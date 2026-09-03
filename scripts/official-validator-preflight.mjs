import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const OFFICIAL_VALIDATOR_SUCCESS_CODE = 'official_validator_preflight_passed';
export const OFFICIAL_VALIDATOR_SUCCESS_CONCLUSION = '当前本地 Creator validators 预检通过';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptRoot, '..');
const launcherPath = path.join(scriptRoot, 'official-validator-launcher.py');
const dependencyLockPath = path.join(scriptRoot, 'official-validator-dependency-lock.json');
const cacheManifestName = '.official-validator-cache.json';
const pythonIdentityScript = 'import json, platform, sys; print(json.dumps({"version": platform.python_version(), "implementation": sys.implementation.name, "platform": sys.platform, "machine": platform.machine()}))';

export function officialValidatorError(code, message, details = {}) {
  const error = new Error(message);
  Object.assign(error, { code, ...details });
  return error;
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function hashFile(file) {
  return sha256(fs.readFileSync(file));
}

function toPortablePath(value) {
  return String(value).replaceAll('\\', '/');
}

export function normalizeRepositoryTarget(repositoryRoot, target, pathApi = path) {
  const root = pathApi.resolve(repositoryRoot);
  const resolvedTarget = pathApi.resolve(target);
  const relative = pathApi.relative(root, resolvedTarget);
  if (!relative || relative.startsWith('..') || pathApi.isAbsolute(relative)) {
    throw officialValidatorError(
      'official_validator_unavailable',
      '官方预检目标必须位于仓库内',
      { target: toPortablePath(relative || '.') },
    );
  }
  return toPortablePath(relative);
}

function resolveRepositoryRoot(repositoryRoot) {
  const resolved = fs.realpathSync(path.resolve(repositoryRoot));
  let home = path.resolve(os.homedir());
  try {
    home = fs.realpathSync(home);
  } catch {
    // 主目录不可解析时仍用规范化路径比较，不影响后续仓库存在性检查。
  }
  if (resolved === path.parse(resolved).root || resolved === home) {
    throw officialValidatorError('official_validator_unavailable', '拒绝在根目录或用户主目录执行官方预检');
  }
  if (!fs.existsSync(path.join(resolved, 'package.json'))) {
    throw officialValidatorError('official_validator_unavailable', '官方预检目标不是有效仓库');
  }
  return resolved;
}

function assertOwnedDirectory(target, label) {
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
    throw officialValidatorError('official_validator_unavailable', `${label}不得是符号链接`);
  }
}

export function resolveOfficialValidatorPaths(repositoryRoot = defaultRepositoryRoot) {
  const root = resolveRepositoryRoot(repositoryRoot);
  const outputsRoot = path.join(root, 'outputs');
  const cacheRoot = path.join(outputsRoot, 'official-validator-cache');
  const runtimeRoot = path.join(outputsRoot, 'official-validator-runtime');
  for (const [target, label] of [
    [outputsRoot, 'outputs 目录'],
    [cacheRoot, '官方预检缓存'],
    [runtimeRoot, '官方预检临时运行时'],
  ]) {
    const relative = path.relative(root, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw officialValidatorError('official_validator_unavailable', `${label}越出仓库范围`);
    }
    assertOwnedDirectory(target, label);
  }
  return { root, outputsRoot, cacheRoot, runtimeRoot };
}

function readDependencyLock(override) {
  const lock = override || JSON.parse(fs.readFileSync(dependencyLockPath, 'utf8'));
  if (
    lock?.schemaVersion !== 1
    || typeof lock.package !== 'string'
    || typeof lock.version !== 'string'
    || !lock.archives
    || Object.keys(lock.archives).length === 0
    || Object.values(lock.archives).some((value) => !/^[a-f0-9]{64}$/u.test(value))
  ) {
    throw officialValidatorError(
      'official_validator_dependency_unavailable',
      'PyYAML 依赖锁无效',
    );
  }
  return lock;
}

function listTreeFiles(root, current = root) {
  const files = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) {
      throw officialValidatorError('official_validator_dependency_unavailable', 'PyYAML 缓存不得包含符号链接');
    }
    if (entry.isDirectory()) files.push(...listTreeFiles(root, absolute));
    else if (entry.isFile() && entry.name !== cacheManifestName) files.push(absolute);
  }
  return files;
}

function hashTree(root) {
  const hash = createHash('sha256');
  for (const file of listTreeFiles(root)) {
    const relative = toPortablePath(path.relative(root, file));
    hash.update(`${relative}\0${fs.statSync(file).size}\0${hashFile(file)}\n`);
  }
  return hash.digest('hex');
}

