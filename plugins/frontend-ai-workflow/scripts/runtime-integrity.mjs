// AI-code-start lines:272 tool:Codex
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BUNDLED_OPENSPEC_VERSION } from './openspec-cli.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(scriptDir, '..');

export const DEFAULT_RUNTIME_ROOT = path.join(pluginRoot, 'runtime', 'openspec');
export const DEFAULT_INTEGRITY_PATH = path.join(pluginRoot, 'runtime', 'openspec-integrity.json');
export const RUNTIME_INTEGRITY_SCHEMA_VERSION = 1;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function normalizeLicense(manifest) {
  const value = manifest.license ?? manifest.licenses;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object') return JSON.stringify(stableValue(value));
  return 'UNKNOWN';
}

function normalizedRelative(root, target) {
  return path.relative(root, target).split(path.sep).join('/') || '.';
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function packageFiles(packageRoot) {
  const records = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name === '.DS_Store' || entry.name === 'node_modules') continue;
      const absolutePath = path.join(directory, entry.name);
      const relativePath = normalizedRelative(packageRoot, absolutePath);
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        records.push({ type: 'link', path: relativePath, digest: sha256(fs.readlinkSync(absolutePath)) });
      } else if (stat.isDirectory()) {
        visit(absolutePath);
      } else if (stat.isFile()) {
        records.push({ type: 'file', path: relativePath, digest: sha256(fs.readFileSync(absolutePath)) });
      }
    }
  }

  visit(packageRoot);
  return records.sort((left, right) => left.path.localeCompare(right.path));
}

function licenseFiles(records) {
  return records
    .map((record) => record.path)
    .filter((relativePath) => /^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/iu.test(path.posix.basename(relativePath)));
}

