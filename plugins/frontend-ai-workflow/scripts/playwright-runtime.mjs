import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BUNDLED_PLAYWRIGHT_VERSION = '1.62.1';
export const PLAYWRIGHT_RUNTIME_SCHEMA_VERSION = 2;
export const PLAYWRIGHT_INTEGRITY_SCHEMA_VERSION = 2;
// Node 平台键是公共合同，Playwright 主机名只用于构建期下载。
export const PLAYWRIGHT_PLATFORM_CONFIGS = Object.freeze({
  'darwin-arm64': Object.freeze({ hostPlatform: 'mac15-arm64' }),
  'darwin-x64': Object.freeze({ hostPlatform: 'mac15' }),
  'linux-x64': Object.freeze({ hostPlatform: 'ubuntu24.04-x64' }),
  'linux-arm64': Object.freeze({
    hostPlatform: 'ubuntu24.04-arm64',
    browserLicenseSourcePlatform: 'linux-x64',
  }),
  'win32-x64': Object.freeze({ hostPlatform: 'win64' }),
});
export const SUPPORTED_PLAYWRIGHT_PLATFORMS = Object.freeze(Object.keys(PLAYWRIGHT_PLATFORM_CONFIGS));

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(scriptDir, '..');
export const DEFAULT_PLAYWRIGHT_RUNTIME_ROOT = path.join(pluginRoot, 'runtime', 'playwright');
export const DEFAULT_PLAYWRIGHT_INTEGRITY_PATH = path.join(DEFAULT_PLAYWRIGHT_RUNTIME_ROOT, 'integrity');

const cachedInspections = new Map();
let bundledPlaywrightPromise = null;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

