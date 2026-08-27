import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  ProjectPathError,
  resolveSafeProjectPath as resolveProjectPath,
} from './project-path-safety.mjs';
import { computeVerificationSemanticBinding } from './verification-semantics.mjs';
import { listRequirementEntries } from './requirement-archive.mjs';

export { computeVerificationSemanticBinding };

export const LEGACY_EVIDENCE_SCHEMA_VERSION = 1;
export const EVIDENCE_SCHEMA_VERSION = 2;
export const EVIDENCE_KINDS = new Set(['local-command', 'external-ci', 'ui-review']);
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

export function normalizedRepositoryPath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//u, '');
}

export function isInside(root, target, { allowRoot = false } = {}) {
  const relative = path.relative(root, target);
  return (allowRoot && relative === '') || Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolveSafePath(root, candidate, label, { mustExist = false, allowRoot = false } = {}) {
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

export function relativeToRoot(root, target) {
  return normalizedRepositoryPath(path.relative(root, target));
}

export function hashFile(filePath) {
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
export function auditProjectVerificationEvidence(target, { includeArchive = false } = {}) {
  const root = fs.realpathSync(path.resolve(target));
  const requirementsRoot = path.join(root, 'requirements');
  const diagnostics = [];
  let records = 0;
  if (!fs.existsSync(requirementsRoot)) {
    return { checked: false, executed: false, requirements: 0, records, counts: {}, diagnostics };
  }
  const requirementFiles = includeArchive
    ? listRequirementEntries(root, { includeArchive: true }).map((entry) => entry.path)
    : fs.readdirSync(requirementsRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^REQ-.*\.md$/u.test(entry.name))
      .map((entry) => path.posix.join('requirements', entry.name))
      .sort();

  for (const projectPath of requirementFiles) {
    const requirementPath = path.join(root, projectPath);
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
    includeArchive,
    scannedDirectory: includeArchive ? 'requirements/archive' : 'requirements',
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
