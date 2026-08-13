import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BUNDLED_PLAYWRIGHT_VERSION,
  DEFAULT_PLAYWRIGHT_RUNTIME_ROOT,
  PLAYWRIGHT_PLATFORM_CONFIGS,
  SUPPORTED_PLAYWRIGHT_PLATFORMS,
  inspectBundledPlaywright,
  writePlaywrightIntegrity,
} from './playwright-runtime.mjs';

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = { write: false, platformKey: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--write') options.write = true;
    else if (value === '--platform') options.platformKey = argv[++index];
    else fail(`不支持的参数：${value}`);
  }
  if (!SUPPORTED_PLAYWRIGHT_PLATFORMS.includes(options.platformKey)) {
    fail(`--platform 只能是 ${SUPPORTED_PLAYWRIGHT_PLATFORMS.join(' 或 ')}`);
  }
  return options;
}

function runtimeAsset(runtimeRoot, relativePath, label) {
  const resolved = path.resolve(runtimeRoot, relativePath);
  const relative = path.relative(runtimeRoot, resolved);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`${label}越出了 Playwright 运行时`);
  }
  return resolved;
}

function copySupplementalBrowserLicense({ runtimeRoot, platformKey, browsersPath }) {
  const sourcePlatform = PLAYWRIGHT_PLATFORM_CONFIGS[platformKey].browserLicenseSourcePlatform;
  if (!sourcePlatform) return;
  const sourceMetadata = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'platforms', `${sourcePlatform}.json`), 'utf8'));
  const targetMetadata = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'platforms', `${platformKey}.json`), 'utf8'));
  const source = runtimeAsset(runtimeRoot, sourceMetadata.browser.license, `${sourcePlatform}.browser.license`);
  if (!fs.existsSync(source)) fail(`缺少可复用的 Chromium 授权文件：${source}`);
  const relativeTarget = path.posix.relative(targetMetadata.browsersPath, targetMetadata.browser.license);
  if (!relativeTarget || relativeTarget === '..' || relativeTarget.startsWith('../')) {
    fail(`${platformKey}.browser.license 必须位于独立浏览器目录内`);
  }
  const target = path.resolve(browsersPath, ...relativeTarget.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // Linux ARM64 上游包未附带通用 Chromium 授权文本，构建期从同版本 Linux x64 包补齐。
  fs.copyFileSync(source, target);
}

export function buildPlaywrightPlatform({
  platformKey,
  write = false,
  runtimeRoot = DEFAULT_PLAYWRIGHT_RUNTIME_ROOT,
  execute = spawnSync,
} = {}) {
  if (!SUPPORTED_PLAYWRIGHT_PLATFORMS.includes(platformKey)) fail(`不支持的 Playwright 平台：${platformKey}`);
  const root = fs.realpathSync(path.resolve(runtimeRoot));
  const finalRoot = path.join(root, 'platform-assets', platformKey);
  const plan = {
    ok: true,
    write,
    platformKey,
    playwrightVersion: BUNDLED_PLAYWRIGHT_VERSION,
    hostOverride: PLAYWRIGHT_PLATFORM_CONFIGS[platformKey].hostPlatform,
    output: path.relative(root, finalRoot).split(path.sep).join('/'),
    downloadsAtRuntime: false,
  };
  if (!write) return plan;
  if (fs.existsSync(finalRoot)) fail(`平台运行包已存在，拒绝覆盖：${finalRoot}`);

  const stageRoot = path.join(root, 'platform-assets', `.build-${platformKey}-${process.pid}`);
  const browsersPath = path.join(stageRoot, '.local-browsers');
  let published = false;
  fs.mkdirSync(browsersPath, { recursive: true });
  try {
    const cliPath = path.join(root, 'node_modules', 'playwright', 'cli.js');
    const result = execute(process.execPath, [cliPath, 'install', '--only-shell', 'chromium'], {
      cwd: root,
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: browsersPath,
        PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: PLAYWRIGHT_PLATFORM_CONFIGS[platformKey].hostPlatform,
      },
      encoding: 'utf8',
      stdio: 'inherit',
    });
    if (result.error || result.status !== 0) fail(`下载 ${platformKey} Playwright 运行包失败：${result.error?.message || `退出码 ${result.status}`}`);
    copySupplementalBrowserLicense({ runtimeRoot: root, platformKey, browsersPath });
    fs.renameSync(stageRoot, finalRoot);
    published = true;
    const [platform, ...archParts] = platformKey.split('-');
    const inspection = inspectBundledPlaywright({
      runtimeRoot: root,
      platform,
      arch: archParts.join('-'),
      verifyIntegrity: false,
      useCache: false,
    });
    if (!inspection.available) fail(inspection.reason);
    writePlaywrightIntegrity({
      runtimeRoot: root,
      integrityPath: path.join(root, 'integrity'),
      platformKeys: [platformKey],
    });
    return { ...plan, inspection: { browser: inspection.browser, revision: inspection.browserRevision } };
  } catch (error) {
    fs.rmSync(stageRoot, { recursive: true, force: true });
    if (published) fs.rmSync(finalRoot, { recursive: true, force: true });
    throw error;
  }
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    console.log(JSON.stringify(buildPlaywrightPlatform(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(`Playwright 平台运行包构建失败：${error.message}`);
    process.exitCode = 1;
  }
}
