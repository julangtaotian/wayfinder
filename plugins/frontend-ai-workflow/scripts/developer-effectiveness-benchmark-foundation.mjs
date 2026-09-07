import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  atomicWriteProjectFile,
  resolveCanonicalProjectRoot,
  resolveSafeProjectPath,
} from './project-path-safety.mjs';

export const BENCHMARK_SCHEMA_VERSION = 1;
export const BENCHMARK_OUTPUT_DIRECTORY = 'outputs/developer-effectiveness-benchmark';
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
const CASE_ID_PATTERN = /^SYN-(P[1-9][0-9]*)-([SML])[0-9]{2}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const REASONING_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const COMPLEXITY_CODES = Object.freeze({ small: 'S', medium: 'M', large: 'L' });
const TASK_TYPES = new Set(['bug', 'feature', 'refactor']);
const MANAGEMENT_PATHS = ['AGENTS.md', 'requirements/', 'openspec/', 'wayfinder/'];
const FORBIDDEN_CASE_PATHS = [
  '.git/', 'outputs/', 'requirements/', 'openspec/', 'wayfinder/', 'AGENTS.md',
  'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
];
const UNSAFE_OUTPUT_PATTERNS = [
  /authorization\s*:\s*bearer\s+\S+/iu,
  /cookie\s*:\s*\S+/iu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
];
const REDACTABLE_SECRET_ASSIGNMENT = /((?:access[_-]?token|api[_-]?key|client[_-]?secret|password|private[_-]?key)(?:\\?["'])?\s*[=:]\s*(?:\\?["'])?)([^\s,;}\]]+)/giu;

export class DeveloperEffectivenessBenchmarkError extends Error {
  constructor(code, message, target = null, status = 'blocked') {
    super(message);
    this.name = 'DeveloperEffectivenessBenchmarkError';
    this.code = code;
    this.target = target;
    this.status = status;
  }
}

function fail(code, message, target = null, status = 'blocked') {
  throw new DeveloperEffectivenessBenchmarkError(code, message, target, status);
}

function assertPlainObject(value, code, message, target = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, message, target);
}

function assertString(value, code, message, target = null) {
  if (typeof value !== 'string' || !value.trim()) fail(code, message, target);
  return value.trim();
}

function assertContent(value, code, message, target = null) {
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

function gitResult(root, args, options = {}) {
  return spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: MAX_CAPTURE_BYTES,
    shell: false,
    ...options,
  });
}

function gitText(root, args, code, target) {
  const result = gitResult(root, args);
  if (result.error || result.status !== 0) {
    fail(code, `项目 ${target} 的 Git 基线无法读取`, target);
  }
  return result.stdout.trim();
}

function assertExternalProjectRoot(project) {
  const canonical = resolveCanonicalProjectRoot(project.root);
  let home;
  try {
    home = fs.realpathSync(os.homedir());
  } catch {
    home = path.resolve(os.homedir());
  }
  if (canonical === path.parse(canonical).root || canonical === home) {
    fail('dangerous_project_root', `项目 ${project.id} 指向危险范围`, project.id);
  }
  if (!fs.existsSync(path.join(canonical, 'package.json'))) {
    fail('project_package_missing', `项目 ${project.id} 缺少根 package.json`, project.id);
  }
  const topLevel = fs.realpathSync(gitText(canonical, ['rev-parse', '--show-toplevel'], 'git_root_unavailable', project.id));
  if (topLevel !== canonical) fail('project_root_mismatch', `项目 ${project.id} 不是独立 Git 根`, project.id);
  return canonical;
}

export function collectSourceBaseline(project) {
  const root = assertExternalProjectRoot(project);
  const branch = gitText(root, ['symbolic-ref', '--short', 'HEAD'], 'git_branch_unavailable', project.id);
  const commit = gitText(root, ['rev-parse', 'HEAD'], 'git_commit_unavailable', project.id).toLowerCase();
  if (!COMMIT_PATTERN.test(commit)) fail('invalid_project_commit', `项目 ${project.id} 缺少有效提交`, project.id);
  const statusText = gitText(root, ['status', '--porcelain=v1', '--untracked-files=all'], 'git_status_unavailable', project.id);
  return {
    projectId: project.id,
    projectName: project.name,
    sourceRoot: root,
    branch,
    commit,
    dirty: Boolean(statusText),
    statusDigest: sha256(statusText),
  };
}

export function publicSourceBaseline(baseline) {
  return {
    projectId: baseline.projectId,
    projectName: baseline.projectName,
    root: `project:${baseline.projectId}`,
    branch: baseline.branch,
    commit: baseline.commit,
    dirty: baseline.dirty,
    existingChangesExcluded: baseline.dirty,
    statusDigest: baseline.statusDigest,
  };
}

export function sourceBaselinesEqual(left, right) {
  return left.projectId === right.projectId
    && left.branch === right.branch
    && left.commit === right.commit
    && left.dirty === right.dirty
    && left.statusDigest === right.statusDigest;
}

export function assertSourceBaselineUnchanged(before, project) {
  const after = collectSourceBaseline(project);
  if (!sourceBaselinesEqual(before, after)) {
    fail('source_baseline_drifted', `项目 ${project.id} 在基准运行期间发生变化`, project.id, 'defect');
  }
  return after;
}

function replaceAllLiteral(content, value, replacement) {
  if (!value) return content;
  return content.split(value).join(replacement);
}

export function sanitizeCapturedOutput(value, { redactions = [], maxBytes = MAX_PERSISTED_LOG_BYTES } = {}) {
  let text = String(value || '').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  for (const redaction of redactions) {
    const original = String(redaction.value || '');
    const replacement = String(redaction.replacement || '[redacted]');
    text = replaceAllLiteral(text, original, replacement);
    text = replaceAllLiteral(text, original.replaceAll('\\', '/'), replacement);
    text = replaceAllLiteral(text, original.replaceAll('/', '\\'), replacement);
  }
  if (UNSAFE_OUTPUT_PATTERNS.some((pattern) => pattern.test(text))) {
    return { safe: false, code: 'sensitive_output_detected', text: null, truncated: false, redacted: false, bytes: 0 };
  }
  const redactedText = text.replace(REDACTABLE_SECRET_ASSIGNMENT, '$1[redacted]');
  const secretRedacted = redactedText !== text;
  text = redactedText;
  const encoded = Buffer.from(text, 'utf8');
  if (encoded.byteLength <= maxBytes) {
    return {
      safe: true,
      code: secretRedacted ? 'output_redacted' : 'output_safe',
      text,
      truncated: false,
      redacted: secretRedacted,
      bytes: encoded.byteLength,
    };
  }
  let shortened = encoded.subarray(0, maxBytes).toString('utf8');
  shortened = shortened.replace(/\uFFFD+$/u, '');
  return {
    safe: true,
    code: 'output_truncated',
    text: `${shortened}\n[输出已按安全上限截断]\n`,
    truncated: true,
    redacted: secretRedacted,
    bytes: maxBytes,
  };
}

export function writeJsonAtomic(repositoryRoot, targetPath, value, { mustNotExist = false, operations = {} } = {}) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  return atomicWriteProjectFile(repositoryRoot, targetPath, content, {
    label: '基准 JSON 证据',
    mustNotExist,
    operations,
  });
}

