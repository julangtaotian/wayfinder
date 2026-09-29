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
const REQUIRED_ARTIFACTS = new Set(['proposal', 'specs', 'design', 'tasks']);
const RETIRED_FILES = new Set(['test-plan.md', 'evidence.json', 'verification-evidence.json']);
const RETIRED_METADATA = /^(?:profile|risks|test_plan|evidence_mode|requirement):/mu;
const SPEC_PLACEHOLDER = /(?:\[TODO(?::[^\]]*)?\]|\bTBD\b|created by archiving change|Update Purpose after archive)/iu;
const ACCEPTANCE_LINE = /^\s*-\s*\*\*ACCEPTANCE\*\*\s+`(AC-\d{2,})`\s*$/gmu;
const TASK_ACCEPTANCE_REFERENCE = /\[(AC-\d{2,})\]/gu;

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
  const context = design?.trim() || '[TODO: 根据真实项目事实说明现状、约束和受影响模块]';
  const files = new Map([
    ['.openspec.yaml', `schema: spec-driven\ncreated: ${new Date().toISOString().slice(0, 10)}\n`],
    ['proposal.md', `## Why\n\n${why}\n\n## What Changes\n\n- ${requirement}。\n- [TODO: 根据项目事实补充明确范围和非目标]\n\n## Capabilities\n\n### New Capabilities\n\n- \`${change}\`：${requirement}。\n\n### Modified Capabilities\n\n- [TODO: 列出现有能力变化；没有时写“无”]\n\n## Impact\n\n- [TODO: 列出受影响模块、接口和验证边界]\n`],
    [`specs/${change}/spec.md`, `## Purpose\n\n[TODO: 描述该能力长期存在的业务目的]\n\n## ADDED Requirements\n\n### Requirement: ${requirement}\n\n[TODO: 使用 MUST/SHALL 描述可验证行为]\n\n#### Scenario: [TODO: 描述一个可观察场景]\n\n- **ACCEPTANCE** \`AC-01\`\n- **WHEN** [TODO: 描述触发条件]\n- **THEN** [TODO: 描述可观察结果]\n`],
    ['design.md', `## Context\n\n${context}\n\n## Goals / Non-Goals\n\n**Goals:** [TODO: 描述本次设计必须实现的目标]\n\n**Non-Goals:** [TODO: 描述明确不处理的范围]\n\n## Decisions\n\n- [TODO: 记录关键实现决策及理由]\n\n## Risks / Trade-offs\n\n- [TODO: 记录风险、取舍和缓解方式]\n\n## Verification Strategy\n\n- [TODO: 说明各验收场景的验证方式]\n`],
    ['tasks.md', `## 1. 实施\n\n- [ ] 1.1 [TODO: 按规格拆分可执行任务] [AC-01]\n- [ ] 1.2 [TODO: 运行与验收场景相称的验证] [AC-01]\n`],
  ]);
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
  const planning = planningDiagnostics(context);
  blockers.push(...planning.diagnostics.map((item) => ({ ...item })));
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

function requiredSectionDiagnostics(content, file, headings) {
  const diagnostics = [];
  for (const heading of headings) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const marker = new RegExp(`^## ${escaped}\\s*$`, 'mu').exec(content);
    const tail = marker ? content.slice(marker.index + marker[0].length) : '';
    const nextHeading = tail.search(/^## /mu);
    const section = (nextHeading >= 0 ? tail.slice(0, nextHeading) : tail).trim();
    if (!section) {
      diagnostics.push({ code: 'complex_section_missing', target: file, message: `规划产物缺少非空章节：${heading}` });
    }
  }
  return diagnostics;
}

