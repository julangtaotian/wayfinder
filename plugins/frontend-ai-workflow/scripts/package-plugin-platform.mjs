import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  PLAYWRIGHT_DISTRIBUTION_SCHEMA_VERSION,
  SUPPORTED_PLAYWRIGHT_PLATFORMS,
  inspectBundledPlaywright,
  smokeTestBundledPlaywright,
  verifyPlaywrightIntegrity,
  writePlaywrightIntegrity,
} from './playwright-runtime.mjs';

const MEBIBYTE = 1024 * 1024;
const RETRYABLE_STAGE_PUBLISH_CODES = new Set(['EACCES', 'EBUSY', 'ENOTEMPTY', 'EPERM']);
export const PLATFORM_STAGE_RETRY_POLICY = Object.freeze({ maxRetries: 8, retryDelay: 250 });
export const PLATFORM_PLUGIN_SIZE_BUDGETS = Object.freeze({
  'darwin-arm64': 260 * MEBIBYTE,
  'darwin-x64': 260 * MEBIBYTE,
  'linux-x64': 330 * MEBIBYTE,
  'linux-arm64': 420 * MEBIBYTE,
  'win32-x64': 340 * MEBIBYTE,
});

export function compactPlatformStageName(label, {
  processId = process.pid,
  timestamp = Date.now(),
} = {}) {
  if (!/^[a-z]$/u.test(label)) fail(`平台暂存标签必须是单个小写字母：${label}`);
  if (!Number.isSafeInteger(processId) || processId < 0 || !Number.isSafeInteger(timestamp) || timestamp < 0) {
    fail('平台暂存标识必须是非负安全整数');
  }
  return `.${label}-${processId.toString(36)}-${timestamp.toString(36)}`;
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultPluginRoot = path.resolve(scriptDir, '..');
const defaultRepositoryRoot = path.resolve(defaultPluginRoot, '..', '..');

function fail(message) {
  throw new Error(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function waitForMilliseconds(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function publishPlatformStage({
  stageRoot,
  finalRoot,
  renamePath = fs.promises.rename,
  waitForRetry = waitForMilliseconds,
  retryPolicy = PLATFORM_STAGE_RETRY_POLICY,
}) {
  let retryCount = 0;
  while (true) {
    try {
      await renamePath(stageRoot, finalRoot);
      return;
    } catch (error) {
      if (!RETRYABLE_STAGE_PUBLISH_CODES.has(error?.code) || retryCount >= retryPolicy.maxRetries) throw error;
      retryCount += 1;
      // Windows 关闭 Chromium 后可能短暂保留目录句柄，线性退避后再发布暂存目录。
      await waitForRetry(retryPolicy.retryDelay * retryCount);
    }
  }
}

function cleanupPlatformStage({ stageRoot, originalError, removePath }) {
  try {
    removePath(stageRoot, {
      recursive: true,
      force: true,
      maxRetries: PLATFORM_STAGE_RETRY_POLICY.maxRetries,
      retryDelay: PLATFORM_STAGE_RETRY_POLICY.retryDelay,
    });
  } catch (cleanupError) {
    const wrapped = new Error(
      `${errorMessage(originalError)}；暂存目录清理失败（${cleanupError?.code || 'UNKNOWN'}）：${errorMessage(cleanupError)}`,
      { cause: originalError },
    );
    wrapped.code = 'platform_package_cleanup_failed';
    wrapped.target = stageRoot;
    wrapped.cleanupError = cleanupError;
    throw wrapped;
  }
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
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

export function validatePlatformOutputRoot({ outputRoot, repositoryRoot, pluginRoot, allowedRoots, allowExisting = false }) {
  const resolvedOutput = path.resolve(outputRoot);
  const forbidden = [path.parse(resolvedOutput).root, os.homedir(), repositoryRoot, pluginRoot]
    .map((item) => canonicalPotentialPath(item));
  const canonicalOutput = canonicalPotentialPath(resolvedOutput);
  if (forbidden.includes(canonicalOutput)) fail(`输出目录不是安全暂存范围：${resolvedOutput}`);
  const canonicalAllowedRoots = allowedRoots.map((item) => canonicalPotentialPath(item));
  if (!canonicalAllowedRoots.some((root) => isInside(root, canonicalOutput))) {
    fail(`输出目录必须位于安全暂存范围：${allowedRoots.map((item) => path.resolve(item)).join('、')}`);
  }
  if (fs.existsSync(resolvedOutput) && !allowExisting) fail(`输出目录已存在，拒绝覆盖：${resolvedOutput}`);
  return resolvedOutput;
}

function copyEntry(source, target) {
  fs.cpSync(source, target, {
    recursive: true,
    dereference: false,
    filter: (candidate) => path.basename(candidate) !== '.DS_Store',
  });
}

function copyDirectoryEntries(sourceRoot, targetRoot, excludedEntries = []) {
  const excluded = new Set(excludedEntries);
  fs.mkdirSync(targetRoot, { recursive: true });
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (entry.name === '.DS_Store' || excluded.has(entry.name)) continue;
    copyEntry(path.join(sourceRoot, entry.name), path.join(targetRoot, entry.name));
  }
}

function copyPlatformPluginSource({ sourcePluginRoot, platformRuntimeRoot, stagePluginRoot, platformKey }) {
  // 按固定目录层级复制，避免依赖不同系统下 fs.cpSync 回调路径的字符串格式。
  copyDirectoryEntries(sourcePluginRoot, stagePluginRoot, ['runtime']);

  const sourceRuntimeRoot = path.join(sourcePluginRoot, 'runtime');
  const packagedRuntimeRoot = path.join(stagePluginRoot, 'runtime');
  copyDirectoryEntries(sourceRuntimeRoot, packagedRuntimeRoot, ['playwright']);

  const sourcePlaywrightRoot = path.join(sourceRuntimeRoot, 'playwright');
  const packagedPlaywrightRoot = path.join(packagedRuntimeRoot, 'playwright');
  copyDirectoryEntries(sourcePlaywrightRoot, packagedPlaywrightRoot, [
    'distribution.json',
    'integrity',
    'platform-assets',
    'platforms',
  ]);
  copyEntry(
    path.join(platformRuntimeRoot, 'platform-assets', platformKey),
    path.join(packagedPlaywrightRoot, 'platform-assets', platformKey),
  );
  copyEntry(
    path.join(platformRuntimeRoot, 'platforms', `${platformKey}.json`),
    path.join(packagedPlaywrightRoot, 'platforms', `${platformKey}.json`),
  );
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function commandFailure(label, result) {
  if (!result?.error && result?.status === 0) return null;
  return `${label}失败：${result?.error?.message || result?.stderr?.trim() || `退出码 ${result?.status ?? '未知'}`}`;
}

function stripLinuxArm64Chromium({ sourceRuntimeRoot, packagedRuntimeRoot, execute }) {
  const metadata = readJson(path.join(packagedRuntimeRoot, 'platforms', 'linux-arm64.json'));
  const sourceExecutable = path.resolve(sourceRuntimeRoot, ...metadata.browser.executable.split('/'));
  const packagedExecutable = path.resolve(packagedRuntimeRoot, ...metadata.browser.executable.split('/'));
  const sourceHashBefore = sha256File(sourceExecutable);
  const stripBeforeBytes = fs.statSync(packagedExecutable).size;
  const stripResult = execute('strip', ['--strip-debug', packagedExecutable], { encoding: 'utf8' });
  const stripFailure = commandFailure('Linux ARM64 Chromium 去符号', stripResult);
  if (stripFailure) fail(stripFailure);
  const stripAfterBytes = fs.statSync(packagedExecutable).size;
  if (stripAfterBytes >= stripBeforeBytes) fail('Linux ARM64 Chromium 去符号后文件没有缩小');
  const readelfResult = execute('readelf', ['-S', '--wide', packagedExecutable], { encoding: 'utf8' });
  const readelfFailure = commandFailure('Linux ARM64 Chromium 调试段检查', readelfResult);
  if (readelfFailure) fail(readelfFailure);
  if (/(?:^|\s)\.debug_/mu.test(readelfResult.stdout || '')) fail('Linux ARM64 Chromium 去符号后仍包含调试段');
  if (sha256File(sourceExecutable) !== sourceHashBefore) fail('Linux ARM64 Chromium 规范源在打包过程中发生变化');
  return { stripped: true, stripBeforeBytes, stripAfterBytes, sourceHash: sourceHashBefore };
}

function writeMarketplaceRoot({ marketplaceRoot, repositoryRoot, platformKey }) {
  const repositoryManifest = readJson(path.join(repositoryRoot, 'package.json'));
  writeJson(path.join(marketplaceRoot, 'package.json'), {
    name: `frontend-ai-workflow-${platformKey}`,
    version: repositoryManifest.version,
    private: true,
    type: 'module',
  });
  writeJson(path.join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json'), {
    name: `frontend-ai-workflow-${platformKey}`,
    interface: { displayName: `Frontend AI Workflow (${platformKey})` },
    plugins: [
      {
        name: 'frontend-ai-workflow',
        source: { source: 'local', path: './plugins/frontend-ai-workflow' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: 'Productivity',
      },
    ],
  });
}

function defaultValidatePackage({ marketplaceRoot, pluginRoot, platformKey }) {
  const validator = path.join(pluginRoot, 'scripts', 'validate-structure.mjs');
  const result = spawnSync(process.execPath, [validator], {
    cwd: marketplaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      UI_REVIEW_EXPECT_PLATFORM: platformKey,
      UI_REVIEW_RUNTIME_ROOT: path.join(pluginRoot, 'runtime', 'playwright'),
    },
  });
  return {
    ok: !result.error && result.status === 0,
    reason: result.error?.message || result.stderr?.trim() || result.stdout?.trim() || null,
  };
}

export function measureLogicalSize(root) {
  let size = 0;
  const visit = (target) => {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) size += Buffer.byteLength(fs.readlinkSync(target));
    else if (stat.isFile()) size += stat.size;
    else if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(target)) visit(path.join(target, entry));
    }
  };
  visit(path.resolve(root));
  return size;
}

function splitPlatformKey(platformKey) {
  const [platform, ...archParts] = platformKey.split('-');
  return { platform, arch: archParts.join('-') };
}

export async function packagePluginPlatform({
  platformKey = process.env.UI_REVIEW_EXPECT_PLATFORM || `${process.platform}-${process.arch}`,
  outputRoot,
  write = false,
  repositoryRoot = defaultRepositoryRoot,
  pluginRoot = defaultPluginRoot,
  runtimeSourceRoot = null,
  allowedRoots,
  currentPlatform = process.platform,
  currentArch = process.arch,
  budgets = PLATFORM_PLUGIN_SIZE_BUDGETS,
  execute = spawnSync,
  validatePackage = defaultValidatePackage,
  smokeTest = smokeTestBundledPlaywright,
  renamePath = fs.promises.rename,
  removePath = fs.rmSync,
  waitForRetry = waitForMilliseconds,
} = {}) {
  if (!SUPPORTED_PLAYWRIGHT_PLATFORMS.includes(platformKey)) fail(`不支持的插件平台：${platformKey}`);
  const sourceRepositoryRoot = fs.realpathSync(path.resolve(repositoryRoot));
  const sourcePluginRoot = fs.realpathSync(path.resolve(pluginRoot));
  if (!isInside(sourceRepositoryRoot, sourcePluginRoot)) fail('插件源目录必须位于仓库范围内');
  const budgetBytes = budgets[platformKey];
  if (!Number.isSafeInteger(budgetBytes) || budgetBytes <= 0) fail(`缺少 ${platformKey} 的有效体积预算`);
  const effectiveOutput = outputRoot || path.join(sourceRepositoryRoot, 'dist', `frontend-ai-workflow-${platformKey}`);
  const effectiveAllowedRoots = allowedRoots || [path.join(sourceRepositoryRoot, 'dist'), os.tmpdir()];
  const finalRoot = validatePlatformOutputRoot({
    outputRoot: effectiveOutput,
    repositoryRoot: sourceRepositoryRoot,
    pluginRoot: sourcePluginRoot,
    allowedRoots: effectiveAllowedRoots,
  });
  const excludedPlatforms = SUPPORTED_PLAYWRIGHT_PLATFORMS.filter((key) => key !== platformKey);
  const plan = {
    ok: true,
    write,
    platformKey,
    output: finalRoot,
    budgetBytes,
    excludedPlatforms,
    nativePlatformKey: `${currentPlatform}-${currentArch}`,
    downloadsAtRuntime: false,
  };
  if (!write) return plan;
  if (plan.nativePlatformKey !== platformKey) {
    fail(`写入平台成品必须匹配当前原生平台：期望 ${plan.nativePlatformKey}，实际 ${platformKey}`);
  }

  fs.mkdirSync(path.dirname(finalRoot), { recursive: true });
  const stageRoot = path.join(path.dirname(finalRoot), compactPlatformStageName('s'));
  if (fs.existsSync(stageRoot)) fail(`平台打包暂存目录已存在：${stageRoot}`);
  const stagePluginRoot = path.join(stageRoot, 'plugins', 'frontend-ai-workflow');
  const sourceRuntimeRoot = path.join(sourcePluginRoot, 'runtime', 'playwright');
  const platformRuntimeRoot = fs.realpathSync(path.resolve(runtimeSourceRoot || sourceRuntimeRoot));
  const packagedRuntimeRoot = path.join(stagePluginRoot, 'runtime', 'playwright');
  let stripEvidence = { stripped: false, stripBeforeBytes: null, stripAfterBytes: null, sourceHash: null };
  try {
    const { platform, arch } = splitPlatformKey(platformKey);
    const sourceInspection = inspectBundledPlaywright({
      runtimeRoot: platformRuntimeRoot,
      integrityPath: path.join(platformRuntimeRoot, 'integrity'),
      platform,
      arch,
      verifyIntegrity: true,
      useCache: false,
    });
    if (!sourceInspection.available) fail(`外部平台运行时校验失败：${sourceInspection.reason}`);
    copyPlatformPluginSource({ sourcePluginRoot, platformRuntimeRoot, stagePluginRoot, platformKey });
    writeMarketplaceRoot({ marketplaceRoot: stageRoot, repositoryRoot: sourceRepositoryRoot, platformKey });
    writeJson(path.join(packagedRuntimeRoot, 'distribution.json'), {
      schemaVersion: PLAYWRIGHT_DISTRIBUTION_SCHEMA_VERSION,
      kind: 'platform',
      platformKey,
      excludedPlatforms,
      budgetBytes,
      stripped: platformKey === 'linux-arm64',
    });
    if (platformKey === 'linux-arm64') {
      stripEvidence = stripLinuxArm64Chromium({ sourceRuntimeRoot: platformRuntimeRoot, packagedRuntimeRoot, execute });
    }
    writePlaywrightIntegrity({
      runtimeRoot: packagedRuntimeRoot,
      integrityPath: path.join(packagedRuntimeRoot, 'integrity'),
      platformKeys: [platformKey],
    });
    const integrity = verifyPlaywrightIntegrity({
      runtimeRoot: packagedRuntimeRoot,
      integrityPath: path.join(packagedRuntimeRoot, 'integrity'),
      platform,
      arch,
      verifyAllPlatforms: true,
    });
    if (!integrity.ok) fail(`平台成品完整性校验失败：${integrity.errors.join('；')}`);
    const smoke = await smokeTest({
      runtimeRoot: packagedRuntimeRoot,
      integrityPath: path.join(packagedRuntimeRoot, 'integrity'),
      platform,
      arch,
      expectedPlatformKey: platformKey,
      useCache: false,
    });
    if (!smoke?.ok || smoke.skipped || smoke.platformKey !== platformKey || smoke.screenshotBytes <= 100) {
      fail(`平台成品 Chromium 冒烟失败：${JSON.stringify(smoke)}`);
    }
    const validation = await validatePackage({ marketplaceRoot: stageRoot, pluginRoot: stagePluginRoot, platformKey });
    if (!validation?.ok) fail(`平台成品结构校验失败：${validation?.reason || '未知错误'}`);
    const sizeBytes = measureLogicalSize(stagePluginRoot);
    if (sizeBytes > budgetBytes) fail(`平台成品超过预算：${sizeBytes} > ${budgetBytes}`);
    const report = {
      schemaVersion: 1,
      platformKey,
      sizeBytes,
      budgetBytes,
      headroomBytes: budgetBytes - sizeBytes,
      excludedPlatforms,
      stripped: stripEvidence.stripped,
      stripBeforeBytes: stripEvidence.stripBeforeBytes,
      stripAfterBytes: stripEvidence.stripAfterBytes,
      sourceHash: stripEvidence.sourceHash,
      smoke,
    };
    writeJson(path.join(stageRoot, 'package-report.json'), report);
    await publishPlatformStage({ stageRoot, finalRoot, renamePath, waitForRetry });
    return {
      ...plan,
      ...report,
      pluginRoot: path.join(finalRoot, 'plugins', 'frontend-ai-workflow'),
      marketplacePath: path.join(finalRoot, '.agents', 'plugins', 'marketplace.json'),
      reportPath: path.join(finalRoot, 'package-report.json'),
    };
  } catch (error) {
    cleanupPlatformStage({ stageRoot, originalError: error, removePath });
    throw error;
  }
}

function parseArgs(argv) {
  const options = { write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--write') options.write = true;
    else if (value === '--platform' || value === '--output') {
      if (!argv[index + 1]) fail(`参数 ${value} 缺少值`);
      options[value === '--platform' ? 'platformKey' : 'outputRoot'] = argv[++index];
    } else fail(`不支持的参数：${value}`);
  }
  return options;
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    console.log(JSON.stringify(await packagePluginPlatform(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(`平台插件成品生成失败：${error.message}`);
    process.exitCode = 1;
  }
}