function executeProcess(execute, command, args, options = {}) {
  return execute(command, args, {
    ...options,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    shell: false,
  });
}

function pythonCandidates(explicitPython) {
  if (explicitPython) return [{ command: explicitPython, prefix: [], source: 'explicit' }];
  if (process.platform === 'win32') {
    return [
      { command: 'python', prefix: [], source: 'path' },
      { command: 'py', prefix: ['-3'], source: 'py-launcher' },
    ];
  }
  return [
    { command: 'python3', prefix: [], source: 'path' },
    { command: 'python', prefix: [], source: 'path' },
  ];
}

function resolvePython({ explicitPython, execute }) {
  let lastDiagnostic = '';
  for (const candidate of pythonCandidates(explicitPython)) {
    const result = executeProcess(execute, candidate.command, [
      ...candidate.prefix,
      '-I',
      '-S',
      '-B',
      '-c',
      pythonIdentityScript,
    ]);
    if (result.error || result.status !== 0) {
      lastDiagnostic = result.error?.message || String(result.stderr || '').trim();
      continue;
    }
    try {
      const identity = JSON.parse(String(result.stdout).trim());
      const key = [identity.implementation, identity.version, identity.platform, identity.machine].join('|');
      return { ...candidate, identity, key };
    } catch {
      lastDiagnostic = 'Python 身份输出不是有效 JSON';
    }
  }
  throw officialValidatorError(
    'official_validator_unavailable',
    `未找到可用 Python${lastDiagnostic ? `：${lastDiagnostic}` : ''}`,
    { validator: 'python' },
  );
}

function inspectYaml({ python, cacheRoot, execute }) {
  const result = executeProcess(execute, python.command, [
    ...python.prefix,
    '-I',
    '-S',
    '-B',
    launcherPath,
    '--inspect',
    cacheRoot,
  ]);
  if (result.error) {
    throw officialValidatorError(
      'official_validator_start_failed',
      `PyYAML 检查进程无法启动：${result.error.message}`,
      { validator: 'dependency', exitCode: null, stdout: '', stderr: String(result.stderr || '') },
    );
  }
  if (result.status !== 0) return null;
  try {
    return JSON.parse(String(result.stdout).trim());
  } catch {
    return null;
  }
}

function readValidCache({ cacheRoot, lock, python, execute }) {
  const manifestPath = path.join(cacheRoot, cacheManifestName);
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (
      manifest.schemaVersion !== 1
      || manifest.package !== lock.package
      || manifest.version !== lock.version
      || manifest.pythonKey !== python.key
      || lock.archives[manifest.archiveFilename] !== manifest.archiveSha256
      || manifest.cacheSha256 !== hashTree(cacheRoot)
    ) return null;
    const inspected = inspectYaml({ python, cacheRoot, execute });
    if (!inspected || inspected.version !== lock.version) return null;
    return { manifest, yamlVersion: inspected.version, cacheStatus: 'reused' };
  } catch (error) {
    if (error.code === 'official_validator_start_failed') throw error;
    return null;
  }
}

