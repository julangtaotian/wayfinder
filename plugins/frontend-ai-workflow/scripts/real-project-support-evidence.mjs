import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { readLifecycleConfig } from './lifecycle-contract.mjs';
import {
  loadValidationMatrix,
  normalizeMachinePath,
} from './real-project-validation.mjs';
import {
  resolveInsideValidationBase,
  stagePayloadDigest,
} from './real-project-validation-foundation.mjs';
import {
  atomicWriteProjectFile,
  resolveSafeProjectPath,
} from './project-path-safety.mjs';

const REVISION_PATTERN = /^[a-f0-9]{40}$/u;
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,79}$/iu;
const PROJECT_ID_PATTERN = /^P[1-9][0-9]*$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const RESULT_STATUSES = new Set(['passed', 'limited', 'blocked']);
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const EVIDENCE_KIND = 'real-project-support-evidence';
const GENERATOR_ID = 'frontend-ai-workflow/real-project-support-evidence';

const COMBINATION_RULES = Object.freeze([
  Object.freeze({ id: 'vue3-vite-vitest-npm', preset: 'vue3-vite', buildTools: ['vite'], packageManager: 'npm', runner: 'Vitest', certification: 'verified-vue3-vite-vitest', certifiable: true }),
  Object.freeze({ id: 'vue2-vite-pnpm', preset: 'vue2-vite', buildTools: ['vite'], packageManager: 'pnpm', runner: '*', certification: '*', certifiable: false }),
  Object.freeze({ id: 'vue-webpack-yarn-jest', preset: 'vue-webpack', buildTools: ['webpack'], packageManager: 'yarn', runner: 'Jest', certification: '*', certifiable: false }),
  Object.freeze({ id: 'react-vite-npm', preset: 'react-vite', buildTools: ['vite'], packageManager: 'npm', runner: '*', certification: '*', certifiable: false }),
  Object.freeze({ id: 'react-webpack-npm-jest', preset: 'react-webpack', buildTools: ['webpack'], packageManager: 'npm', runner: 'Jest', certification: '*', certifiable: false }),
  Object.freeze({ id: 'wechat-native-npm-manual', preset: 'wechat-native', buildTools: [], packageManager: 'npm', runner: '未识别', certification: '*', certifiable: false }),
]);

export class RealProjectSupportEvidenceError extends Error {
  constructor(code, message, target = null) {
    super(message);
    this.name = 'RealProjectSupportEvidenceError';
    this.code = code;
    this.status = 'failed';
    this.target = target;
  }
}

function fail(code, message, target = null) {
  throw new RealProjectSupportEvidenceError(code, message, target);
}

function repositorySnapshot(root) {
  const run = (args) => {
    const result = spawnSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      shell: false,
    });
    if (result.status !== 0) fail('support_repository_git_unavailable', '无法读取插件仓库 Git 状态', 'repository');
    return result.stdout.trim();
  };
  const topLevel = fs.realpathSync(path.resolve(run(['rev-parse', '--show-toplevel'])));
  const canonicalRoot = fs.realpathSync(path.resolve(root));
  const normalize = (value) => normalizeMachinePath(value).replace(/\/$/u, '');
  const left = normalize(topLevel);
  const right = normalize(canonicalRoot);
  if ((process.platform === 'win32' ? left.toLowerCase() : left) !== (process.platform === 'win32' ? right.toLowerCase() : right)) {
    fail('support_repository_git_root_mismatch', '目标目录必须是插件 Git 顶层目录', 'repository');
  }
  return {
    revision: run(['rev-parse', 'HEAD']).toLowerCase(),
    status: run(['status', '--porcelain=v1', '--untracked-files=all']),
  };
}

function sortedStrings(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null;
  return [...value].sort((left, right) => left.localeCompare(right));
}

function sameStrings(left, right) {
  const normalized = sortedStrings(left);
  return normalized !== null && JSON.stringify(normalized) === JSON.stringify([...right].sort());
}

function containsAbsolutePath(value) {
  if (typeof value === 'string') return path.posix.isAbsolute(value) || path.win32.isAbsolute(value);
  if (Array.isArray(value)) return value.some(containsAbsolutePath);
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some(containsAbsolutePath);
}

function sourceDescriptor(root, candidate, label) {
  const source = resolveSafeProjectPath(root, candidate, label, { mustExist: true, allowDirectory: false });
  const stats = fs.statSync(source.absolutePath);
  if (stats.size > MAX_SOURCE_BYTES) fail('support_source_too_large', `${label}超过大小上限`, source.projectPath);
  const content = fs.readFileSync(source.absolutePath);
  return {
    path: source.projectPath,
    bytes: content.byteLength,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
  };
}

