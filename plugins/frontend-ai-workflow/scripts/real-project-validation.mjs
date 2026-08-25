import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { runBootstrap } from './bootstrap-project.mjs';
import { checkProject } from './check-project.mjs';
import { parseCliArgs } from './cli-arguments.mjs';
import { inspectProject } from './inspect-project.mjs';
import { inspectTestContext } from './inspect-test-context.mjs';
import { resolveCanonicalProjectRoot, resolveSafeProjectPath } from './project-path-safety.mjs';
import { runUpdate } from './update-project.mjs';

const MATRIX_SCHEMA_VERSION = 1;
const EXPECTED_STATUSES = new Set(['passed', 'limited', 'blocked']);
const STAGES = new Set(['baseline', 'inspection', 'lifecycle', 'native-test', 'all']);
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,79}$/iu;
const PROJECT_ID_PATTERN = /^P[1-9][0-9]*$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/iu;
const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
const MAX_PERSISTED_LOG_BYTES = 128 * 1024;
const MIN_DISK_RESERVE_BYTES = 512 * 1024 * 1024;
const SENSITIVE_OUTPUT_PATTERNS = [
  /authorization\s*:\s*bearer\s+\S+/iu,
  /cookie\s*:\s*\S+/iu,
  /(?:access[_-]?token|api[_-]?key|client[_-]?secret|password|private[_-]?key)\s*[=:]\s*\S+/iu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
];
const EXCLUDED_SCAN_DIRECTORIES = new Set(['.git', 'node_modules']);

export class RealProjectValidationError extends Error {
  constructor(code, message, target = null, status = 'blocked') {
    super(message);
    this.name = 'RealProjectValidationError';
    this.code = code;
    this.status = status;
    this.target = target;
  }
}

export function normalizeMachinePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//u, '');
}

function validationFailure(error, fallbackTarget = null) {
  if (error instanceof RealProjectValidationError) {
    return {
      status: error.status,
      code: error.code,
      target: error.target ?? fallbackTarget,
      error: error.message,
    };
  }
  return {
    status: 'defect',
    code: 'validation_internal_error',
    target: fallbackTarget,
    error: error.message,
  };
}

function isInside(root, candidate, { allowRoot = false } = {}) {
  const relative = path.relative(root, candidate);
  return (allowRoot && relative === '')
    || Boolean(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function assertPlainObject(value, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RealProjectValidationError(code, message);
  }
}

function assertExternalProjectRoot(value, projectId) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new RealProjectValidationError('invalid_project_root', `项目 ${projectId} 的 root 必须是绝对路径`, projectId);
  }
  const root = resolveCanonicalProjectRoot(value);
  const filesystemRoot = path.parse(root).root;
  let userHome;
  try {
    userHome = fs.realpathSync(os.homedir());
  } catch {
    userHome = path.resolve(os.homedir());
  }
  if (root === filesystemRoot || root === userHome) {
    throw new RealProjectValidationError('dangerous_project_root', `项目 ${projectId} 指向危险范围`, projectId);
  }
  if (!fs.existsSync(path.join(root, 'package.json'))) {
    throw new RealProjectValidationError('project_package_missing', `项目 ${projectId} 缺少根 package.json`, projectId);
  }
  return root;
}

function validationBase(repositoryRoot) {
  return path.join(repositoryRoot, 'outputs', 'real-project-validation');
}

function resolveInsideValidationBase(repositoryRoot, candidate, label, { allowBase = false } = {}) {
  const canonicalRepository = resolveCanonicalProjectRoot(repositoryRoot);
  const base = validationBase(canonicalRepository);
  const resolved = path.resolve(candidate);
  if (!isInside(base, resolved, { allowRoot: allowBase })) {
    throw new RealProjectValidationError('unsafe_validation_path', `${label}必须位于 outputs/real-project-validation 内`, normalizeMachinePath(path.relative(canonicalRepository, resolved)));
  }
  const repositoryRelative = normalizeMachinePath(path.relative(canonicalRepository, resolved));
  resolveSafeProjectPath(canonicalRepository, repositoryRelative, label);
  return { repositoryRoot: canonicalRepository, base, resolved, repositoryRelative };
}

function expectedStatuses(value, projectId, stage) {
  const values = Array.isArray(value) ? value : [value];
  if (!values.length || values.some((item) => !EXPECTED_STATUSES.has(item))) {
    throw new RealProjectValidationError('invalid_expected_status', `项目 ${projectId} 的 ${stage} 期望状态非法`, `${projectId}.${stage}`);
  }
  return values;
}