function defaultPrepareDependency({ stagingRoot, runRoot, lock, python, execute, environment }) {
  const downloadRoot = path.join(runRoot, 'download');
  fs.mkdirSync(downloadRoot, { recursive: true });
  const download = executeProcess(execute, python.command, [
    ...python.prefix,
    '-m',
    'pip',
    'download',
    '--disable-pip-version-check',
    '--no-cache-dir',
    '--no-input',
    '--no-deps',
    '--only-binary=:all:',
    '--dest',
    downloadRoot,
    `${lock.package}==${lock.version}`,
  ], { env: { ...environment, PIP_DISABLE_PIP_VERSION_CHECK: '1' } });
  if (download.error || download.status !== 0) {
    throw officialValidatorError(
      'official_validator_dependency_unavailable',
      '无法取得固定 PyYAML 发布包',
      {
        validator: 'dependency',
        exitCode: download.status ?? null,
        stdout: String(download.stdout || ''),
        stderr: String(download.stderr || download.error?.message || ''),
      },
    );
  }

  const archives = fs.readdirSync(downloadRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  if (archives.length !== 1) {
    throw officialValidatorError('official_validator_dependency_unavailable', 'PyYAML 下载结果数量无效');
  }
  const archiveFilename = archives[0];
  const archivePath = path.join(downloadRoot, archiveFilename);
  const archiveSha256 = hashFile(archivePath);
  if (lock.archives[archiveFilename] !== archiveSha256) {
    throw officialValidatorError(
      'official_validator_dependency_unavailable',
      'PyYAML 发布包摘要不在依赖锁中',
      { target: archiveFilename },
    );
  }

  fs.mkdirSync(stagingRoot, { recursive: true });
  const install = executeProcess(execute, python.command, [
    ...python.prefix,
    '-m',
    'pip',
    'install',
    '--disable-pip-version-check',
    '--no-cache-dir',
    '--no-input',
    '--no-deps',
    '--no-index',
    '--no-compile',
    '--target',
    stagingRoot,
    archivePath,
  ], { env: { ...environment, PIP_DISABLE_PIP_VERSION_CHECK: '1' } });
  if (install.error || install.status !== 0) {
    throw officialValidatorError(
      'official_validator_dependency_unavailable',
      '固定 PyYAML 发布包安装失败',
      {
        validator: 'dependency',
        exitCode: install.status ?? null,
        stdout: String(install.stdout || ''),
        stderr: String(install.stderr || install.error?.message || ''),
      },
    );
  }
  return { archiveFilename, archiveSha256 };
}

function ensureDependencyCache({
  cacheRoot,
  runRoot,
  lock,
  python,
  execute,
  environment,
  prepareDependency,
}) {
  const existing = readValidCache({ cacheRoot, lock, python, execute });
  if (existing) return existing;

  const stagingRoot = path.join(runRoot, 'dependency');
  let prepared;
  try {
    prepared = prepareDependency({ stagingRoot, runRoot, lock, python, execute, environment });
  } catch (error) {
    if (error.code) throw error;
    throw officialValidatorError(
      'official_validator_dependency_unavailable',
      `固定 PyYAML 依赖准备失败：${error.message}`,
      { validator: 'dependency' },
    );
  }
  if (lock.archives[prepared?.archiveFilename] !== prepared?.archiveSha256) {
    throw officialValidatorError('official_validator_dependency_unavailable', '依赖准备结果不符合 PyYAML 锁');
  }
  const inspected = inspectYaml({ python, cacheRoot: stagingRoot, execute });
  if (!inspected || inspected.version !== lock.version) {
    throw officialValidatorError('official_validator_dependency_unavailable', '准备后的 PyYAML 版本无法核验');
  }

  const manifest = {
    schemaVersion: 1,
    package: lock.package,
    version: lock.version,
    archiveFilename: prepared.archiveFilename,
    archiveSha256: prepared.archiveSha256,
    pythonKey: python.key,
    cacheSha256: hashTree(stagingRoot),
  };
  fs.writeFileSync(path.join(stagingRoot, cacheManifestName), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  assertOwnedDirectory(cacheRoot, '官方预检缓存');
  fs.rmSync(cacheRoot, { recursive: true, force: true });
  fs.renameSync(stagingRoot, cacheRoot);
  return { manifest, yamlVersion: inspected.version, cacheStatus: 'created' };
}

function codexHomes(environment) {
  return [...new Set([
    environment.CODEX_HOME ? path.resolve(environment.CODEX_HOME) : null,
    path.join(os.homedir(), '.codex'),
  ].filter(Boolean))];
}

function sourceIdentifier(file, homes, kind, explicit) {
  if (!explicit) {
    for (const home of homes) {
      const relative = path.relative(home, file);
      if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
        return `codex-home/${toPortablePath(relative)}`;
      }
    }
  }
  return `explicit/${kind}/${path.basename(file)}`;
}

function resolveValidator({ kind, explicitPath, relativePath, environment }) {
  const homes = codexHomes(environment);
  const candidates = explicitPath
    ? [path.resolve(explicitPath)]
    : homes.map((home) => path.join(home, relativePath));
  const candidate = candidates.find((file) => fs.existsSync(file) && fs.statSync(file).isFile());
  if (!candidate) {
    throw officialValidatorError(
      'official_validator_unavailable',
      `当前 Codex 环境缺少 ${kind} Creator validator`,
      { validator: kind },
    );
  }
  const file = fs.realpathSync(candidate);
  return {
    kind,
    path: file,
    sourceId: sourceIdentifier(file, homes, kind, Boolean(explicitPath)),
    sha256: hashFile(file),
  };
}

function resolveValidators({ skillValidatorPath, pluginValidatorPath, environment }) {
  return {
    skill: resolveValidator({
      kind: 'skill',
      explicitPath: skillValidatorPath,
      relativePath: path.join('skills', '.system', 'skill-creator', 'scripts', 'quick_validate.py'),
      environment,
    }),
    plugin: resolveValidator({
      kind: 'plugin',
      explicitPath: pluginValidatorPath,
      relativePath: path.join('skills', '.system', 'plugin-creator', 'scripts', 'validate_plugin.py'),
      environment,
    }),
  };
}

function discoverTargets(root) {
  const pluginRoot = path.join(root, 'plugins', 'frontend-ai-workflow');
  const skillsRoot = path.join(pluginRoot, 'skills');
  if (!fs.existsSync(skillsRoot) || !fs.statSync(skillsRoot).isDirectory()) {
    throw officialValidatorError('official_validator_unavailable', '自定义 Skill 目录不存在', { validator: 'skill' });
  }
  const skills = fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsRoot, entry.name))
    .sort((left, right) => normalizeRepositoryTarget(root, left).localeCompare(normalizeRepositoryTarget(root, right)));
  if (skills.length === 0) {
    throw officialValidatorError('official_validator_unavailable', '自定义 Skill 集合为空', { validator: 'skill' });
  }
  return { pluginRoot, skills };
}

