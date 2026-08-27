import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { assertSafeProjectRoot, resolveProjectRoot } from './collect-project-scope.mjs';
import {
  ProjectPathError,
  atomicWriteProjectFile,
  ensureSafeProjectDirectory,
  openProjectFileExclusive,
} from './project-path-safety.mjs';
import {
  VerificationSemanticError,
  computeVerificationSemanticBinding,
} from './verification-semantics.mjs';
import {
  EVIDENCE_SCHEMA_VERSION,
  LEGACY_EVIDENCE_SCHEMA_VERSION,
  EvidenceError,
  auditProjectVerificationEvidence,
  computeWorkspaceFingerprint,
  extractEvidenceReferences,
  relativeToRoot,
  resolveSafePath,
  stableJson,
  verificationEvidenceRequired,
} from './verification-evidence-foundation.mjs';
import {
  assertEvidenceFiles,
  createEvidenceFileDescriptor,
} from './verification-evidence-validation.mjs';

export {
  computeVerificationSemanticBinding,
  EVIDENCE_SCHEMA_VERSION,
  LEGACY_EVIDENCE_SCHEMA_VERSION,
  EvidenceError,
  auditProjectVerificationEvidence,
  computeWorkspaceFingerprint,
  extractEvidenceReferences,
  stableJson,
  verificationEvidenceRequired,
};

export {
  createEvidenceFileDescriptor,
  validateEvidenceManifest,
  validateVerificationEvidenceRecords,
} from './verification-evidence-validation.mjs';

function npmJavaScriptEntry({ platform, environment, nodePath, fileExists }) {
  const injected = environment.npm_execpath ? path.resolve(environment.npm_execpath) : null;
  if (injected && fileExists(injected)) return { entry: injected, source: 'npm_execpath' };
  if (platform !== 'win32') return null;
  const pathApi = path.win32;
  const bundled = pathApi.join(pathApi.dirname(nodePath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (fileExists(bundled)) return { entry: bundled, source: 'node-bundled-npm' };
  throw new EvidenceError('npm_js_entry_missing', '无法定位 npm 的 JavaScript 入口，Windows 不会直接启动 npm.cmd', 'npm');
}

export function normalizeEvidenceCommand(command, {
  platform = process.platform,
  environment = process.env,
  nodePath = process.execPath,
  fileExists = fs.existsSync,
} = {}) {
  if (!Array.isArray(command) || !command.length || command.some((item) => typeof item !== 'string' || !item)) {
    throw new EvidenceError('invalid_command', '验证命令必须是非空字符串参数数组', 'command');
  }
  const [executable, ...args] = command;
  const base = (platform === 'win32' ? path.win32.basename(executable) : path.basename(executable)).toLowerCase();
  if (base === 'node' || base === 'node.exe' || path.resolve(executable) === path.resolve(nodePath)) {
    return { command: nodePath, args, source: 'node', shell: false };
  }
  if (base === 'npm' || base === 'npm.cmd') {
    const npm = npmJavaScriptEntry({ platform, environment, nodePath, fileExists });
    if (npm) return { command: nodePath, args: [npm.entry, ...args], source: npm.source, shell: false };
    return { command: 'npm', args, source: 'path', shell: false };
  }
  if (platform === 'win32' && base.endsWith('.cmd')) {
    throw new EvidenceError('unsafe_command_wrapper', `Windows 不直接启动 .cmd 包装器：${executable}`, executable);
  }
  return { command: executable, args, source: 'direct', shell: false };
}

function readGitProvenance(root) {
  const inside = spawnSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') return { available: false, commit: null, dirty: null };
  const commit = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  const status = spawnSync('git', ['-C', root, 'status', '--porcelain=v1'], { encoding: 'utf8' });
  return {
    available: commit.status === 0,
    commit: commit.status === 0 ? commit.stdout.trim() : null,
    dirty: status.status === 0 ? Boolean(status.stdout.trim()) : null,
  };
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(needle, index)) >= 0) {
    count += 1;
    index += needle.length;
  }
  return count;
}

function createLogAccumulator(root, filePath, locator) {
  const opened = openProjectFileExclusive(root, filePath, '验证日志');
  const descriptor = opened.descriptor;
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  let matches = 0;
  let tail = '';
  return {
    consume(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      fs.writeSync(descriptor, buffer);
      hash.update(buffer);
      bytes += buffer.length;
      const current = `${tail}${buffer.toString('utf8')}`;
      matches += countOccurrences(current, locator);
      tail = locator.length > 1 ? current.slice(-(locator.length - 1)) : '';
    },
    finish() {
      fs.closeSync(descriptor);
      return { bytes, matches, sha256: hash.digest('hex') };
    },
  };
}