export function validateMatrix(matrix) {
  assertPlainObject(matrix, 'invalid_matrix', '真实项目矩阵必须是 JSON 对象');
  if (matrix.schemaVersion !== MATRIX_SCHEMA_VERSION) {
    throw new RealProjectValidationError('unsupported_matrix_schema', `矩阵 schemaVersion 必须为 ${MATRIX_SCHEMA_VERSION}`, 'schemaVersion');
  }
  if (typeof matrix.runId !== 'string' || !RUN_ID_PATTERN.test(matrix.runId)) {
    throw new RealProjectValidationError('invalid_run_id', 'runId 只能包含字母、数字、点、下划线和短横线', 'runId');
  }
  if (!Array.isArray(matrix.projects) || matrix.projects.length === 0) {
    throw new RealProjectValidationError('empty_project_matrix', '矩阵至少需要一个项目', 'projects');
  }
  const ids = new Set();
  const projects = matrix.projects.map((project) => {
    assertPlainObject(project, 'invalid_project_entry', '矩阵项目必须是对象');
    if (typeof project.id !== 'string' || !PROJECT_ID_PATTERN.test(project.id)) {
      throw new RealProjectValidationError('invalid_project_id', '项目 ID 必须使用 P1、P2 等稳定格式', project.id || null);
    }
    if (ids.has(project.id)) {
      throw new RealProjectValidationError('duplicate_project_id', `项目 ID 重复：${project.id}`, project.id);
    }
    ids.add(project.id);
    if (typeof project.branch !== 'string' || !project.branch.trim()) {
      throw new RealProjectValidationError('invalid_project_branch', `项目 ${project.id} 缺少分支`, project.id);
    }
    if (typeof project.commit !== 'string' || !COMMIT_PATTERN.test(project.commit)) {
      throw new RealProjectValidationError('invalid_project_commit', `项目 ${project.id} 缺少 40 位提交`, project.id);
    }
    if (typeof project.role !== 'string' || !project.role.trim()) {
      throw new RealProjectValidationError('invalid_project_role', `项目 ${project.id} 缺少验证角色`, project.id);
    }
    assertPlainObject(project.expected, 'invalid_project_expectation', `项目 ${project.id} 缺少 expected`);
    const expected = {
      inspection: expectedStatuses(project.expected.inspection, project.id, 'inspection'),
      lifecycle: expectedStatuses(project.expected.lifecycle, project.id, 'lifecycle'),
      nativeTest: expectedStatuses(project.expected.nativeTest, project.id, 'nativeTest'),
    };
    if (project.testArgs !== undefined && (!Array.isArray(project.testArgs) || project.testArgs.some((item) => typeof item !== 'string'))) {
      throw new RealProjectValidationError('invalid_test_args', `项目 ${project.id} 的 testArgs 必须是字符串数组`, project.id);
    }
    return {
      ...project,
      commit: project.commit.toLowerCase(),
      expected,
      testArgs: project.testArgs || [],
    };
  });
  return { schemaVersion: MATRIX_SCHEMA_VERSION, runId: matrix.runId, projects };
}

export function loadValidationMatrix({ repositoryRoot, matrixPath }) {
  const canonicalRepository = resolveCanonicalProjectRoot(repositoryRoot);
  const checked = resolveInsideValidationBase(canonicalRepository, matrixPath, '矩阵文件');
  if (!fs.existsSync(checked.resolved) || !fs.statSync(checked.resolved).isFile()) {
    throw new RealProjectValidationError('matrix_file_missing', `矩阵文件不存在：${checked.repositoryRelative}`, checked.repositoryRelative);
  }
  return validateMatrix(JSON.parse(fs.readFileSync(checked.resolved, 'utf8')));
}

function gitResult(root, args, options = {}) {
  return spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: MAX_CAPTURE_BYTES,
    shell: false,
    ...options,
  });
}

function gitText(root, args, code, projectId) {
  const result = gitResult(root, args);
  if (result.status !== 0) {
    throw new RealProjectValidationError(code, `项目 ${projectId} 的 Git 基线无法读取`, projectId);
  }
  return result.stdout.trim();
}

function baselineMatches(left, right) {
  return left.commit === right.commit
    && left.branch === right.branch
    && left.dirty === right.dirty
    && left.statusDigest === right.statusDigest;
}

export function collectProjectBaseline(project) {
  let sourceRoot;
  try {
    sourceRoot = assertExternalProjectRoot(project.root, project.id);
    const topLevel = fs.realpathSync(gitText(sourceRoot, ['rev-parse', '--show-toplevel'], 'git_root_unavailable', project.id));
    const branch = gitText(sourceRoot, ['symbolic-ref', '--short', 'HEAD'], 'git_branch_unavailable', project.id);
    const commit = gitText(sourceRoot, ['rev-parse', 'HEAD'], 'git_commit_unavailable', project.id).toLowerCase();
    const statusText = gitText(sourceRoot, ['status', '--porcelain=v1', '--untracked-files=all'], 'git_status_unavailable', project.id);
    const statusDigest = crypto.createHash('sha256').update(statusText).digest('hex');
    const base = {
      projectId: project.id,
      root: `project:${project.id}`,
      branch,
      commit,
      dirty: Boolean(statusText),
      statusDigest,
    };
    if (topLevel !== sourceRoot) return { ...base, status: 'blocked', code: 'project_root_mismatch' };
    if (branch !== project.branch) return { ...base, status: 'blocked', code: 'project_branch_mismatch' };
    if (commit !== project.commit.toLowerCase()) return { ...base, status: 'blocked', code: 'project_commit_mismatch' };
    if (statusText) return { ...base, status: 'blocked', code: 'project_workspace_dirty' };
    return { ...base, status: 'passed', code: 'project_baseline_matched' };
  } catch (error) {
    return {
      projectId: project.id,
      root: `project:${project.id}`,
      branch: null,
      commit: null,
      dirty: null,
      statusDigest: null,
      ...validationFailure(error, project.id),
    };
  }
}

function packageNames(profile) {
  return new Set((profile?.packages || []).map((item) => item.name));
}

