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
  resolveSafeProjectPath as resolveProjectPath,
} from './project-path-safety.mjs';
import {
  VerificationSemanticError,
  computeVerificationSemanticBinding,
} from './verification-semantics.mjs';
import { UI_REVIEW_STATE_VERSION } from './ui-review-contract.mjs';
import { assertState } from './ui-review-state.mjs';

export { computeVerificationSemanticBinding };

export const LEGACY_EVIDENCE_SCHEMA_VERSION = 1;
export const EVIDENCE_SCHEMA_VERSION = 2;
const EVIDENCE_KINDS = new Set(['local-command', 'external-ci', 'ui-review']);
const LIFECYCLE_ROOTS = new Set(['openspec', 'requirements', 'outputs']);
const EXCLUDED_SEGMENTS = new Set([
  '.git', '.cache', '.idea', '.vscode', 'node_modules', 'coverage', 'test-results',
  'playwright-report', 'blob-report', '.nyc_output', 'dist',
]);
const IGNORED_FILE_PATTERN = /^(?:\.DS_Store|Thumbs\.db)|\.(?:log|pid|tmp|swp|swo)$/iu;

export class EvidenceError extends Error {
  constructor(code, message, target = null) {
    super(message);
    this.name = 'EvidenceError';
    this.code = code;
    this.target = target;
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function stableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function normalizedRepositoryPath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//u, '');
}

function isInside(root, target, { allowRoot = false } = {}) {
  const relative = path.relative(root, target);
  return (allowRoot && relative === '') || Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveSafePath(root, candidate, label, { mustExist = false, allowRoot = false } = {}) {
  try {
    return resolveProjectPath(root, normalizedRepositoryPath(candidate), label, {
      mustExist,
      allowRoot,
      allowAbsolute: path.isAbsolute(candidate || ''),
    }).absolutePath;
  } catch (error) {
    if (!(error instanceof ProjectPathError)) throw error;
    const code = error.code === 'project_path_missing' ? 'evidence_file_missing' : 'unsafe_evidence_path';
    throw new EvidenceError(code, error.message, error.target);
  }
}

function relativeToRoot(root, target) {
  return normalizedRepositoryPath(path.relative(root, target));
}

function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function shouldExclude(relativePath, entryName) {
  const segments = normalizedRepositoryPath(relativePath).split('/').filter(Boolean);
  if (segments.length === 1 && LIFECYCLE_ROOTS.has(segments[0])) return true;
  if (segments.some((segment) => EXCLUDED_SEGMENTS.has(segment))) return true;
  return IGNORED_FILE_PATTERN.test(entryName);
}

function collectWorkspaceEntries(root, directory, entries) {
  const names = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of names) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = relativeToRoot(root, absolutePath);
    if (shouldExclude(relativePath, entry.name)) continue;
    const stats = fs.lstatSync(absolutePath);
    if (stats.isSymbolicLink()) {
      const real = fs.realpathSync(absolutePath);
      if (!isInside(root, real)) {
        throw new EvidenceError('unsafe_workspace_symlink', `工作区符号链接越出项目范围：${relativePath}`, relativePath);
      }
      entries.push(`L\0${relativePath}\0${relativeToRoot(root, real)}`);
      continue;
    }
    if (stats.isDirectory()) {
      collectWorkspaceEntries(root, absolutePath, entries);
      continue;
    }
    if (!stats.isFile()) continue;
    entries.push(`F\0${relativePath}\0${stats.size}\0${hashFile(absolutePath)}`);
  }
}

export function computeWorkspaceFingerprint(target) {
  const root = fs.realpathSync(path.resolve(target));
  const entries = [];
  collectWorkspaceEntries(root, root, entries);
  entries.sort();
  return {
    algorithm: 'sha256',
    digest: crypto.createHash('sha256').update(entries.join('\n')).digest('hex'),
    fileCount: entries.length,
    excludedRoots: [...LIFECYCLE_ROOTS].sort(),
  };
}