function executeWithoutShell(command, args, options, handlers) {
  return new Promise((resolve) => {
    let startError = null;
    const child = spawn(command, args, { ...options, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', handlers.stdout);
    child.stderr.on('data', handlers.stderr);
    child.once('error', (error) => { startError = error; });
    child.once('close', (status, signal) => resolve({ status, signal, error: startError }));
  });
}

function resolveChange(root, change) {
  const candidate = typeof change === 'string' && /[\\/]/u.test(change)
    ? resolveSafePath(root, change, '变更目录', { mustExist: true })
    : resolveSafePath(root, `openspec/changes/${change || ''}`, '变更目录', { mustExist: true });
  if (!fs.statSync(candidate).isDirectory()) throw new EvidenceError('invalid_change', `变更路径不是目录：${change}`, change);
  return candidate;
}

export async function runVerificationEvidence({
  target = process.cwd(),
  change,
  requirement,
  evidenceId,
  locator,
  command,
  workingDirectory = '.',
  artifacts = [],
  write = false,
  environment = process.env,
  platform = process.platform,
  nodePath = process.execPath,
  fileExists = fs.existsSync,
  execute = executeWithoutShell,
  now = () => new Date().toISOString(),
} = {}) {
  try {
    const root = resolveProjectRoot(target);
    assertSafeProjectRoot(root);
    if (!/^V-\d{2,}$/u.test(evidenceId || '')) throw new EvidenceError('invalid_evidence_id', `证据 ID 无效：${evidenceId || '空值'}`, evidenceId || null);
    if (typeof locator !== 'string' || !locator.trim()) throw new EvidenceError('invalid_locator', '测试定位不能为空', evidenceId);
    const changePath = resolveChange(root, change);
    const requirementPath = resolveSafePath(root, requirement, '需求文件', { mustExist: true });
    resolveSafePath(root, path.join(changePath, 'test-plan.md'), '测试方案', { mustExist: true });
    const cwd = resolveSafePath(root, workingDirectory, '验证工作目录', { mustExist: true, allowRoot: true });
    if (!fs.statSync(cwd).isDirectory()) throw new EvidenceError('invalid_working_directory', '验证工作目录必须是目录', workingDirectory);
    const normalizedCommand = normalizeEvidenceCommand(command, { platform, environment, nodePath, fileExists });
    const manifestPath = path.join(changePath, 'evidence', `${evidenceId}.json`);
    const logRoot = path.join(root, 'outputs', 'verification-evidence', path.basename(changePath), evidenceId);
    resolveSafePath(root, manifestPath, '机器证据清单');
    resolveSafePath(root, logRoot, '验证日志目录');
    const semanticBinding = computeVerificationSemanticBinding({ requirementPath, changePath, evidenceId });
    const preview = {
      ok: true,
      code: 'ready',
      status: 'ready',
      write: false,
      readyToWrite: true,
      root,
      evidenceId,
      locator: locator.trim(),
      command: normalizedCommand,
      target: relativeToRoot(root, manifestPath),
      logTarget: relativeToRoot(root, logRoot),
    };
    if (!write) return preview;

    ensureSafeProjectDirectory(root, logRoot, '验证日志目录');
    const attemptId = `${now().replace(/[^0-9]/gu, '')}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    const attemptRoot = path.join(logRoot, attemptId);
    ensureSafeProjectDirectory(root, attemptRoot, '验证日志批次目录');
    const stdoutPath = path.join(attemptRoot, 'stdout.log');
    const stderrPath = path.join(attemptRoot, 'stderr.log');
    const stdout = createLogAccumulator(root, stdoutPath, locator.trim());
    const stderr = createLogAccumulator(root, stderrPath, locator.trim());
    const startedAt = now();
    let execution;
    let stdoutResult;
    let stderrResult;
    try {
      execution = await execute(normalizedCommand.command, normalizedCommand.args, { cwd, env: environment }, {
        stdout: (chunk) => stdout.consume(chunk),
        stderr: (chunk) => stderr.consume(chunk),
      });
    } finally {
      stdoutResult = stdout.finish();
      stderrResult = stderr.finish();
    }
    const completedAt = now();
    const locatorMatches = stdoutResult.matches + stderrResult.matches;
    const logs = [
      { stream: 'stdout', ...createEvidenceFileDescriptor(root, stdoutPath, '标准输出日志') },
      { stream: 'stderr', ...createEvidenceFileDescriptor(root, stderrPath, '标准错误日志') },
    ];
    if (execution?.error) {
      return { ...preview, ok: false, code: 'command_start_failed', status: 'failed', write: true, readyToWrite: false, locatorMatches, exitCode: null, logs, error: execution.error.message };
    }
    if (execution?.status !== 0) {
      return { ...preview, ok: false, code: 'command_failed', status: 'failed', write: true, readyToWrite: false, locatorMatches, exitCode: execution?.status ?? null, signal: execution?.signal || null, logs };
    }
    if (locatorMatches === 0) {
      return { ...preview, ok: false, code: 'zero_test_locator', status: 'blocked', write: true, readyToWrite: false, locatorMatches, exitCode: 0, logs };
    }
    const completedSemanticBinding = computeVerificationSemanticBinding({ requirementPath, changePath, evidenceId });
    if (stableJson(completedSemanticBinding) !== stableJson(semanticBinding)) {
      return {
        ...preview,
        ok: false,
        code: 'semantic_source_changed_during_execution',
        status: 'blocked',
        write: true,
        readyToWrite: false,
        locatorMatches,
        exitCode: 0,
        logs,
      };
    }

    const manifest = {
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      evidenceId,
      kind: 'local-command',
      status: 'passed',
      requirement: relativeToRoot(root, requirementPath),
      change: path.basename(changePath).replace(/^\d{4}-\d{2}-\d{2}-/u, ''),
      semanticBinding,
      command: {
        executable: normalizedCommand.command,
        args: normalizedCommand.args,
        cwd: relativeToRoot(root, cwd) || '.',
        source: normalizedCommand.source,
      },
      locator: locator.trim(),
      locatorMatches,
      workspaceFingerprint: computeWorkspaceFingerprint(root).digest,
      git: readGitProvenance(root),
      startedAt,
      completedAt,
      exitCode: 0,
      logs,
      artifacts: artifacts.map((item) => createEvidenceFileDescriptor(root, item, '验证产物')),
    };
    assertEvidenceFiles(root, manifest.logs, '验证日志', evidenceId);
    assertEvidenceFiles(root, manifest.artifacts, '验证产物', evidenceId);
    atomicWriteProjectFile(root, manifestPath, stableJson(manifest), { label: '机器证据清单' });
    return {
      ...preview,
      ok: true,
      code: 'evidence_recorded',
      status: 'passed',
      write: true,
      readyToWrite: false,
      locatorMatches,
      exitCode: 0,
      manifest,
      logs,
    };
  } catch (error) {
    const normalized = error instanceof EvidenceError || error instanceof ProjectPathError || error instanceof VerificationSemanticError
      ? error
      : new EvidenceError('evidence_execution_failed', error.message);
    return {
      ok: false,
      code: normalized.code,
      status: 'blocked',
      write: Boolean(write),
      readyToWrite: false,
      evidenceId: evidenceId || null,
      target: normalized.target,
      locatorMatches: 0,
      fresh: null,
      error: normalized.message,
    };
  }
}

function parseArgs(argv) {
  const separator = argv.indexOf('--');
  const options = separator < 0 ? argv : argv.slice(0, separator);
  const command = separator < 0 ? [] : argv.slice(separator + 1);
  const parsed = { target: process.cwd(), change: null, requirement: null, evidenceId: null, locator: null, workingDirectory: '.', artifacts: [], write: false, command };
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === '--write') {
      parsed.write = true;
      continue;
    }
    const key = {
      '--target': 'target', '--change': 'change', '--requirement': 'requirement',
      '--evidence-id': 'evidenceId', '--locator': 'locator', '--cwd': 'workingDirectory',
    }[option];
    if (option === '--artifact') {
      if (!options[index + 1]) throw new Error('参数 --artifact 缺少值');
      parsed.artifacts.push(options[index + 1]);
      index += 1;
      continue;
    }
    if (!key) throw new Error(`不支持的参数：${option}`);
    if (!options[index + 1]) throw new Error(`参数 ${option} 缺少值`);
    parsed[key] = options[index + 1];
    index += 1;
  }
  if (!parsed.change || !parsed.requirement || !parsed.evidenceId || !parsed.locator || !parsed.command.length) {
    throw new Error('必须提供 --change、--requirement、--evidence-id、--locator 和 -- 后的命令参数');
  }
  return parsed;
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const result = await runVerificationEvidence(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
