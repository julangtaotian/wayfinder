import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  BUNDLED_PLAYWRIGHT_VERSION,
  PLAYWRIGHT_PLATFORM_CONFIGS,
  SUPPORTED_PLAYWRIGHT_PLATFORMS,
  buildPlaywrightIntegrityManifest,
  inspectBundledPlaywright,
  inspectPlaywrightAsset,
  normalizePlaywrightPlatformPath,
  resolvePlaywrightIntegrityScope,
  resolvePlaywrightValidationTarget,
  verifyConfiguredPlaywrightIntegrity,
  verifyPlaywrightIntegrity,
  verifyPlaywrightSharedIntegrity,
  writePlaywrightIntegrity,
} from '../plugins/frontend-ai-workflow/scripts/playwright-runtime.mjs';
import { buildPlaywrightPlatform, copyExternalRuntimeSource } from '../plugins/frontend-ai-workflow/scripts/build-playwright-platform.mjs';
import {
  PACKAGE_PRUNING_POLICY_VERSION,
  PLATFORM_PLUGIN_SIZE_BUDGETS,
  PLATFORM_STAGE_RETRY_POLICY,
  compactPlatformStageName,
  packagePluginPlatform,
} from '../plugins/frontend-ai-workflow/scripts/package-plugin-platform.mjs';
import { preparePlatformMarketplace } from '../plugins/frontend-ai-workflow/scripts/prepare-platform-marketplace.mjs';
import {
  EXPECTED_PLATFORMS,
  createPluginFixture,
  createRuntimeFixture,
  packagePluginScript,
  packagingOptions,
  platformMetadata,
  playwrightRuntimeScript,
  populateRuntimeFixture,
  preparePlatformMarketplaceScript,
  writeDownloadedFixture,
} from './helpers/platform-runtime-fixtures.mjs';