export function writeTextAtomic(repositoryRoot, targetPath, content, { mustNotExist = false, operations = {} } = {}) {
  return atomicWriteProjectFile(repositoryRoot, targetPath, String(content), {
    label: '基准文本证据',
    mustNotExist,
    operations,
  });
}

export function writeImmutableJson(repositoryRoot, targetPath, value) {
  const checked = resolveSafeProjectPath(repositoryRoot, targetPath, '不可变基准证据', { allowAbsolute: path.isAbsolute(targetPath) });
  if (!checked.exists) {
    writeJsonAtomic(repositoryRoot, checked.absolutePath, value, { mustNotExist: true });
    return { status: 'created', digest: sha256Json(value), path: checked.projectPath };
  }
  const existing = JSON.parse(fs.readFileSync(checked.absolutePath, 'utf8'));
  const existingDigest = sha256Json(existing);
  const requestedDigest = sha256Json(value);
  if (existingDigest !== requestedDigest) {
    fail('resume_input_mismatch', `恢复输入与既有证据不一致：${checked.projectPath}`, checked.projectPath);
  }
  return { status: 'reused', digest: existingDigest, path: checked.projectPath };
}

export function writeImmutableText(repositoryRoot, targetPath, content) {
  const requested = String(content);
  const checked = resolveSafeProjectPath(repositoryRoot, targetPath, '不可变基准证据', { allowAbsolute: path.isAbsolute(targetPath) });
  if (!checked.exists) {
    writeTextAtomic(repositoryRoot, checked.absolutePath, requested, { mustNotExist: true });
    return { status: 'created', digest: sha256(requested), path: checked.projectPath };
  }
  const existing = fs.readFileSync(checked.absolutePath, 'utf8');
  if (sha256(existing) !== sha256(requested)) {
    fail('resume_input_mismatch', `恢复输入与既有证据不一致：${checked.projectPath}`, checked.projectPath);
  }
  return { status: 'reused', digest: sha256(existing), path: checked.projectPath };
}