function discoverNestedPackages(root, limit = 10_000) {
  const found = [];
  let visited = 0;
  const walk = (directory) => {
    if (visited >= limit) return;
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (visited >= limit) return;
      visited += 1;
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_SCAN_DIRECTORIES.has(entry.name)) walk(absolute);
      } else if (entry.isFile() && entry.name === 'package.json' && directory !== root) {
        found.push(normalizeMachinePath(path.relative(root, absolute)));
      }
    }
  };
  walk(root);
  return { paths: found.sort(), bounded: true, visited, limit, truncated: visited >= limit };
}

function expectationIssues(project, facts) {
  const expected = project.facts || {};
  const issues = [];
  const compare = (field, actual) => {
    if (expected[field] !== undefined && expected[field] !== actual) {
      issues.push({ field, expected: expected[field], actual });
    }
  };
  compare('preset', facts.preset);
  compare('packageManager', facts.packageManager);
  compare('runner', facts.runner.name);
  compare('runnerCertification', facts.runner.certification);
  compare('testCommandStatus', facts.testCommand.status);
  compare('workspaceDeclared', facts.workspaceDeclared);
  compare('testFileCount', facts.testFiles.length);
  if (Array.isArray(expected.buildTools)) {
    const actual = [...facts.buildTools].sort();
    const wanted = [...expected.buildTools].sort();
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) issues.push({ field: 'buildTools', expected: wanted, actual });
  }
  if (Number.isInteger(expected.minimumNestedPackages) && facts.nestedPackages.paths.length < expected.minimumNestedPackages) {
    issues.push({ field: 'minimumNestedPackages', expected: expected.minimumNestedPackages, actual: facts.nestedPackages.paths.length });
  }
  if (Array.isArray(expected.excludedTestFiles)) {
    const unexpected = expected.excludedTestFiles.filter((testFile) => facts.testFiles.includes(testFile));
    if (unexpected.length) issues.push({ field: 'excludedTestFiles', expected: [], actual: unexpected });
  }
  return issues;
}

export function inspectProjectFacts(project) {
  const baselineBefore = collectProjectBaseline(project);
  if (baselineBefore.status !== 'passed') return { ...baselineBefore, stage: 'inspection' };
  try {
    const root = assertExternalProjectRoot(project.root, project.id);
    const inspection = inspectProject(root);
    const testContext = inspectTestContext(root);
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const names = packageNames(inspection.dependencyProfile);
    const nestedPackages = discoverNestedPackages(root);
    const facts = {
      projectId: project.id,
      stage: 'inspection',
      root: `project:${project.id}`,
      commit: baselineBefore.commit,
      preset: inspection.preset,
      packageManager: inspection.packageManager,
      buildTools: ['vite', 'webpack'].filter((name) => names.has(name)),
      dependencyProfile: {
        schemaVersion: inspection.dependencyProfile.schemaVersion,
        totalPackages: inspection.dependencyProfile.totalPackages,
        groupCounts: inspection.dependencyProfile.groupCounts,
        packageNames: [...names].sort(),
        diagnostics: inspection.dependencyProfile.diagnostics,
      },
      targetProfile: inspection.targetProfile,
      testCommand: testContext.testCommand,
      runner: testContext.runner,
      testFiles: testContext.testFiles,
      nestedPackages,
      workspaceDeclared: Boolean(packageJson.workspaces),
      commandEvidence: {
        testStatus: inspection.commandSemantics.test.status,
        testExecuted: inspection.commandSemantics.test.executed,
        platformStatus: inspection.platformCommands.status,
        platformExecuted: inspection.platformCommands.executed,
      },
      warnings: testContext.warnings,
    };
    const baselineAfter = collectProjectBaseline(project);
    if (baselineAfter.status !== 'passed' || !baselineMatches(baselineBefore, baselineAfter)) {
      return { ...facts, status: 'defect', code: 'source_workspace_changed_during_inspection' };
    }
    const issues = expectationIssues(project, facts);
    return {
      ...facts,
      status: issues.length ? 'defect' : 'passed',
      code: issues.length ? 'inspection_expectation_mismatch' : 'inspection_facts_matched',
      issues,
    };
  } catch (error) {
    return { projectId: project.id, stage: 'inspection', root: `project:${project.id}`, ...validationFailure(error, project.id) };
  }
}

function workspaceEnvironment(runRoot, workspaceRoot) {
  const tempRoot = path.join(runRoot, 'tmp', path.basename(workspaceRoot));
  const cacheRoot = path.join(runRoot, 'cache', path.basename(workspaceRoot));
  fs.mkdirSync(tempRoot, { recursive: true });
  fs.mkdirSync(cacheRoot, { recursive: true });
  return {
    ...process.env,
    GIT_CEILING_DIRECTORIES: path.dirname(workspaceRoot),
    TMPDIR: tempRoot,
    TMP: tempRoot,
    TEMP: tempRoot,
    npm_config_cache: path.join(cacheRoot, 'npm'),
    YARN_CACHE_FOLDER: path.join(cacheRoot, 'yarn'),
  };
}

