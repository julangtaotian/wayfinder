import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  BUNDLED_PLAYWRIGHT_VERSION,
  DEFAULT_PLAYWRIGHT_RUNTIME_ROOT,
  PLAYWRIGHT_PLATFORM_CONFIGS,
  SUPPORTED_PLAYWRIGHT_PLATFORMS,
  inspectBundledPlaywright,
  inspectPlaywrightAsset,
  writePlaywrightIntegrity,
} from './playwright-runtime.mjs';

function fail(message, { code = 'playwright_platform_build_failed', target = null } = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = 'failed';
  error.target = target;
  throw error;
}

function parseArgs(argv) {
  const options = { write: false, replaceLfsPointers: false, platformKey: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--write') options.write = true;
    else if (value === '--replace-lfs-pointers') options.replaceLfsPointers = true;
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

function installPlatformAssets({ runtimeRoot, platformKey, browsersPath, execute }) {
  const cliPath = path.join(runtimeRoot, 'node_modules', 'playwright', 'cli.js');
  const result = execute(process.execPath, [cliPath, 'install', '--only-shell', 'chromium'], {
    cwd: runtimeRoot,
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: browsersPath,
      PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: PLAYWRIGHT_PLATFORM_CONFIGS[platformKey].hostPlatform,
    },
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) {
    fail(
      `下载 ${platformKey} Playwright 运行包失败：${result.error?.message || `退出码 ${result.status}`}`,
      { code: 'playwright_platform_download_failed', target: platformKey },
    );
  }
}

function inspectReplaceableLfsTree({ runtimeRoot, platformKey, targetRoot }) {
  const targetStat = fs.lstatSync(targetRoot);
  if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
    fail(`目标平台占位路径不是安全目录：${targetRoot}`, {
      code: 'playwright_platform_replacement_unsafe',
      target: platformKey,
    });
  }
  let pointerFiles = 0;
  let emptyFiles = 0;
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      const stat = fs.lstatSync(target);
      if (stat.isDirectory()) {
        visit(target);
        continue;
      }
      if (!stat.isFile()) {
        fail(`目标平台占位目录包含不安全的非普通文件：${target}`, {
          code: 'playwright_platform_replacement_unsafe',
          target: platformKey,
        });
      }
      if (stat.size === 0) {
        emptyFiles += 1;
        continue;
      }
      const inspection = inspectPlaywrightAsset(target, { runtimeRoot });
      if (inspection.code !== 'playwright_lfs_pointer') {
        fail(`目标平台占位目录包含真实文件，拒绝覆盖：${target}`, {
          code: 'playwright_platform_replacement_unsafe',
          target: platformKey,
        });
      }
      pointerFiles += 1;
    }
  };
  visit(targetRoot);
  if (pointerFiles === 0) {
    fail(`目标平台目录没有可识别的 Git LFS 指针，拒绝替换：${targetRoot}`, {
      code: 'playwright_platform_replacement_unsafe',
      target: platformKey,
    });
  }
  return { pointerFiles, emptyFiles };
}

function copySupplementalBrowserLicense({ runtimeRoot, platformKey, browsersPath, execute }) {
  const sourcePlatform = PLAYWRIGHT_PLATFORM_CONFIGS[platformKey].browserLicenseSourcePlatform;
  if (!sourcePlatform) return { source: null };
  const sourceMetadata = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'platforms', `${sourcePlatform}.json`), 'utf8'));
  const targetMetadata = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'platforms', `${platformKey}.json`), 'utf8'));
  const relativeTarget = path.posix.relative(targetMetadata.browsersPath, targetMetadata.browser.license);
  if (!relativeTarget || relativeTarget === '..' || relativeTarget.startsWith('../')) {
    fail(`${platformKey}.browser.license 必须位于独立浏览器目录内`);
  }
  const target = path.resolve(browsersPath, ...relativeTarget.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const repositorySource = runtimeAsset(runtimeRoot, sourceMetadata.browser.license, `${sourcePlatform}.browser.license`);
  const repositoryInspection = inspectPlaywrightAsset(repositorySource, { runtimeRoot });
  if (repositoryInspection.ok) {
    if (fs.statSync(repositorySource).size === 0) {
      fail(`可复用的 Chromium 授权文件为空：${repositorySource}`, {
        code: 'playwright_platform_license_missing',
        target: platformKey,
      });
    }
    fs.copyFileSync(repositorySource, target);
    return { source: 'repository-platform-asset' };
  }
  if (repositoryInspection.code !== 'playwright_lfs_pointer') {
    fail(`缺少可复用的 Chromium 授权文件：${repositorySource}`, {
      code: 'playwright_platform_license_missing',
      target: platformKey,
    });
  }

  const licenseStageRoot = path.join(runtimeRoot, 'platform-assets', `.license-${sourcePlatform}-${process.pid}`);
  const sourceBrowsersPath = path.join(licenseStageRoot, '.local-browsers');
  if (fs.existsSync(licenseStageRoot)) {
    fail(`许可暂存目录已存在，拒绝复用：${licenseStageRoot}`, {
      code: 'playwright_platform_stage_exists',
      target: platformKey,
    });
  }
  fs.mkdirSync(sourceBrowsersPath, { recursive: true });
  try {
    installPlatformAssets({ runtimeRoot, platformKey: sourcePlatform, browsersPath: sourceBrowsersPath, execute });
    const relativeSource = path.posix.relative(sourceMetadata.browsersPath, sourceMetadata.browser.license);
    const downloadedSource = path.resolve(sourceBrowsersPath, ...relativeSource.split('/'));
    if (!inspectPlaywrightAsset(downloadedSource, { runtimeRoot }).ok || fs.statSync(downloadedSource).size === 0) {
      fail(`同版本 ${sourcePlatform} 官方包缺少 Chromium 授权文件`, {
        code: 'playwright_platform_license_missing',
        target: platformKey,
      });
    }
    // Linux ARM64 上游包未附带通用 Chromium 授权文本，仅在构建期下载同版本 x64 包补齐。
    fs.copyFileSync(downloadedSource, target);
    return { source: 'playwright-official-download' };
  } finally {
    fs.rmSync(licenseStageRoot, { recursive: true, force: true });
  }
}