function normalizedRelative(root, target) {
  return path.relative(root, target).split(path.sep).join('/') || '.';
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function platformKey(platform, arch) {
  return `${platform}-${arch}`;
}

function safeRuntimeAsset(runtimeRoot, relativePath, label) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) throw new Error(`${label}不能为空`);
  if (relativePath.includes('\\') || path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
    throw new Error(`${label}必须是运行时相对路径`);
  }
  const segments = relativePath.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`${label}不能包含空路径段、. 或 ..`);
  }
  const absolutePath = path.resolve(runtimeRoot, ...segments);
  const relative = path.relative(runtimeRoot, absolutePath);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label}越出了 Playwright 运行时`);
  }
  return absolutePath;
}

function fileRecord(runtimeRoot, absolutePath) {
  const stat = fs.lstatSync(absolutePath);
  const relativePath = normalizedRelative(runtimeRoot, absolutePath);
  if (stat.isSymbolicLink()) {
    const target = fs.readlinkSync(absolutePath);
    return { type: 'link', path: relativePath, size: Buffer.byteLength(target), sha256: sha256(target) };
  }
  return { type: 'file', path: relativePath, size: stat.size, sha256: sha256(fs.readFileSync(absolutePath)) };
}

function visitFiles(runtimeRoot, directory, records, { exclude = () => false } = {}) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === '.DS_Store') continue;
    const absolutePath = path.join(directory, entry.name);
    const relativePath = normalizedRelative(runtimeRoot, absolutePath);
    if (exclude(relativePath, entry)) continue;
    const stat = fs.lstatSync(absolutePath);
    if (stat.isSymbolicLink() || stat.isFile()) records.push(fileRecord(runtimeRoot, absolutePath));
    else if (stat.isDirectory()) visitFiles(runtimeRoot, absolutePath, records, { exclude });
  }
}

function sharedRuntimeFiles(runtimeRoot) {
  const records = [];
  visitFiles(runtimeRoot, runtimeRoot, records, {
    exclude: (relativePath) => (
      relativePath === 'node_modules/.bin'
      || relativePath === 'platform-assets'
      || relativePath.startsWith('platform-assets/')
      || relativePath === 'platforms'
      || relativePath.startsWith('platforms/')
      || relativePath === 'integrity'
      || relativePath.startsWith('integrity/')
    ),
  });
  return records.sort((left, right) => left.path.localeCompare(right.path));
}

function platformMetadataPath(runtimeRoot, key) {
  return path.join(runtimeRoot, 'platforms', `${key}.json`);
}

function readPlatformMetadata(runtimeRoot, key) {
  const metadataPath = platformMetadataPath(runtimeRoot, key);
  if (!fs.existsSync(metadataPath)) throw new Error(`缺少 Playwright 平台元数据：${key}`);
  const metadata = readJson(metadataPath);
  if (metadata.schemaVersion !== PLAYWRIGHT_RUNTIME_SCHEMA_VERSION || metadata.platformKey !== key) {
    throw new Error(`Playwright 平台元数据格式不受支持：${key}`);
  }
  return metadata;
}

function platformRuntimeFiles(runtimeRoot, key) {
  const metadataPath = platformMetadataPath(runtimeRoot, key);
  const metadata = readPlatformMetadata(runtimeRoot, key);
  const browsersPath = safeRuntimeAsset(runtimeRoot, metadata.browsersPath, `${key}.browsersPath`);
  if (!fs.existsSync(browsersPath) || !fs.statSync(browsersPath).isDirectory()) {
    throw new Error(`Playwright 平台运行包缺少浏览器目录：${key}`);
  }
  const records = [fileRecord(runtimeRoot, metadataPath)];
  visitFiles(runtimeRoot, browsersPath, records);
  return records.sort((left, right) => left.path.localeCompare(right.path));
}

function sharedDescriptor(runtimeRoot) {
  const runtimeManifest = readJson(path.join(runtimeRoot, 'package.json'));
  const playwrightManifest = readJson(path.join(runtimeRoot, 'node_modules', 'playwright', 'package.json'));
  const coreManifest = readJson(path.join(runtimeRoot, 'node_modules', 'playwright-core', 'package.json'));
  return {
    name: runtimeManifest.name,
    runtimeVersion: runtimeManifest.version,
    playwrightVersion: playwrightManifest.version,
    playwrightCoreVersion: coreManifest.version,
  };
}

export function buildPlaywrightIntegrityManifest(runtimeRoot = DEFAULT_PLAYWRIGHT_RUNTIME_ROOT, { platform, arch, kind } = {}) {
  const root = fs.realpathSync(path.resolve(runtimeRoot));
  if (kind === 'shared' || (!platform && !arch)) {
    return {
      schemaVersion: PLAYWRIGHT_INTEGRITY_SCHEMA_VERSION,
      kind: 'shared',
      algorithm: 'sha256',
      runtime: sharedDescriptor(root),
      files: sharedRuntimeFiles(root),
    };
  }
  const key = platformKey(platform, arch);
  const metadata = readPlatformMetadata(root, key);
  return {
    schemaVersion: PLAYWRIGHT_INTEGRITY_SCHEMA_VERSION,
    kind: 'platform',
    algorithm: 'sha256',
    runtime: {
      platformKey: key,
      platform: metadata.platform,
      arch: metadata.arch,
      playwrightVersion: metadata.playwrightVersion,
      browser: metadata.browser?.name,
      browserRevision: metadata.browser?.revision,
    },
    files: platformRuntimeFiles(root, key),
  };
}

function compareIntegrityManifests(expected, actual, label) {
  const errors = [];
  if (
    expected.schemaVersion !== PLAYWRIGHT_INTEGRITY_SCHEMA_VERSION
    || expected.algorithm !== 'sha256'
    || expected.kind !== actual.kind
  ) {
    errors.push(`${label}完整性清单格式或摘要算法不受支持`);
  }
  if (JSON.stringify(expected.runtime) !== JSON.stringify(actual.runtime)) {
    errors.push(`${label}运行时描述与完整性清单不一致`);
  }
  const expectedFiles = new Map((expected.files || []).map((record) => [record.path, record]));
  const actualFiles = new Map(actual.files.map((record) => [record.path, record]));
  for (const filePath of expectedFiles.keys()) {
    if (!actualFiles.has(filePath)) errors.push(`${label}完整性清单包含但运行时缺少文件：${filePath}`);
  }
  for (const [filePath, actualRecord] of actualFiles) {
    const expectedRecord = expectedFiles.get(filePath);
    if (!expectedRecord) errors.push(`${label}运行时新增未登记文件：${filePath}`);
    else if (JSON.stringify(expectedRecord) !== JSON.stringify(actualRecord)) errors.push(`${label}运行时文件摘要变化：${filePath}`);
  }
  return errors;
}

function verifyOneManifest(expectedPath, actual, label) {
  if (!fs.existsSync(expectedPath)) return { ok: false, files: actual.files.length, errors: [`缺少${label}完整性清单：${expectedPath}`] };
  const errors = compareIntegrityManifests(readJson(expectedPath), actual, label);
  return { ok: errors.length === 0, files: actual.files.length, errors };
}

export function verifyPlaywrightIntegrity({
  runtimeRoot = DEFAULT_PLAYWRIGHT_RUNTIME_ROOT,
  integrityPath = DEFAULT_PLAYWRIGHT_INTEGRITY_PATH,
  platform = process.platform,
  arch = process.arch,
  verifyAllPlatforms = false,
} = {}) {
  const root = path.resolve(runtimeRoot);
  const integrityRoot = path.resolve(integrityPath);
  try {
    const shared = verifyOneManifest(
      path.join(integrityRoot, 'shared.json'),
      buildPlaywrightIntegrityManifest(root, { kind: 'shared' }),
      'Playwright 共享运行时',
    );
    const keys = verifyAllPlatforms ? SUPPORTED_PLAYWRIGHT_PLATFORMS : [platformKey(platform, arch)];
    const platforms = {};
    for (const key of keys) {
      const [targetPlatform, ...archParts] = key.split('-');
      const targetArch = archParts.join('-');
      const actual = buildPlaywrightIntegrityManifest(root, { platform: targetPlatform, arch: targetArch });
      platforms[key] = verifyOneManifest(path.join(integrityRoot, `${key}.json`), actual, `Playwright ${key} 运行包`);
    }
    const errors = [...shared.errors, ...Object.values(platforms).flatMap((result) => result.errors)];
    return {
      ok: errors.length === 0,
      files: shared.files + Object.values(platforms).reduce((sum, result) => sum + result.files, 0),
      shared,
      platforms,
      errors,
    };
  } catch (error) {
    return { ok: false, files: 0, shared: null, platforms: {}, errors: [error.message] };
  }
}

export function writePlaywrightIntegrity({
  runtimeRoot = DEFAULT_PLAYWRIGHT_RUNTIME_ROOT,
  integrityPath = DEFAULT_PLAYWRIGHT_INTEGRITY_PATH,
  platformKeys = SUPPORTED_PLAYWRIGHT_PLATFORMS,
} = {}) {
  const root = path.resolve(runtimeRoot);
  const integrityRoot = path.resolve(integrityPath);
  for (const key of platformKeys) {
    if (!SUPPORTED_PLAYWRIGHT_PLATFORMS.includes(key)) throw new Error(`不支持的 Playwright 平台：${key}`);
  }
  const shared = buildPlaywrightIntegrityManifest(root, { kind: 'shared' });
  writeJsonAtomic(path.join(integrityRoot, 'shared.json'), shared);
  let files = shared.files.length;
  for (const key of platformKeys) {
    const [platform, ...archParts] = key.split('-');
    const manifest = buildPlaywrightIntegrityManifest(root, { platform, arch: archParts.join('-') });
    writeJsonAtomic(path.join(integrityRoot, `${key}.json`), manifest);
    files += manifest.files.length;
  }
  return { ok: true, files, integrityPath: integrityRoot, platforms: [...platformKeys] };
}

function unavailable(reason, details = {}) {
  return {
    valid: false,
    available: false,
    compatible: false,
    source: 'bundled',
    version: BUNDLED_PLAYWRIGHT_VERSION,
    reason,
    ...details,
  };
}

export function inspectBundledPlaywright({
  runtimeRoot = DEFAULT_PLAYWRIGHT_RUNTIME_ROOT,
  integrityPath = DEFAULT_PLAYWRIGHT_INTEGRITY_PATH,
  platform = process.platform,
  arch = process.arch,
  verifyIntegrity = true,
  useCache = runtimeRoot === DEFAULT_PLAYWRIGHT_RUNTIME_ROOT
    && integrityPath === DEFAULT_PLAYWRIGHT_INTEGRITY_PATH
    && platform === process.platform
    && arch === process.arch,
} = {}) {
  const key = platformKey(platform, arch);
  if (useCache && cachedInspections.has(key) && (!verifyIntegrity || cachedInspections.get(key).integrity?.ok)) {
    return cachedInspections.get(key);
  }
  if (!SUPPORTED_PLAYWRIGHT_PLATFORMS.includes(key)) return unavailable(`插件未携带 ${key} 的 Playwright 运行包`, { platform, arch });
  const root = path.resolve(runtimeRoot);
  const requiredFiles = ['package.json', 'package-lock.json', 'node_modules/playwright/package.json', 'node_modules/playwright/index.mjs'];
  const missing = requiredFiles.filter((relativePath) => !fs.existsSync(path.join(root, relativePath)));
  if (missing.length) return unavailable(`插件内置 Playwright 共享运行时文件不完整：${missing.join('、')}`);

  try {
    const descriptor = sharedDescriptor(root);
    const metadata = readPlatformMetadata(root, key);
    const versions = [
      descriptor.runtimeVersion,
      descriptor.playwrightVersion,
      descriptor.playwrightCoreVersion,
      metadata.playwrightVersion,
    ];
    if (versions.some((version) => version !== BUNDLED_PLAYWRIGHT_VERSION)) {
      return unavailable(`Playwright 运行时版本不一致：期望 ${BUNDLED_PLAYWRIGHT_VERSION}，实际 ${versions.join(' / ')}`);
    }
    const browserExecutable = safeRuntimeAsset(root, metadata.browser?.executable, '浏览器可执行文件');
    const browserLicense = safeRuntimeAsset(root, metadata.browser?.license, '浏览器许可文件');
    const ffmpegExecutable = safeRuntimeAsset(root, metadata.ffmpeg?.executable, 'FFmpeg 可执行文件');
    const ffmpegLicense = safeRuntimeAsset(root, metadata.ffmpeg?.license, 'FFmpeg 许可文件');
    const browsersPath = safeRuntimeAsset(root, metadata.browsersPath, '浏览器目录');
    for (const [label, filePath] of [
      ['浏览器可执行文件', browserExecutable],
      ['浏览器许可文件', browserLicense],
      ['FFmpeg 可执行文件', ffmpegExecutable],
      ['FFmpeg 许可文件', ffmpegLicense],
    ]) {
      const relative = path.relative(browsersPath, filePath);
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        return unavailable(`${key} ${label}没有位于该平台的独立浏览器目录内`);
      }
    }
    for (const [label, filePath] of [
      ['Chromium', browserExecutable],
      ['Chromium 许可', browserLicense],
      ['FFmpeg', ffmpegExecutable],
      ['FFmpeg 许可', ffmpegLicense],
    ]) {
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return unavailable(`插件内置 ${key} ${label} 不完整：${filePath}`);
    }
    const integrity = verifyIntegrity
      ? verifyPlaywrightIntegrity({ runtimeRoot: root, integrityPath, platform, arch })
      : { ok: true, files: null, errors: [] };
    if (!integrity.ok) return unavailable(`Playwright 运行时完整性校验失败：${integrity.errors.join('；')}`, { integrity });
    const inspection = {
      valid: true,
      available: true,
      compatible: true,
      source: 'bundled',
      version: descriptor.playwrightVersion,
      platform,
      arch,
      platformKey: key,
      currentPlatform: platform,
      currentArch: arch,
      browser: metadata.browser.name,
      browserRevision: metadata.browser.revision,
      browserExecutable,
      ffmpegExecutable,
      modulePath: path.join(root, 'node_modules', 'playwright', 'index.mjs'),
      browsersPath,
      integrity,
      reason: null,
    };
    if (useCache) cachedInspections.set(key, inspection);
    return inspection;
  } catch (error) {
    return unavailable(`无法检查插件内置 Playwright：${error.message}`, { platform, arch });
  }
}

export async function loadBundledPlaywright(options = {}) {
  const inspection = inspectBundledPlaywright(options);
  if (!inspection.available) throw new Error(inspection.reason || '插件内置 Playwright 不可用');
  if (!bundledPlaywrightPromise) {
    // 使用当前平台的绝对浏览器目录，禁止回退到用户缓存或运行期下载。
    process.env.PLAYWRIGHT_BROWSERS_PATH = inspection.browsersPath;
    bundledPlaywrightPromise = import(pathToFileURL(inspection.modulePath).href);
  }
  return bundledPlaywrightPromise;
}

export async function smokeTestBundledPlaywright(options = {}) {
  const inspection = inspectBundledPlaywright(options);
  if (!inspection.available) throw new Error(inspection.reason || '当前平台没有内置 Playwright 运行包');
  const expectedPlatformKey = options.expectedPlatformKey || process.env.UI_REVIEW_EXPECT_PLATFORM;
  if (expectedPlatformKey && inspection.platformKey !== expectedPlatformKey) {
    throw new Error(`Playwright 冒烟平台不匹配：期望 ${expectedPlatformKey}，实际 ${inspection.platformKey}`);
  }
  const playwright = await loadBundledPlaywright(options);
  const browser = await playwright.chromium.launch({ headless: true, executablePath: inspection.browserExecutable });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
    await page.setContent('<main data-runtime="bundled">Playwright runtime ready</main>');
    const marker = await page.locator('main').getAttribute('data-runtime');
    const screenshot = await page.screenshot({ type: 'png' });
    if (marker !== 'bundled' || screenshot.length < 100) throw new Error('Chromium 最小页面验证没有产生有效证据');
    return {
      ok: true,
      skipped: false,
      platformKey: inspection.platformKey,
      screenshotBytes: screenshot.length,
    };
  } finally {
    await browser.close();
  }
}

function parseArgs(argv) {
  const args = { mode: 'inspect' };
  for (const value of argv) {
    if (value === '--write') args.mode = 'write';
    else if (value === '--check') args.mode = 'check';
    else if (value === '--inspect') args.mode = 'inspect';
    else if (value === '--smoke') args.mode = 'smoke';
    else throw new Error(`不支持的参数：${value}`);
  }
  return args;
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const { mode } = parseArgs(process.argv.slice(2));
    if (mode === 'write') console.log(JSON.stringify(writePlaywrightIntegrity(), null, 2));
    else if (mode === 'check') {
      const result = verifyPlaywrightIntegrity({ verifyAllPlatforms: true });
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    } else if (mode === 'smoke') console.log(JSON.stringify(await smokeTestBundledPlaywright(), null, 2));
    else {
      const result = inspectBundledPlaywright();
      console.log(JSON.stringify(result, null, 2));
      if (!result.available) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Playwright 运行时检查失败：${error.message}`);
    process.exitCode = 1;
  }
}