export function prepareWorkspace({ project, runRoot, purpose = 'lifecycle' }) {
  const workspaceBase = path.join(runRoot, 'workspaces');
  fs.mkdirSync(workspaceBase, { recursive: true });
  const workspaceRoot = path.join(workspaceBase, `${project.id.toLowerCase()}-${purpose}`);
  if (!isInside(workspaceBase, workspaceRoot)) {
    return { projectId: project.id, status: 'blocked', code: 'unsafe_workspace_path', workspace: null };
  }
  if (fs.existsSync(workspaceRoot)) {
    return { projectId: project.id, status: 'blocked', code: 'workspace_already_exists', workspace: null };
  }
  const sourceBefore = collectProjectBaseline(project);
  if (sourceBefore.status !== 'passed') return { ...sourceBefore, workspace: null };
  const clone = spawnSync('git', ['clone', '--quiet', '--no-hardlinks', '--no-checkout', project.root, workspaceRoot], {
    encoding: 'utf8', maxBuffer: MAX_CAPTURE_BYTES, shell: false,
  });
  if (clone.status !== 0) {
    return { projectId: project.id, status: 'blocked', code: 'workspace_clone_failed', workspace: null, exitCode: clone.status };
  }
  const env = workspaceEnvironment(runRoot, workspaceRoot);
  const checkout = gitResult(workspaceRoot, ['checkout', '--quiet', '--detach', project.commit], { env });
  if (checkout.status !== 0) {
    return { projectId: project.id, status: 'blocked', code: 'workspace_checkout_failed', workspace: workspaceRoot, exitCode: checkout.status };
  }
  const sourceAfter = collectProjectBaseline(project);
  if (sourceAfter.status !== 'passed' || !baselineMatches(sourceBefore, sourceAfter)) {
    return { projectId: project.id, status: 'defect', code: 'source_workspace_changed_during_clone', workspace: workspaceRoot };
  }
  return { projectId: project.id, status: 'passed', code: 'workspace_prepared', workspace: workspaceRoot, env };
}

export function cleanupWorkspace({ workspace, runRoot, operations = {} }) {
  const workspaceBase = path.join(runRoot, 'workspaces');
  const resolved = path.resolve(workspace || '');
  if (!workspace || !isInside(workspaceBase, resolved)) {
    return { status: 'blocked', code: 'unsafe_cleanup_target', target: normalizeMachinePath(path.relative(runRoot, resolved)) };
  }
  try {
    const stats = fs.lstatSync(resolved);
    if (stats.isSymbolicLink()) return { status: 'blocked', code: 'cleanup_target_symlink', target: normalizeMachinePath(path.relative(runRoot, resolved)) };
    const remove = operations.remove || fs.rmSync;
    remove(resolved, { recursive: true, force: true });
    return { status: 'passed', code: 'workspace_cleaned', target: normalizeMachinePath(path.relative(runRoot, resolved)) };
  } catch (error) {
    if (error?.code === 'ENOENT') return { status: 'passed', code: 'workspace_already_clean', target: normalizeMachinePath(path.relative(runRoot, resolved)) };
    return { status: 'blocked', code: 'workspace_cleanup_failed', target: normalizeMachinePath(path.relative(runRoot, resolved)), error: error.message };
  }
}

function managedActionSummary(result) {
  return (result?.actions || []).map((item) => ({ file: item.file, action: item.action, reason: item.reason || null }));
}

export function runLifecycleValidation({ project, runRoot, operations = {} }) {
  const prepared = prepareWorkspace({ project, runRoot, purpose: 'lifecycle' });
  if (prepared.status !== 'passed') {
    if (prepared.workspace) prepared.cleanup = cleanupWorkspace({ workspace: prepared.workspace, runRoot, operations });
    return { projectId: project.id, stage: 'lifecycle', ...prepared };
  }
  const result = { projectId: project.id, stage: 'lifecycle', root: `project:${project.id}` };
  try {
    const initialStatus = gitText(prepared.workspace, ['status', '--porcelain=v1', '--untracked-files=all'], 'workspace_git_status_failed', project.id);
    const preview = runBootstrap({ target: prepared.workspace });
    const previewStatus = gitText(prepared.workspace, ['status', '--porcelain=v1', '--untracked-files=all'], 'workspace_git_status_failed', project.id);
    const write = runBootstrap({ target: prepared.workspace, write: true });
    const repeated = runBootstrap({ target: prepared.workspace, write: true });
    const managedTarget = write.actions?.find((item) => ['create', 'update'].includes(item.action))?.file || null;
    let customPreserved = null;
    let conflictProtected = null;
    if (managedTarget && fs.existsSync(path.join(prepared.workspace, managedTarget))) {
      const managedPath = path.join(prepared.workspace, managedTarget);
      const original = fs.readFileSync(managedPath, 'utf8');
      const customMarker = '\n# real-project-validation-custom\n真实验证自定义内容\n';
      fs.appendFileSync(managedPath, customMarker, 'utf8');
      const updatePreview = runUpdate({ target: prepared.workspace });
      const updateWrite = runUpdate({ target: prepared.workspace, write: true });
      customPreserved = updatePreview.ok && updateWrite.ok && fs.readFileSync(managedPath, 'utf8').includes(customMarker.trim());
      const managedWithCustom = fs.readFileSync(managedPath, 'utf8');
      fs.writeFileSync(managedPath, '# 未受管冲突哨兵\n', 'utf8');
      const conflict = runUpdate({ target: prepared.workspace, write: true });
      conflictProtected = conflict.ok === false && fs.readFileSync(managedPath, 'utf8') === '# 未受管冲突哨兵\n';
      fs.writeFileSync(managedPath, managedWithCustom || original, 'utf8');
      result.updatePreview = { ok: updatePreview.ok, actions: managedActionSummary(updatePreview) };
      result.updateWrite = { ok: updateWrite.ok, actions: managedActionSummary(updateWrite) };
    }
    const checked = checkProject(prepared.workspace);
    const protectedExisting = write.actions?.some((item) => item.action === 'skip' && /已存在/u.test(item.reason || '')) || false;
    const assertions = {
      previewOk: preview.ok === true,
      previewZeroWrite: previewStatus === initialStatus,
      writeOk: write.ok === true,
      repeatedIdempotent: repeated.ok === true && repeated.actions.every((item) => !['create', 'update'].includes(item.action)),
      customPreserved: customPreserved !== false,
      conflictProtected: conflictProtected !== false,
      checkOk: checked.ok === true,
    };
    const passed = Object.values(assertions).every(Boolean);
    result.status = passed ? (protectedExisting ? 'limited' : 'passed') : 'defect';
    result.code = passed ? (protectedExisting ? 'lifecycle_protected_existing_files' : 'lifecycle_completed') : 'lifecycle_assertion_failed';
    result.assertions = assertions;
    result.preview = { ok: preview.ok, actions: managedActionSummary(preview) };
    result.write = { ok: write.ok, actions: managedActionSummary(write) };
    result.repeated = { ok: repeated.ok, actions: managedActionSummary(repeated) };
    result.check = { ok: checked.ok, layout: checked.layout, errors: checked.errors, warnings: checked.warnings };
  } catch (error) {
    Object.assign(result, validationFailure(error, project.id));
  } finally {
    result.cleanup = cleanupWorkspace({ workspace: prepared.workspace, runRoot, operations });
    if (result.cleanup.status !== 'passed' && result.status === 'passed') {
      result.status = 'blocked';
      result.code = 'lifecycle_cleanup_failed';
    }
    const sourceAfter = collectProjectBaseline(project);
    result.sourceAfter = sourceAfter;
    if (sourceAfter.status !== 'passed' && result.status !== 'defect') {
      result.status = 'defect';
      result.code = 'source_workspace_changed_during_lifecycle';
    }
  }
  return result;
}

