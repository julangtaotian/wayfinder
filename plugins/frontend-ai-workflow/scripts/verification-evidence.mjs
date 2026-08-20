import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { assertSafeProjectRoot, resolveProjectRoot } from './collect-project-scope.mjs';

export const EVIDENCE_SCHEMA_VERSION = 1;
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
  if (typeof candidate !== 'string' || !candidate.trim()) {
    throw new EvidenceError('unsafe_evidence_path', `${label}不能为空`, candidate || null);
  }
  const raw = candidate.trim();
  if (!path.isAbsolute(raw) && path.win32.isAbsolute(raw) && process.platform !== 'win32') {
    throw new EvidenceError('unsafe_evidence_path', `${label}不得使用其他平台绝对路径：${raw}`, raw);
  }
  const resolved = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(root, ...normalizedRepositoryPath(raw).split('/'));
  if (!isInside(root, resolved, { allowRoot })) {
    throw new EvidenceError('unsafe_evidence_path', `${label}越出项目范围：${raw}`, raw);
  }
  if (mustExist && !fs.existsSync(resolved)) {
    throw new EvidenceError('evidence_file_missing', `${label}不存在：${raw}`, normalizedRepositoryPath(path.relative(root, resolved)));
  }
  if (fs.existsSync(resolved)) {
    const real = fs.realpathSync(resolved);
    if (!isInside(root, real, { allowRoot })) {
      throw new EvidenceError('unsafe_evidence_path', `${label}通过符号链接越出项目范围：${raw}`, raw);
    }
  }
  return resolved;
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
        if (manifest?.kind !== 'external-ci' || manifest.external?.remotelyVerified === true) continue;
        diagnostics.push({
          code: 'external_evidence_unverified',
          status: 'warning',
          target: candidate,
          requirement: normalizedRepositoryPath(path.relative(root, requirementPath)),
          evidenceId: record.验证ID,
          trust: 'external-unverified',
          message: `外部 CI 证据 ${record.验证ID} 只记录引用，尚未由插件远程复查`,
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
  return fs.existsSync(metadataPath)
    && /^verification_evidence:\s*required\s*(?:#.*)?$/mu.test(fs.readFileSync(metadataPath, 'utf8'));
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

function createLogAccumulator(filePath, locator) {
  const descriptor = fs.openSync(filePath, 'w');
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

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temporary, content, 'utf8');
    fs.renameSync(temporary, filePath);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function summarizeArtifact(root, candidate) {
  const absolutePath = resolveSafePath(root, candidate, '验证产物', { mustExist: true });
  if (!fs.statSync(absolutePath).isFile()) {
    throw new EvidenceError('invalid_artifact', `验证产物必须是文件：${candidate}`, candidate);
  }
  return {
    path: relativeToRoot(root, absolutePath),
    bytes: fs.statSync(absolutePath).size,
    sha256: hashFile(absolutePath),
  };
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
    const cwd = resolveSafePath(root, workingDirectory, '验证工作目录', { mustExist: true, allowRoot: true });
    if (!fs.statSync(cwd).isDirectory()) throw new EvidenceError('invalid_working_directory', '验证工作目录必须是目录', workingDirectory);
    const normalizedCommand = normalizeEvidenceCommand(command, { platform, environment, nodePath, fileExists });
    const manifestPath = path.join(changePath, 'evidence', `${evidenceId}.json`);
    const logRoot = path.join(root, 'outputs', 'verification-evidence', path.basename(changePath), evidenceId);
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

    fs.mkdirSync(logRoot, { recursive: true });
    const stdoutPath = path.join(logRoot, 'stdout.log');
    const stderrPath = path.join(logRoot, 'stderr.log');
    const stdout = createLogAccumulator(stdoutPath, locator.trim());
    const stderr = createLogAccumulator(stderrPath, locator.trim());
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
      { stream: 'stdout', path: relativeToRoot(root, stdoutPath), bytes: stdoutResult.bytes, sha256: stdoutResult.sha256 },
      { stream: 'stderr', path: relativeToRoot(root, stderrPath), bytes: stderrResult.bytes, sha256: stderrResult.sha256 },
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

    const manifest = {
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      evidenceId,
      kind: 'local-command',
      status: 'passed',
      requirement: relativeToRoot(root, requirementPath),
      change: path.basename(changePath).replace(/^\d{4}-\d{2}-\d{2}-/u, ''),
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
      artifacts: artifacts.map((item) => summarizeArtifact(root, item)),
    };
    atomicWrite(manifestPath, stableJson(manifest));
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
    const normalized = error instanceof EvidenceError
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
  return { ok: false, code, status: 'failed', target, evidenceId, fresh: extra.fresh ?? null, trust: null, message, ...extra };
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

export function validateEvidenceManifest({ root, changePath, evidencePath, expectedId, expectedRequirement, manifest } = {}) {
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

    if (data.kind === 'local-command') {
      if (!data.command || typeof data.command.executable !== 'string' || !Array.isArray(data.command.args)) {
        return invalidManifest('invalid_evidence_command', '本地机器证据缺少命令参数', target, expectedId);
      }
      if (data.exitCode !== 0) return invalidManifest('evidence_command_failed', `机器证据退出码不是 0：${String(data.exitCode)}`, target, expectedId);
      if (typeof data.locator !== 'string' || !data.locator || !Number.isInteger(data.locatorMatches) || data.locatorMatches <= 0) {
        return invalidManifest('zero_test_locator', '机器证据没有命中计划测试定位', target, expectedId);
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
        status: 'passed',
        target,
        evidenceId: expectedId,
        fresh: null,
        trust: data.external.remotelyVerified === true ? 'external-verified' : 'external-unverified',
        kind: data.kind,
        manifest: data,
      };
    }

    if (!data.uiReview || typeof data.uiReview.runId !== 'string' || typeof data.uiReview.statePath !== 'string') {
      return invalidManifest('invalid_ui_review_evidence', 'UI Review 证据缺少 runId 或状态路径', target, expectedId);
    }
    resolveSafePath(projectRoot, data.uiReview.statePath, 'UI Review 状态', { mustExist: true });
    return { ok: true, code: 'ui_review_evidence_valid', status: 'passed', target, evidenceId: expectedId, fresh: null, trust: 'ui-review-state', kind: data.kind, manifest: data };
  } catch (error) {
    const normalized = error instanceof EvidenceError ? error : new EvidenceError('invalid_evidence_manifest', error.message);
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
      });
      diagnostics.push({
        code: validation.code,
        status: validation.ok
          ? (validation.trust === 'external-unverified' ? 'warning' : 'passed')
          : (required ? 'failed' : 'warning'),
        target: validation.target,
        evidenceId: id,
        kind: validation.kind || null,
        locator: validation.manifest?.locator || null,
        locatorMatches: validation.manifest?.locatorMatches ?? null,
        fresh: validation.fresh,
        trust: validation.trust,
        message: validation.message || null,
      });
      if (validation.ok) validMachineEvidence = true;
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