export function buildPlaywrightPlatform({
  platformKey,
  write = false,
  replaceLfsPointers = false,
  runtimeRoot = DEFAULT_PLAYWRIGHT_RUNTIME_ROOT,
  execute = spawnSync,
} = {}) {
  if (!SUPPORTED_PLAYWRIGHT_PLATFORMS.includes(platformKey)) fail(`不支持的 Playwright 平台：${platformKey}`);
  const root = fs.realpathSync(path.resolve(runtimeRoot));
  const finalRoot = path.join(root, 'platform-assets', platformKey);
  const plan = {
    ok: true,
    status: 'planned',
    code: 'playwright_platform_build_plan',
    target: platformKey,
    write,
    replaceLfsPointers,
    platformKey,
    playwrightVersion: BUNDLED_PLAYWRIGHT_VERSION,
    hostOverride: PLAYWRIGHT_PLATFORM_CONFIGS[platformKey].hostPlatform,
    output: path.relative(root, finalRoot).split(path.sep).join('/'),
    assetSource: 'playwright-official-download',
    downloadsAtRuntime: false,
  };
  if (!write) return plan;

  let replacement = { pointerFiles: 0, emptyFiles: 0 };
  const targetExists = fs.existsSync(finalRoot);
  if (targetExists && !replaceLfsPointers) fail(`平台运行包已存在，拒绝覆盖：${finalRoot}`);
  if (targetExists) replacement = inspectReplaceableLfsTree({ runtimeRoot: root, platformKey, targetRoot: finalRoot });

  const stageRoot = path.join(root, 'platform-assets', `.build-${platformKey}-${process.pid}`);
  const backupRoot = path.join(root, 'platform-assets', `.backup-${platformKey}-${process.pid}`);
  const browsersPath = path.join(stageRoot, '.local-browsers');
  if (fs.existsSync(stageRoot) || fs.existsSync(backupRoot)) {
    fail(`平台构建暂存目录已存在，拒绝复用：${stageRoot}`, {
      code: 'playwright_platform_stage_exists',
      target: platformKey,
    });
  }
  fs.mkdirSync(browsersPath, { recursive: true });
  try {
    installPlatformAssets({ runtimeRoot: root, platformKey, browsersPath, execute });
    const supplementalLicense = copySupplementalBrowserLicense({
      runtimeRoot: root,
      platformKey,
      browsersPath,
      execute,
    });
    if (targetExists) {
      fs.renameSync(finalRoot, backupRoot);
    }
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
    writePlaywrightIntegrity({
      runtimeRoot: root,
      integrityPath: path.join(root, 'integrity'),
      platformKeys: [platformKey],
    });
    if (targetExists) {
      fs.rmSync(backupRoot, { recursive: true, force: true });
    }
    return {
      ...plan,
      status: 'passed',
      code: 'playwright_platform_built',
      replacedLfsPointers: replacement.pointerFiles,
      retainedEmptyPlaceholders: replacement.emptyFiles,
      supplementalLicenseSource: supplementalLicense.source,
      inspection: { browser: inspection.browser, revision: inspection.browserRevision },
    };
  } catch (error) {
    const cleanupErrors = [];
    try {
      fs.rmSync(stageRoot, { recursive: true, force: true });
    } catch (cleanupError) {
      cleanupErrors.push(`暂存目录清理失败：${cleanupError.message}`);
    }
    const backupExists = fs.existsSync(backupRoot);
    // 仅当新发布目录可以由备份或原始“目标不存在”状态判定时，才删除不完整产物。
    if (fs.existsSync(finalRoot) && (!targetExists || backupExists)) {
      try {
        fs.rmSync(finalRoot, { recursive: true, force: true });
      } catch (cleanupError) {
        cleanupErrors.push(`不完整发布物清理失败：${cleanupError.message}`);
      }
    }
    if (backupExists) {
      try {
        fs.renameSync(backupRoot, finalRoot);
      } catch (cleanupError) {
        cleanupErrors.push(`原占位目录恢复失败：${cleanupError.message}`);
      }
    }
    if (!error.code) error.code = 'playwright_platform_build_failed';
    if (!error.status) error.status = 'failed';
    if (!error.target) error.target = platformKey;
    if (cleanupErrors.length) error.cleanupErrors = cleanupErrors;
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
    console.error(JSON.stringify({
      ok: false,
      status: error.status || 'failed',
      code: error.code || 'playwright_platform_build_failed',
      target: error.target || null,
      cleanupErrors: error.cleanupErrors || [],
      message: `Playwright 平台运行包构建失败：${error.message}`,
    }));
    process.exitCode = 1;
  }
}