function packageTreeSha256(records) {
  const hash = crypto.createHash('sha256');
  for (const record of records) {
    hash.update(record.type);
    hash.update('\0');
    hash.update(record.path);
    hash.update('\0');
    hash.update(record.digest);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function discoverInstalledPackageRoots(runtimeRoot) {
  const roots = [runtimeRoot];

  function visitNodeModules(nodeModulesRoot) {
    if (!fs.existsSync(nodeModulesRoot)) return;
    const entries = fs.readdirSync(nodeModulesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== '.bin')
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (entry.name.startsWith('@')) {
        const scopeRoot = path.join(nodeModulesRoot, entry.name);
        for (const child of fs.readdirSync(scopeRoot, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
          if (!child.isDirectory()) continue;
          addPackage(path.join(scopeRoot, child.name));
        }
      } else {
        addPackage(path.join(nodeModulesRoot, entry.name));
      }
    }
  }

  function addPackage(packageRoot) {
    if (!fs.existsSync(path.join(packageRoot, 'package.json'))) return;
    roots.push(packageRoot);
    visitNodeModules(path.join(packageRoot, 'node_modules'));
  }

  visitNodeModules(path.join(runtimeRoot, 'node_modules'));
  return roots.sort((left, right) => normalizedRelative(runtimeRoot, left).localeCompare(normalizedRelative(runtimeRoot, right)));
}

function packageRecord(runtimeRoot, packageRoot) {
  const manifest = readJson(path.join(packageRoot, 'package.json'));
  const files = packageFiles(packageRoot);
  if (!manifest.name || !manifest.version) {
    throw new Error(`运行时包缺少名称或版本：${normalizedRelative(runtimeRoot, packageRoot)}`);
  }
  return {
    path: normalizedRelative(runtimeRoot, packageRoot),
    name: manifest.name,
    version: manifest.version,
    license: normalizeLicense(manifest),
    licenseFiles: licenseFiles(files),
    fileCount: files.length,
    treeSha256: packageTreeSha256(files),
  };
}

function validateRuntimeMetadata(runtimeRoot, manifest, packages) {
  if (manifest.name !== '@fission-ai/openspec') {
    throw new Error(`内置运行时包名异常：${manifest.name || '缺失'}`);
  }
  if (manifest.version !== BUNDLED_OPENSPEC_VERSION) {
    throw new Error(`内置运行时版本异常：期望 ${BUNDLED_OPENSPEC_VERSION}，实际 ${manifest.version || '缺失'}`);
  }
  const entrypoint = String(manifest.bin?.openspec || '').replace(/^\.\//u, '');
  if (!entrypoint || !fs.existsSync(path.join(runtimeRoot, entrypoint))) {
    throw new Error(`内置运行时入口不存在：${entrypoint || '缺失'}`);
  }
  const packagePaths = new Set(packages.map((item) => item.path));
  for (const dependency of Object.keys(manifest.dependencies || {}).sort()) {
    const dependencyPath = `node_modules/${dependency}`;
    if (!packagePaths.has(dependencyPath)) throw new Error(`内置运行时生产依赖缺失：${dependency}`);
  }
  return entrypoint;
}

export function buildRuntimeIntegrityManifest(runtimeRoot = DEFAULT_RUNTIME_ROOT) {
  const root = fs.realpathSync(path.resolve(runtimeRoot));
  const manifestPath = path.join(root, 'package.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`内置运行时缺少 package.json：${root}`);
  const runtimeManifest = readJson(manifestPath);
  const packages = discoverInstalledPackageRoots(root).map((packageRoot) => packageRecord(root, packageRoot));
  const entrypoint = validateRuntimeMetadata(root, runtimeManifest, packages);
  return {
    schemaVersion: RUNTIME_INTEGRITY_SCHEMA_VERSION,
    algorithm: 'sha256',
    runtime: {
      name: runtimeManifest.name,
      version: runtimeManifest.version,
      entrypoint,
    },
    packages,
  };
}

export function formatRuntimeIntegrityManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function compareManifests(expected, actual) {
  const errors = [];
  if (JSON.stringify(expected.runtime) !== JSON.stringify(actual.runtime)) {
    errors.push('运行时名称、版本或入口与完整性清单不一致');
  }
  if (expected.schemaVersion !== actual.schemaVersion || expected.algorithm !== actual.algorithm) {
    errors.push('运行时完整性清单格式或摘要算法不一致');
  }
  const expectedPackages = new Map((expected.packages || []).map((item) => [item.path, item]));
  const actualPackages = new Map((actual.packages || []).map((item) => [item.path, item]));
  for (const packagePath of expectedPackages.keys()) {
    if (!actualPackages.has(packagePath)) errors.push(`完整性清单包含但运行时缺少包：${packagePath}`);
  }
  for (const [packagePath, actualPackage] of actualPackages) {
    const expectedPackage = expectedPackages.get(packagePath);
    if (!expectedPackage) {
      errors.push(`运行时新增未登记包：${packagePath}`);
    } else if (JSON.stringify(expectedPackage) !== JSON.stringify(actualPackage)) {
      errors.push(`运行时包内容或元数据摘要变化：${packagePath}`);
    }
  }
  return errors;
}

export function verifyRuntimeIntegrity({
  runtimeRoot = DEFAULT_RUNTIME_ROOT,
  integrityPath = DEFAULT_INTEGRITY_PATH,
} = {}) {
  const resolvedIntegrityPath = path.resolve(integrityPath);
  if (!fs.existsSync(resolvedIntegrityPath)) {
    return { ok: false, packages: 0, errors: [`缺少运行时完整性清单：${resolvedIntegrityPath}`] };
  }
  try {
    const expected = readJson(resolvedIntegrityPath);
    const actual = buildRuntimeIntegrityManifest(runtimeRoot);
    const errors = compareManifests(expected, actual);
    return { ok: errors.length === 0, packages: actual.packages.length, errors };
  } catch (error) {
    return { ok: false, packages: 0, errors: [error.message] };
  }
}

export function writeRuntimeIntegrity({
  runtimeRoot = DEFAULT_RUNTIME_ROOT,
  integrityPath = DEFAULT_INTEGRITY_PATH,
} = {}) {
  const resolvedIntegrityPath = path.resolve(integrityPath);
  const content = formatRuntimeIntegrityManifest(buildRuntimeIntegrityManifest(runtimeRoot));
  fs.mkdirSync(path.dirname(resolvedIntegrityPath), { recursive: true });
  const temporaryPath = `${resolvedIntegrityPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, content, 'utf8');
    fs.renameSync(temporaryPath, resolvedIntegrityPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
  return { ok: true, packages: JSON.parse(content).packages.length, integrityPath: resolvedIntegrityPath };
}

function parseArgs(argv) {
  const args = { write: false, runtimeRoot: DEFAULT_RUNTIME_ROOT, integrityPath: DEFAULT_INTEGRITY_PATH };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--write') {
      args.write = true;
    } else if (value === '--check') {
      args.write = false;
    } else if (value === '--runtime') {
      args.runtimeRoot = argv[index + 1];
      index += 1;
    } else if (value === '--manifest') {
      args.integrityPath = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`不支持的参数：${value}`);
    }
  }
  return args;
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = args.write ? writeRuntimeIntegrity(args) : verifyRuntimeIntegrity(args);
    if (result.ok) {
      console.log(`OpenSpec 运行时完整性${args.write ? '清单已更新' : '校验通过'}：${result.packages} 个包。`);
    } else {
      console.error(result.errors.map((error) => `- ${error}`).join('\n'));
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