test('平台插件成品预览保持零写入并公开带余量预算', async (context) => {
  const options = packagingOptions(context);
  const result = await packagePluginPlatform(options);
  assert.equal(result.write, false);
  assert.equal(result.platformKey, 'darwin-arm64');
  assert.equal(result.budgetBytes, PLATFORM_PLUGIN_SIZE_BUDGETS['darwin-arm64']);
  assert.deepEqual(result.excludedPlatforms.sort(), EXPECTED_PLATFORMS.filter((key) => key !== 'darwin-arm64'));
  assert.equal(fs.existsSync(options.outputRoot), false);
});
test('平台插件 CLI 缺省参数继承矩阵平台且保持预览零写入', (context) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-platform-cli-'));
  context.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const outputRoot = path.join(temporaryRoot, 'preview-output');
  const result = spawnSync(process.execPath, [packagePluginScript, '--output', outputRoot], {
    encoding: 'utf8',
    env: { ...process.env, UI_REVIEW_EXPECT_PLATFORM: 'darwin-arm64' },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.platformKey, 'darwin-arm64');
  assert.equal(plan.write, false);
  assert.equal(fs.existsSync(outputRoot), false);
});
test('平台插件成品只保留匹配资产并重建完整性', async (context) => {
  const options = packagingOptions(context);
  const result = await packagePluginPlatform({ ...options, write: true });
  const packagedPluginRoot = path.join(options.outputRoot, 'plugins', 'frontend-ai-workflow');
  const packagedRuntimeRoot = path.join(packagedPluginRoot, 'runtime', 'playwright');
  assert.equal(result.write, true);
  assert.equal(result.sizeBytes > 0, true);
  assert.equal(result.headroomBytes, result.budgetBytes - result.sizeBytes);
  assert.equal(fs.existsSync(path.join(options.outputRoot, 'package-report.json')), true);
  assert.equal(fs.existsSync(path.join(packagedPluginRoot, 'skills', 'fixture', 'SKILL.md')), true);
  assert.equal(fs.existsSync(path.join(packagedRuntimeRoot, 'platform-assets', 'darwin-arm64')), true);
  assert.deepEqual(fs.readdirSync(path.join(packagedRuntimeRoot, 'platform-assets')), ['darwin-arm64']);
  assert.deepEqual(fs.readdirSync(path.join(packagedRuntimeRoot, 'platforms')), ['darwin-arm64.json']);
  assert.deepEqual(fs.readdirSync(path.join(packagedRuntimeRoot, 'integrity')).sort(), ['darwin-arm64.json', 'shared.json']);
  const distribution = JSON.parse(fs.readFileSync(path.join(packagedRuntimeRoot, 'distribution.json'), 'utf8'));
  assert.equal(distribution.kind, 'platform');
  assert.equal(distribution.platformKey, 'darwin-arm64');
  assert.equal(distribution.budgetBytes, PLATFORM_PLUGIN_SIZE_BUDGETS['darwin-arm64']);
  const integrity = verifyPlaywrightIntegrity({
    runtimeRoot: packagedRuntimeRoot,
    integrityPath: path.join(packagedRuntimeRoot, 'integrity'),
    verifyAllPlatforms: true,
  });
  assert.equal(integrity.ok, true, integrity.errors.join('\n'));
  const marketplace = JSON.parse(fs.readFileSync(path.join(options.outputRoot, '.agents', 'plugins', 'marketplace.json'), 'utf8'));
  assert.equal(marketplace.plugins[0].source.path, './plugins/frontend-ai-workflow');
  await assert.rejects(() => packagePluginPlatform({ ...options, write: true }), /拒绝覆盖/u);
});
test('[TC-10] 平台成品白名单裁剪与包体报告可复算', async (context) => {
  const options = packagingOptions(context);
  const packageRoot = path.join(options.runtimeRoot, 'node_modules', 'playwright');
  const sourceFiles = {
    declaration: path.join(packageRoot, 'types.d.ts'),
    sourceMap: path.join(packageRoot, 'index.js.map'),
    readme: path.join(packageRoot, 'README.md'),
    license: path.join(packageRoot, 'LICENSE'),
    notice: path.join(packageRoot, 'NOTICE.txt'),
    runtime: path.join(packageRoot, 'runtime.js'),
  };
  for (const [name, target] of Object.entries(sourceFiles)) {
    fs.writeFileSync(target, `${name} fixture\n`);
  }
  writePlaywrightIntegrity({
    runtimeRoot: options.runtimeRoot,
    integrityPath: path.join(options.runtimeRoot, 'integrity'),
    platformKeys: EXPECTED_PLATFORMS,
  });
  const sourceBefore = Object.fromEntries(Object.entries(sourceFiles).map(([name, target]) => [name, fs.readFileSync(target)]));
  const result = await packagePluginPlatform({ ...options, write: true });
  const packagedRoot = path.join(result.pluginRoot, 'runtime', 'playwright', 'node_modules', 'playwright');
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.pruning.policyVersion, PACKAGE_PRUNING_POLICY_VERSION);
  assert.equal(result.pruning.removedFiles, 3);
  assert.equal(result.pruning.removedBytes, ['declaration', 'sourceMap', 'readme']
    .reduce((sum, name) => sum + sourceBefore[name].byteLength, 0));
  assert.equal(result.unprunedSizeBytes, result.sizeBytes + result.pruning.removedBytes);
  assert.equal(Object.values(result.composition).reduce((sum, bytes) => sum + bytes, 0), result.sizeBytes);
  assert.equal(result.headroomRatio, Number((result.headroomBytes / result.budgetBytes).toFixed(6)));
  assert.equal(['healthy', 'watch', 'critical'].includes(result.health), true);
  for (const name of ['declaration', 'sourceMap', 'readme']) {
    assert.equal(fs.existsSync(path.join(packagedRoot, path.basename(sourceFiles[name]))), false);
  }
  for (const name of ['license', 'notice', 'runtime']) {
    assert.deepEqual(fs.readFileSync(path.join(packagedRoot, path.basename(sourceFiles[name]))), sourceBefore[name]);
  }
  for (const [name, target] of Object.entries(sourceFiles)) assert.deepEqual(fs.readFileSync(target), sourceBefore[name], name);
});
test('平台插件成品拒绝危险路径和非原生写入', async (context) => {
  const options = packagingOptions(context);
  await assert.rejects(
    () => packagePluginPlatform({ ...options, outputRoot: options.repositoryRoot }),
    /安全暂存范围/u,
  );
  await assert.rejects(
    () => packagePluginPlatform({ ...options, platformKey: 'linux-x64', write: true }),
    /当前原生平台/u,
  );
  assert.equal(fs.existsSync(options.outputRoot), false);
});
test('平台插件成品超预算或校验失败时清理半成品', async (context) => {
  const options = packagingOptions(context);
  const budgets = { ...PLATFORM_PLUGIN_SIZE_BUDGETS, 'darwin-arm64': 1 };
  await assert.rejects(
    () => packagePluginPlatform({ ...options, write: true, budgets }),
    /超过预算/u,
  );
  assert.equal(fs.existsSync(options.outputRoot), false);
  assert.equal(fs.existsSync(options.distRoot) ? fs.readdirSync(options.distRoot).some((name) => name.startsWith('.s-')) : false, false);
  await assert.rejects(
    () => packagePluginPlatform({
      ...options,
      write: true,
      validatePackage: async () => ({ ok: false, reason: 'fixture invalid' }),
    }),
    /结构校验失败/u,
  );
  assert.equal(fs.existsSync(options.outputRoot), false);
});
test('平台插件发布遇到 Windows 瞬时目录占用后按线性退避重试', async (context) => {
  const options = packagingOptions(context);
  const retryDelays = [];
  let renameAttempts = 0;
  const renamePath = async (source, target) => {
    renameAttempts += 1;
    if (renameAttempts <= 2) {
      const error = new Error('Windows 目录句柄尚未释放');
      error.code = renameAttempts === 1 ? 'EPERM' : 'EBUSY';
      throw error;
    }
    fs.renameSync(source, target);
  };
  const result = await packagePluginPlatform({
    ...options,
    write: true,
    renamePath,
    waitForRetry: async (milliseconds) => retryDelays.push(milliseconds),
  });
  assert.equal(result.write, true);
  assert.equal(renameAttempts, 3);
  assert.deepEqual(retryDelays, [250, 500]);
  assert.equal(fs.existsSync(options.outputRoot), true);
});
test('平台插件清理重试耗尽时保留原始打包错误和清理定位', async (context) => {
  const options = packagingOptions(context);
  const cleanupError = new Error('directory not empty');
  cleanupError.code = 'ENOTEMPTY';
  let cleanupTarget;
  let cleanupOptions;
  await assert.rejects(
    () => packagePluginPlatform({
      ...options,
      write: true,
      validatePackage: async () => ({ ok: false, reason: 'fixture invalid' }),
      removePath: (target, receivedOptions) => {
        cleanupTarget = target;
        cleanupOptions = receivedOptions;
        throw cleanupError;
      },
    }),
    (error) => {
      assert.equal(error.code, 'platform_package_cleanup_failed');
      assert.match(error.message, /平台成品结构校验失败：fixture invalid；暂存目录清理失败（ENOTEMPTY）/u);
      assert.equal(error.cause?.message, '平台成品结构校验失败：fixture invalid');
      assert.equal(error.cleanupError, cleanupError);
      assert.equal(error.target, cleanupTarget);
      assert.match(path.basename(error.target), /^\.s-[0-9a-z]+-[0-9a-z]+$/u);
      return true;
    },
  );
  assert.deepEqual(cleanupOptions, {
    recursive: true,
    force: true,
    maxRetries: PLATFORM_STAGE_RETRY_POLICY.maxRetries,
    retryDelay: PLATFORM_STAGE_RETRY_POLICY.retryDelay,
  });
  assert.equal(fs.existsSync(options.outputRoot), false);
});
test('Linux ARM64 只对暂存 Chromium 去除调试符号', async (context) => {
  const options = packagingOptions(context, 'linux-arm64');
  const metadata = platformMetadata('linux', 'arm64');
  const sourceExecutable = path.join(options.runtimeRoot, metadata.browser.executable);
  fs.writeFileSync(sourceExecutable, Buffer.alloc(8192, 7));
  writePlaywrightIntegrity({
    runtimeRoot: options.runtimeRoot,
    integrityPath: path.join(options.runtimeRoot, 'integrity'),
    platformKeys: EXPECTED_PLATFORMS,
  });
  const sourceBefore = fs.readFileSync(sourceExecutable);
  const execute = (command, args) => {
    if (command === 'strip') {
      const executable = args.at(-1);
      fs.writeFileSync(executable, fs.readFileSync(executable).subarray(0, 4096));
      return { status: 0, stdout: '', stderr: '' };
    }
    if (command === 'readelf') return { status: 0, stdout: 'There are no debug sections.\n', stderr: '' };
    return { status: 1, stdout: '', stderr: `unexpected command: ${command}` };
  };
  const result = await packagePluginPlatform({ ...options, write: true, execute });
  const packagedExecutable = path.join(
    options.outputRoot,
    'plugins',
    'frontend-ai-workflow',
    'runtime',
    'playwright',
    metadata.browser.executable,
  );
  assert.equal(result.stripped, true);
  assert.equal(result.stripBeforeBytes, 8192);
  assert.equal(result.stripAfterBytes, 4096);
  assert.deepEqual(fs.readFileSync(sourceExecutable), sourceBefore);
  assert.equal(fs.statSync(packagedExecutable).size, 4096);
});
test('[TC-01] 平台准备预览与安全写入边界', async (context) => {
  const options = packagingOptions(context);
  const previewRoot = path.join(options.distRoot, 'prepared-preview');
  const preview = await preparePlatformMarketplace({ ...options, outputRoot: previewRoot, write: false });
  assert.equal(preview.status, 'planned');
  assert.equal(preview.code, 'platform_marketplace_prepare_plan');
  assert.equal(preview.platformKey, 'darwin-arm64');
  assert.equal(preview.playwrightVersion, BUNDLED_PLAYWRIGHT_VERSION);
  assert.equal(preview.downloadsAtRuntime, false);
  assert.deepEqual(preview.steps, [
    'validate-output',
    'build-runtime',
    'package-marketplace',
    'verify-package',
    'publish-atomically',
  ]);
  assert.equal(fs.existsSync(previewRoot), false);
  await assert.rejects(
    () => preparePlatformMarketplace({ ...options, outputRoot: options.repositoryRoot }),
    /安全暂存范围/u,
  );
  await assert.rejects(
    () => preparePlatformMarketplace({
      ...options,
      platformKey: 'linux-x64',
      outputRoot: path.join(options.distRoot, 'non-native'),
      write: true,
    }),
    (error) => error.code === 'platform_marketplace_non_native_write'
      && error.status === 'failed'
      && error.target === 'linux-x64',
  );
  assert.equal(fs.existsSync(path.join(options.distRoot, 'non-native')), false);
});
test('[TC-02] 平台下载重试超时与代理脱敏', (context) => {
  const runtimeRoot = createRuntimeFixture(context);
  const outputRoot = path.join(path.dirname(runtimeRoot), `${path.basename(runtimeRoot)}-external`);
  context.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }));
  const proxy = 'http://fixture-user:fixture-password@proxy.invalid:8080';
  const environment = { ...process.env, HTTPS_PROXY: proxy };
  let attempts = 0;
  const execute = (_command, _args, options) => {
    attempts += 1;
    assert.equal(options.timeout, 600000);
    assert.equal(options.env.HTTPS_PROXY, proxy);
    if (attempts < 3) return { status: 17, signal: null, stderr: `download via ${proxy} failed` };
    writeDownloadedFixture(runtimeRoot, 'darwin-arm64', options.env.PLAYWRIGHT_BROWSERS_PATH);
    return { status: 0, signal: null, stdout: `download via ${proxy}` };
  };
  const result = buildPlaywrightPlatform({
    platformKey: 'darwin-arm64',
    write: true,
    runtimeRoot,
    outputRuntimeRoot: outputRoot,
    execute,
    environment,
  });
  assert.equal(attempts, 3);
  assert.equal(result.download.attempts, 3);
  assert.equal(result.download.timeoutMilliseconds, 600000);
  assert.equal(result.download.proxyConfigured, true);
  assert.equal(JSON.stringify(result).includes(proxy), false);
  assert.deepEqual(
    fs.readdirSync(path.dirname(outputRoot)).filter((name) => name.startsWith(`${path.basename(outputRoot)}.stage-`)),
    [],
  );
  const failedOutput = `${outputRoot}-failed`;
  context.after(() => fs.rmSync(failedOutput, { recursive: true, force: true }));
  assert.throws(
    () => buildPlaywrightPlatform({
      platformKey: 'darwin-arm64',
      write: true,
      runtimeRoot,
      outputRuntimeRoot: failedOutput,
      execute: () => ({ status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT', message: proxy }, stderr: proxy }),
      environment,
    }),
    (error) => {
      assert.equal(error.code, 'playwright_platform_download_timeout');
      assert.equal(error.attempts, 3);
      assert.equal(error.timeoutMilliseconds, 600000);
      assert.equal(error.signal, 'SIGTERM');
      assert.equal(error.proxyConfigured, true);
      assert.equal(`${error.message}\n${error.stderr}`.includes(proxy), false);
      return true;
    },
  );
  assert.equal(fs.existsSync(failedOutput), false);
});
test('[TC-03] 源码外唯一平台 marketplace 成品', async (context) => {
  const options = packagingOptions(context);
  const externalRuntimeRoot = path.join(options.distRoot, 'external-runtime');
  const sourceExecutable = path.join(options.runtimeRoot, platformMetadata('darwin', 'arm64').browser.executable);
  const sourceBefore = fs.readFileSync(sourceExecutable);
  const execute = (_command, _args, executeOptions) => {
    writeDownloadedFixture(options.runtimeRoot, 'darwin-arm64', executeOptions.env.PLAYWRIGHT_BROWSERS_PATH);
    return { status: 0, stdout: '', stderr: '' };
  };
  const build = buildPlaywrightPlatform({
    platformKey: 'darwin-arm64',
    write: true,
    runtimeRoot: options.runtimeRoot,
    outputRuntimeRoot: externalRuntimeRoot,
    execute,
  });
  assert.equal(build.externalRuntime, true);
  assert.deepEqual(fs.readFileSync(sourceExecutable), sourceBefore);
  assert.deepEqual(fs.readdirSync(path.join(externalRuntimeRoot, 'platforms')), ['darwin-arm64.json']);
  const result = await packagePluginPlatform({ ...options, write: true, runtimeSourceRoot: externalRuntimeRoot });
  const packagedRuntimeRoot = path.join(result.pluginRoot, 'runtime', 'playwright');
  assert.deepEqual(fs.readdirSync(path.join(packagedRuntimeRoot, 'platform-assets')), ['darwin-arm64']);
  assert.deepEqual(fs.readdirSync(path.join(packagedRuntimeRoot, 'platforms')), ['darwin-arm64.json']);
  assert.deepEqual(fs.readdirSync(path.join(packagedRuntimeRoot, 'integrity')).sort(), ['darwin-arm64.json', 'shared.json']);
  assert.equal(verifyPlaywrightIntegrity({
    runtimeRoot: packagedRuntimeRoot,
    integrityPath: path.join(packagedRuntimeRoot, 'integrity'),
    verifyAllPlatforms: true,
  }).ok, true);
  const offlineRoot = path.join(options.distRoot, 'offline-copy');
  fs.cpSync(options.outputRoot, offlineRoot, { recursive: true });
  const offlineRuntimeRoot = path.join(offlineRoot, 'plugins', 'frontend-ai-workflow', 'runtime', 'playwright');
  assert.equal(verifyPlaywrightIntegrity({
    runtimeRoot: offlineRuntimeRoot,
    integrityPath: path.join(offlineRuntimeRoot, 'integrity'),
    verifyAllPlatforms: true,
  }).ok, true);
});
test('[TC-06] Windows 外部运行时复制排除源码平台资产', (context) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-external-copy-'));
  context.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const sourceRuntimeRoot = path.join(fixtureRoot, 'source-runtime'), targetRuntimeRoot = path.join(fixtureRoot, 'target-runtime');
  for (const relativePath of ['node_modules/playwright/package.json', 'platform-assets/win32-x64/sentinel.txt', 'integrity/shared.json', 'distribution.json']) {
    const target = path.join(sourceRuntimeRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '{}\n');
  }
  copyExternalRuntimeSource({ sourceRuntimeRoot, targetRuntimeRoot });
  assert.equal(fs.existsSync(path.join(targetRuntimeRoot, 'node_modules', 'playwright', 'package.json')), true);
  for (const excluded of ['platform-assets', 'integrity', 'distribution.json']) assert.equal(fs.existsSync(path.join(targetRuntimeRoot, excluded)), false);
  const windowsOutputRoot = 'D:\\a\\wayfinder\\wayfinder\\dist\\frontend-ai-workflow-win32-x64';
  const windowsStageExecutable = path.win32.join(path.win32.dirname(windowsOutputRoot),
    compactPlatformStageName('p', { processId: 5092, timestamp: 1788137687493 }), compactPlatformStageName('s', { processId: 5092, timestamp: 1788137696439 }),
    'plugins', 'frontend-ai-workflow', 'runtime', 'playwright', ...platformMetadata('win32', 'x64').browser.executable.split('/'));
  assert.ok(windowsStageExecutable.length < 260, `Windows 暂存启动路径过长：${windowsStageExecutable.length}`);
});
test('[TC-04] 平台 marketplace 原子升级与旧包保留', async (context) => {
  const options = packagingOptions(context);
  fs.mkdirSync(options.outputRoot, { recursive: true });
  fs.writeFileSync(path.join(options.outputRoot, 'version.txt'), 'old\n');
  const buildPlatform = ({ outputRuntimeRoot }) => {
    fs.mkdirSync(outputRuntimeRoot, { recursive: true });
    return { code: 'playwright_platform_built', download: { attempts: 1 } };
  };
  const packagePlatform = async ({ outputRoot }) => {
    fs.mkdirSync(outputRoot, { recursive: true });
    fs.writeFileSync(path.join(outputRoot, 'version.txt'), 'new\n');
    fs.writeFileSync(path.join(outputRoot, 'package-report.json'), '{}\n');
    return { sizeBytes: 10, headroomBytes: 20 };
  };
  await assert.rejects(
    () => preparePlatformMarketplace({ ...options, buildPlatform, packagePlatform }),
    /拒绝覆盖/u,
  );
  const upgraded = await preparePlatformMarketplace({
    ...options,
    write: true,
    upgrade: true,
    buildPlatform,
    packagePlatform,
  });
  assert.equal(upgraded.status, 'passed');
  assert.equal(fs.readFileSync(path.join(options.outputRoot, 'version.txt'), 'utf8'), 'new\n');
  fs.writeFileSync(path.join(options.outputRoot, 'version.txt'), 'stable\n');
  await assert.rejects(
    () => preparePlatformMarketplace({
      ...options,
      write: true,
      upgrade: true,
      buildPlatform,
      packagePlatform: async () => { throw new Error('fixture package failed'); },
    }),
    /fixture package failed/u,
  );
  assert.equal(fs.readFileSync(path.join(options.outputRoot, 'version.txt'), 'utf8'), 'stable\n');
  assert.equal(
    fs.readdirSync(options.distRoot).some((name) => name.startsWith('.p-') || name.startsWith('.b-')),
    false,
  );
});
test('[TC-05] CI 平台 marketplace 准备与小型报告合同', (context) => {
  const workflow = fs.readFileSync(path.resolve('.github/workflows/validate.yml'), 'utf8');
  const platformJob = workflow.slice(workflow.indexOf('\n  platform:'));
  assert.match(platformJob, /prepare-platform-marketplace\.mjs --write --platform \$\{\{ matrix\.platform \}\}/u);
  assert.match(platformJob, /UI_REVIEW_RUNTIME_ROOT:/u);
  assert.equal([...platformJob.matchAll(/npm run verify:platform/gmu)].length, 1);
  assert.doesNotMatch(platformJob, /build-playwright-platform\.mjs|package-plugin-platform\.mjs|--replace-lfs-pointers|git lfs pull/u);
  assert.doesNotMatch(workflow, /^\s*schedule:|actions\/cache|cache:|permissions:\s*write/gmu);
  assert.equal([...platformJob.matchAll(/actions\/upload-artifact@v7/gmu)].length, 2);
  assert.match(platformJob, /Upload optional platform install evidence[\s\S]*collect_platform_install_evidence/u);
  assert.equal([...platformJob.matchAll(/retention-days:\s*14/gmu)].length, 2);
  assert.match(platformJob, /dist\/frontend-ai-workflow-\$\{\{ matrix\.platform \}\}\/package-report\.json/u);
  assert.doesNotMatch(platformJob, /path:\s*dist\/frontend-ai-workflow-\$\{\{ matrix\.platform \}\}\s*$/mu);
  const previewRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-marketplace-preview-'));
  context.after(() => fs.rmSync(previewRoot, { recursive: true, force: true }));
  const previewOutput = path.join(previewRoot, 'marketplace');
  const preview = spawnSync(process.execPath, [
    preparePlatformMarketplaceScript,
    '--platform',
    `${process.platform}-${process.arch}`,
    '--output',
    previewOutput,
  ], {
    encoding: 'utf8',
  });
  assert.equal(preview.status, 0, preview.stderr || preview.stdout);
  assert.equal(JSON.parse(preview.stdout).status, 'planned');
  assert.equal(fs.existsSync(previewOutput), false);
});
test('源码共享运行时不伪装成已经准备的平台成品', () => {
  const expectedKey = `${process.platform}-${process.arch}`;
  assert.equal(SUPPORTED_PLAYWRIGHT_PLATFORMS.includes(expectedKey), true, `当前验证平台不在支持范围：${expectedKey}`);
  // 平台 CI 会注入外部成品根；此处必须显式检查仓库源码，避免环境变量改变测试对象。
  const sourceRuntimeRoot = fileURLToPath(new URL('../plugins/frontend-ai-workflow/runtime/playwright/', import.meta.url));
  const runtime = inspectBundledPlaywright({
    runtimeRoot: sourceRuntimeRoot,
    integrityPath: path.join(sourceRuntimeRoot, 'integrity'),
    useCache: false,
  });
  assert.equal(runtime.available, false);
  assert.equal(runtime.code, 'playwright_platform_asset_missing');
  assert.match(runtime.target, new RegExp(`^platform-assets/${expectedKey}/`, 'u'));
  assert.match(runtime.reason, /缺少浏览器目录|不完整/u);
});
