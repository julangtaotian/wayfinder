import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  BUNDLED_PLAYWRIGHT_VERSION,
  SUPPORTED_PLAYWRIGHT_PLATFORMS,
} from './playwright-runtime.mjs';
import {
  PLAYWRIGHT_DOWNLOAD_POLICY,
  buildPlaywrightPlatform,
  redactPlaywrightDiagnostics,
} from './build-playwright-platform.mjs';
import {
  PLATFORM_PLUGIN_SIZE_BUDGETS,
  compactPlatformStageName,
  packagePluginPlatform,
  publishPlatformStage,
  validatePlatformOutputRoot,
} from './package-plugin-platform.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultPluginRoot = path.resolve(scriptDir, '..');
const defaultRepositoryRoot = path.resolve(defaultPluginRoot, '..', '..');

function fail(message, { code = 'platform_marketplace_prepare_failed', target = null } = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = 'failed';
  error.target = target;
  throw error;
}

function splitPlatformKey(platformKey) {
  const [platform, ...archParts] = platformKey.split('-');
  return { platform, arch: archParts.join('-') };
}

function removeExactPath(removePath, target, cleanupErrors, environment) {
  if (!fs.existsSync(target)) return;
  try {
    removePath(target, { recursive: true, force: true });
  } catch (error) {
    cleanupErrors.push(`清理失败 ${target}：${redactPlaywrightDiagnostics(error.message, environment)}`);
  }
}

async function publishPreparedMarketplace({
  preparedRoot,
  finalRoot,
  upgrade,
  renamePath,
  removePath,
  waitForRetry,
  environment,
}) {
  const backupRoot = path.join(path.dirname(finalRoot), compactPlatformStageName('b'));
  let backupMoved = false;
  try {
    if (upgrade) {
      await renamePath(finalRoot, backupRoot);
      backupMoved = true;
    }
    await publishPlatformStage({ stageRoot: preparedRoot, finalRoot, renamePath, waitForRetry });
    if (backupMoved) removePath(backupRoot, { recursive: true, force: true });
  } catch (error) {
    const cleanupErrors = [];
    removeExactPath(removePath, finalRoot, cleanupErrors, environment);
    if (backupMoved && fs.existsSync(backupRoot)) {
      try {
        await renamePath(backupRoot, finalRoot);
      } catch (restoreError) {
        cleanupErrors.push(`旧成品恢复失败：${redactPlaywrightDiagnostics(restoreError.message, environment)}`);
      }
    }
    if (cleanupErrors.length) error.cleanupErrors = [...(error.cleanupErrors || []), ...cleanupErrors];
    throw error;
  }
}

