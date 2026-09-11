import crypto from 'node:crypto';
import path from 'node:path';
import {
  resolveCanonicalProjectRoot,
  resolveSafeProjectPath,
} from './project-path-safety.mjs';

export const BENCHMARK_SCHEMA_VERSION = 1;
export const BENCHMARK_OUTPUT_DIRECTORY = '.frontend-ai-workflow/runs/developer-effectiveness-benchmark';
export const EXPECTED_PROJECT_IDS = Object.freeze(['P1', 'P2', 'P3']);
export const COMPLEXITY_MATRIX = Object.freeze({
  P1: Object.freeze(['small', 'large']),
  P2: Object.freeze(['medium', 'large']),
  P3: Object.freeze(['small', 'medium']),
});
export const EXPECTED_CASE_COUNT = 6;
export const EXPECTED_RUN_COUNT = 12;
export const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
export const MAX_PERSISTED_LOG_BYTES = 128 * 1024;
export const MIN_DISK_RESERVE_BYTES = 512 * 1024 * 1024;

const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,79}$/u;
const PROJECT_ID_PATTERN = /^P[1-9][0-9]*$/u;
export const CASE_ID_PATTERN = /^SYN-(P[1-9][0-9]*)-([SML])[0-9]{2}$/u;
export const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const REASONING_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
export const COMPLEXITY_CODES = Object.freeze({ small: 'S', medium: 'M', large: 'L' });
export const TASK_TYPES = new Set(['bug', 'feature', 'refactor']);
export const MANAGEMENT_PATHS = ['AGENTS.md', 'requirements/', 'openspec/', 'wayfinder/'];
export const FORBIDDEN_CASE_PATHS = [
  '.git/', '.frontend-ai-workflow/', 'outputs/', 'requirements/', 'openspec/', 'wayfinder/', 'AGENTS.md',
  'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
];
export const UNSAFE_OUTPUT_PATTERNS = [
  /authorization\s*:\s*bearer\s+\S+/iu,
  /cookie\s*:\s*\S+/iu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
];
export const REDACTABLE_SECRET_ASSIGNMENT = /((?:access[_-]?token|api[_-]?key|client[_-]?secret|password|private[_-]?key)(?:\\?["'])?\s*[=:]\s*(?:\\?["'])?)([^\s,;}\]]+)/giu;

export class DeveloperEffectivenessBenchmarkError extends Error {
  constructor(code, message, target = null, status = 'blocked') {
    super(message);
    this.name = 'DeveloperEffectivenessBenchmarkError';
    this.code = code;
    this.target = target;
    this.status = status;
  }
}

export function fail(code, message, target = null, status = 'blocked') {
  throw new DeveloperEffectivenessBenchmarkError(code, message, target, status);
}

export function assertPlainObject(value, code, message, target = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, message, target);
}

export function assertString(value, code, message, target = null) {
  if (typeof value !== 'string' || !value.trim()) fail(code, message, target);
  return value.trim();
}

export function assertContent(value, code, message, target = null) {
  if (typeof value !== 'string' || !value.trim()) fail(code, message, target);
  return value;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  const content = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function sha256Json(value) {
  return sha256(stableJson(value));
}

export function normalizeMachinePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//u, '');
}

export function normalizeComparablePath(value, flavor = process.platform === 'win32' ? 'win32' : 'posix') {
  const raw = assertString(value, 'invalid_path_value', '路径不能为空');
  if (flavor === 'win32') {
    let normalized = path.win32.normalize(raw).replaceAll('\\', '/');
    normalized = normalized.replace(/^([a-z]):/u, (_, drive) => `${drive.toUpperCase()}:`);
    if (!/^[A-Z]:\/$/u.test(normalized)) normalized = normalized.replace(/\/+$/u, '');
    return normalized;
  }
  if (flavor !== 'posix') fail('invalid_path_flavor', `不支持的路径语义：${flavor}`, flavor);
  const normalized = path.posix.normalize(raw);
  return normalized === '/' ? normalized : normalized.replace(/\/+$/u, '');
}

export function comparablePathsEqual(left, right, flavor) {
  return normalizeComparablePath(left, flavor) === normalizeComparablePath(right, flavor);
}

export function isInside(root, candidate, { allowRoot = false, pathApi = path } = {}) {
  const relative = pathApi.relative(root, candidate);
  return (allowRoot && relative === '')
    || Boolean(relative && relative !== '..' && !relative.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(relative));
}

export function assertSafeRelativePath(value, label = '项目路径') {
  const raw = assertString(value, 'unsafe_relative_path', `${label}不能为空`, value || null);
  if (path.isAbsolute(raw) || path.win32.isAbsolute(raw) || raw.includes('\\')) {
    fail('unsafe_relative_path', `${label}必须是正斜杠项目相对路径`, normalizeMachinePath(raw));
  }
  const normalized = path.posix.normalize(raw);
  const segments = normalized.split('/');
  if (normalized === '.' || normalized.startsWith('../') || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    fail('unsafe_relative_path', `${label}不能指向根目录、项目外部或包含空路径段`, normalizeMachinePath(raw));
  }
  return normalized;
}

export function resolveBenchmarkRunRoot(repositoryRoot, runId) {
  const canonicalRepository = resolveCanonicalProjectRoot(repositoryRoot);
  if (!RUN_ID_PATTERN.test(String(runId || ''))) {
    fail('invalid_run_id', 'runId 只能包含小写字母、数字、点、下划线和短横线', runId || null);
  }
  const relative = `${BENCHMARK_OUTPUT_DIRECTORY}/${runId}`;
  const checked = resolveSafeProjectPath(canonicalRepository, relative, '基准输出目录');
  return {
    repositoryRoot: canonicalRepository,
    runRoot: checked.absolutePath,
    runPath: checked.projectPath,
  };
}

function validateProjectShape(project, seen) {
  assertPlainObject(project, 'invalid_project_entry', '项目配置必须是对象');
  const id = assertString(project.id, 'invalid_project_id', '项目 ID 不能为空', project.id || null);
  if (!PROJECT_ID_PATTERN.test(id)) fail('invalid_project_id', `项目 ID 非法：${id}`, id);
  if (seen.has(id)) fail('duplicate_project_id', `项目 ID 重复：${id}`, id);
  seen.add(id);
  if (!path.isAbsolute(project.root || '')) fail('invalid_project_root', `项目 ${id} 的路径必须是绝对路径`, id);
  const name = assertString(project.name || path.basename(project.root), 'invalid_project_name', `项目 ${id} 缺少名称`, id);
  return { id, name, root: project.root };
}

export function validateBenchmarkConfig(config) {
  assertPlainObject(config, 'invalid_benchmark_config', '基准配置必须是对象');
  const resolved = resolveBenchmarkRunRoot(config.repositoryRoot, config.runId);
  const model = assertString(config.model, 'invalid_model', '必须显式指定模型', 'model');
  const reasoning = assertString(config.reasoning, 'invalid_reasoning', '必须显式指定推理强度', 'reasoning');
  if (!REASONING_LEVELS.has(reasoning)) fail('invalid_reasoning', `不支持的推理强度：${reasoning}`, reasoning);
  const timeoutMinutes = Number(config.timeoutMinutes);
  if (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > 240) {
    fail('invalid_timeout', '单次运行超时必须是 1 到 240 分钟的整数', 'timeoutMinutes');
  }
  if (!Array.isArray(config.projects) || config.projects.length !== EXPECTED_PROJECT_IDS.length) {
    fail('invalid_project_count', `第一轮必须恰好配置 ${EXPECTED_PROJECT_IDS.length} 个项目`, 'projects');
  }
  const seen = new Set();
  const projects = config.projects.map((project) => validateProjectShape(project, seen));
  const actualIds = [...seen].sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(EXPECTED_PROJECT_IDS)) {
    fail('invalid_project_ids', `第一轮项目 ID 必须是 ${EXPECTED_PROJECT_IDS.join('、')}`, actualIds.join(','));
  }
  const write = Boolean(config.write);
  const executeAgents = Boolean(config.executeAgents);
  if (executeAgents && !write) fail('agent_execution_requires_write', '真实代理执行必须同时显式提供 --write', 'executeAgents');
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    ...resolved,
    runId: config.runId,
    model,
    reasoning,
    timeoutMinutes,
    projects,
    write,
    executeAgents,
    expectedCaseCount: EXPECTED_CASE_COUNT,
    expectedRunCount: EXPECTED_RUN_COUNT,
  };
}