function inspectDependencyTree(root) {
  let bytes = 0;
  let entries = 0;
  const links = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const stats = fs.lstatSync(absolute);
      entries += 1;
      if (stats.isSymbolicLink()) {
        const target = fs.readlinkSync(absolute);
        if (path.isAbsolute(target)) {
          links.push({ path: absolute, safe: false, reason: 'absolute' });
        } else {
          const resolved = path.resolve(path.dirname(absolute), target);
          links.push({ path: absolute, safe: isInside(root, resolved), reason: 'relative' });
        }
      } else if (stats.isDirectory()) {
        walk(absolute);
      } else if (stats.isFile()) {
        bytes += stats.size;
      }
    }
  };
  walk(root);
  return { bytes, entries, links, unsafeLinks: links.filter((item) => !item.safe) };
}

function availableBytes(directory) {
  if (typeof fs.statfsSync !== 'function') return null;
  const stats = fs.statfsSync(directory);
  return Number(stats.bavail) * Number(stats.bsize);
}

export function collectProjectResourceBudget({ project, runRoot }) {
  const source = path.join(assertExternalProjectRoot(project.root, project.id), 'node_modules');
  const free = availableBytes(runRoot);
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    return { status: 'blocked', code: 'project_dependencies_missing', bytes: null, entries: 0, availableBytes: free };
  }
  try {
    const tree = inspectDependencyTree(source);
    return {
      status: tree.unsafeLinks.length ? 'blocked' : 'passed',
      code: tree.unsafeLinks.length ? 'dependency_symlink_outside' : 'dependency_budget_recorded',
      bytes: tree.bytes,
      entries: tree.entries,
      unsafeLinks: tree.unsafeLinks.length,
      availableBytes: free,
      reserveBytes: MIN_DISK_RESERVE_BYTES,
    };
  } catch (error) {
    return { status: 'blocked', code: 'dependency_tree_unreadable', bytes: null, entries: 0, availableBytes: free, error: error.message };
  }
}

export function prepareProjectDependencies({ sourceRoot, workspaceRoot, runRoot, operations = {} }) {
  const source = path.join(sourceRoot, 'node_modules');
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    return { status: 'blocked', code: 'project_dependencies_missing', bytes: null, availableBytes: availableBytes(runRoot) };
  }
  let tree;
  try {
    tree = inspectDependencyTree(source);
  } catch (error) {
    return { status: 'blocked', code: 'dependency_tree_unreadable', error: error.message, bytes: null, availableBytes: availableBytes(runRoot) };
  }
  if (tree.unsafeLinks.length) {
    return { status: 'blocked', code: 'dependency_symlink_outside', bytes: tree.bytes, availableBytes: availableBytes(runRoot), unsafeLinks: tree.unsafeLinks.length };
  }
  const free = availableBytes(runRoot);
  if (free !== null && free < tree.bytes + MIN_DISK_RESERVE_BYTES) {
    return { status: 'blocked', code: 'dependency_disk_budget_insufficient', bytes: tree.bytes, availableBytes: free };
  }
  const target = path.join(workspaceRoot, 'node_modules');
  try {
    const copy = operations.copy || fs.cpSync;
    copy(source, target, { recursive: true, dereference: false, preserveTimestamps: true, errorOnExist: true });
    return { status: 'passed', code: 'project_dependencies_copied', bytes: tree.bytes, entries: tree.entries, availableBytes: free };
  } catch (error) {
    return { status: 'blocked', code: 'dependency_copy_failed', error: error.message, bytes: tree.bytes, availableBytes: free };
  }
}

