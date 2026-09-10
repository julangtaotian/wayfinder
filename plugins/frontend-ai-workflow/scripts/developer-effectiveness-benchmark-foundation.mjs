import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  COMMIT_PATTERN, MAX_CAPTURE_BYTES, MAX_PERSISTED_LOG_BYTES,
  REDACTABLE_SECRET_ASSIGNMENT, UNSAFE_OUTPUT_PATTERNS,
  assertContent, assertString, fail, isInside, normalizeMachinePath, sha256, sha256Json,
} from './developer-effectiveness-benchmark-contract.mjs';
import {
  atomicWriteProjectFile,
  resolveCanonicalProjectRoot,
  resolveSafeProjectPath,
} from './project-path-safety.mjs';

export {
  BENCHMARK_OUTPUT_DIRECTORY, BENCHMARK_SCHEMA_VERSION, COMPLEXITY_MATRIX,
  EXPECTED_CASE_COUNT, EXPECTED_PROJECT_IDS, EXPECTED_RUN_COUNT,
  MAX_CAPTURE_BYTES, MAX_PERSISTED_LOG_BYTES, MIN_DISK_RESERVE_BYTES,
  DeveloperEffectivenessBenchmarkError, assertSafeRelativePath, comparablePathsEqual,
  isInside, normalizeComparablePath, normalizeMachinePath, resolveBenchmarkRunRoot,
  sha256, sha256Json, validateBenchmarkConfig,
} from './developer-effectiveness-benchmark-contract.mjs';
export {
  detectExecutionRoute, freezeSyntheticCases, validateSyntheticCase, verifyFrozenCases,
} from './developer-effectiveness-benchmark-cases.mjs';
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