export function workspaceEnvironment(runRoot, workspaceRoot) {
  const token = sha256(workspaceRoot).slice(0, 12);
  const tempRoot = path.join(runRoot, 'tmp', token);
  const cacheRoot = path.join(runRoot, 'cache', token);
  fs.mkdirSync(tempRoot, { recursive: true });
  fs.mkdirSync(cacheRoot, { recursive: true });
  const environment = {
    ...process.env,
    GIT_CEILING_DIRECTORIES: path.dirname(workspaceRoot),
    TMPDIR: tempRoot,
    TMP: tempRoot,
    TEMP: tempRoot,
    npm_config_cache: path.join(cacheRoot, 'npm'),
    YARN_CACHE_FOLDER: path.join(cacheRoot, 'yarn'),
  };
  // 基准验收可能由 node:test 回归启动，不能让内部标记导致子测试被当作递归调用而跳过。
  delete environment.NODE_TEST_CONTEXT;
  return environment;
}

function resolveWorkspaceTarget(runRoot, category, name) {
  if (!['workspaces', 'evaluations', 'author'].includes(category)) {
    fail('invalid_workspace_category', `未知工作区类别：${category}`, category);
  }
  const safeName = assertString(name, 'invalid_workspace_name', '工作区名称不能为空', name || null);
  if (!/^[a-z0-9][a-z0-9._-]{1,119}$/u.test(safeName)) {
    fail('invalid_workspace_name', `工作区名称非法：${safeName}`, safeName);
  }
  const base = path.join(runRoot, category);
  const workspace = path.join(base, safeName);
  if (!isInside(base, workspace)) fail('unsafe_workspace_path', '工作区越出本轮输出范围', safeName);
  return { base, workspace };
}

export function prepareCommittedWorkspace({
  project, baseline, runRoot, category = 'workspaces', name, recoverExisting = false, operations = {},
}) {
  const target = resolveWorkspaceTarget(runRoot, category, name);
  if (fs.existsSync(target.workspace)) {
    if (!recoverExisting) fail('workspace_already_exists', `工作区已经存在：${name}`, name);
    const cleanup = cleanupBoundedWorkspace({ runRoot, workspace: target.workspace, operations });
    if (cleanup.status !== 'passed') fail(cleanup.code, `无法恢复遗留工作区：${name}`, cleanup.target);
  }
  assertSourceBaselineUnchanged(baseline, project);
  fs.mkdirSync(target.base, { recursive: true });
  const spawn = operations.spawnSync || spawnSync;
  const clone = spawn('git', ['clone', '--quiet', '--no-hardlinks', '--no-checkout', baseline.sourceRoot, target.workspace], {
    encoding: 'utf8', maxBuffer: MAX_CAPTURE_BYTES, shell: false,
  });
  if (clone.error || clone.status !== 0) fail('workspace_clone_failed', `项目 ${project.id} 的隔离副本创建失败`, project.id);
  const env = workspaceEnvironment(runRoot, target.workspace);
  const checkout = spawn('git', ['-C', target.workspace, 'checkout', '--quiet', '--detach', baseline.commit], {
    encoding: 'utf8', maxBuffer: MAX_CAPTURE_BYTES, shell: false, env,
  });
  if (checkout.error || checkout.status !== 0) fail('workspace_checkout_failed', `项目 ${project.id} 的提交检出失败`, project.id);
  const workspaceStatus = spawn('git', ['-C', target.workspace, 'status', '--porcelain=v1', '--untracked-files=all'], {
    encoding: 'utf8', maxBuffer: MAX_CAPTURE_BYTES, shell: false, env,
  });
  if (workspaceStatus.error || workspaceStatus.status !== 0 || workspaceStatus.stdout.trim()) {
    fail('workspace_not_clean', `项目 ${project.id} 的隔离副本包含非提交内容`, project.id, 'defect');
  }
  assertSourceBaselineUnchanged(baseline, project);
  return { workspace: target.workspace, environment: env, source: publicSourceBaseline(baseline) };
}

