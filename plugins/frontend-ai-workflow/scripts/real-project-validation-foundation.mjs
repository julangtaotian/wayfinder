import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectProject } from './inspect-project.mjs';
import { inspectTestContext } from './inspect-test-context.mjs';
import { resolveCanonicalProjectRoot, resolveSafeProjectPath } from './project-path-safety.mjs';

export const MATRIX_SCHEMA_VERSION = 1;
const EXPECTED_STATUSES = new Set(['passed', 'limited', 'blocked']);
export const STAGES = new Set(['baseline', 'inspection', 'lifecycle', 'native-test', 'all']);
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,79}$/iu;
const PROJECT_ID_PATTERN = /^P[1-9][0-9]*$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/iu;
export const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
export const MAX_PERSISTED_LOG_BYTES = 128 * 1024;
export const MIN_DISK_RESERVE_BYTES = 512 * 1024 * 1024;
export const SENSITIVE_OUTPUT_PATTERNS = [
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

export function validationFailure(error, fallbackTarget = null) {
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

export function isInside(root, candidate, { allowRoot = false } = {}) {
  const relative = path.relative(root, candidate);
  return (allowRoot && relative === '')
    || Boolean(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function assertPlainObject(value, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RealProjectValidationError(code, message);
  }
}

export function assertExternalProjectRoot(value, projectId) {
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

export function validationBase(repositoryRoot) {
  return path.join(repositoryRoot, 'outputs', 'real-project-validation');
}

export function resolveInsideValidationBase(repositoryRoot, candidate, label, { allowBase = false } = {}) {
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

export function gitResult(root, args, options = {}) {
  return spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: MAX_CAPTURE_BYTES,
    shell: false,
    ...options,
  });
}

export function gitText(root, args, code, projectId) {
  const result = gitResult(root, args);
  if (result.status !== 0) {
    throw new RealProjectValidationError(code, `项目 ${projectId} 的 Git 基线无法读取`, projectId);
  }
  return result.stdout.trim();
}

export function baselineMatches(left, right) {
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
