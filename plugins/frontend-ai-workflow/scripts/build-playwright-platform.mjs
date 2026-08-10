import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BUNDLED_PLAYWRIGHT_VERSION,
  DEFAULT_PLAYWRIGHT_RUNTIME_ROOT,
  SUPPORTED_PLAYWRIGHT_PLATFORMS,
  inspectBundledPlaywright,
  writePlaywrightIntegrity,
} from './playwright-runtime.mjs';

const HOST_OVERRIDES = {
  'darwin-arm64': 'mac15-arm64',
  'linux-x64': 'ubuntu24.04-x64',
};

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
    hostOverride: HOST_OVERRIDES[platformKey],
    output: path.relative(root, finalRoot).split(path.sep).join('/'),
    downloadsAtRuntime: false,
  };
  if (!write) return plan;
  if (fs.existsSync(finalRoot)) fail(`平台运行包已存在，拒绝覆盖：${finalRoot}`);

  const stageRoot = path.join(root, 'platform-assets', `.build-${platformKey}-${process.pid}`);
  const browsersPath = path.join(stageRoot, '.local-browsers');
  fs.mkdirSync(browsersPath, { recursive: true });
  try {
    const cliPath = path.join(root, 'node_modules', 'playwright', 'cli.js');
    const result = execute(process.execPath, [cliPath, 'install', '--only-shell', 'chromium'], {
      cwd: root,
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: browsersPath,
        PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: HOST_OVERRIDES[platformKey],
      },
      encoding: 'utf8',
      stdio: 'inherit',
    });
    if (result.error || result.status !== 0) fail(`下载 ${platformKey} Playwright 运行包失败：${result.error?.message || `退出码 ${result.status}`}`);
    fs.renameSync(stageRoot, finalRoot);
    const [platform, ...archParts] = platformKey.split('-');
    const inspection = inspectBundledPlaywright({
      runtimeRoot: root,
      platform,
      arch: archParts.join('-'),
      verifyIntegrity: false,
      useCache: false,
    });
    if (!inspection.available) fail(inspection.reason);
    writePlaywrightIntegrity({ runtimeRoot: root });
    return { ...plan, inspection: { browser: inspection.browser, revision: inspection.browserRevision } };
  } catch (error) {
    fs.rmSync(stageRoot, { recursive: true, force: true });
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