export function cleanupBoundedWorkspace({ runRoot, workspace, operations = {} }) {
  const resolved = path.resolve(workspace || '');
  const allowedBases = ['workspaces', 'evaluations', 'author'].map((item) => path.join(runRoot, item));
  if (!workspace || !allowedBases.some((base) => isInside(base, resolved))) {
    return { status: 'blocked', code: 'unsafe_cleanup_target', target: normalizeMachinePath(path.relative(runRoot, resolved)) };
  }
  try {
    const stats = fs.lstatSync(resolved);
    if (stats.isSymbolicLink()) {
      return { status: 'blocked', code: 'cleanup_target_symlink', target: normalizeMachinePath(path.relative(runRoot, resolved)) };
    }
    if (!stats.isDirectory()) {
      return { status: 'blocked', code: 'cleanup_target_not_directory', target: normalizeMachinePath(path.relative(runRoot, resolved)) };
    }
    const remove = operations.remove || fs.rmSync;
    remove(resolved, { recursive: true, force: true });
    return { status: 'passed', code: 'workspace_cleaned', target: normalizeMachinePath(path.relative(runRoot, resolved)) };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { status: 'passed', code: 'workspace_already_clean', target: normalizeMachinePath(path.relative(runRoot, resolved)) };
    }
    return {
      status: 'blocked',
      code: 'workspace_cleanup_failed',
      target: normalizeMachinePath(path.relative(runRoot, resolved)),
      error: error.message,
    };
  }
}

export function applyUnifiedPatch(workspace, patchContent, label, { spawn = spawnSync, env = process.env } = {}) {
  const patch = assertContent(patchContent, 'empty_patch', `${label}不能为空`, label);
  const result = spawn('git', ['-C', workspace, 'apply', '--binary', '--whitespace=nowarn', '-'], {
    input: patch,
    encoding: 'utf8',
    maxBuffer: MAX_CAPTURE_BYTES,
    shell: false,
    env,
  });
  if (result.error || result.status !== 0) {
    const detail = String(result.stderr || result.error?.message || '').trim().split('\n')[0];
    fail('patch_apply_failed', `${label}无法应用${detail ? `：${detail}` : ''}`, label);
  }
  return { status: 'passed', code: 'patch_applied', label };
}

export function commitWorkspaceBaseline(workspace, message, { spawn = spawnSync, env = process.env } = {}) {
  const common = { encoding: 'utf8', maxBuffer: MAX_CAPTURE_BYTES, shell: false, env };
  const add = spawn('git', ['-C', workspace, 'add', '-A'], common);
  if (add.error || add.status !== 0) fail('workspace_stage_failed', '隔离工作区无法建立固定起点', 'git-add');
  const commit = spawn('git', [
    '-C', workspace,
    '-c', 'user.name=Frontend AI Workflow Benchmark',
    '-c', 'user.email=benchmark@example.invalid',
    'commit', '--quiet', '--allow-empty', '-m', message,
  ], common);
  if (commit.error || commit.status !== 0) fail('workspace_commit_failed', '隔离工作区无法提交固定起点', 'git-commit');
  const revision = spawn('git', ['-C', workspace, 'rev-parse', 'HEAD'], common);
  if (revision.error || revision.status !== 0) fail('workspace_commit_unavailable', '隔离工作区无法读取固定起点', 'workspace');
  return revision.stdout.trim().toLowerCase();
}

