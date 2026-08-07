import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BUNDLED_PLAYWRIGHT_VERSION = '1.62.1';
export const PLAYWRIGHT_RUNTIME_SCHEMA_VERSION = 1;
export const PLAYWRIGHT_INTEGRITY_SCHEMA_VERSION = 1;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(scriptDir, '..');
export const DEFAULT_PLAYWRIGHT_RUNTIME_ROOT = path.join(pluginRoot, 'runtime', 'playwright');
export const DEFAULT_PLAYWRIGHT_INTEGRITY_PATH = path.join(pluginRoot, 'runtime', 'playwright-integrity.json');

let cachedInspection = null;
let bundledPlaywrightPromise = null;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizedRelative(root, target) {
  return path.relative(root, target).split(path.sep).join('/') || '.';
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
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

function runtimeFiles(runtimeRoot) {
  const records = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name === '.DS_Store') continue;
      const absolutePath = path.join(directory, entry.name);
      const relativePath = normalizedRelative(runtimeRoot, absolutePath);
      // Codex 插件缓存会省略 npm 的 .bin 符号链接；运行器直接加载模块，不依赖这些快捷入口。
      if (relativePath === 'node_modules/.bin') continue;
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(absolutePath);
        records.push({ type: 'link', path: relativePath, size: Buffer.byteLength(target), sha256: sha256(target) });
      } else if (stat.isDirectory()) {
        visit(absolutePath);
      } else if (stat.isFile()) {
        records.push({ type: 'file', path: relativePath, size: stat.size, sha256: sha256(fs.readFileSync(absolutePath)) });
      }
    }
  }

  visit(runtimeRoot);
  return records.sort((left, right) => left.path.localeCompare(right.path));
}

function runtimeDescriptor(runtimeRoot) {
  const packageManifest = readJson(path.join(runtimeRoot, 'package.json'));
  const metadata = readJson(path.join(runtimeRoot, 'platform.json'));
  return {
    name: packageManifest.name,
    version: packageManifest.version,
    platform: metadata.platform,
    arch: metadata.arch,
    browser: metadata.browser?.name,
    browserRevision: metadata.browser?.revision,
  };
}

export function buildPlaywrightIntegrityManifest(runtimeRoot = DEFAULT_PLAYWRIGHT_RUNTIME_ROOT) {
  const root = fs.realpathSync(path.resolve(runtimeRoot));
  return {
    schemaVersion: PLAYWRIGHT_INTEGRITY_SCHEMA_VERSION,
    algorithm: 'sha256',
    runtime: runtimeDescriptor(root),
    files: runtimeFiles(root),
  };
}

function compareIntegrityManifests(expected, actual) {
  const errors = [];
  if (expected.schemaVersion !== PLAYWRIGHT_INTEGRITY_SCHEMA_VERSION || expected.algorithm !== 'sha256') {
    errors.push('Playwright 完整性清单格式或摘要算法不受支持');
  }
  if (JSON.stringify(expected.runtime) !== JSON.stringify(actual.runtime)) {
    errors.push('Playwright 运行时版本、平台或浏览器信息与完整性清单不一致');
  }
  const expectedFiles = new Map((expected.files || []).map((record) => [record.path, record]));
  const actualFiles = new Map(actual.files.map((record) => [record.path, record]));
  for (const filePath of expectedFiles.keys()) {
    if (!actualFiles.has(filePath)) errors.push(`完整性清单包含但运行时缺少文件：${filePath}`);
  }
  for (const [filePath, actualRecord] of actualFiles) {
    const expectedRecord = expectedFiles.get(filePath);
    if (!expectedRecord) {
      errors.push(`Playwright 运行时新增未登记文件：${filePath}`);
    } else if (JSON.stringify(expectedRecord) !== JSON.stringify(actualRecord)) {
      errors.push(`Playwright 运行时文件摘要变化：${filePath}`);
    }
  }
  return errors;
}

export function verifyPlaywrightIntegrity({
  runtimeRoot = DEFAULT_PLAYWRIGHT_RUNTIME_ROOT,
  integrityPath = DEFAULT_PLAYWRIGHT_INTEGRITY_PATH,
} = {}) {
  const resolvedIntegrity = path.resolve(integrityPath);
  if (!fs.existsSync(resolvedIntegrity)) {
    return { ok: false, files: 0, errors: [`缺少 Playwright 完整性清单：${resolvedIntegrity}`] };
  }
  try {
    const expected = readJson(resolvedIntegrity);
    const actual = buildPlaywrightIntegrityManifest(runtimeRoot);
    const errors = compareIntegrityManifests(expected, actual);
    return { ok: errors.length === 0, files: actual.files.length, errors };
  } catch (error) {
    return { ok: false, files: 0, errors: [error.message] };
  }
}

