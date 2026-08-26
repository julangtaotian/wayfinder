import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { runBootstrap } from './bootstrap-project.mjs';
import { checkProject } from './check-project.mjs';
import { parseCliArgs } from './cli-arguments.mjs';
import { resolveCanonicalProjectRoot, resolveSafeProjectPath } from './project-path-safety.mjs';
import { runUpdate } from './update-project.mjs';
import {
  MATRIX_SCHEMA_VERSION,
  MAX_CAPTURE_BYTES,
  MAX_PERSISTED_LOG_BYTES,
  MIN_DISK_RESERVE_BYTES,
  SENSITIVE_OUTPUT_PATTERNS,
  STAGES,
  RealProjectValidationError,
  assertExternalProjectRoot,
  baselineMatches,
  collectProjectBaseline,
  gitResult,
  gitText,
  inspectProjectFacts,
  isInside,
  loadValidationMatrix,
  normalizeMachinePath,
  resolveInsideValidationBase,
  validationBase,
  validationFailure,
  validateMatrix,
} from './real-project-validation-foundation.mjs';

export {
  RealProjectValidationError,
  collectProjectBaseline,
  inspectProjectFacts,
  loadValidationMatrix,
  normalizeMachinePath,
  validateMatrix,
};

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