export function captureWorkspaceChanges(workspace, { spawn = spawnSync, env = process.env } = {}) {
  const common = { encoding: 'utf8', maxBuffer: MAX_CAPTURE_BYTES, shell: false, env };
  const intent = spawn('git', ['-C', workspace, 'add', '-N', '.'], common);
  if (intent.error || intent.status !== 0) fail('workspace_diff_prepare_failed', '无法准备工作区差异', 'git-add-intent');
  let diff;
  let names;
  let numstat;
  try {
    diff = spawn('git', ['-C', workspace, 'diff', '--binary', 'HEAD'], common);
    names = spawn('git', ['-C', workspace, 'diff', '--name-only', '-z', 'HEAD'], common);
    numstat = spawn('git', ['-C', workspace, 'diff', '--numstat', 'HEAD'], common);
    if ([diff, names, numstat].some((result) => result.error || result.status !== 0)) {
      fail('workspace_diff_failed', '无法读取工作区差异', 'git-diff');
    }
  } finally {
    // 只撤销隔离副本中的 intent-to-add 索引状态，保留代理产生的工作区内容。
    const reset = spawn('git', ['-C', workspace, 'reset', '--quiet'], common);
    if (reset.error || reset.status !== 0) fail('workspace_index_restore_failed', '无法恢复隔离工作区索引', 'git-reset');
  }
  const changedPaths = names.stdout.split('\0').filter(Boolean).map((item) => normalizeMachinePath(item));
  let insertions = 0;
  let deletions = 0;
  for (const line of numstat.stdout.split('\n').filter(Boolean)) {
    const [added, removed] = line.split('\t');
    if (/^[0-9]+$/u.test(added)) insertions += Number(added);
    if (/^[0-9]+$/u.test(removed)) deletions += Number(removed);
  }
  return {
    patch: diff.stdout,
    changedPaths,
    diffstat: { files: changedPaths.length, insertions, deletions },
  };
}

export function scopedBenchmarkProjects(config) {
  if (!config.smokeCase) return config.projects;
  const projectId = config.smokeCase.split('-')[1];
  return config.projects.filter((project) => project.id === projectId);
}

function patchPaths(patchContent) {
  const found = new Set();
  for (const line of String(patchContent || '').split('\n')) {
    const match = line.match(/^(?:---|\+\+\+) (?:[ab]\/)?(.+)$/u);
    if (!match || match[1] === '/dev/null') continue;
    const candidate = match[1].split('\t')[0];
    found.add(assertSafeRelativePath(candidate, '补丁目标'));
  }
  return [...found].sort();
}

function allowedByPrefixes(candidate, allowedPaths) {
  return allowedPaths.some((allowed) => candidate === allowed || candidate.startsWith(`${allowed}/`));
}

function validatePatchTargets(content, label, allowedPaths, { evaluator = false } = {}) {
  const paths = patchPaths(content);
  if (paths.length === 0) fail('patch_has_no_paths', `${label}没有可识别的项目相对路径`, label);
  for (const candidate of paths) {
    if (FORBIDDEN_CASE_PATHS.some((prefix) => candidate === prefix.replace(/\/$/u, '') || candidate.startsWith(prefix))) {
      fail('case_patch_forbidden_path', `${label}修改了禁止路径：${candidate}`, candidate);
    }
    if (evaluator && candidate.startsWith('.benchmark-evaluator/')) continue;
    if (!allowedByPrefixes(candidate, allowedPaths)) {
      fail('case_patch_outside_allowed_paths', `${label}越出允许路径：${candidate}`, candidate);
    }
  }
  return paths;
}

