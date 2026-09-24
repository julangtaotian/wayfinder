import fs from 'node:fs';
import path from 'node:path';

import { assertSafeProjectRoot, resolveProjectRoot } from './collect-project-scope.mjs';
import { runOpenSpecSync } from './openspec-cli.mjs';
import {
  atomicWriteProjectFile,
  removeProjectDirectory,
  resolveSafeProjectPath,
} from './project-path-safety.mjs';

const CHANGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const REQUIRED_ARTIFACTS = new Set(['proposal', 'specs', 'tasks']);
const RETIRED_FILES = new Set(['test-plan.md', 'evidence.json', 'verification-evidence.json']);
const RETIRED_METADATA = /^(?:profile|risks|test_plan|evidence_mode|requirement):/mu;

export class ComplexChangeError extends Error {
  constructor(code, message, target = null, status = 'blocked') {
    super(message);
    this.name = 'ComplexChangeError';
    this.code = code;
    this.status = status;
    this.target = target;
  }
}

function fail(code, message, target = null, status = 'blocked') {
  throw new ComplexChangeError(code, message, target, status);
}

function parseEngineJson(output) {
  const source = String(output || '');
  const start = source.indexOf('{');
  if (start < 0) return null;
  try {
    return JSON.parse(source.slice(start));
  } catch {
    return null;
  }
}