function markdownSection(content, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const marker = new RegExp(`^## ${escaped}\\s*$`, 'mu').exec(String(content || ''));
  if (!marker) return null;
  const tail = String(content).slice(marker.index + marker[0].length);
  const nextHeading = tail.search(/^## /mu);
  return (nextHeading >= 0 ? tail.slice(0, nextHeading) : tail).trim();
}

export function hasSpecPlaceholder(content) {
  return SPEC_PLACEHOLDER.test(String(content || ''));
}

export function specPurposeIssue(content) {
  const purpose = markdownSection(content, 'Purpose');
  if (!purpose) return 'missing';
  return hasSpecPlaceholder(purpose) ? 'placeholder' : null;
}

function specFiles(context) {
  const specsRoot = path.join(context.changePath, 'specs');
  if (!fs.existsSync(specsRoot)) return [];
  return fs.readdirSync(specsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `specs/${entry.name}/spec.md`)
    .filter((file) => fs.existsSync(path.join(context.changePath, file)));
}

function acceptanceDiagnostics(context, files) {
  const diagnostics = [];
  const ids = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(context.changePath, file), 'utf8');
    const scenarios = content.split(/^#### Scenario:\s*/gmu).slice(1);
    for (const [index, scenario] of scenarios.entries()) {
      const found = [...scenario.matchAll(ACCEPTANCE_LINE)].map((match) => match[1]);
      if (found.length !== 1) {
        diagnostics.push({
          code: 'complex_acceptance_marker_invalid',
          target: `${file}#scenario-${index + 1}`,
          message: `每个场景必须且只能声明一个 Acceptance ID，当前数量：${found.length}`,
        });
      }
      ids.push(...found);
    }
  }
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].sort();
  for (const id of duplicates) {
    diagnostics.push({ code: 'complex_acceptance_duplicate', target: id, message: `Acceptance ID 重复：${id}` });
  }
  const acceptanceIds = [...new Set(ids)].sort();
  const tasksPath = path.join(context.changePath, 'tasks.md');
  if (fs.existsSync(tasksPath)) {
    const taskContent = fs.readFileSync(tasksPath, 'utf8');
    const referenced = [...taskContent.matchAll(TASK_ACCEPTANCE_REFERENCE)].map((match) => match[1]);
    for (const id of [...new Set(referenced)].sort()) {
      if (!acceptanceIds.includes(id)) {
        diagnostics.push({ code: 'complex_acceptance_reference_invalid', target: id, message: `任务引用了未定义的 Acceptance ID：${id}` });
      }
    }
    for (const id of acceptanceIds) {
      if (!referenced.includes(id)) {
        diagnostics.push({ code: 'complex_acceptance_uncovered', target: id, message: `Acceptance ID 没有实施或验证任务覆盖：${id}` });
      }
    }
  }
  return { diagnostics, acceptanceIds };
}

function planningDiagnostics(context) {
  const diagnostics = [];
  const required = ['.openspec.yaml', 'proposal.md', 'design.md', 'tasks.md'];
  for (const file of required) {
    if (!fs.existsSync(path.join(context.changePath, file))) {
      diagnostics.push({ code: 'complex_artifact_missing', target: file, message: `缺少必需产物：${file}` });
    }
  }
  const specs = specFiles(context);
  if (specs.length === 0) {
    diagnostics.push({ code: 'complex_artifact_missing', target: 'specs/*/spec.md', message: '缺少必需规格产物：specs/<capability>/spec.md' });
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
  const contentFiles = ['proposal.md', 'design.md', 'tasks.md', ...specs];
  for (const file of contentFiles) {
    const target = path.join(context.changePath, file);
    if (!fs.existsSync(target)) continue;
    const content = fs.readFileSync(target, 'utf8');
    if (hasSpecPlaceholder(content)) {
      diagnostics.push({ code: 'complex_placeholder_present', target: file, message: `规划产物仍包含显式占位：${file}` });
    }
  }
  for (const file of specs) {
    const capability = file.slice('specs/'.length, -'/spec.md'.length);
    const mainSpec = path.join(context.root, 'openspec', 'specs', capability, 'spec.md');
    if (fs.existsSync(mainSpec)) continue;
    const issue = specPurposeIssue(fs.readFileSync(path.join(context.changePath, file), 'utf8'));
    if (issue) {
      diagnostics.push({
        code: 'complex_spec_purpose_invalid',
        target: file,
        message: issue === 'missing'
          ? `新能力规格缺少 Purpose：${file}`
          : `新能力规格的 Purpose 仍是占位内容：${file}`,
      });
    }
  }
  const proposalPath = path.join(context.changePath, 'proposal.md');
  if (fs.existsSync(proposalPath)) {
    diagnostics.push(...requiredSectionDiagnostics(
      fs.readFileSync(proposalPath, 'utf8'),
      'proposal.md',
      ['Why', 'What Changes', 'Capabilities', 'Impact'],
    ));
  }
  const designPath = path.join(context.changePath, 'design.md');
  if (fs.existsSync(designPath)) {
    diagnostics.push(...requiredSectionDiagnostics(
      fs.readFileSync(designPath, 'utf8'),
      'design.md',
      ['Context', 'Goals / Non-Goals', 'Decisions', 'Risks / Trade-offs', 'Verification Strategy'],
    ));
  }
  const acceptance = acceptanceDiagnostics(context, specs);
  diagnostics.push(...acceptance.diagnostics);
  return { diagnostics, acceptanceIds: acceptance.acceptanceIds };
}

export function validateComplexChange({ target = process.cwd(), change } = {}, injected = {}) {
  const context = resolveContext(target, change);
  if (!fs.existsSync(context.changePath)) fail('complex_change_missing', `活动变更不存在：${context.relativePath}`, context.relativePath);
  const services = { runOpenSpecSync, ...injected };
  const planning = planningDiagnostics(context);
  const diagnostics = [...planning.diagnostics];
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
    acceptanceIds: planning.acceptanceIds,
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