function runValidator({ validator, target, targetId, python, cacheRoot, execute, environment }) {
  const result = executeProcess(execute, python.command, [
    ...python.prefix,
    '-I',
    '-S',
    '-B',
    launcherPath,
    '--run',
    cacheRoot,
    validator.path,
    target,
  ], { cwd: path.dirname(target), env: environment });
  if (result.error || result.status === null || result.status === undefined) {
    throw officialValidatorError(
      'official_validator_start_failed',
      `${validator.kind} Creator validator 无法启动`,
      {
        validator: validator.kind,
        target: targetId,
        exitCode: null,
        stdout: String(result.stdout || ''),
        stderr: String(result.stderr || result.error?.message || ''),
      },
    );
  }
  return {
    validator: validator.kind,
    target: targetId,
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

function failureResult(error, context = {}) {
  return {
    ok: false,
    code: error.code || 'official_validator_start_failed',
    status: error.statusName || 'failed',
    validator: error.validator || null,
    target: error.target || null,
    validatorSha256: error.validatorSha256 || null,
    pythonVersion: context.python?.identity?.version || null,
    yamlVersion: context.yamlVersion || null,
    skillCount: context.skillCount || 0,
    exitCode: error.exitCode ?? null,
    stdout: String(error.stdout || ''),
    stderr: String(error.stderr || ''),
    message: error.message,
    results: context.results || [],
  };
}

function cleanupRun(runtimeRoot, runRoot) {
  if (runRoot) fs.rmSync(runRoot, { recursive: true, force: true });
  if (fs.existsSync(runtimeRoot) && fs.readdirSync(runtimeRoot).length === 0) fs.rmdirSync(runtimeRoot);
}

function resolveRunRoot(runtimeRoot, runId) {
  const suffix = String(runId).replaceAll(/[^a-zA-Z0-9_-]/gu, '');
  const runRoot = path.join(runtimeRoot, `run-${suffix}`);
  const runtimeRelative = path.relative(runtimeRoot, runRoot);
  if (!runtimeRelative || runtimeRelative.startsWith('..') || path.isAbsolute(runtimeRelative)) {
    throw officialValidatorError('official_validator_unavailable', '官方预检运行标识无效');
  }
  return runRoot;
}

function completedPreflightResult({ context, validators, cacheStatus }) {
  const failed = context.results.find((result) => result.status === 'failed');
  if (failed) {
    const validator = validators[failed.validator];
    return failureResult(officialValidatorError(
      'official_validator_validation_failed',
      `${failed.validator} Creator validator 报告内容不符合要求`,
      { ...failed, validatorSha256: validator.sha256 },
    ), context);
  }
  return {
    ok: true,
    code: OFFICIAL_VALIDATOR_SUCCESS_CODE,
    status: 'passed',
    validator: null,
    target: null,
    validatorSha256: {
      skill: validators.skill.sha256,
      plugin: validators.plugin.sha256,
    },
    pythonVersion: context.python.identity.version,
    yamlVersion: context.yamlVersion,
    skillCount: context.skillCount,
    cacheStatus,
    validators: {
      skill: { sourceId: validators.skill.sourceId, sha256: validators.skill.sha256 },
      plugin: { sourceId: validators.plugin.sourceId, sha256: validators.plugin.sha256 },
    },
    results: context.results,
    conclusion: OFFICIAL_VALIDATOR_SUCCESS_CONCLUSION,
    boundary: '结果仅对应本次实际执行环境与脚本，不代表最新上游规则、行为质量或公共目录最终审核。',
  };
}

export function runOfficialValidatorPreflight({
  repositoryRoot = defaultRepositoryRoot,
  skillValidatorPath = null,
  pluginValidatorPath = null,
  pythonPath = null,
  environment = process.env,
  execute = spawnSync,
  dependencyLock = null,
  prepareDependency = defaultPrepareDependency,
  runId = randomUUID(),
} = {}) {
  let paths;
  let runRoot;
  let output;
  const context = { python: null, yamlVersion: null, skillCount: 0, results: [] };
  try {
    paths = resolveOfficialValidatorPaths(repositoryRoot);
    fs.mkdirSync(paths.outputsRoot, { recursive: true });
    assertOwnedDirectory(paths.runtimeRoot, '官方预检临时运行时');
    runRoot = resolveRunRoot(paths.runtimeRoot, runId);
    fs.mkdirSync(paths.runtimeRoot, { recursive: true });
    fs.mkdirSync(runRoot, { recursive: false });

    const validators = resolveValidators({ skillValidatorPath, pluginValidatorPath, environment });
    context.python = resolvePython({ explicitPython: pythonPath, execute });
    const lock = readDependencyLock(dependencyLock);
    const cache = ensureDependencyCache({
      cacheRoot: paths.cacheRoot,
      runRoot,
      lock,
      python: context.python,
      execute,
      environment,
      prepareDependency,
    });
    context.yamlVersion = cache.yamlVersion;

    const targets = discoverTargets(paths.root);
    context.skillCount = targets.skills.length;
    for (const skill of targets.skills) {
      context.results.push(runValidator({
        validator: validators.skill,
        target: skill,
        targetId: normalizeRepositoryTarget(paths.root, skill),
        python: context.python,
        cacheRoot: paths.cacheRoot,
        execute,
        environment,
      }));
    }
    context.results.push(runValidator({
      validator: validators.plugin,
      target: targets.pluginRoot,
      targetId: normalizeRepositoryTarget(paths.root, targets.pluginRoot),
      python: context.python,
      cacheRoot: paths.cacheRoot,
      execute,
      environment,
    }));

    output = completedPreflightResult({ context, validators, cacheStatus: cache.cacheStatus });
  } catch (error) {
    output = failureResult(error, context);
  } finally {
    if (paths) {
      try {
        cleanupRun(paths.runtimeRoot, runRoot);
      } catch (cleanupError) {
        if (output?.ok) {
          output = failureResult(officialValidatorError(
            'official_validator_start_failed',
            `官方预检临时运行时清理失败：${cleanupError.message}`,
            { target: 'outputs/official-validator-runtime' },
          ), context);
        } else if (output) {
          output.cleanupError = cleanupError.message;
        }
      }
    }
  }
  return output;
}

export function cleanupOfficialValidatorCache({ repositoryRoot = defaultRepositoryRoot } = {}) {
  const paths = resolveOfficialValidatorPaths(repositoryRoot);
  assertOwnedDirectory(paths.cacheRoot, '官方预检缓存');
  fs.rmSync(paths.cacheRoot, { recursive: true, force: true });
  return {
    ok: true,
    code: 'official_validator_cache_cleaned',
    status: 'cleaned',
    target: 'outputs/official-validator-cache',
  };
}

export function parseOfficialValidatorArgs(argv = []) {
  const options = {
    skillValidatorPath: null,
    pluginValidatorPath: null,
    pythonPath: null,
    cleanupCache: false,
  };
  const valueOptions = new Map([
    ['--skill-validator', 'skillValidatorPath'],
    ['--plugin-validator', 'pluginValidatorPath'],
    ['--python', 'pythonPath'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--cleanup-cache' && !options.cleanupCache) {
      options.cleanupCache = true;
      continue;
    }
    const key = valueOptions.get(option);
    const value = argv[index + 1];
    if (!key || options[key] || !value || value.startsWith('--')) {
      throw officialValidatorError('official_validator_unavailable', `不支持或缺少官方预检参数：${option}`);
    }
    options[key] = value;
    index += 1;
  }
  if (options.cleanupCache && (options.skillValidatorPath || options.pluginValidatorPath || options.pythonPath)) {
    throw officialValidatorError('official_validator_unavailable', '缓存清理不能与 validator 参数同时使用');
  }
  return options;
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  let result;
  try {
    const options = parseOfficialValidatorArgs(process.argv.slice(2));
    result = options.cleanupCache
      ? cleanupOfficialValidatorCache()
      : runOfficialValidatorPreflight(options);
  } catch (error) {
    result = failureResult(error);
  }
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