export function writePlaywrightIntegrity({
  runtimeRoot = DEFAULT_PLAYWRIGHT_RUNTIME_ROOT,
  integrityPath = DEFAULT_PLAYWRIGHT_INTEGRITY_PATH,
} = {}) {
  const manifest = buildPlaywrightIntegrityManifest(runtimeRoot);
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  const resolvedIntegrity = path.resolve(integrityPath);
  fs.mkdirSync(path.dirname(resolvedIntegrity), { recursive: true });
  const temporaryPath = `${resolvedIntegrity}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, content, 'utf8');
    fs.renameSync(temporaryPath, resolvedIntegrity);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
  return { ok: true, files: manifest.files.length, integrityPath: resolvedIntegrity };
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
  if (useCache && cachedInspection && (!verifyIntegrity || cachedInspection.integrity?.ok)) return cachedInspection;
  const root = path.resolve(runtimeRoot);
  const requiredFiles = ['package.json', 'package-lock.json', 'platform.json', 'node_modules/playwright/package.json', 'node_modules/playwright/index.mjs'];
  const missing = requiredFiles.filter((relativePath) => !fs.existsSync(path.join(root, relativePath)));
  if (missing.length) return unavailable(`插件内置 Playwright 运行时文件不完整：${missing.join('、')}`);

  try {
    const runtimeManifest = readJson(path.join(root, 'package.json'));
    const playwrightManifest = readJson(path.join(root, 'node_modules', 'playwright', 'package.json'));
    const coreManifest = readJson(path.join(root, 'node_modules', 'playwright-core', 'package.json'));
    const metadata = readJson(path.join(root, 'platform.json'));
    if (metadata.schemaVersion !== PLAYWRIGHT_RUNTIME_SCHEMA_VERSION) {
      return unavailable(`Playwright 平台元数据版本不受支持：${String(metadata.schemaVersion)}`);
    }
    const versions = [runtimeManifest.version, playwrightManifest.version, coreManifest.version, metadata.playwrightVersion];
    if (versions.some((version) => version !== BUNDLED_PLAYWRIGHT_VERSION)) {
      return unavailable(`Playwright 运行时版本不一致：期望 ${BUNDLED_PLAYWRIGHT_VERSION}，实际 ${versions.join(' / ')}`);
    }

    const browserExecutable = safeRuntimeAsset(root, metadata.browser?.executable, '浏览器可执行文件');
    const browserLicense = safeRuntimeAsset(root, metadata.browser?.license, '浏览器许可文件');
    if (!fs.existsSync(browserExecutable) || !fs.statSync(browserExecutable).isFile()) {
      return unavailable(`插件内置 Chromium 不完整：${metadata.browser?.executable || '缺少路径'}`);
    }
    if (!fs.existsSync(browserLicense)) return unavailable(`插件内置 Chromium 缺少许可：${metadata.browser?.license}`);

    const integrity = verifyIntegrity
      ? verifyPlaywrightIntegrity({ runtimeRoot: root, integrityPath })
      : { ok: true, files: null, errors: [] };
    if (!integrity.ok) return unavailable(`Playwright 运行时完整性校验失败：${integrity.errors.join('；')}`, { integrity });

    const compatible = metadata.platform === platform && metadata.arch === arch;
    const inspection = {
      valid: true,
      available: compatible,
      compatible,
      source: 'bundled',
      version: playwrightManifest.version,
      platform: metadata.platform,
      arch: metadata.arch,
      currentPlatform: platform,
      currentArch: arch,
      browser: metadata.browser.name,
      browserRevision: metadata.browser.revision,
      browserExecutable,
      modulePath: path.join(root, 'node_modules', 'playwright', 'index.mjs'),
      browsersPath: path.join(root, 'node_modules', 'playwright-core', '.local-browsers'),
      integrity,
      reason: compatible
        ? null
        : `内置 Chromium 面向 ${metadata.platform}-${metadata.arch}，当前环境是 ${platform}-${arch}`,
    };
    if (useCache) cachedInspection = inspection;
    return inspection;
  } catch (error) {
    return unavailable(`无法检查插件内置 Playwright：${error.message}`);
  }
}

export async function loadBundledPlaywright(options = {}) {
  const inspection = inspectBundledPlaywright(options);
  if (!inspection.available) throw new Error(inspection.reason || '插件内置 Playwright 不可用');
  if (!bundledPlaywrightPromise) {
    // 使用绝对浏览器目录，避免 Playwright 回退到用户缓存或触发外部安装路径。
    process.env.PLAYWRIGHT_BROWSERS_PATH = inspection.browsersPath;
    bundledPlaywrightPromise = import(pathToFileURL(inspection.modulePath).href);
  }
  return bundledPlaywrightPromise;
}

export async function smokeTestBundledPlaywright() {
  const inspection = inspectBundledPlaywright();
  if (inspection.valid && !inspection.compatible) {
    return { ok: true, skipped: true, reason: inspection.reason };
  }
  const playwright = await loadBundledPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
    await page.setContent('<main data-runtime="bundled">Playwright runtime ready</main>');
    const marker = await page.locator('main').getAttribute('data-runtime');
    const screenshot = await page.screenshot({ type: 'png' });
    if (marker !== 'bundled' || screenshot.length < 100) throw new Error('Chromium 最小页面验证没有产生有效证据');
    return { ok: true, skipped: false, screenshotBytes: screenshot.length };
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
    if (mode === 'write') {
      console.log(JSON.stringify(writePlaywrightIntegrity(), null, 2));
    } else if (mode === 'check') {
      const result = verifyPlaywrightIntegrity();
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    } else if (mode === 'smoke') {
      console.log(JSON.stringify(await smokeTestBundledPlaywright(), null, 2));
    } else {
      const result = inspectBundledPlaywright();
      console.log(JSON.stringify(result, null, 2));
      if (!result.available) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Playwright 运行时检查失败：${error.message}`);
    process.exitCode = 1;
  }
}