export async function preparePlatformMarketplace({
  platformKey = `${process.platform}-${process.arch}`,
  outputRoot,
  write = false,
  upgrade = false,
  repositoryRoot = defaultRepositoryRoot,
  pluginRoot = defaultPluginRoot,
  allowedRoots,
  currentPlatform = process.platform,
  currentArch = process.arch,
  environment = process.env,
  execute,
  removePath = fs.rmSync,
  renamePath = fs.promises.rename,
  waitForRetry,
  buildPlatform = buildPlaywrightPlatform,
  packagePlatform = packagePluginPlatform,
} = {}) {
  if (!SUPPORTED_PLAYWRIGHT_PLATFORMS.includes(platformKey)) {
    fail(`不支持的平台：${platformKey}`, { code: 'platform_marketplace_platform_unsupported', target: platformKey });
  }
  const sourceRepositoryRoot = fs.realpathSync(path.resolve(repositoryRoot));
  const sourcePluginRoot = fs.realpathSync(path.resolve(pluginRoot));
  const effectiveOutput = outputRoot || path.join(sourceRepositoryRoot, 'dist', `frontend-ai-workflow-${platformKey}`);
  const effectiveAllowedRoots = allowedRoots || [
    path.join(sourceRepositoryRoot, 'dist'),
    path.join(sourceRepositoryRoot, 'outputs'),
    os.tmpdir(),
  ];
  const finalRoot = validatePlatformOutputRoot({
    outputRoot: effectiveOutput,
    repositoryRoot: sourceRepositoryRoot,
    pluginRoot: sourcePluginRoot,
    allowedRoots: effectiveAllowedRoots,
    allowExisting: upgrade,
  });
  if (upgrade && !fs.existsSync(finalRoot)) {
    fail(`升级目标不存在：${finalRoot}`, { code: 'platform_marketplace_upgrade_target_missing', target: finalRoot });
  }
  if (upgrade && (!fs.lstatSync(finalRoot).isDirectory() || fs.lstatSync(finalRoot).isSymbolicLink())) {
    fail(`升级目标不是安全目录：${finalRoot}`, { code: 'platform_marketplace_upgrade_target_unsafe', target: finalRoot });
  }
  const nativePlatformKey = `${currentPlatform}-${currentArch}`;
  const plan = {
    ok: true,
    status: 'planned',
    code: 'platform_marketplace_prepare_plan',
    write,
    upgrade,
    platformKey,
    nativePlatformKey,
    playwrightVersion: BUNDLED_PLAYWRIGHT_VERSION,
    output: finalRoot,
    budgetBytes: PLATFORM_PLUGIN_SIZE_BUDGETS[platformKey],
    downloadsAtRuntime: false,
    downloadPolicy: PLAYWRIGHT_DOWNLOAD_POLICY,
    proxyConfigured: [
      'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY',
      'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy',
    ].some((key) => Boolean(environment[key])),
    steps: ['validate-output', 'build-runtime', 'package-marketplace', 'verify-package', 'publish-atomically'],
  };
  if (!write) return plan;
  if (nativePlatformKey !== platformKey) {
    fail(`写入平台必须匹配当前原生平台：期望 ${nativePlatformKey}，实际 ${platformKey}`, {
      code: 'platform_marketplace_non_native_write',
      target: platformKey,
    });
  }

  fs.mkdirSync(path.dirname(finalRoot), { recursive: true });
  const workRoot = path.join(path.dirname(finalRoot), compactPlatformStageName('p'));
  const runtimeRoot = path.join(workRoot, 'runtime', 'playwright');
  const preparedRoot = path.join(workRoot, 'm');
  if (fs.existsSync(workRoot)) {
    fail(`准备暂存目录已存在：${workRoot}`, { code: 'platform_marketplace_stage_exists', target: workRoot });
  }
  fs.mkdirSync(workRoot, { recursive: true });
  const cleanupErrors = [];
  try {
    const build = buildPlatform({
      platformKey,
      write: true,
      runtimeRoot: path.join(sourcePluginRoot, 'runtime', 'playwright'),
      outputRuntimeRoot: runtimeRoot,
      execute,
      removePath,
      environment,
      downloadPolicy: PLAYWRIGHT_DOWNLOAD_POLICY,
    });
    const packaged = await packagePlatform({
      platformKey,
      outputRoot: preparedRoot,
      write: true,
      repositoryRoot: sourceRepositoryRoot,
      pluginRoot: sourcePluginRoot,
      runtimeSourceRoot: runtimeRoot,
      allowedRoots: [workRoot],
      currentPlatform,
      currentArch,
      execute,
      removePath,
      renamePath,
      waitForRetry,
    });
    await publishPreparedMarketplace({
      preparedRoot,
      finalRoot,
      upgrade,
      renamePath,
      removePath,
      waitForRetry,
      environment,
    });
    removeExactPath(removePath, workRoot, cleanupErrors, environment);
    return {
      ...plan,
      status: 'passed',
      code: 'platform_marketplace_prepared',
      build: {
        code: build.code,
        attempts: build.download?.attempts || 0,
        supplementalLicenseSource: build.supplementalLicenseSource || null,
      },
      sizeBytes: packaged.sizeBytes,
      headroomBytes: packaged.headroomBytes,
      pluginRoot: path.join(finalRoot, 'plugins', 'frontend-ai-workflow'),
      marketplacePath: path.join(finalRoot, '.agents', 'plugins', 'marketplace.json'),
      reportPath: path.join(finalRoot, 'package-report.json'),
      cleanupErrors,
    };
  } catch (error) {
    removeExactPath(removePath, workRoot, cleanupErrors, environment);
    if (!error.code) error.code = 'platform_marketplace_prepare_failed';
    if (!error.status) error.status = 'failed';
    if (!error.target) error.target = platformKey;
    if (cleanupErrors.length) error.cleanupErrors = [...(error.cleanupErrors || []), ...cleanupErrors];
    error.message = redactPlaywrightDiagnostics(error.message, environment);
    if (error.stderr) error.stderr = redactPlaywrightDiagnostics(error.stderr, environment);
    throw error;
  }
}

function parseArgs(argv) {
  const options = { write: false, upgrade: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--write') options.write = true;
    else if (value === '--upgrade') options.upgrade = true;
    else if (value === '--platform' || value === '--output') {
      if (!argv[index + 1]) fail(`参数 ${value} 缺少值`, { code: 'platform_marketplace_argument_missing', target: value });
      options[value === '--platform' ? 'platformKey' : 'outputRoot'] = argv[++index];
    } else fail(`不支持的参数：${value}`, { code: 'platform_marketplace_argument_unknown', target: value });
  }
  return options;
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    console.log(JSON.stringify(await preparePlatformMarketplace(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      status: error.status || 'failed',
      code: error.code || 'platform_marketplace_prepare_failed',
      target: error.target || null,
      attempts: error.attempts || 0,
      timeoutMilliseconds: error.timeoutMilliseconds || null,
      exitCode: error.exitCode ?? null,
      signal: error.signal || null,
      proxyConfigured: error.proxyConfigured || false,
      cleanupErrors: error.cleanupErrors || [],
      message: `平台 marketplace 准备失败：${error.message}`,
    }));
    process.exitCode = 1;
  }
}
