import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const STUB_MARKER = '<!-- requirement-archive-stub:v1 -->';
const REQUIREMENT_PATTERN = /^REQ-(\d{4})-\d+[-\w]*\.md$/u;

export class RequirementArchiveError extends Error {
  constructor(code, message, target = null) {
    super(message);
    this.name = 'RequirementArchiveError';
    this.code = code;
    this.target = target;
  }
}

function normalizeRelative(value) {
  return String(value).split(path.sep).join('/');
}

function assertSafeRoot(root) {
  const resolved = fs.realpathSync(path.resolve(root));
  if (resolved === path.parse(resolved).root || resolved === fs.realpathSync(os.homedir())) {
    throw new RequirementArchiveError('unsafe_project_root', `拒绝把文件系统根目录或用户主目录作为项目根目录：${resolved}`, resolved);
  }
  const requirementsRoot = path.join(resolved, 'requirements');
  if (fs.existsSync(requirementsRoot) && fs.lstatSync(requirementsRoot).isSymbolicLink()) {
    throw new RequirementArchiveError('unsafe_requirement_root', `requirements 不能是符号链接：${requirementsRoot}`, requirementsRoot);
  }
  return { root: resolved, requirementsRoot };
}

function assertRequirementPath(root, requirementsRoot, candidate) {
  const resolved = path.resolve(candidate);
  const relative = path.relative(requirementsRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.includes(path.sep)) {
    throw new RequirementArchiveError('unsafe_requirement_path', `需求文件必须直接位于 requirements 根目录：${candidate}`, candidate);
  }
  if (!REQUIREMENT_PATTERN.test(relative)) {
    throw new RequirementArchiveError('invalid_requirement_name', `需求文件名不符合 REQ-<year>-<number> 约定：${relative}`, relative);
  }
  if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) {
    throw new RequirementArchiveError('unsafe_requirement_path', `需求文件不能是符号链接：${relative}`, relative);
  }
  return { absolutePath: resolved, relativePath: normalizeRelative(path.relative(root, resolved)) };
}

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(temporary, content, 'utf8');
  fs.renameSync(temporary, filePath);
}

function field(content, label) {
  return String(content).match(new RegExp(`^-\\s*${label}：\\s*(.+?)\\s*$`, 'mu'))?.[1]?.replace(/^`|`$/gu, '').trim() || null;
}

