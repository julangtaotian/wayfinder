import fs from 'node:fs';
import os from 'node:os';
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

export const PLAYWRIGHT_DOWNLOAD_POLICY = Object.freeze({ maxAttempts: 3, timeoutMilliseconds: 10 * 60 * 1000 });
const PROXY_ENVIRONMENT_KEYS = Object.freeze([
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY',
  'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy',
]);

function fail(message, { code = 'playwright_platform_build_failed', target = null, details = {} } = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = 'failed';
  error.target = target;
  Object.assign(error, details);
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

export function redactPlaywrightDiagnostics(value, environment = process.env) {
  let sanitized = String(value || '');
  const sensitiveValues = PROXY_ENVIRONMENT_KEYS
    .map((key) => environment[key])
    .filter((item) => typeof item === 'string' && item.length > 0)
    .sort((left, right) => right.length - left.length);
  for (const sensitiveValue of sensitiveValues) sanitized = sanitized.split(sensitiveValue).join('[代理已脱敏]');
  return sanitized.replace(/\bhttps?:\/\/[^\s/@:]+:[^\s/@]+@/giu, 'https://[凭据已脱敏]@');
}

function installPlatformAssets({
  runtimeRoot,
  platformKey,
  browsersPath,
  execute,
  removePath,
  environment,
  downloadPolicy,
}) {
  const cliPath = path.join(runtimeRoot, 'node_modules', 'playwright', 'cli.js');
  let lastFailure = null;
  const cleanupErrors = [];
  for (let attempt = 1; attempt <= downloadPolicy.maxAttempts; attempt += 1) {
    const attemptPath = `${browsersPath}.attempt-${attempt}`;
    fs.mkdirSync(attemptPath, { recursive: true });
    const childEnvironment = {
      ...environment,
      PLAYWRIGHT_BROWSERS_PATH: attemptPath,
      PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: PLAYWRIGHT_PLATFORM_CONFIGS[platformKey].hostPlatform,
    };
    const result = execute(process.execPath, [cliPath, 'install', '--only-shell', 'chromium'], {
      cwd: runtimeRoot,
      env: childEnvironment,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: downloadPolicy.timeoutMilliseconds,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (!result?.error && result?.status === 0) {
      fs.renameSync(attemptPath, browsersPath);
      return {
        attempts: attempt,
        timeoutMilliseconds: downloadPolicy.timeoutMilliseconds,
        proxyConfigured: PROXY_ENVIRONMENT_KEYS.some((key) => Boolean(environment[key])),
      };
    }
    lastFailure = {
      attempt,
      exitCode: result?.status ?? null,
      signal: result?.signal ?? null,
      timedOut: result?.error?.code === 'ETIMEDOUT',
      stderr: redactPlaywrightDiagnostics(result?.stderr || result?.error?.message || '', environment),
    };
    try {
      removePath(attemptPath, { recursive: true, force: true });
    } catch (cleanupError) {
      cleanupErrors.push(`第 ${attempt} 次下载目录清理失败：${redactPlaywrightDiagnostics(cleanupError.message, environment)}`);
    }
  }
  const reason = lastFailure?.timedOut
    ? `单次超过 ${downloadPolicy.timeoutMilliseconds} 毫秒`
    : (lastFailure?.stderr || `退出码 ${lastFailure?.exitCode ?? '未知'}`);
  fail(`下载 ${platformKey} Playwright 运行包失败：${reason}`, {
    code: lastFailure?.timedOut ? 'playwright_platform_download_timeout' : 'playwright_platform_download_failed',
    target: platformKey,
    details: {
      attempts: downloadPolicy.maxAttempts,
      timeoutMilliseconds: downloadPolicy.timeoutMilliseconds,
      exitCode: lastFailure?.exitCode ?? null,
      signal: lastFailure?.signal ?? null,
      cleanupErrors,
      proxyConfigured: PROXY_ENVIRONMENT_KEYS.some((key) => Boolean(environment[key])),
      stderr: lastFailure?.stderr || '',
    },
  });
}

function canonicalPotentialPath(target) {
  const missing = [];
  let existing = path.resolve(target);
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  const realExisting = fs.existsSync(existing) ? fs.realpathSync(existing) : existing;
  return path.resolve(realExisting, ...missing);
}

function validateExternalRuntimeRoot(sourceRuntimeRoot, outputRuntimeRoot) {
  const source = canonicalPotentialPath(sourceRuntimeRoot);
  const output = canonicalPotentialPath(outputRuntimeRoot);
  const relative = path.relative(source, output);
  if (
    output === path.parse(output).root
    || output === canonicalPotentialPath(os.homedir())
    || output === source
    || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  ) {
    fail(`外部运行时输出不是安全独立目录：${output}`, {
      code: 'playwright_platform_output_unsafe',
      target: output,
    });
  }
  if (fs.existsSync(path.resolve(outputRuntimeRoot))) {
    fail(`外部运行时输出已存在，拒绝覆盖：${outputRuntimeRoot}`, {
      code: 'playwright_platform_output_exists',
      target: path.resolve(outputRuntimeRoot),
    });
  }
  return path.resolve(outputRuntimeRoot);
}

function copyExternalRuntimeSource({ sourceRuntimeRoot, targetRuntimeRoot }) {
  fs.cpSync(sourceRuntimeRoot, targetRuntimeRoot, {
    recursive: true,
    dereference: false,
    filter: (candidate) => {
      const relative = path.relative(sourceRuntimeRoot, candidate);
      const first = relative.split(path.sep)[0];
      return !['distribution.json', 'integrity', 'platform-assets'].includes(first);
    },
  });
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

function copySupplementalBrowserLicense({
  runtimeRoot,
  platformKey,
  browsersPath,
  execute,
  removePath,
  environment,
  downloadPolicy,
}) {
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
  if (!['playwright_lfs_pointer', 'playwright_platform_asset_missing'].includes(repositoryInspection.code)) {
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
  fs.mkdirSync(licenseStageRoot, { recursive: true });
  try {
    installPlatformAssets({
      runtimeRoot,
      platformKey: sourcePlatform,
      browsersPath: sourceBrowsersPath,
      execute,
      removePath,
      environment,
      downloadPolicy,
    });
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
  outputRuntimeRoot = null,
  execute = spawnSync,
  removePath = fs.rmSync,
  environment = process.env,
  downloadPolicy = PLAYWRIGHT_DOWNLOAD_POLICY,
} = {}) {
  if (!SUPPORTED_PLAYWRIGHT_PLATFORMS.includes(platformKey)) fail(`不支持的 Playwright 平台：${platformKey}`);
  const root = fs.realpathSync(path.resolve(runtimeRoot));
  if (outputRuntimeRoot) {
    const externalRoot = validateExternalRuntimeRoot(root, outputRuntimeRoot);
    const externalPlan = {
      ok: true,
      status: 'planned',
      code: 'playwright_platform_build_plan',
      target: platformKey,
      write,
      replaceLfsPointers: false,
      platformKey,
      playwrightVersion: BUNDLED_PLAYWRIGHT_VERSION,
      hostOverride: PLAYWRIGHT_PLATFORM_CONFIGS[platformKey].hostPlatform,
      output: externalRoot,
      assetSource: 'playwright-official-download',
      downloadsAtRuntime: false,
      downloadPolicy,
    };
    if (!write) return externalPlan;
    const externalStageRoot = `${externalRoot}.stage-${process.pid}-${Date.now()}`;
    try {
      copyExternalRuntimeSource({ sourceRuntimeRoot: root, targetRuntimeRoot: externalStageRoot });
      const result = buildPlaywrightPlatform({
        platformKey,
        write: true,
        runtimeRoot: externalStageRoot,
        execute,
        removePath,
        environment,
        downloadPolicy,
      });
      for (const metadataName of fs.readdirSync(path.join(externalStageRoot, 'platforms'))) {
        if (metadataName !== `${platformKey}.json`) fs.rmSync(path.join(externalStageRoot, 'platforms', metadataName));
      }
      writePlaywrightIntegrity({
        runtimeRoot: externalStageRoot,
        integrityPath: path.join(externalStageRoot, 'integrity'),
        platformKeys: [platformKey],
      });
      fs.renameSync(externalStageRoot, externalRoot);
      return { ...externalPlan, ...result, output: externalRoot, externalRuntime: true };
    } catch (error) {
      try {
        removePath(externalStageRoot, { recursive: true, force: true });
      } catch (cleanupError) {
        error.cleanupErrors = [
          ...(error.cleanupErrors || []),
          `外部运行时暂存清理失败：${redactPlaywrightDiagnostics(cleanupError.message, environment)}`,
        ];
      }
      throw error;
    }
  }
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
  fs.mkdirSync(stageRoot, { recursive: true });
  try {
    const download = installPlatformAssets({
      runtimeRoot: root,
      platformKey,
      browsersPath,
      execute,
      removePath,
      environment,
      downloadPolicy,
    });
    const supplementalLicense = copySupplementalBrowserLicense({
      runtimeRoot: root,
      platformKey,
      browsersPath,
      execute,
      removePath,
      environment,
      downloadPolicy,
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
      download,
      supplementalLicenseSource: supplementalLicense.source,
      inspection: { browser: inspection.browser, revision: inspection.browserRevision },
    };
  } catch (error) {
    const cleanupErrors = [];
    try {
      removePath(stageRoot, { recursive: true, force: true });
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
      attempts: error.attempts || 0,
      timeoutMilliseconds: error.timeoutMilliseconds || null,
      exitCode: error.exitCode ?? null,
      signal: error.signal || null,
      proxyConfigured: error.proxyConfigured || false,
      stderr: error.stderr || '',
      message: `Playwright 平台运行包构建失败：${error.message}`,
    }));
    process.exitCode = 1;
  }
}