export function normalizeComparablePath(value, platform = process.platform) {
  const raw = String(value || '');
  const api = platform === 'win32' ? path.win32 : path.posix;
  const normalized = api.normalize(raw).replaceAll('\\', '/').replace(/\/$/u, '');
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function resolveContext(target, change) {
  if (!CHANGE_ID.test(String(change || ''))) {
    fail('complex_invalid_change', 'change 必须是 kebab-case 标识', String(change || '') || null);
  }
  const root = resolveProjectRoot(target);
  assertSafeProjectRoot(root);
  const relativePath = `openspec/changes/${change}`;
  const safe = resolveSafeProjectPath(root, relativePath, '复杂变更目录');
  return { root, change, changePath: safe.absolutePath, relativePath };
}

function artifactTemplates({ change, title, goal, design }) {
  const requirement = title.trim().replace(/[。；;]+$/u, '');
  const why = (goal || `需要交付“${title}”，并以一个 OpenSpec 变更跟踪范围、验收与完成状态。`).trim();
  const files = new Map([
    ['.openspec.yaml', `schema: spec-driven\ncreated: ${new Date().toISOString().slice(0, 10)}\n`],
    ['proposal.md', `## Why\n\n${why}\n\n## What Changes\n\n- ${requirement}。\n\n## Capabilities\n\n### New Capabilities\n\n- \`${change}\`：${requirement}。\n\n### Modified Capabilities\n\n- 无。\n\n## Impact\n\n- 影响范围在实施前通过任务与规格进一步确认。\n`],
    [`specs/${change}/spec.md`, `## ADDED Requirements\n\n### Requirement: ${requirement}\n\n系统 MUST ${requirement}。\n\n#### Scenario: 完成目标行为\n\n- **WHEN** 用户执行该能力的目标流程\n- **THEN** 系统提供规格中定义的结果\n`],
    ['tasks.md', `## 1. 实施\n\n- [ ] 1.1 按规格实现“${requirement}”。\n- [ ] 1.2 运行与影响范围相称的验证并记录结果。\n`],
  ]);
  if (design?.trim()) {
    files.set('design.md', `## Context\n\n${design.trim()}\n\n## Goals / Non-Goals\n\n**Goals:** 落实上述架构决策。\n\n**Non-Goals:** 不扩大 proposal 已声明的产品范围。\n\n## Decisions\n\n- 采用已确认的架构决策作为实施边界。\n\n## Risks / Trade-offs\n\n- 实施时验证决策与现有系统约束是否一致。\n`);
  }
  return files;
}

export function createComplexChange({
  target = process.cwd(),
  change,
  title,
  goal = null,
  design = null,
  write = false,
} = {}, injected = {}) {
  if (!String(title || '').trim()) fail('complex_invalid_arguments', 'title 不能为空', 'title');
  const context = resolveContext(target, change);
  if (fs.existsSync(context.changePath)) {
    fail('complex_change_exists', `活动变更已存在：${context.relativePath}`, context.relativePath);
  }
  const files = artifactTemplates({ change, title: String(title), goal, design });
  const actions = [...files.keys()].map((file) => ({ action: 'create', target: `${context.relativePath}/${file}` }));
  if (!write) {
    return {
      schemaVersion: 1,
      ok: true,
      code: 'complex_create_ready',
      status: 'ready',
      write: false,
      change,
      root: context.root,
      artifacts: [...files.keys()],
      actions,
    };
  }

  const writer = injected.atomicWriteProjectFile || atomicWriteProjectFile;
  try {
    for (const [file, content] of files) {
      writer(context.root, `${context.relativePath}/${file}`, content, {
        label: '复杂变更产物',
        mustNotExist: true,
      });
    }
  } catch (error) {
    if (fs.existsSync(context.changePath)) {
      removeProjectDirectory(context.root, context.changePath, { label: '创建失败的复杂变更' });
    }
    fail('complex_create_failed', `复杂变更创建失败，已清理本次产物：${error.message}`, context.relativePath, 'failed');
  }
  return {
    schemaVersion: 1,
    ok: true,
    code: 'complex_created',
    status: 'created',
    write: true,
    change,
    root: context.root,
    artifacts: [...files.keys()],
    actions,
  };
}

function taskProgress(changePath) {
  const tasksPath = path.join(changePath, 'tasks.md');
  if (!fs.existsSync(tasksPath)) return { total: 0, complete: 0, remaining: 0, pending: [] };
  const tasks = [...fs.readFileSync(tasksPath, 'utf8').matchAll(/^\s*-\s*\[([ xX])\]\s+(.+)$/gmu)];
  const pending = tasks.filter((match) => match[1].toLowerCase() !== 'x').map((match) => match[2].trim());
  return { total: tasks.length, complete: tasks.length - pending.length, remaining: pending.length, pending };
}

function runEngine(root, args, label, services) {
  const result = services.runOpenSpecSync(args, { cwd: root, encoding: 'utf8' });
  if (!result.available || result.status !== 0) {
    return {
      ok: false,
      code: result.error ? 'complex_engine_unavailable' : 'complex_engine_failed',
      message: `${label}失败：${(result.stderr || result.stdout || result.error?.message || '未知错误').trim()}`,
      data: parseEngineJson(result.stdout || result.stderr),
    };
  }
  return { ok: true, data: parseEngineJson(result.stdout) };
}

function validateEngineRoot(root, data, label) {
  if (!data?.root || typeof data.root.path !== 'string' || typeof data.root.source !== 'string') {
    return `${label}缺少可核验的规划根信息`;
  }
  if (data.root.source === 'global_default') return `${label}解析到未经选择的全局 Store`;
  const actual = normalizeComparablePath(data.root.path);
  const expected = normalizeComparablePath(root);
  return actual === expected ? null : `${label}规划根与目标项目不一致：${data.root.path}`;
}

export function statusComplexChange({ target = process.cwd(), change } = {}, injected = {}) {
  const context = resolveContext(target, change);
  if (!fs.existsSync(context.changePath)) fail('complex_change_missing', `活动变更不存在：${context.relativePath}`, context.relativePath);
  const services = { runOpenSpecSync, ...injected };
  const engine = runEngine(context.root, ['status', '--change', change, '--json'], 'OpenSpec 状态检查', services);
  const blockers = [];
  if (!engine.ok) blockers.push({ code: engine.code, target: change, message: engine.message });
  const rootError = engine.data ? validateEngineRoot(context.root, engine.data, 'OpenSpec 状态检查') : null;
  if (rootError) blockers.push({ code: 'complex_root_mismatch', target: '.', message: rootError });
  const artifacts = (engine.data?.artifacts || [])
    .filter((artifact) => REQUIRED_ARTIFACTS.has(artifact?.id) || artifact?.status === 'done')
    .map((artifact) => ({ id: artifact.id, status: artifact.status }));
  for (const required of REQUIRED_ARTIFACTS) {
    const artifact = artifacts.find((item) => item.id === required);
    if (!artifact || artifact.status !== 'done') {
      blockers.push({ code: 'complex_artifact_incomplete', target: required, message: `必需产物未完成：${required}` });
    }
  }
  const progress = taskProgress(context.changePath);
  return {
    schemaVersion: 1,
    ok: blockers.length === 0,
    code: blockers.length ? 'complex_status_blocked' : 'complex_status_ready',
    status: blockers.length ? 'blocked' : progress.remaining ? 'active' : 'ready',
    change,
    root: context.root,
    artifacts,
    progress,
    blockers,
  };
}

function structureDiagnostics(context) {
  const diagnostics = [];
  const required = ['.openspec.yaml', 'proposal.md', 'tasks.md', `specs/${context.change}/spec.md`];
  for (const file of required) {
    if (!fs.existsSync(path.join(context.changePath, file))) {
      diagnostics.push({ code: 'complex_artifact_missing', target: file, message: `缺少必需产物：${file}` });
    }
  }
  for (const file of RETIRED_FILES) {
    if (fs.existsSync(path.join(context.changePath, file))) {
      diagnostics.push({ code: 'complex_retired_artifact', target: file, message: `复杂通道不得包含退役产物：${file}` });
    }
  }
  const metadataPath = path.join(context.changePath, '.openspec.yaml');
  if (fs.existsSync(metadataPath) && RETIRED_METADATA.test(fs.readFileSync(metadataPath, 'utf8'))) {
    diagnostics.push({ code: 'complex_retired_metadata', target: '.openspec.yaml', message: '复杂通道不得声明 profile、risks、test plan、evidence 或 requirement 元数据' });
  }
  return diagnostics;
}

export function validateComplexChange({ target = process.cwd(), change } = {}, injected = {}) {
  const context = resolveContext(target, change);
  if (!fs.existsSync(context.changePath)) fail('complex_change_missing', `活动变更不存在：${context.relativePath}`, context.relativePath);
  const services = { runOpenSpecSync, ...injected };
  const diagnostics = structureDiagnostics(context);
  const strict = runEngine(
    context.root,
    ['validate', change, '--type', 'change', '--strict', '--json', '--no-interactive'],
    '严格 OpenSpec 校验',
    services,
  );
  if (!strict.ok) diagnostics.push({ code: strict.code, target: change, message: strict.message });
  const rootError = strict.data ? validateEngineRoot(context.root, strict.data, '严格 OpenSpec 校验') : null;
  if (rootError) diagnostics.push({ code: 'complex_root_mismatch', target: '.', message: rootError });
  const progress = taskProgress(context.changePath);
  return {
    schemaVersion: 1,
    ok: diagnostics.length === 0,
    code: diagnostics.length ? 'complex_validation_failed' : 'complex_validation_passed',
    status: diagnostics.length ? 'failed' : 'passed',
    change,
    root: context.root,
    changePath: context.changePath,
    progress,
    diagnostics,
  };
}

export function complexFailure(error, { write = false } = {}) {
  const known = error instanceof ComplexChangeError || (error && typeof error.code === 'string');
  return {
    schemaVersion: 1,
    ok: false,
    code: known ? error.code : 'complex_internal_error',
    status: known ? (error.status || 'blocked') : 'failed',
    target: known ? (error.target || null) : null,
    write: Boolean(write),
    errors: [error?.message || String(error)],
  };
}
