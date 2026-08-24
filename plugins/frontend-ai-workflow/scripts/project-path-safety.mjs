import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export class ProjectPathError extends Error {
  constructor(code, message, target = null, status = 'blocked') {
    super(message);
    this.name = 'ProjectPathError';
    this.code = code;
    this.status = status;
    this.target = target;
  }
}

function normalizeMachinePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//u, '');
}

function isInside(root, candidate, { allowRoot = false } = {}) {
  const relative = path.relative(root, candidate);
  return (allowRoot && relative === '')
    || Boolean(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function fail(code, label, detail, target) {
  throw new ProjectPathError(code, `${label}${detail}`, normalizeMachinePath(target));
}

function lstatIfPresent(candidate) {
  try {
    return fs.lstatSync(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function resolveCanonicalProjectRoot(projectRoot) {
  if (typeof projectRoot !== 'string' || !projectRoot.trim()) {
    fail('invalid_project_root', '项目根目录', '不能为空', projectRoot || null);
  }
  const selected = path.resolve(projectRoot);
  let canonicalRoot;
  try {
    canonicalRoot = fs.realpathSync(selected);
  } catch (error) {
    throw new ProjectPathError('invalid_project_root', `项目根目录无法解析：${error.message}`, normalizeMachinePath(selected));
  }
  const rootStats = lstatIfPresent(canonicalRoot);
  if (!rootStats?.isDirectory()) {
    fail('invalid_project_root', '项目根目录', '必须是真实目录', canonicalRoot);
  }
  return canonicalRoot;
}

function resolveCandidate(canonicalRoot, candidate, label, { allowAbsolute = false, allowRoot = false } = {}) {
  if (typeof candidate !== 'string' || !candidate.trim()) {
    fail('unsafe_project_path', label, '不能为空', candidate || null);
  }
  const raw = candidate.trim();
  const machineTarget = normalizeMachinePath(raw);
  const foreignAbsolute = path.win32.isAbsolute(raw) && process.platform !== 'win32';
  const absolute = path.isAbsolute(raw);
  if ((absolute || foreignAbsolute) && !allowAbsolute) {
    fail('unsafe_project_path', label, '必须是项目相对路径', machineTarget);
  }

  let resolved;
  if (absolute) {
    resolved = path.resolve(raw);
  } else if (foreignAbsolute) {
    fail('unsafe_project_path', label, '不得使用其他平台绝对路径', machineTarget);
  } else if (allowRoot && raw === '.') {
    resolved = canonicalRoot;
  } else {
    if (raw.includes('\\')) fail('unsafe_project_path', label, '必须使用正斜杠项目相对路径', machineTarget);
    const segments = raw.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
      fail('unsafe_project_path', label, '不能包含空路径段、. 或 ..', machineTarget);
    }
    resolved = path.resolve(canonicalRoot, ...segments);
  }

  if (!isInside(canonicalRoot, resolved, { allowRoot })) {
    fail('unsafe_project_path', label, allowRoot ? '越出项目范围' : '不能指向项目根目录或项目外部', machineTarget);
  }
  return {
    resolved,
    projectPath: normalizeMachinePath(path.relative(canonicalRoot, resolved)),
    machineTarget,
  };
}

// 逐段使用 lstat，确保项目内部的链接即使仍指向项目内也不会成为受管写入落点。
export function resolveSafeProjectPath(projectRoot, candidate, label = '项目路径', {
  mustExist = false,
  allowRoot = false,
  allowDirectory = true,
  allowAbsolute = false,
} = {}) {
  const canonicalRoot = resolveCanonicalProjectRoot(projectRoot);
  const normalized = resolveCandidate(canonicalRoot, candidate, label, { allowAbsolute, allowRoot });
  const relative = path.relative(canonicalRoot, normalized.resolved);
  const segments = relative ? relative.split(path.sep).filter(Boolean) : [];
  let current = canonicalRoot;
  let exists = true;
  let stats = fs.lstatSync(canonicalRoot);

  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    stats = lstatIfPresent(current);
    if (!stats) {
      exists = false;
      break;
    }
    if (stats.isSymbolicLink()) {
      fail('project_path_symlink', label, `通过符号链接越出了项目安全边界：${normalized.projectPath}`, normalized.projectPath);
    }
    if (index < segments.length - 1 && !stats.isDirectory()) {
      fail('project_path_not_directory', label, `的祖先不是目录：${normalized.projectPath}`, normalized.projectPath);
    }
  }

  if (mustExist && !exists) {
    fail('project_path_missing', label, `不存在：${normalized.projectPath}`, normalized.projectPath);
  }
  if (exists && !allowDirectory && !stats.isFile()) {
    fail('project_path_not_file', label, `必须是普通文件：${normalized.projectPath}`, normalized.projectPath);
  }
  return {
    canonicalRoot,
    absolutePath: normalized.resolved,
    projectPath: normalized.projectPath,
    exists,
    kind: !exists ? 'missing' : stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other',
  };
}

export function ensureSafeProjectDirectory(projectRoot, candidate, label = '目标目录') {
  const initial = resolveSafeProjectPath(projectRoot, candidate, label, {
    allowRoot: true,
    allowAbsolute: path.isAbsolute(candidate),
  });
  const relative = path.relative(initial.canonicalRoot, initial.absolutePath);
  const segments = relative ? relative.split(path.sep).filter(Boolean) : [];
  let current = initial.canonicalRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    let stats = lstatIfPresent(current);
    if (!stats) {
      try {
        fs.mkdirSync(current);
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }
      stats = lstatIfPresent(current);
    }
    if (stats?.isSymbolicLink()) {
      fail('project_path_symlink', label, `通过符号链接越出了项目安全边界：${initial.projectPath}`, initial.projectPath);
    }
    if (!stats?.isDirectory()) {
      fail('project_path_not_directory', label, `不是目录：${initial.projectPath}`, initial.projectPath);
    }
  }
  return resolveSafeProjectPath(initial.canonicalRoot, initial.absolutePath, label, {
    mustExist: true,
    allowRoot: true,
    allowAbsolute: true,
  });
}

export function openProjectFileExclusive(projectRoot, candidate, label = '目标文件') {
  const initial = resolveSafeProjectPath(projectRoot, candidate, label, { allowAbsolute: path.isAbsolute(candidate) });
  ensureSafeProjectDirectory(initial.canonicalRoot, path.dirname(initial.absolutePath), `${label}父目录`);
  const checked = resolveSafeProjectPath(initial.canonicalRoot, initial.absolutePath, label, { allowAbsolute: true });
  if (checked.exists) {
    throw new ProjectPathError('project_path_exists', `${label}已存在：${checked.projectPath}`, checked.projectPath);
  }
  const descriptor = fs.openSync(checked.absolutePath, 'wx');
  try {
    const created = resolveSafeProjectPath(checked.canonicalRoot, checked.absolutePath, label, {
      mustExist: true,
      allowDirectory: false,
      allowAbsolute: true,
    });
    return { ...created, descriptor };
  } catch (error) {
    fs.closeSync(descriptor);
    throw error;
  }
}

export function atomicWriteProjectFile(projectRoot, candidate, content, {
  label = '目标文件',
  encoding = typeof content === 'string' ? 'utf8' : undefined,
  mustNotExist = false,
  operations = {},
} = {}) {
  const initial = resolveSafeProjectPath(projectRoot, candidate, label, {
    allowDirectory: false,
    allowAbsolute: path.isAbsolute(candidate),
  });
  ensureSafeProjectDirectory(initial.canonicalRoot, path.dirname(initial.absolutePath), `${label}父目录`);
  const target = resolveSafeProjectPath(initial.canonicalRoot, initial.absolutePath, label, {
    allowDirectory: false,
    allowAbsolute: true,
  });
  if (mustNotExist && target.exists) {
    throw new ProjectPathError('project_path_exists', `${label}已存在：${target.projectPath}`, target.projectPath);
  }
  const temporaryName = `.${path.basename(target.absolutePath)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  const temporaryPath = path.join(path.dirname(target.absolutePath), temporaryName);
  let descriptor = null;
  try {
    const opened = openProjectFileExclusive(target.canonicalRoot, temporaryPath, `${label}临时文件`);
    descriptor = opened.descriptor;
    fs.writeFileSync(descriptor, content, encoding ? { encoding } : undefined);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    resolveSafeProjectPath(target.canonicalRoot, target.absolutePath, label, {
      allowDirectory: false,
      allowAbsolute: true,
    });
    if (mustNotExist && lstatIfPresent(target.absolutePath)) {
      throw new ProjectPathError('project_path_exists', `${label}已存在：${target.projectPath}`, target.projectPath);
    }
    const rename = operations.rename || fs.renameSync;
    rename(temporaryPath, target.absolutePath);
    return resolveSafeProjectPath(target.canonicalRoot, target.absolutePath, label, {
      mustExist: true,
      allowDirectory: false,
      allowAbsolute: true,
    });
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
    const temporaryStats = lstatIfPresent(temporaryPath);
    if (temporaryStats?.isFile()) fs.unlinkSync(temporaryPath);
  }
}

export function copyProjectFile(projectRoot, source, target, { label = '目标文件' } = {}) {
  const safeSource = resolveSafeProjectPath(projectRoot, source, `${label}来源`, {
    mustExist: true,
    allowDirectory: false,
    allowAbsolute: path.isAbsolute(source),
  });
  return atomicWriteProjectFile(projectRoot, target, fs.readFileSync(safeSource.absolutePath), {
    label,
    encoding: undefined,
    mustNotExist: true,
  });
}

function assertSafeDirectoryTree(projectRoot, directory, label) {
  const safe = resolveSafeProjectPath(projectRoot, directory, label, {
    mustExist: true,
    allowAbsolute: path.isAbsolute(directory),
  });
  if (safe.kind !== 'directory') {
    fail('project_path_not_directory', label, `不是目录：${safe.projectPath}`, safe.projectPath);
  }
  for (const entry of fs.readdirSync(safe.absolutePath, { withFileTypes: true })) {
    const child = path.join(safe.absolutePath, entry.name);
    const checked = resolveSafeProjectPath(safe.canonicalRoot, child, label, {
      mustExist: true,
      allowAbsolute: true,
    });
    if (checked.kind === 'directory') assertSafeDirectoryTree(safe.canonicalRoot, checked.absolutePath, label);
  }
  return safe;
}

export function publishProjectDirectory(projectRoot, source, target, { label = '目标目录', operations = {} } = {}) {
  const safeSource = assertSafeDirectoryTree(projectRoot, source, `${label}临时目录`);
  const initialTarget = resolveSafeProjectPath(safeSource.canonicalRoot, target, label, {
    allowAbsolute: path.isAbsolute(target),
  });
  if (initialTarget.exists) {
    throw new ProjectPathError('project_path_exists', `${label}已存在：${initialTarget.projectPath}`, initialTarget.projectPath);
  }
  ensureSafeProjectDirectory(safeSource.canonicalRoot, path.dirname(initialTarget.absolutePath), `${label}父目录`);
  assertSafeDirectoryTree(safeSource.canonicalRoot, safeSource.absolutePath, `${label}临时目录`);
  const checkedTarget = resolveSafeProjectPath(safeSource.canonicalRoot, initialTarget.absolutePath, label, {
    allowAbsolute: true,
  });
  if (checkedTarget.exists) {
    throw new ProjectPathError('project_path_exists', `${label}已存在：${checkedTarget.projectPath}`, checkedTarget.projectPath);
  }
  const rename = operations.rename || fs.renameSync;
  rename(safeSource.absolutePath, checkedTarget.absolutePath);
  return assertSafeDirectoryTree(safeSource.canonicalRoot, checkedTarget.absolutePath, label);
}

export function removeProjectDirectory(projectRoot, candidate, { label = '目标目录', operations = {} } = {}) {
  const safe = assertSafeDirectoryTree(projectRoot, candidate, label);
  const remove = operations.remove || fs.rmSync;
  remove(safe.absolutePath, { recursive: true, force: false });
  return { ...safe, removed: true };
}

export function removeProjectFile(projectRoot, candidate, { label = '目标文件', operations = {} } = {}) {
  const initial = resolveSafeProjectPath(projectRoot, candidate, label, {
    mustExist: true,
    allowDirectory: false,
    allowAbsolute: path.isAbsolute(candidate),
  });
  const checked = resolveSafeProjectPath(initial.canonicalRoot, initial.absolutePath, label, {
    mustExist: true,
    allowDirectory: false,
    allowAbsolute: true,
  });
  const unlink = operations.unlink || fs.unlinkSync;
  unlink(checked.absolutePath);
  return { ...checked, removed: true };
}

export function projectPathFailure(error, { write = false, actions = [] } = {}) {
  if (!(error instanceof ProjectPathError)) throw error;
  return {
    ok: false,
    code: error.code,
    status: error.status,
    target: error.target,
    write: Boolean(write),
    actions,
    error: error.message,
  };
}