export function extractEvidenceReferences(value) {
  const text = String(value || '').trim();
  const paths = [];
  const urls = [];
  const addPath = (candidate) => {
    const normalized = normalizedRepositoryPath(candidate.trim());
    if (!normalized || !normalized.includes('/') || /\s/u.test(normalized)) return;
    if (!paths.includes(normalized)) paths.push(normalized);
  };
  const addUrl = (candidate) => {
    const normalized = candidate.replace(/[），。、；;,]+$/u, '');
    if (!urls.includes(normalized)) urls.push(normalized);
  };
  for (const match of text.matchAll(/`([^`]+)`/gu)) {
    if (/^https?:\/\//iu.test(match[1])) addUrl(match[1]);
    else addPath(match[1]);
  }
  for (const match of text.matchAll(/https?:\/\/[^\s`]+/giu)) addUrl(match[0]);
  if (!paths.length && !urls.length && !/[\s：；，、]/u.test(text)) addPath(text);
  return { paths, urls };
}

function verificationRows(content) {
  const section = String(content || '').match(/^##\s+验证记录\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/mu)?.[1] || '';
  const rows = section.split(/\r?\n/u)
    .filter((line) => /^\s*\|/u.test(line))
    .map((line) => line.trim().replace(/^\||\|$/gu, '').split('|').map((cell) => cell.trim()));
  const headerIndex = rows.findIndex((cells) => cells.includes('验证ID'));
  if (headerIndex < 0) return [];
  const header = rows[headerIndex];
  return rows.slice(headerIndex + 2).flatMap((cells) => {
    const record = Object.fromEntries(header.map((name, index) => [name, cells[index] || '']));
    return /^V-\d{2,}$/u.test(record.验证ID || '') ? [record] : [];
  });
}

function archivedCandidates(root, changeName) {
  const archiveRoot = path.join(root, 'openspec', 'changes', 'archive');
  if (!fs.existsSync(archiveRoot)) return [];
  return fs.readdirSync(archiveRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(`-${changeName}`))
    .map((entry) => normalizedRepositoryPath(path.join('openspec', 'changes', 'archive', entry.name)))
    .sort();
}

// 项目检查只报告历史证据风险，不修改需求、不执行命令，也不把外部引用冒充远程复查结果。
export function auditProjectVerificationEvidence(target) {
  const root = fs.realpathSync(path.resolve(target));
  const requirementsRoot = path.join(root, 'requirements');
  const diagnostics = [];
  let records = 0;
  if (!fs.existsSync(requirementsRoot)) {
    return { checked: false, executed: false, requirements: 0, records, counts: {}, diagnostics };
  }
  const requirementFiles = fs.readdirSync(requirementsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^REQ-.*\.md$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  for (const fileName of requirementFiles) {
    const requirementPath = path.join(requirementsRoot, fileName);
    for (const record of verificationRows(fs.readFileSync(requirementPath, 'utf8'))) {
      if (record.结果 !== '通过' || !['自动', '自动+人工'].includes(record.验证类型)) continue;
      records += 1;
      const references = extractEvidenceReferences(record.证据位置);
      const jsonReferences = references.paths.filter((candidate) => candidate.toLowerCase().endsWith('.json'));
      for (const candidate of references.paths) {
        const active = candidate.match(/^openspec\/changes\/([^/]+)\//u);
        if (!active || active[1] === 'archive' || fs.existsSync(path.resolve(root, ...candidate.split('/')))) continue;
        diagnostics.push({
          code: 'stale_active_evidence_path',
          status: 'warning',
          target: candidate,
          requirement: normalizedRepositoryPath(path.relative(root, requirementPath)),
          evidenceId: record.验证ID,
          archivedCandidates: archivedCandidates(root, active[1]),
          message: `验证记录 ${record.验证ID} 仍引用不存在的活动变更路径：${candidate}`,
        });
      }
      if (!jsonReferences.length) {
        diagnostics.push({
          code: 'legacy_markdown_evidence',
          status: 'warning',
          target: `${normalizedRepositoryPath(path.relative(root, requirementPath))}#${record.验证ID}`,
          requirement: normalizedRepositoryPath(path.relative(root, requirementPath)),
          evidenceId: record.验证ID,
          message: `历史验证记录 ${record.验证ID} 只有 Markdown 或其他非机器证据`,
        });
        continue;
      }
      for (const candidate of jsonReferences) {
        let absolutePath;
        try {
          absolutePath = resolveSafePath(root, candidate, `历史验证记录 ${record.验证ID} 的机器证据`, { mustExist: true });
        } catch {
          continue;
        }
        let manifest;
        try {
          manifest = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
        } catch {
          continue;
        }
        if (manifest?.kind !== 'external-ci') continue;
        diagnostics.push({
          code: 'external_evidence_unverified',
          status: 'warning',
          target: candidate,
          requirement: normalizedRepositoryPath(path.relative(root, requirementPath)),
          evidenceId: record.验证ID,
          trust: 'external-recorded',
          message: `外部 CI 证据 ${record.验证ID} 只记录引用，当前插件没有可信远程读取回执`,
        });
      }
    }
  }
  const countEntries = new Map();
  for (const diagnostic of diagnostics) {
    countEntries.set(diagnostic.code, (countEntries.get(diagnostic.code) || 0) + 1);
  }
  const counts = Object.fromEntries([...countEntries].sort(([left], [right]) => left.localeCompare(right)));
  return {
    checked: true,
    executed: false,
    requirements: requirementFiles.length,
    records,
    counts,
    diagnostics,
  };
}

export function verificationEvidenceRequired(changePath) {
  const metadataPath = path.join(changePath, '.openspec.yaml');
  if (!fs.existsSync(metadataPath)) return false;
  // 元数据本身若被替换成链接，按严格合同失败关闭，且不读取链接目标内容。
  if (fs.lstatSync(metadataPath).isSymbolicLink()) return true;
  return /^verification_evidence:\s*required\s*(?:#.*)?$/mu.test(fs.readFileSync(metadataPath, 'utf8'));
}

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

export function createEvidenceFileDescriptor(root, candidate, label = '证据文件') {
  const absolutePath = resolveSafePath(root, candidate, label, { mustExist: true });
  if (!fs.statSync(absolutePath).isFile()) {
    throw new EvidenceError('invalid_evidence_file', `${label}必须是普通文件：${candidate}`, candidate);
  }
  return {
    path: relativeToRoot(root, absolutePath),
    bytes: fs.statSync(absolutePath).size,
    sha256: hashFile(absolutePath),
  };
}

function validateEvidenceFileDescriptor(root, descriptor, label, evidenceId) {
  const target = normalizedRepositoryPath(descriptor?.path);
  if (
    !descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)
    || !target || !Number.isInteger(descriptor.bytes) || descriptor.bytes < 0
    || !/^[a-f0-9]{64}$/u.test(descriptor.sha256 || '')
  ) {
    return invalidManifest('invalid_evidence_file_descriptor', `${label}缺少路径、字节数或 SHA-256`, target || label, evidenceId);
  }
  if (descriptor.path !== target) {
    return invalidManifest('invalid_evidence_file_descriptor', `${label}路径必须是规范化的项目相对路径`, target, evidenceId);
  }
  let absolutePath;
  try {
    absolutePath = resolveSafePath(root, target, label, { mustExist: true });
  } catch (error) {
    const normalized = error instanceof EvidenceError ? error : new EvidenceError('evidence_file_missing', error.message, target);
    return invalidManifest(normalized.code, normalized.message, normalized.target || target, evidenceId);
  }
  const stats = fs.statSync(absolutePath);
  if (!stats.isFile()) return invalidManifest('invalid_evidence_file', `${label}必须是普通文件`, target, evidenceId);
  if (stats.size !== descriptor.bytes) {
    return invalidManifest('evidence_file_size_mismatch', `${label}字节数与记录不一致`, target, evidenceId);
  }
  const currentHash = hashFile(absolutePath);
  if (currentHash !== descriptor.sha256) {
    return invalidManifest('evidence_file_hash_mismatch', `${label}内容哈希与记录不一致`, target, evidenceId);
  }
  return { ok: true, absolutePath, target };
}

function validateEvidenceFiles(root, descriptors, label, evidenceId) {
  if (!Array.isArray(descriptors)) {
    return invalidManifest('invalid_evidence_file_descriptor', `${label}必须是文件描述数组`, label, evidenceId);
  }
  for (const [index, descriptor] of descriptors.entries()) {
    const validation = validateEvidenceFileDescriptor(root, descriptor, `${label}[${index}]`, evidenceId);
    if (!validation.ok) return validation;
  }
  return { ok: true };
}

function assertEvidenceFiles(root, descriptors, label, evidenceId) {
  const validation = validateEvidenceFiles(root, descriptors, label, evidenceId);
  if (!validation.ok) throw new EvidenceError(validation.code, validation.message, validation.target);
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
      execution = await execute(normalizedCommand.command, normalizedCommand.args, {
        cwd,
        env: environment,
      }, {
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

function invalidManifest(code, message, target, evidenceId, extra = {}) {
  return {
    ok: false,
    code,
    status: 'failed',
    target,
    evidenceId,
    fresh: extra.fresh ?? null,
    trust: extra.trust ?? null,
    message,
    ...extra,
  };
}

function validExternal(manifest) {
  const external = manifest.external;
  return external && typeof external === 'object'
    && /^https?:\/\//iu.test(external.url || '')
    && /^[a-f0-9]{40,64}$/iu.test(external.commit || '')
    && Array.isArray(external.jobs)
    && external.jobs.length > 0
    && external.jobs.every((job) => job && typeof job.name === 'string' && job.status === 'passed');
}

export function validateEvidenceManifest({
  root,
  changePath,
  evidencePath,
  expectedId,
  expectedRequirement,
  manifest,
  strict = verificationEvidenceRequired(changePath),
} = {}) {
  let resolved;
  let data = manifest;
  try {
    const projectRoot = fs.realpathSync(path.resolve(root));
    resolved = resolveSafePath(projectRoot, evidencePath, '机器证据', { mustExist: data === undefined });
    const realChangePath = fs.realpathSync(path.resolve(changePath));
    if (!isInside(realChangePath, resolved)) {
      return invalidManifest(
        'unsafe_evidence_path',
        '机器证据必须位于所选变更目录内',
        relativeToRoot(projectRoot, resolved),
        expectedId,
      );
    }
    if (data === undefined) {
      try {
        data = JSON.parse(fs.readFileSync(resolved, 'utf8'));
      } catch (error) {
        return invalidManifest('invalid_evidence_json', `机器证据 JSON 无法解析：${error.message}`, relativeToRoot(projectRoot, resolved), expectedId);
      }
    }
    const target = relativeToRoot(projectRoot, resolved);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return invalidManifest('invalid_evidence_manifest', '机器证据必须是 JSON 对象', target, expectedId);
    if (data.schemaVersion === LEGACY_EVIDENCE_SCHEMA_VERSION) {
      if (strict) {
        return invalidManifest('legacy_evidence_schema', '严格证据门禁不接受历史 schema v1，请重新生成机器证据', target, expectedId, { trust: 'legacy' });
      }
      return {
        ok: true,
        code: 'legacy_evidence_schema',
        status: 'warning',
        target,
        evidenceId: expectedId,
        fresh: null,
        trust: 'legacy',
        kind: data.kind || null,
        manifest: data,
        message: '历史 schema v1 仅作兼容记录，不计入可信机器证据',
      };
    }
    if (data.schemaVersion !== EVIDENCE_SCHEMA_VERSION) return invalidManifest('unsupported_evidence_schema', `机器证据版本不受支持：${String(data.schemaVersion)}`, target, expectedId);
    if (data.evidenceId !== expectedId) return invalidManifest('evidence_id_mismatch', `机器证据 ID 与验证记录不一致：${data.evidenceId || '空值'} / ${expectedId}`, target, expectedId);
    if (!EVIDENCE_KINDS.has(data.kind)) return invalidManifest('unsupported_evidence_kind', `机器证据类型不受支持：${data.kind || '空值'}`, target, expectedId);
    if (data.status !== 'passed') return invalidManifest('evidence_not_passed', `机器证据状态不是 passed：${data.status || '空值'}`, target, expectedId);
    const canonicalChange = path.basename(changePath).replace(/^\d{4}-\d{2}-\d{2}-/u, '');
    if (data.change !== canonicalChange) return invalidManifest('evidence_change_mismatch', `机器证据变更不一致：${data.change || '空值'} / ${canonicalChange}`, target, expectedId);
    let recordedRequirement;
    try {
      recordedRequirement = resolveSafePath(projectRoot, data.requirement, '机器证据关联需求', { mustExist: true });
    } catch (error) {
      const normalized = error instanceof EvidenceError ? error : new EvidenceError('evidence_requirement_missing', error.message, data.requirement || null);
      return invalidManifest(normalized.code, normalized.message, normalized.target, expectedId);
    }
    if (expectedRequirement) {
      const selectedRequirement = resolveSafePath(projectRoot, expectedRequirement, '所选需求', { mustExist: true });
      if (fs.realpathSync(recordedRequirement) !== fs.realpathSync(selectedRequirement)) {
        return invalidManifest('evidence_requirement_mismatch', '机器证据关联需求与当前需求不一致', target, expectedId);
      }
    }
    resolveSafePath(projectRoot, path.join(changePath, 'test-plan.md'), '机器证据测试方案', { mustExist: true });

    let currentSemanticBinding;
    try {
      currentSemanticBinding = computeVerificationSemanticBinding({
        requirementPath: recordedRequirement,
        changePath,
        evidenceId: expectedId,
      });
    } catch (error) {
      const normalized = error instanceof VerificationSemanticError
        ? error
        : new VerificationSemanticError('semantic_binding_failed', error.message, target);
      return invalidManifest(normalized.code, normalized.message, normalized.target || target, expectedId, { fresh: false });
    }
    if (
      !data.semanticBinding || typeof data.semanticBinding !== 'object' || Array.isArray(data.semanticBinding)
      || stableJson(data.semanticBinding) !== stableJson(currentSemanticBinding)
    ) {
      return invalidManifest('stale_semantic_evidence', '机器证据对应的需求决策、验收、验证或测试语义已经变化', target, expectedId, {
        fresh: false,
        semanticFresh: false,
        actualSemanticBinding: currentSemanticBinding,
        recordedSemanticBinding: data.semanticBinding || null,
      });
    }

    const logValidation = validateEvidenceFiles(projectRoot, data.logs, '验证日志', expectedId);
    if (!logValidation.ok) return logValidation;
    const artifactValidation = validateEvidenceFiles(projectRoot, data.artifacts, '验证产物', expectedId);
    if (!artifactValidation.ok) return artifactValidation;

    if (data.kind === 'local-command') {
      if (!data.command || typeof data.command.executable !== 'string' || !Array.isArray(data.command.args)) {
        return invalidManifest('invalid_evidence_command', '本地机器证据缺少命令参数', target, expectedId);
      }
      if (data.exitCode !== 0) return invalidManifest('evidence_command_failed', `机器证据退出码不是 0：${String(data.exitCode)}`, target, expectedId);
      if (typeof data.locator !== 'string' || !data.locator || !Number.isInteger(data.locatorMatches) || data.locatorMatches <= 0) {
        return invalidManifest('zero_test_locator', '机器证据没有命中计划测试定位', target, expectedId);
      }
      if (data.logs.length === 0 || data.logs.some((item) => !['stdout', 'stderr'].includes(item?.stream))) {
        return invalidManifest('invalid_evidence_logs', '本地机器证据缺少可校验的 stdout/stderr 日志', target, expectedId);
      }
      if (!/^[a-f0-9]{64}$/u.test(data.workspaceFingerprint || '')) {
        return invalidManifest('invalid_workspace_fingerprint', '机器证据缺少有效工作区指纹', target, expectedId);
      }
      const current = computeWorkspaceFingerprint(projectRoot).digest;
      if (current !== data.workspaceFingerprint) {
        return invalidManifest('stale_evidence', '机器证据对应的工作区已经变化', target, expectedId, { fresh: false, actualFingerprint: current, recordedFingerprint: data.workspaceFingerprint });
      }
      return { ok: true, code: 'evidence_valid', status: 'passed', target, evidenceId: expectedId, fresh: true, trust: 'local-captured', kind: data.kind, manifest: data };
    }

    if (data.kind === 'external-ci') {
      if (!validExternal(data)) return invalidManifest('invalid_external_evidence', '外部 CI 证据缺少 URL、精确提交或通过任务', target, expectedId);
      return {
        ok: true,
        code: 'external_evidence_recorded',
        status: 'recorded',
        target,
        evidenceId: expectedId,
        fresh: null,
        trust: 'external-recorded',
        kind: data.kind,
        manifest: data,
        message: '外部 CI 引用已记录，但当前插件没有独立远程读取回执',
      };
    }

    const uiReview = data.uiReview;
    if (
      !uiReview || typeof uiReview !== 'object' || Array.isArray(uiReview)
      || typeof uiReview.runId !== 'string' || typeof uiReview.scenarioId !== 'string'
      || !/^[a-f0-9]{64}$/u.test(uiReview.scenarioFingerprint || '')
      || typeof uiReview.actualCapture !== 'string' || typeof uiReview.statePath !== 'string'
    ) {
      return invalidManifest('invalid_ui_review_evidence', 'UI Review 证据缺少运行、场景、采集器或状态路径身份', target, expectedId);
    }
    if (uiReview.state?.path !== normalizedRepositoryPath(uiReview.statePath)) {
      return invalidManifest('ui_review_state_mismatch', 'UI Review 状态文件描述与状态路径不一致', target, expectedId);
    }
    const stateValidation = validateEvidenceFileDescriptor(projectRoot, uiReview.state, 'UI Review 状态', expectedId);
    if (!stateValidation.ok) return stateValidation;
    let state;
    try {
      state = JSON.parse(fs.readFileSync(stateValidation.absolutePath, 'utf8'));
      assertState(state);
    } catch (error) {
      return invalidManifest('invalid_ui_review_state', `UI Review 状态无效：${error.message}`, stateValidation.target, expectedId);
    }
    if (state.schemaVersion !== UI_REVIEW_STATE_VERSION) {
      return invalidManifest('legacy_ui_review_state', '严格 UI Review 证据不接受历史状态版本', stateValidation.target, expectedId, { trust: 'legacy' });
    }
    if (state.status !== 'passed') {
      return invalidManifest('ui_review_not_passed', `UI Review 状态不是 passed：${state.status || '空值'}`, stateValidation.target, expectedId);
    }
    if (
      state.runId !== uiReview.runId
      || state.scenarioId !== uiReview.scenarioId
      || state.scenarioFingerprint !== uiReview.scenarioFingerprint
      || state.capture !== uiReview.actualCapture
    ) {
      return invalidManifest('ui_review_identity_mismatch', 'UI Review 清单与持久状态身份不一致', stateValidation.target, expectedId);
    }
    const requiredArtifactPaths = [
      state.artifacts?.actualScreenshot,
      state.artifacts?.annotatedScreenshot,
      state.artifacts?.report,
    ].map(normalizedRepositoryPath);
    if (requiredArtifactPaths.some((item) => !item)) {
      return invalidManifest('invalid_ui_review_artifacts', 'UI Review 状态缺少截图或报告路径', stateValidation.target, expectedId);
    }
    const recordedArtifactPaths = data.artifacts.map((item) => normalizedRepositoryPath(item.path)).sort();
    if (stableJson(recordedArtifactPaths) !== stableJson([...requiredArtifactPaths].sort())) {
      return invalidManifest('ui_review_artifact_mismatch', 'UI Review 清单没有完整绑定实际截图、标注截图和报告', target, expectedId);
    }
    return { ok: true, code: 'ui_review_evidence_valid', status: 'passed', target, evidenceId: expectedId, fresh: true, trust: 'ui-review-state', kind: data.kind, manifest: data };
  } catch (error) {
    const normalized = error instanceof EvidenceError || error instanceof ProjectPathError
      ? error
      : new EvidenceError('invalid_evidence_manifest', error.message);
    return invalidManifest(normalized.code, normalized.message, normalized.target || evidencePath || null, expectedId);
  }
}

function recordValue(record, english, chinese) {
  return record?.[english] ?? record?.[chinese] ?? null;
}

// 普通配置或报告 JSON 只作为持久资料，显式 V-* 或 evidence 目录才代表机器证据。
function isMachineEvidenceCandidate(candidatePath) {
  const normalized = candidatePath.replace(/\\/gu, '/');
  if (!normalized.toLowerCase().endsWith('.json')) return false;
  const segments = normalized.split('/').filter(Boolean);
  const fileName = segments.at(-1) || '';
  return /^V-\d+\.json$/iu.test(fileName)
    || segments.slice(0, -1).some((segment) => segment.toLowerCase() === 'evidence');
}

export function validateVerificationEvidenceRecords({ root, changePath, requirementPath = null, records = [] } = {}) {
  const projectRoot = fs.realpathSync(path.resolve(root));
  const required = verificationEvidenceRequired(changePath);
  const diagnostics = [];
  let verifiedFiles = 0;
  for (const record of records) {
    const id = recordValue(record, 'id', '验证ID');
    const type = recordValue(record, 'type', '验证类型');
    const result = recordValue(record, 'result', '结果');
    const evidence = recordValue(record, 'evidence', '证据位置');
    if (result !== '通过') continue;
    const references = extractEvidenceReferences(evidence);
    const existing = [];
    for (const candidate of references.paths) {
      try {
        const absolutePath = resolveSafePath(projectRoot, candidate, `验证记录 ${id} 的持久证据`, { mustExist: true });
        verifiedFiles += 1;
        existing.push({ path: candidate, absolutePath });
      } catch (error) {
        const normalized = error instanceof EvidenceError ? error : new EvidenceError('evidence_file_missing', error.message, candidate);
        diagnostics.push({ code: normalized.code, status: required ? 'failed' : 'warning', target: normalized.target || candidate, evidenceId: id, message: normalized.message });
      }
    }
    if (type !== '自动' && type !== '自动+人工') continue;
    const jsonEvidence = existing.filter((item) => isMachineEvidenceCandidate(item.path));
    let validMachineEvidence = false;
    for (const item of jsonEvidence) {
      const validation = validateEvidenceManifest({
        root: projectRoot,
        changePath,
        evidencePath: item.absolutePath,
        expectedId: id,
        expectedRequirement: requirementPath,
        strict: required,
      });
      diagnostics.push({
        code: validation.code,
        status: validation.ok ? validation.status : (required ? 'failed' : 'warning'),
        target: validation.target,
        evidenceId: id,
        kind: validation.kind || null,
        locator: validation.manifest?.locator || null,
        locatorMatches: validation.manifest?.locatorMatches ?? null,
        fresh: validation.fresh,
        trust: validation.trust,
        message: validation.message || null,
      });
      if (
        validation.ok
        && validation.status === 'passed'
        && ['local-captured', 'ui-review-state'].includes(validation.trust)
      ) validMachineEvidence = true;
    }
    if (required && !validMachineEvidence) {
      diagnostics.push({ code: 'machine_evidence_missing', status: 'failed', target: id, evidenceId: id, fresh: null, trust: null, message: `自动验证记录 ${id} 缺少同 ID 的有效机器证据` });
    } else if (!required && !validMachineEvidence) {
      diagnostics.push({ code: 'legacy_markdown_evidence', status: 'warning', target: id, evidenceId: id, fresh: null, trust: 'legacy', message: `历史验证记录 ${id} 只有 Markdown 或其他非机器证据` });
    }
  }
  return {
    ok: !diagnostics.some((item) => item.status === 'failed'),
    required,
    executed: false,
    verifiedFiles,
    diagnostics,
  };
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