function validateAcceptance(acceptance, caseId) {
  assertPlainObject(acceptance, 'invalid_acceptance', `用例 ${caseId} 缺少验收命令`, caseId);
  if (acceptance.command !== 'node') fail('unsupported_acceptance_command', `用例 ${caseId} 只允许 node 验收入口`, caseId);
  if (!Array.isArray(acceptance.args) || acceptance.args.length === 0 || acceptance.args.some((item) => typeof item !== 'string' || !item)) {
    fail('invalid_acceptance_args', `用例 ${caseId} 的验收参数非法`, caseId);
  }
  const allowedFlags = new Set(['--test', '--test-reporter=spec']);
  let evaluatorTargets = 0;
  for (const argument of acceptance.args) {
    if (argument.startsWith('-')) {
      if (!allowedFlags.has(argument) && !argument.startsWith('--test-name-pattern=')) {
        fail('unsafe_acceptance_argument', `用例 ${caseId} 的验收参数不在允许范围：${argument}`, caseId);
      }
      continue;
    }
    const target = assertSafeRelativePath(argument, '验收参数路径');
    if (!target.startsWith('.benchmark-evaluator/')) {
      fail('unsafe_acceptance_target', `用例 ${caseId} 的验收目标必须位于隔离评估目录`, caseId);
    }
    evaluatorTargets += 1;
  }
  if (!acceptance.args.includes('--test') || evaluatorTargets === 0) {
    fail('invalid_acceptance_contract', `用例 ${caseId} 的验收必须使用 node --test 和隔离评估文件`, caseId);
  }
  const timeoutMs = Number(acceptance.timeoutMs);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 10 * 60_000) {
    fail('invalid_acceptance_timeout', `用例 ${caseId} 的验收超时非法`, caseId);
  }
  return { command: 'node', args: acceptance.args, timeoutMs };
}

function expectedCaseId(projectId, complexity, index = 1) {
  return `SYN-${projectId}-${COMPLEXITY_CODES[complexity]}${String(index).padStart(2, '0')}`;
}