function readStage(root, candidate, runId, stage) {
  const descriptor = sourceDescriptor(root, candidate, `${stage} 标准结果`);
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(path.join(root, descriptor.path), 'utf8'));
  } catch {
    fail('invalid_support_source_json', `${stage} 标准结果不是有效 JSON`, descriptor.path);
  }
  if (payload?.schemaVersion !== 1 || payload.runId !== runId || payload.stage !== stage
    || payload.status !== 'passed' || !Array.isArray(payload.results)) {
    fail('invalid_support_stage_result', `${stage} 标准结果结构、runId 或状态无效`, descriptor.path);
  }
  if (!SHA256_PATTERN.test(String(payload.contentDigest || '')) || stagePayloadDigest(payload) !== payload.contentDigest) {
    fail('support_stage_digest_mismatch', `${stage} 标准结果摘要无效`, descriptor.path);
  }
  if (containsAbsolutePath(payload)) {
    fail('support_stage_absolute_path', `${stage} 标准结果包含不允许持久化的绝对路径`, descriptor.path);
  }
  return { payload, descriptor };
}

function indexResults(payload, projects, stage) {
  const expectedIds = new Set(projects.map((project) => project.id));
  if (payload.results.length !== expectedIds.size) fail('support_project_set_mismatch', `${stage} 项目数量与矩阵不一致`, stage);
  const mapped = new Map();
  for (const result of payload.results) {
    const projectId = String(result?.projectId || '');
    if (!PROJECT_ID_PATTERN.test(projectId) || !expectedIds.has(projectId)) {
      fail('support_project_set_mismatch', `${stage} 包含未知项目`, projectId || stage);
    }
    if (mapped.has(projectId)) fail('support_project_duplicate', `${stage} 包含重复项目`, projectId);
    if (result.stage !== stage || !RESULT_STATUSES.has(result.status) || result.matchesExpected !== true) {
      fail(result.status === 'defect' ? 'support_project_defect' : 'invalid_support_project_result', `${stage} 项目结果不可用于支持证据`, projectId);
    }
    mapped.set(projectId, result);
  }
  if ([...expectedIds].some((projectId) => !mapped.has(projectId))) {
    fail('support_project_set_mismatch', `${stage} 缺少矩阵项目`, stage);
  }
  return mapped;
}

export function matchSupportCombination(inspection, rules = COMBINATION_RULES) {
  if (inspection.status !== 'passed' || typeof inspection.preset !== 'string'
    || typeof inspection.packageManager !== 'string' || !inspection.runner || typeof inspection.runner.name !== 'string') {
    fail('support_combination_facts_missing', 'inspection 缺少唯一组合所需事实', inspection.projectId || 'inspection');
  }
  const matches = rules.filter((rule) => rule.preset === inspection.preset
    && rule.packageManager === inspection.packageManager
    && sameStrings(inspection.buildTools, rule.buildTools)
    && (rule.runner === '*' || rule.runner === inspection.runner.name)
    && (rule.certification === '*' || rule.certification === inspection.runner.certification));
  if (matches.length !== 1) {
    fail(matches.length ? 'support_combination_ambiguous' : 'support_combination_unknown', '真实项目事实无法唯一映射支持组合', inspection.projectId);
  }
  return matches[0];
}

function projectProjection(project, inspection, nativeTest) {
  if (inspection.commit !== project.commit) fail('support_project_commit_mismatch', 'inspection 提交与矩阵不一致', project.id);
  const rule = matchSupportCombination(inspection);
  let status = nativeTest.status;
  if (status === 'passed' && !rule.certifiable) status = 'limited';
  if (status === 'passed' && (nativeTest.code !== 'certified_test_run_passed'
    || inspection.runner.certification !== 'verified-vue3-vite-vitest')) {
    status = 'limited';
  }
  return {
    id: rule.id,
    status,
    code: String(nativeTest.code || 'real_project_result_recorded'),
    project: { id: project.id, commit: project.commit },
  };
}

function aggregateCombinations(projects) {
  const rank = { blocked: 0, limited: 1, passed: 2 };
  const grouped = new Map();
  for (const item of projects) {
    const current = grouped.get(item.id) || [];
    current.push(item);
    grouped.set(item.id, current);
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, items]) => {
    const selected = [...items].sort((left, right) => rank[left.status] - rank[right.status] || left.project.id.localeCompare(right.project.id))[0];
    const projectEntries = items.map((item) => item.project).sort((left, right) => left.id.localeCompare(right.id));
    return {
      id,
      status: selected.status,
      code: selected.code,
      projectIds: projectEntries.map((project) => project.id),
      projects: projectEntries,
    };
  });
}