function requirementMetadata(fileName, content, archiveTarget = null) {
  const id = fileName.match(/^(REQ-\d{4}-\d+)/u)?.[1] || path.basename(fileName, '.md');
  const year = fileName.match(REQUIREMENT_PATTERN)?.[1] || null;
  const title = String(content).match(/^#\s+(.+?)\s*$/mu)?.[1] || id;
  return {
    id,
    title,
    status: field(content, '状态'),
    year,
    entryPath: `requirements/${fileName}`,
    archivePath: archiveTarget || `requirements/archive/${year}/${fileName}`,
    change: field(content, '关联变更'),
  };
}

export function renderRequirementStub(metadata) {
  return `${STUB_MARKER}
# ${metadata.title}

## 基本信息

- 状态：${metadata.status || '已验收'}
- 归档年份：${metadata.year}
- 完整正文：\`${metadata.archivePath}\`
${metadata.change ? `- 关联变更：\`${metadata.change}\`\n` : ''}
> 本文件是轻量入口。日常检查无需展开归档正文；历史审计时按上方路径读取。
`;
}

function isStub(content) {
  return String(content).includes(STUB_MARKER);
}

function collectIndexEntries(root, requirementsRoot) {
  if (!fs.existsSync(requirementsRoot)) return [];
  return fs.readdirSync(requirementsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && REQUIREMENT_PATTERN.test(entry.name))
    .map((entry) => {
      const content = fs.readFileSync(path.join(requirementsRoot, entry.name), 'utf8');
      if (!isStub(content)) return null;
      const archivePath = field(content, '完整正文');
      return requirementMetadata(entry.name, content, archivePath);
    })
    .filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id) || left.entryPath.localeCompare(right.entryPath));
}

export function refreshRequirementIndex(root, { write = true } = {}) {
  const safe = assertSafeRoot(root);
  const index = { schemaVersion: 1, entries: collectIndexEntries(safe.root, safe.requirementsRoot) };
  const indexPath = path.join(safe.requirementsRoot, 'index.json');
  if (write) atomicWrite(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  return { index, indexPath };
}

export function readRequirementIndex(root) {
  const safe = assertSafeRoot(root);
  const indexPath = path.join(safe.requirementsRoot, 'index.json');
  if (!fs.existsSync(indexPath)) return { schemaVersion: 1, entries: [] };
  return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
}

export function archiveRequirement({ root, requirementPath, write = false } = {}) {
  const safe = assertSafeRoot(root);
  const requirement = assertRequirementPath(safe.root, safe.requirementsRoot, requirementPath);
  if (!fs.existsSync(requirement.absolutePath)) {
    throw new RequirementArchiveError('requirement_not_found', `需求文件不存在：${requirement.relativePath}`, requirement.relativePath);
  }
  const content = fs.readFileSync(requirement.absolutePath, 'utf8');
  const fileName = path.basename(requirement.absolutePath);
  const year = fileName.match(REQUIREMENT_PATTERN)[1];
  const archivePath = path.join(safe.requirementsRoot, 'archive', year, fileName);
  const archiveTarget = normalizeRelative(path.relative(safe.root, archivePath));
  const metadata = requirementMetadata(fileName, content, archiveTarget);

  if (isStub(content)) {
    if (!fs.existsSync(path.resolve(safe.root, metadata.archivePath))) {
      throw new RequirementArchiveError('requirement_archive_missing', `根存根指向的归档正文不存在：${metadata.archivePath}`, metadata.archivePath);
    }
    if (write) refreshRequirementIndex(safe.root);
    return {
      ok: true,
      code: 'requirement_already_archived',
      status: 'passed',
      write,
      target: requirement.relativePath,
      archiveTarget: metadata.archivePath,
      requirementPath: requirement.absolutePath,
      archivePath: path.resolve(safe.root, metadata.archivePath),
    };
  }
  if (metadata.status !== '已验收') {
    throw new RequirementArchiveError('requirement_not_accepted', `只有“已验收”需求可以归档，当前为“${metadata.status || '未知'}”`, requirement.relativePath);
  }
  if (fs.existsSync(archivePath) && fs.readFileSync(archivePath, 'utf8') !== content) {
    throw new RequirementArchiveError('requirement_archive_conflict', `归档目标已存在且正文不同：${archiveTarget}`, archiveTarget);
  }

  const result = {
    ok: true,
    code: write ? 'requirement_archived' : 'requirement_archive_ready',
    status: write ? 'passed' : 'ready',
    write,
    target: requirement.relativePath,
    archiveTarget,
    requirementPath: requirement.absolutePath,
    archivePath,
  };
  if (!write) return result;

  if (!fs.existsSync(archivePath)) atomicWrite(archivePath, content);
  atomicWrite(requirement.absolutePath, renderRequirementStub(metadata));
  refreshRequirementIndex(safe.root);
  return result;
}

export function archiveAcceptedRequirements({ root = process.cwd(), write = false } = {}) {
  const safe = assertSafeRoot(root);
  const files = fs.existsSync(safe.requirementsRoot)
    ? fs.readdirSync(safe.requirementsRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && REQUIREMENT_PATTERN.test(entry.name))
      .map((entry) => path.join(safe.requirementsRoot, entry.name))
      .sort()
    : [];
  const actions = [];
  let archived = 0;
  let alreadyArchived = 0;
  let skipped = 0;
  for (const requirementPath of files) {
    const content = fs.readFileSync(requirementPath, 'utf8');
    if (isStub(content)) {
      actions.push(archiveRequirement({ root: safe.root, requirementPath, write }));
      alreadyArchived += 1;
    } else if (field(content, '状态') === '已验收') {
      actions.push(archiveRequirement({ root: safe.root, requirementPath, write }));
      archived += 1;
    } else {
      skipped += 1;
    }
  }
  const index = refreshRequirementIndex(safe.root, { write });
  return {
    ok: true,
    code: write ? 'requirements_archived' : 'requirements_archive_ready',
    status: write ? 'passed' : 'ready',
    write,
    archived,
    alreadyArchived,
    skipped,
    actions,
    index: index.index,
  };
}

export function listRequirementEntries(root, { includeArchive = false } = {}) {
  const safe = assertSafeRoot(root);
  if (includeArchive) {
    return readRequirementIndex(safe.root).entries.map((entry) => ({
      ...entry,
      kind: 'archive',
      path: entry.archivePath,
    }));
  }
  if (!fs.existsSync(safe.requirementsRoot)) return [];
  return fs.readdirSync(safe.requirementsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && REQUIREMENT_PATTERN.test(entry.name))
    .map((entry) => {
      const content = fs.readFileSync(path.join(safe.requirementsRoot, entry.name), 'utf8');
      return {
        ...requirementMetadata(entry.name, content),
        kind: isStub(content) ? 'stub' : 'active',
        path: `requirements/${entry.name}`,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function parseArgs(argv) {
  const args = { root: process.cwd(), requirementPath: null, write: false, includeArchive: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--target' || value === '--requirement') {
      if (!argv[index + 1]) throw new Error(`参数 ${value} 缺少值`);
      if (value === '--target') args.root = argv[index + 1];
      else args.requirementPath = path.resolve(args.root, argv[index + 1]);
      index += 1;
    } else if (value === '--write') args.write = true;
    else if (value === '--history') args.includeArchive = true;
    else throw new Error(`不支持的参数：${value}`);
  }
  return args;
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = args.includeArchive
      ? { ok: true, code: 'requirement_history_listed', entries: listRequirementEntries(args.root, { includeArchive: true }) }
      : args.requirementPath
        ? archiveRequirement(args)
        : archiveAcceptedRequirements(args);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: error.code || 'requirement_archive_failed', target: error.target || null, errors: [error.message] }, null, 2));
    process.exitCode = 1;
  }
}