export function validateSyntheticCase(candidate) {
  assertPlainObject(candidate, 'invalid_case', '模拟用例必须是对象');
  const id = assertString(candidate.id, 'invalid_case_id', '模拟用例缺少 ID', candidate.id || null);
  const match = id.match(CASE_ID_PATTERN);
  if (!match) fail('invalid_case_id', `模拟用例 ID 非法：${id}`, id);
  const projectId = assertString(candidate.projectId, 'invalid_case_project', `用例 ${id} 缺少项目 ID`, id);
  if (match[1] !== projectId || !EXPECTED_PROJECT_IDS.includes(projectId)) {
    fail('case_project_mismatch', `用例 ${id} 的项目 ID 不匹配`, id);
  }
  const complexity = assertString(candidate.complexity, 'invalid_case_complexity', `用例 ${id} 缺少复杂度`, id);
  if (COMPLEXITY_CODES[complexity] !== match[2] || !COMPLEXITY_MATRIX[projectId]?.includes(complexity)) {
    fail('case_complexity_mismatch', `用例 ${id} 的复杂度不符合第一轮矩阵`, id);
  }
  const expectedId = expectedCaseId(projectId, complexity);
  if (id !== expectedId) fail('unexpected_case_id', `用例 ID 应为 ${expectedId}`, id);
  const title = assertString(candidate.title, 'invalid_case_title', `用例 ${id} 缺少标题`, id);
  const taskType = assertString(candidate.taskType, 'invalid_case_type', `用例 ${id} 缺少任务类型`, id);
  if (!TASK_TYPES.has(taskType)) fail('invalid_case_type', `用例 ${id} 的任务类型非法`, id);
  const publicRequirement = assertString(candidate.publicRequirement, 'invalid_public_requirement', `用例 ${id} 缺少公开需求`, id);
  if (publicRequirement.length < 80) fail('public_requirement_too_short', `用例 ${id} 的公开需求过短`, id);
  if (/evaluator|reference\.patch|隐藏验收|参考实现/iu.test(publicRequirement)) {
    fail('public_requirement_leaks_evaluator', `用例 ${id} 的公开需求泄露了隐藏材料`, id);
  }
  if (candidate.requiresExternalSystem !== false || candidate.usesNetwork !== false) {
    fail('case_requires_external_system', `用例 ${id} 依赖外部系统或网络`, id);
  }
  if (!Array.isArray(candidate.allowedPaths) || candidate.allowedPaths.length === 0) {
    fail('case_allowed_paths_missing', `用例 ${id} 缺少允许路径`, id);
  }
  const allowedPaths = [...new Set(candidate.allowedPaths.map((item) => assertSafeRelativePath(item, '用例允许路径')))];
  // 补丁末尾换行属于 unified diff 语法，校验时不能像普通文本一样 trim。
  const seedPatch = assertContent(candidate.seedPatch, 'empty_patch', `用例 ${id} 缺少 seed patch`, id);
  const evaluatorPatch = assertContent(candidate.evaluatorPatch, 'empty_patch', `用例 ${id} 缺少 evaluator patch`, id);
  const referencePatch = assertContent(candidate.referencePatch, 'empty_patch', `用例 ${id} 缺少 reference patch`, id);
  const seedPaths = validatePatchTargets(seedPatch, `${id}.seed`, allowedPaths);
  const evaluatorPaths = validatePatchTargets(evaluatorPatch, `${id}.evaluator`, allowedPaths, { evaluator: true });
  const referencePaths = validatePatchTargets(referencePatch, `${id}.reference`, allowedPaths);
  const acceptance = validateAcceptance(candidate.acceptance, id);
  if (!Array.isArray(candidate.availabilityChecks)) {
    fail('invalid_availability_checks', `用例 ${id} 的可用性检查必须是数组`, id);
  }
  const availabilityChecks = candidate.availabilityChecks.map((item, index) => {
    assertPlainObject(item, 'invalid_availability_check', `用例 ${id} 的可用性检查必须是对象`, `${id}.${index}`);
    if (item.kind !== 'file') fail('unsupported_availability_check', `用例 ${id} 只允许文件可用性检查`, id);
    const target = assertSafeRelativePath(item.target, '可用性检查路径');
    if (!allowedByPrefixes(target, allowedPaths)) {
      fail('availability_check_outside_allowed_paths', `用例 ${id} 的可用性检查越出允许路径`, target);
    }
    return { kind: 'file', target };
  });
  if (!Array.isArray(candidate.clarifications)) fail('invalid_clarifications', `用例 ${id} 的澄清预案必须是数组`, id);
  const clarifications = candidate.clarifications.map((item, index) => {
    assertPlainObject(item, 'invalid_clarification', `用例 ${id} 的澄清项必须是对象`, `${id}.${index}`);
    return {
      pattern: assertString(item.pattern, 'invalid_clarification_pattern', `用例 ${id} 的澄清模式不能为空`, id),
      answer: assertString(item.answer, 'invalid_clarification_answer', `用例 ${id} 的澄清答案不能为空`, id),
    };
  });
  const maxReworks = Number(candidate.maxReworks);
  const maxClarifications = Number(candidate.maxClarifications);
  if (!Number.isInteger(maxReworks) || maxReworks < 0 || maxReworks > 3) {
    fail('invalid_max_reworks', `用例 ${id} 的返工上限非法`, id);
  }
  if (!Number.isInteger(maxClarifications) || maxClarifications < 0 || maxClarifications > 3) {
    fail('invalid_max_clarifications', `用例 ${id} 的澄清上限非法`, id);
  }
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    id,
    projectId,
    title,
    complexity,
    taskType,
    publicRequirement,
    allowedPaths,
    seedPatch,
    evaluatorPatch,
    referencePatch,
    clarifications,
    acceptance,
    availabilityChecks,
    maxReworks,
    maxClarifications,
    requiresExternalSystem: false,
    usesNetwork: false,
    patchPaths: { seed: seedPaths, evaluator: evaluatorPaths, reference: referencePaths },
  };
}

function caseAssetDigests(candidate) {
  return {
    publicRequirement: sha256(candidate.publicRequirement),
    seedPatch: sha256(candidate.seedPatch),
    evaluatorPatch: sha256(candidate.evaluatorPatch),
    referencePatch: sha256(candidate.referencePatch),
    clarifications: sha256Json(candidate.clarifications),
    acceptance: sha256Json(candidate.acceptance),
    availabilityChecks: sha256Json(candidate.availabilityChecks),
  };
}