function normalizeOptions({
  root = process.cwd(), matrix = null, revision, output = null, write = false,
} = {}) {
  const normalizedRevision = String(revision || '').trim().toLowerCase();
  if (!REVISION_PATTERN.test(normalizedRevision)) fail('invalid_support_revision', '插件 revision 必须是 40 位十六进制提交', normalizedRevision || null);
  const config = readLifecycleConfig(root);
  const matrixPath = String(matrix || `${config.runtimeDirectory}/runs/real-project-validation/local-matrix.json`).trim().replaceAll('\\', '/').replace(/^\.\//u, '');
  const checkedMatrix = resolveInsideValidationBase(config.root, path.resolve(config.root, matrixPath), '真实项目矩阵');
  const loadedMatrix = loadValidationMatrix({ repositoryRoot: config.root, matrixPath: checkedMatrix.resolved });
  if (!RUN_ID_PATTERN.test(loadedMatrix.runId)) fail('invalid_support_run_id', '真实项目 runId 无效', loadedMatrix.runId);
  const outputPath = String(output || `${config.runtimeDirectory}/runs/support-evidence/real-project-${normalizedRevision.slice(0, 12)}.json`).trim().replaceAll('\\', '/').replace(/^\.\//u, '');
  const target = resolveSafeProjectPath(config.root, outputPath, '真实项目支持证据输出', { allowDirectory: false });
  const allowedPrefix = `${config.runtimeDirectory}/runs/support-evidence/`;
  if (!target.projectPath.startsWith(allowedPrefix)) fail('support_evidence_outside_runtime', `真实项目支持证据必须位于 ${allowedPrefix}`, target.projectPath);
  return {
    root: config.root,
    matrix: loadedMatrix,
    matrixPath: checkedMatrix.repositoryRelative,
    revision: normalizedRevision,
    output: target.projectPath,
    outputExists: target.exists,
    write: write === true,
  };
}

export function projectRealSupportEvidence(options = {}, operations = {}) {
  const config = normalizeOptions(options);
  const runRoot = `${readLifecycleConfig(config.root).runtimeDirectory}/runs/real-project-validation/${config.matrix.runId}`;
  const inspection = readStage(config.root, `${runRoot}/inspection/results.json`, config.matrix.runId, 'inspection');
  const nativeTest = readStage(config.root, `${runRoot}/native-test/results.json`, config.matrix.runId, 'native-test');
  const inspections = indexResults(inspection.payload, config.matrix.projects, 'inspection');
  const nativeTests = indexResults(nativeTest.payload, config.matrix.projects, 'native-test');
  const combinations = aggregateCombinations(config.matrix.projects.map((project) => projectProjection(
    project,
    inspections.get(project.id),
    nativeTests.get(project.id),
  )));
  const matrixDescriptor = sourceDescriptor(config.root, config.matrixPath, '真实项目矩阵');
  const evidence = {
    schemaVersion: 1,
    kind: EVIDENCE_KIND,
    generator: { id: GENERATOR_ID, version: 1 },
    status: 'passed',
    revision: config.revision,
    runId: config.matrix.runId,
    combinations,
    source: {
      files: [matrixDescriptor, inspection.descriptor, nativeTest.descriptor],
    },
  };
  const preview = {
    ok: true,
    status: 'planned',
    code: 'real_project_support_evidence_plan',
    write: false,
    revision: config.revision,
    runId: config.matrix.runId,
    output: config.output,
    outputExists: config.outputExists,
    combinations,
    source: evidence.source,
  };
  if (!config.write) return preview;
  if (config.outputExists) fail('support_evidence_exists', '真实项目支持证据已存在，禁止覆盖', config.output);
  const readSnapshot = operations.readSnapshot || repositorySnapshot;
  const snapshot = readSnapshot(config.root);
  if (String(snapshot?.revision || '').toLowerCase() !== config.revision || String(snapshot?.status || '')) {
    fail('support_repository_snapshot_mismatch', '插件仓库提交或工作区状态与目标 revision 不一致', 'repository');
  }
  atomicWriteProjectFile(config.root, config.output, `${JSON.stringify(evidence, null, 2)}\n`, {
    label: '真实项目支持证据',
    mustNotExist: true,
    operations: operations.fileOperations || {},
  });
  return {
    ...preview,
    status: 'recorded',
    code: 'real_project_support_evidence_recorded',
    write: true,
    receipt: config.output,
  };
}

export function validateSupportSourceDescriptor(value) {
  return Boolean(value && typeof value.path === 'string' && !path.posix.isAbsolute(value.path) && !path.win32.isAbsolute(value.path)
    && Number.isSafeInteger(value.bytes) && value.bytes > 0 && SHA256_PATTERN.test(String(value.sha256 || '')));
}

function requiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) fail('missing_cli_value', `参数 ${option} 缺少值`, option);
  return value;
}

function parseArgs(argv) {
  const result = { root: process.cwd(), matrix: null, revision: null, output: null, write: false };
  const valueOptions = new Map([
    ['--target', 'root'], ['--matrix', 'matrix'], ['--revision', 'revision'], ['--output', 'output'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--write') result.write = true;
    else if (valueOptions.has(option)) {
      result[valueOptions.get(option)] = requiredValue(argv, index, option);
      index += 1;
    } else fail('unsupported_cli_argument', `不支持的参数：${option}`, option);
  }
  return result;
}

function publicFailure(error) {
  return {
    ok: false,
    status: error?.status || 'failed',
    code: error?.code || 'real_project_support_evidence_failed',
    target: normalizeMachinePath(error?.target || ''),
    error: error?.message || String(error),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(projectRealSupportEvidence(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(JSON.stringify(publicFailure(error), null, 2));
    process.exitCode = 1;
  }
}