function executableOnPath(name) {
  const pathValue = process.env.PATH || '';
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.COM;.BAT;.CMD').split(path.delimiter)
    : [''];
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${name}${extension}`);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // PATH 中不存在的候选直接继续。
      }
    }
  }
  return null;
}

function firstExistingFile(candidates) {
  return candidates.find((candidate) => {
    try {
      return candidate && fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  }) || null;
}

export function resolvePackageManagerInvocation({ packageManager, workspaceRoot, scriptName, scriptArgs = [] }) {
  if (!scriptName) return { status: 'blocked', code: 'test_script_missing' };
  if (packageManager === 'npm') {
    const npmCli = firstExistingFile([
      process.env.npm_execpath && /npm-cli\.(?:js|cjs)$/iu.test(process.env.npm_execpath) ? process.env.npm_execpath : null,
      path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      path.resolve(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ]);
    if (npmCli) return { status: 'passed', source: 'javascript-cli', executable: process.execPath, args: [npmCli, 'run', scriptName, '--', ...scriptArgs] };
    const npmExecutable = process.platform === 'win32' ? null : executableOnPath('npm');
    if (npmExecutable) return { status: 'limited', source: 'posix-path', executable: npmExecutable, args: ['run', scriptName, '--', ...scriptArgs] };
    return { status: 'blocked', code: 'npm_cli_missing' };
  }
  if (packageManager === 'yarn') {
    const yarnCli = firstExistingFile([
      path.join(workspaceRoot, 'node_modules', 'yarn', 'bin', 'yarn.js'),
      path.join(workspaceRoot, '.yarn', 'releases', 'yarn.cjs'),
    ]);
    if (yarnCli) return { status: 'passed', source: 'javascript-cli', executable: process.execPath, args: [yarnCli, 'run', scriptName, ...scriptArgs] };
    const yarnExecutable = process.platform === 'win32' ? null : executableOnPath('yarn');
    if (yarnExecutable) return { status: 'limited', source: 'posix-path', executable: yarnExecutable, args: ['run', scriptName, ...scriptArgs] };
    return { status: 'blocked', code: 'yarn_cli_missing' };
  }
  return { status: 'blocked', code: 'package_manager_not_supported' };
}

function stripAnsi(value) {
  return String(value || '').replace(/\u001b\[[0-9;]*m/gu, '');
}

export function detectTestDiscovery(output) {
  const text = stripAnsi(output);
  const counts = [];
  for (const match of text.matchAll(/(?:Test Files|Tests)\s+(\d+)\s+passed/giu)) counts.push(Number(match[1]));
  const passLines = text.match(/^PASS\s+.+$/gmu) || [];
  const checkLines = text.match(/^\s*✓\s+.+$/gmu) || [];
  return Math.max(0, ...counts, passLines.length, checkLines.length);
}

export function classifyNativeTestResult({
  processResult,
  discoveryCount,
  certification = 'project-evidence-only',
  assertionMismatch = false,
  zeroTestReported = false,
}) {
  if (assertionMismatch) return { status: 'defect', code: 'plugin_assertion_mismatch' };
  if (processResult.launchError) return { status: 'blocked', code: 'test_process_launch_failed' };
  if (processResult.timedOut) return { status: 'blocked', code: 'test_process_timeout' };
  if (zeroTestReported) return { status: 'blocked', code: 'test_zero_discovery' };
  if (processResult.exitCode !== 0) return { status: 'limited', code: 'project_test_nonzero_exit' };
  if (!Number.isInteger(discoveryCount) || discoveryCount <= 0) return { status: 'blocked', code: 'test_zero_discovery' };
  if (certification === 'verified-vue3-vite-vitest') return { status: 'passed', code: 'certified_test_run_passed' };
  return { status: 'limited', code: 'project_evidence_test_run_passed' };
}

export function sanitizeCapturedOutput(output, { redactions = [] } = {}) {
  let normalized = stripAnsi(output).replaceAll('\r\n', '\n');
  for (const redaction of [...redactions].sort((left, right) => right.value.length - left.value.length)) {
    if (!redaction?.value) continue;
    normalized = normalized.replaceAll(redaction.value, redaction.replacement);
    const portableValue = normalizeMachinePath(redaction.value);
    if (portableValue !== redaction.value) normalized = normalized.replaceAll(portableValue, redaction.replacement);
  }
  if (SENSITIVE_OUTPUT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { safe: false, status: 'blocked', code: 'sensitive_output_detected', text: null, originalBytes: Buffer.byteLength(normalized) };
  }
  const bytes = Buffer.byteLength(normalized);
  if (bytes <= MAX_PERSISTED_LOG_BYTES) {
    return { safe: true, status: 'passed', code: 'output_safe', text: normalized, originalBytes: bytes, truncated: false };
  }
  const buffer = Buffer.from(normalized);
  const head = buffer.subarray(0, MAX_PERSISTED_LOG_BYTES / 2).toString('utf8');
  const tail = buffer.subarray(buffer.length - MAX_PERSISTED_LOG_BYTES / 2).toString('utf8');
  return { safe: true, status: 'passed', code: 'output_safe_truncated', text: `${head}\n...<truncated>...\n${tail}`, originalBytes: bytes, truncated: true };
}

export function createValidationArtifactDescriptor(repositoryRoot, artifactPath, label) {
  const canonicalRepository = resolveCanonicalProjectRoot(repositoryRoot);
  const absolute = path.resolve(artifactPath);
  if (!isInside(canonicalRepository, absolute)) {
    throw new RealProjectValidationError('unsafe_artifact_path', `${label}越出仓库范围`, normalizeMachinePath(artifactPath));
  }
  const relative = normalizeMachinePath(path.relative(canonicalRepository, absolute));
  const checked = resolveSafeProjectPath(canonicalRepository, relative, label, { mustExist: true, allowDirectory: false });
  const content = fs.readFileSync(checked.absolutePath);
  return { path: relative, size: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex'), label };
}

function executeProcess(executable, args, { cwd, env, timeoutMs = 10 * 60 * 1000 } = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(executable, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: MAX_CAPTURE_BYTES,
    shell: false,
    timeout: timeoutMs,
  });
  return {
    startedAt,
    completedAt: new Date().toISOString(),
    exitCode: result.status,
    signal: result.signal || null,
    launchError: result.error?.code === 'ENOENT' || result.error?.code === 'EACCES',
    timedOut: result.error?.code === 'ETIMEDOUT',
    errorCode: result.error?.code || null,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

export function runNativeTestValidation({ project, runRoot, repositoryRoot, operations = {} }) {
  const inspection = inspectProjectFacts(project);
  if (inspection.status !== 'passed' && inspection.code !== 'inspection_expectation_mismatch') {
    return { projectId: project.id, stage: 'native-test', status: inspection.status, code: inspection.code, inspection };
  }
  if (inspection.testCommand.status !== 'detected' || !inspection.testCommand.scriptName || inspection.runner.name === '未识别') {
    return { projectId: project.id, stage: 'native-test', status: 'blocked', code: 'test_facility_missing', commandDetected: false, runner: inspection.runner };
  }
  if (project.testTarget && !inspection.testFiles.includes(project.testTarget)) {
    return { projectId: project.id, stage: 'native-test', status: 'blocked', code: 'test_target_missing', target: project.testTarget };
  }
  const prepared = prepareWorkspace({ project, runRoot, purpose: 'native-test' });
  if (prepared.status !== 'passed') {
    if (prepared.workspace) prepared.cleanup = cleanupWorkspace({ workspace: prepared.workspace, runRoot, operations });
    return { projectId: project.id, stage: 'native-test', ...prepared };
  }
  const result = {
    projectId: project.id,
    stage: 'native-test',
    root: `project:${project.id}`,
    runner: inspection.runner,
    inspectionIssues: inspection.issues || [],
  };
  try {
    const dependencies = prepareProjectDependencies({ sourceRoot: project.root, workspaceRoot: prepared.workspace, runRoot, operations });
    result.dependencies = dependencies;
    if (dependencies.status !== 'passed') {
      result.status = 'blocked';
      result.code = dependencies.code;
      return result;
    }
    const scriptArgs = project.testTarget ? [...project.testArgs, project.testTarget] : project.testArgs;
    const invocation = resolvePackageManagerInvocation({
      packageManager: inspection.packageManager,
      workspaceRoot: prepared.workspace,
      scriptName: inspection.testCommand.scriptName,
      scriptArgs,
    });
    result.command = invocation.status === 'blocked' ? null : {
      executable: path.basename(invocation.executable),
      args: invocation.args.map((item) => {
        if (item.includes(prepared.workspace)) return normalizeMachinePath(path.relative(prepared.workspace, item));
        return path.isAbsolute(item) ? path.basename(item) : item;
      }),
      source: invocation.source,
    };
    if (invocation.status === 'blocked') {
      result.status = 'blocked';
      result.code = invocation.code;
      return result;
    }
    const processResult = executeProcess(invocation.executable, invocation.args, {
      cwd: prepared.workspace,
      env: prepared.env,
      timeoutMs: project.timeoutMs || 10 * 60 * 1000,
    });
    const combined = `${processResult.stdout}\n${processResult.stderr}`;
    const discoveryCount = detectTestDiscovery(combined);
    const zeroTestReported = /No tests found|No test files found|no tests? found/iu.test(stripAnsi(combined));
    const classification = classifyNativeTestResult({
      processResult,
      discoveryCount,
      certification: inspection.runner.certification,
      zeroTestReported,
    });
    Object.assign(result, classification, {
      exitCode: processResult.exitCode,
      signal: processResult.signal,
      discoveryCount,
      startedAt: processResult.startedAt,
      completedAt: processResult.completedAt,
    });
    const sanitized = sanitizeCapturedOutput(combined, {
      redactions: [
        { value: prepared.workspace, replacement: `workspace:${project.id}` },
        { value: project.root, replacement: `project:${project.id}` },
        { value: os.homedir(), replacement: '<home>' },
      ],
    });
    result.output = { status: sanitized.status, code: sanitized.code, originalBytes: sanitized.originalBytes, truncated: sanitized.truncated || false };
    if (!sanitized.safe) {
      result.status = 'blocked';
      result.code = sanitized.code;
    } else {
      const logDirectory = path.join(runRoot, 'test-runs');
      fs.mkdirSync(logDirectory, { recursive: true });
      const logPath = path.join(logDirectory, `${project.id.toLowerCase()}.log`);
      fs.writeFileSync(logPath, sanitized.text, 'utf8');
      result.log = createValidationArtifactDescriptor(repositoryRoot, logPath, `${project.id} 测试日志`);
    }
  } catch (error) {
    Object.assign(result, validationFailure(error, project.id));
  } finally {
    result.cleanup = cleanupWorkspace({ workspace: prepared.workspace, runRoot, operations });
    if (result.cleanup.status !== 'passed' && result.status === 'passed') {
      result.status = 'blocked';
      result.code = 'native_test_cleanup_failed';
    }
    const sourceAfter = collectProjectBaseline(project);
    result.sourceAfter = sourceAfter;
    if (sourceAfter.status !== 'passed' && result.status !== 'defect') {
      result.status = 'defect';
      result.code = 'source_workspace_changed_during_native_test';
    }
  }
  return result;
}

function stageExpected(project, stage) {
  if (stage === 'baseline' || stage === 'inspection') return project.expected.inspection;
  if (stage === 'lifecycle') return project.expected.lifecycle;
  return project.expected.nativeTest;
}

function publicProject(project) {
  const { root, ...safe } = project;
  return { ...safe, root: `project:${project.id}` };
}

function writeStageResult({ repositoryRoot, runRoot, stage, payload }) {
  const stageDirectory = path.join(runRoot, stage);
  fs.mkdirSync(stageDirectory, { recursive: true });
  const resultPath = path.join(stageDirectory, 'results.json');
  fs.writeFileSync(resultPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return createValidationArtifactDescriptor(repositoryRoot, resultPath, `${stage} 结果`);
}

export function runRealProjectValidation({
  repositoryRoot = process.cwd(),
  matrixPath = path.join(process.cwd(), 'outputs', 'real-project-validation', 'local-matrix.json'),
  output = null,
  stage = 'all',
  write = false,
  operations = {},
} = {}) {
  if (!STAGES.has(stage)) throw new RealProjectValidationError('invalid_validation_stage', `验证阶段无效：${stage}`, stage);
  const matrix = loadValidationMatrix({ repositoryRoot, matrixPath });
  const canonicalRepository = resolveCanonicalProjectRoot(repositoryRoot);
  const requestedOutput = output ? path.resolve(output) : path.join(validationBase(canonicalRepository), matrix.runId);
  const checkedOutput = resolveInsideValidationBase(canonicalRepository, requestedOutput, '验证输出目录');
  if (path.basename(checkedOutput.resolved) !== matrix.runId) {
    throw new RealProjectValidationError('run_output_mismatch', '输出目录名必须与 runId 一致', checkedOutput.repositoryRelative);
  }
  const previewBaselines = matrix.projects.map((project) => collectProjectBaseline(project));
  const preview = {
    ok: previewBaselines.every((item) => item.status === 'passed'),
    write: false,
    readyToWrite: previewBaselines.every((item) => item.status === 'passed'),
    schemaVersion: MATRIX_SCHEMA_VERSION,
    runId: matrix.runId,
    stage,
    output: checkedOutput.repositoryRelative,
    projects: matrix.projects.map(publicProject),
    baselines: previewBaselines,
  };
  if (!write) return preview;
  fs.mkdirSync(checkedOutput.resolved, { recursive: true });
  const stages = stage === 'all' ? ['inspection', 'lifecycle', 'native-test'] : [stage];
  const summaries = [];
  for (const selectedStage of stages) {
    const results = matrix.projects.map((project) => {
      if (selectedStage === 'baseline') {
        return {
          ...collectProjectBaseline(project),
          resourceBudget: collectProjectResourceBudget({ project, runRoot: checkedOutput.resolved }),
        };
      }
      if (selectedStage === 'inspection') return inspectProjectFacts(project);
      if (selectedStage === 'lifecycle') return runLifecycleValidation({ project, runRoot: checkedOutput.resolved, operations });
      return runNativeTestValidation({ project, runRoot: checkedOutput.resolved, repositoryRoot: canonicalRepository, operations });
    }).map((result, index) => {
      const expected = stageExpected(matrix.projects[index], selectedStage);
      return { ...result, expected, matchesExpected: expected.includes(result.status) && result.status !== 'defect' };
    });
    const payload = {
      schemaVersion: MATRIX_SCHEMA_VERSION,
      runId: matrix.runId,
      stage: selectedStage,
      platform: { platform: process.platform, arch: process.arch, node: process.version },
      status: results.every((item) => item.matchesExpected) ? 'passed' : 'defect',
      results,
    };
    payload.artifact = writeStageResult({ repositoryRoot: canonicalRepository, runRoot: checkedOutput.resolved, stage: selectedStage, payload });
    summaries.push(payload);
  }
  return {
    ok: summaries.every((item) => item.status === 'passed'),
    write: true,
    schemaVersion: MATRIX_SCHEMA_VERSION,
    runId: matrix.runId,
    stage,
    output: checkedOutput.repositoryRelative,
    summaries,
  };
}

function parseArgs(argv) {
  return parseCliArgs(argv, {
    defaults: { repositoryRoot: process.cwd(), matrixPath: null, output: null, stage: 'all', write: false },
    valueOptions: {
      '--target': 'repositoryRoot',
      '--matrix': 'matrixPath',
      '--output': 'output',
      '--stage': 'stage',
    },
    booleanOptions: { '--write': 'write' },
  });
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = runRealProjectValidation({
      ...args,
      matrixPath: args.matrixPath || path.join(args.repositoryRoot, 'outputs', 'real-project-validation', 'local-matrix.json'),
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify(validationFailure(error), null, 2));
    process.exitCode = 1;
  }
}