export function freezeSyntheticCases(candidates, frozenAt = new Date().toISOString(), projectIds = EXPECTED_PROJECT_IDS) {
  const expectedProjectIds = [...new Set(projectIds)].sort();
  if (expectedProjectIds.length === 0 || expectedProjectIds.some((item) => !EXPECTED_PROJECT_IDS.includes(item))) {
    fail('invalid_case_project_scope', '冻结用例的项目范围非法', 'cases');
  }
  const expectedCaseCount = expectedProjectIds.reduce((count, projectId) => count + COMPLEXITY_MATRIX[projectId].length, 0);
  if (!Array.isArray(candidates) || candidates.length !== expectedCaseCount) {
    fail('invalid_case_count', `当前范围必须恰好冻结 ${expectedCaseCount} 个用例`, 'cases');
  }
  const cases = candidates.map(validateSyntheticCase);
  const ids = new Set(cases.map((item) => item.id));
  if (ids.size !== expectedCaseCount) fail('duplicate_case_id', '模拟用例 ID 重复', 'cases');
  if (cases.some((item) => !expectedProjectIds.includes(item.projectId))) {
    fail('case_project_outside_scope', '模拟用例越出冻结项目范围', 'cases');
  }
  for (const projectId of expectedProjectIds) {
    const expected = COMPLEXITY_MATRIX[projectId].map((complexity) => expectedCaseId(projectId, complexity)).sort();
    const actual = cases.filter((item) => item.projectId === projectId).map((item) => item.id).sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      fail('case_matrix_mismatch', `项目 ${projectId} 的用例不符合复杂度矩阵`, projectId);
    }
  }
  const frozenCases = cases.sort((left, right) => left.id.localeCompare(right.id)).map((item) => ({
    ...item,
    assetDigests: caseAssetDigests(item),
  }));
  const manifest = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    synthetic: true,
    frozenAt,
    caseCount: frozenCases.length,
    cases: frozenCases,
  };
  if (expectedProjectIds.length !== EXPECTED_PROJECT_IDS.length) manifest.projectIds = expectedProjectIds;
  return { ...manifest, manifestDigest: sha256Json(manifest) };
}

export function verifyFrozenCases(manifest) {
  assertPlainObject(manifest, 'invalid_frozen_manifest', '冻结清单必须是对象');
  if (manifest.schemaVersion !== BENCHMARK_SCHEMA_VERSION || manifest.synthetic !== true) {
    fail('invalid_frozen_manifest', '冻结清单版本或合成标记非法', 'manifest');
  }
  const rebuilt = freezeSyntheticCases(manifest.cases, manifest.frozenAt, manifest.projectIds || EXPECTED_PROJECT_IDS);
  if (rebuilt.manifestDigest !== manifest.manifestDigest) {
    fail('frozen_manifest_drifted', '冻结清单内容摘要发生变化', 'manifest', 'defect');
  }
  return rebuilt;
}

export function detectExecutionRoute({ mode, eventText = '', finalRoute = 'unknown', changedPaths = [] }) {
  if (!['plugin', 'baseline'].includes(mode)) fail('invalid_execution_mode', `未知执行组：${mode}`, mode);
  const normalizedPaths = changedPaths.map(normalizeMachinePath);
  const managementPaths = normalizedPaths.filter((candidate) => MANAGEMENT_PATHS.some((prefix) => (
    candidate === prefix.replace(/\/$/u, '') || candidate.startsWith(prefix)
  )));
  if (mode === 'baseline') {
    const valid = finalRoute === 'baseline' && managementPaths.length === 0;
    return {
      route: 'baseline',
      valid,
      code: valid ? 'baseline_route_confirmed' : 'baseline_route_contaminated',
      evidence: { finalRoute, managementPaths },
    };
  }
  const fastEvent = /frontend-fast-change/iu.test(eventText);
  const fullEvent = /(?:frontend-change\/SKILL\.md|frontend-ai-workflow:frontend-change)/iu.test(eventText);
  const fullArtifacts = managementPaths.some((candidate) => candidate.startsWith('requirements/') || candidate.startsWith('openspec/'));
  if (finalRoute === 'fast' && fastEvent && !fullArtifacts) {
    return { route: 'fast', valid: true, code: 'plugin_fast_route_confirmed', evidence: { fastEvent, fullEvent, managementPaths } };
  }
  if (finalRoute === 'full' && fullArtifacts && (fullEvent || managementPaths.length >= 2)) {
    return { route: 'full', valid: true, code: 'plugin_full_route_confirmed', evidence: { fastEvent, fullEvent, managementPaths } };
  }
  return {
    route: ['fast', 'full'].includes(finalRoute) ? finalRoute : 'unknown',
    valid: false,
    code: 'plugin_route_evidence_missing',
    evidence: { fastEvent, fullEvent, managementPaths, finalRoute },
  };
}
