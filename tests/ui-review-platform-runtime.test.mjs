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

test('平台运行时区分共享文件、平台资产和独立完整性', (context) => {
  const runtimeRoot = createRuntimeFixture(context);
  const shared = buildPlaywrightIntegrityManifest(runtimeRoot, { kind: 'shared' });
  assert.equal(shared.files.some((file) => file.path.startsWith('platform-assets/')), false);
  assert.deepEqual([...SUPPORTED_PLAYWRIGHT_PLATFORMS].sort(), EXPECTED_PLATFORMS);
  for (const key of EXPECTED_PLATFORMS) {
    const [platform, ...archParts] = key.split('-');
    const manifest = buildPlaywrightIntegrityManifest(runtimeRoot, { platform, arch: archParts.join('-') });
    assert.equal(
      manifest.files.every((file) => file.path === `platforms/${key}.json` || file.path.startsWith(`platform-assets/${key}/`)),
      true,
      `${key} 完整性清单混入了其他平台资产`,
    );
  }
  const integrity = verifyPlaywrightIntegrity({
    runtimeRoot,
    integrityPath: path.join(runtimeRoot, 'integrity'),
    verifyAllPlatforms: true,
  });
  assert.equal(integrity.ok, true, integrity.errors.join('\n'));
  assert.deepEqual(Object.keys(integrity.platforms).sort(), EXPECTED_PLATFORMS);
});
test('Windows Chromium 固定诊断日志不污染完整性且其他新增文件仍被阻止', (context) => {
  const runtimeRoot = createRuntimeFixture(context);
  const integrityPath = path.join(runtimeRoot, 'integrity');
  const metadata = platformMetadata('win32', 'x64');
  const executableDirectory = path.dirname(path.join(runtimeRoot, metadata.browser.executable));
  fs.writeFileSync(path.join(executableDirectory, 'debug.log'), 'Chromium runtime diagnostics\n');
  const knownSideEffect = verifyPlaywrightIntegrity({
    runtimeRoot,
    integrityPath,
    platform: 'win32',
    arch: 'x64',
  });
  assert.equal(knownSideEffect.ok, true, knownSideEffect.errors.join('\n'));
  fs.writeFileSync(path.join(executableDirectory, 'unexpected.log'), 'unexpected runtime file\n');
  const unexpectedFile = verifyPlaywrightIntegrity({
    runtimeRoot,
    integrityPath,
    platform: 'win32',
    arch: 'x64',
  });
  assert.equal(unexpectedFile.ok, false);
  assert.match(unexpectedFile.errors.join('\n'), /新增未登记文件.*unexpected\.log/u);
});
test('平台构建预览使用统一的 Playwright 主机映射', () => {
  const expectedHosts = {
    'darwin-arm64': 'mac15-arm64',
    'darwin-x64': 'mac15',
    'linux-arm64': 'ubuntu24.04-arm64',
    'linux-x64': 'ubuntu24.04-x64',
    'win32-x64': 'win64',
  };
  assert.deepEqual(
    Object.fromEntries(Object.entries(PLAYWRIGHT_PLATFORM_CONFIGS).map(([key, value]) => [key, value.hostPlatform])),
    expectedHosts,
  );
  for (const key of EXPECTED_PLATFORMS) {
    const plan = buildPlaywrightPlatform({ platformKey: key });
    assert.equal(plan.write, false);
    assert.equal(plan.hostOverride, expectedHosts[key]);
    assert.equal(plan.output, `platform-assets/${key}`);
    assert.equal(plan.downloadsAtRuntime, false);
  }
});
test('单平台构建只更新当前清单并在校验失败时回滚', (context) => {
  const runtimeRoot = createRuntimeFixture(context);
  const integrityPath = path.join(runtimeRoot, 'integrity');
  const targetKey = 'linux-arm64';
  const targetRoot = path.join(runtimeRoot, 'platform-assets', targetKey);
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.rmSync(integrityPath, { recursive: true, force: true });
  const execute = (_command, _args, options) => {
    const metadata = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'platforms', `${targetKey}.json`), 'utf8'));
    for (const relativePath of [
      metadata.browser.executable,
      metadata.ffmpeg.executable,
      metadata.ffmpeg.license,
    ]) {
      const stagedPath = path.join(options.env.PLAYWRIGHT_BROWSERS_PATH, path.relative(metadata.browsersPath, relativePath));
      fs.mkdirSync(path.dirname(stagedPath), { recursive: true });
      fs.writeFileSync(stagedPath, `${targetKey}:${path.basename(stagedPath)}\n`);
    }
    return { status: 0 };
  };
  const built = buildPlaywrightPlatform({ platformKey: targetKey, write: true, runtimeRoot, execute });
  assert.equal(built.inspection.revision, '1234');
  assert.equal(fs.existsSync(path.join(runtimeRoot, platformMetadata('linux', 'arm64').browser.license)), true);
  assert.equal(fs.existsSync(path.join(integrityPath, 'shared.json')), true);
  assert.equal(fs.existsSync(path.join(integrityPath, `${targetKey}.json`)), true);
  assert.equal(fs.existsSync(path.join(integrityPath, 'linux-x64.json')), false);
  assert.throws(
    () => buildPlaywrightPlatform({ platformKey: targetKey, write: true, runtimeRoot, execute }),
    /拒绝覆盖/u,
  );
  const brokenKey = 'win32-x64';
  const brokenRoot = path.join(runtimeRoot, 'platform-assets', brokenKey);
  fs.rmSync(brokenRoot, { recursive: true, force: true });
  const incompleteExecute = (_command, _args, options) => {
    const metadata = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'platforms', `${brokenKey}.json`), 'utf8'));
    const executable = path.join(
      options.env.PLAYWRIGHT_BROWSERS_PATH,
      path.relative(metadata.browsersPath, metadata.browser.executable),
    );
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.writeFileSync(executable, 'incomplete\n');
    return { status: 0 };
  };
  assert.throws(
    () => buildPlaywrightPlatform({ platformKey: brokenKey, write: true, runtimeRoot, execute: incompleteExecute }),
    /不完整/u,
  );
  assert.equal(fs.existsSync(brokenRoot), false);
});
test('平台选择拒绝缺包、混装、摘要变化和未支持平台', (context) => {
  const runtimeRoot = createRuntimeFixture(context);
  const integrityPath = path.join(runtimeRoot, 'integrity');
  const darwin = inspectBundledPlaywright({ runtimeRoot, integrityPath, platform: 'darwin', arch: 'arm64', useCache: false });
  const linux = inspectBundledPlaywright({ runtimeRoot, integrityPath, platform: 'linux', arch: 'x64', useCache: false });
  const windows = inspectBundledPlaywright({ runtimeRoot, integrityPath, platform: 'win32', arch: 'x64', useCache: false });
  assert.equal(darwin.available, true, darwin.reason);
  assert.equal(linux.available, true, linux.reason);
  assert.equal(windows.available, true, windows.reason);
  assert.notEqual(darwin.browserExecutable, linux.browserExecutable);
  assert.notEqual(linux.browserExecutable, windows.browserExecutable);
  const linuxMetadataPath = path.join(runtimeRoot, 'platforms', 'linux-x64.json');
  const linuxMetadata = JSON.parse(fs.readFileSync(linuxMetadataPath, 'utf8'));
  const originalLinuxMetadata = `${JSON.stringify(linuxMetadata, null, 2)}\n`;
  linuxMetadata.browser.executable = platformMetadata('darwin', 'arm64').browser.executable;
  fs.writeFileSync(linuxMetadataPath, `${JSON.stringify(linuxMetadata, null, 2)}\n`);
  const mixed = inspectBundledPlaywright({ runtimeRoot, integrityPath, platform: 'linux', arch: 'x64', verifyIntegrity: false, useCache: false });
  assert.equal(mixed.available, false);
  assert.match(mixed.reason, /独立浏览器目录/u);
  fs.writeFileSync(linuxMetadataPath, originalLinuxMetadata);
  fs.unlinkSync(path.join(runtimeRoot, platformMetadata('linux', 'x64').browser.executable));
  const missing = inspectBundledPlaywright({ runtimeRoot, integrityPath, platform: 'linux', arch: 'x64', useCache: false });
  assert.equal(missing.available, false);
  assert.match(missing.reason, /Chromium 不完整/u);
  fs.writeFileSync(path.join(runtimeRoot, 'package-lock.json'), '{"changed":true}\n');
  const changed = verifyPlaywrightIntegrity({ runtimeRoot, integrityPath, platform: 'darwin', arch: 'arm64' });
  assert.equal(changed.ok, false);
  assert.match(changed.errors.join('\n'), /摘要变化/u);
  const unsupported = inspectBundledPlaywright({ platform: 'win32', arch: 'arm64', useCache: false });
  assert.equal(unsupported.available, false);
  assert.match(unsupported.reason, /未携带 win32-arm64/u);
});
test('[V-04] 平台作用域完整性只消费目标成品并对不完整文件失败关闭', (context) => {
  const runtimeRoot = createRuntimeFixture(context);
  const metadata = platformMetadata('darwin', 'arm64');
  const executable = path.join(runtimeRoot, metadata.browser.executable);
  assert.equal(
    normalizePlaywrightPlatformPath('platform-assets\\win32-x64\\browser.exe'),
    'platform-assets/win32-x64/browser.exe',
  );
  assert.equal(inspectPlaywrightAsset(executable, { runtimeRoot }).code, 'playwright_platform_asset_ready');
  fs.writeFileSync(executable, 'version https://git-lfs.github.com/spec/v1\noid sha256:fixture\nsize 123\n');
  const pointer = inspectPlaywrightAsset(executable, { runtimeRoot });
  assert.deepEqual(
    { code: pointer.code, status: pointer.status, target: pointer.target },
    {
      code: 'playwright_lfs_pointer',
      status: 'failed',
      target: metadata.browser.executable,
    },
  );
  const pointerRuntime = inspectBundledPlaywright({
    runtimeRoot,
    integrityPath: path.join(runtimeRoot, 'integrity'),
    platform: 'darwin',
    arch: 'arm64',
    verifyIntegrity: false,
    useCache: false,
  });
  assert.equal(pointerRuntime.code, 'playwright_lfs_pointer');
  fs.unlinkSync(executable);
  assert.equal(
    inspectPlaywrightAsset(executable, { runtimeRoot }).code,
    'playwright_platform_asset_missing',
  );
  fs.writeFileSync(path.join(runtimeRoot, 'distribution.json'), `${JSON.stringify({
    schemaVersion: 1,
    kind: 'platform',
    platformKey: 'darwin-arm64',
    excludedPlatforms: EXPECTED_PLATFORMS.filter((key) => key !== 'darwin-arm64'),
    budgetBytes: 1024,
    stripped: false,
  }, null, 2)}\n`);
  const mismatch = inspectBundledPlaywright({
    runtimeRoot,
    platform: 'linux',
    arch: 'x64',
    verifyIntegrity: false,
    useCache: false,
  });
  assert.equal(mismatch.code, 'playwright_platform_mismatch');
  assert.equal(mismatch.target, 'linux-x64');
});
test('[TC-03] CI 共享验证前置门禁', (context) => {
  const workflow = fs.readFileSync(path.resolve('.github/workflows/validate.yml'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  const sharedStart = workflow.indexOf('\n  shared:');
  const platformStart = workflow.indexOf('\n  native-platform:');
  assert.notEqual(sharedStart, -1);
  assert.ok(platformStart > sharedStart);
  const sharedJob = workflow.slice(sharedStart, platformStart);
  const platformJob = workflow.slice(platformStart, workflow.indexOf('\n  release-install:'));
  assert.match(sharedJob, /runs-on:\s*ubuntu-24\.04/u);
  assert.match(sharedJob, /lfs:\s*false/u);
  assert.match(sharedJob, /node-version:\s*20\.19\.0/u);
  assert.match(sharedJob, /run:\s*npm run verify:shared/u);
  assert.match(sharedJob, /if:\s*always\(\)/u);
  assert.match(sharedJob, /run:\s*npm run cleanup:test-runtime/u);
  assert.doesNotMatch(sharedJob, /git lfs pull|UI_REVIEW_EXPECT_PLATFORM/u);
  assert.match(platformJob, /needs:\s*shared/u);
  assert.equal([...workflow.matchAll(/run:\s*npm run verify:shared/gmu)].length, 1);
  assert.equal(packageJson.scripts.verify, 'node scripts/verify.mjs');
  assert.equal(packageJson.scripts['verify:shared'], 'node scripts/verify.mjs --scope shared');
  assert.equal(packageJson.scripts['verify:platform'], 'node scripts/verify.mjs --scope platform');
  assert.equal(packageJson.scripts['cleanup:test-runtime'], 'node scripts/cleanup-frontend-test-runtime.mjs');
  const runtimeRoot = createRuntimeFixture(context);
  const integrityPath = path.join(runtimeRoot, 'integrity');
  const platformExecutable = path.join(runtimeRoot, platformMetadata('darwin', 'arm64').browser.executable);
  fs.writeFileSync(platformExecutable, 'version https://git-lfs.github.com/spec/v1\noid sha256:fixture\nsize 123\n');
  const sharedIntegrity = verifyPlaywrightSharedIntegrity({ runtimeRoot, integrityPath });
  assert.equal(sharedIntegrity.ok, true, sharedIntegrity.errors.join('\n'));
  assert.deepEqual(Object.keys(sharedIntegrity.platforms), []);
  const fullIntegrity = verifyPlaywrightIntegrity({ runtimeRoot, integrityPath, verifyAllPlatforms: true });
  assert.equal(fullIntegrity.ok, false);
  assert.match(fullIntegrity.errors.join('\n'), /Playwright darwin-arm64 运行包运行时文件摘要变化/u);
});
test('[TC-04] CI 五平台专属验证与产物合同', () => {
  const workflow = fs.readFileSync(path.resolve('.github/workflows/validate.yml'), 'utf8');
  const attributes = fs.readFileSync(path.resolve('.gitattributes'), 'utf8');
  const platformStart = workflow.indexOf('\n  native-platform:');
  assert.notEqual(platformStart, -1);
  const platformJob = workflow.slice(platformStart, workflow.indexOf('\n  release-install:'));
  assert.match(workflow, /lfs:\s*false/u);
  assert.doesNotMatch(workflow, /lfs:\s*true/u);
  assert.match(platformJob, /needs:\s*shared/u);
  assert.match(platformJob, /fail-fast:\s*false/u);
  assert.match(platformJob, /UI_REVIEW_EXPECT_PLATFORM:\s*\$\{\{ matrix\.platform \}\}/u);
  assert.match(platformJob, /UI_REVIEW_RUNTIME_ROOT:/u);
  assert.doesNotMatch(workflow, /git lfs pull/u);
  assert.match(
    platformJob,
    /prepare-platform-marketplace\.mjs --write --platform \$\{\{ matrix\.platform \}\}/u,
  );
  assert.ok(
    platformJob.indexOf('actions/setup-node@v6') < platformJob.indexOf('prepare-platform-marketplace.mjs'),
    '平台资产重建必须在固定 Node.js 准备完成后执行',
  );
  for (const [runner, platform] of [
    ['macos-15', 'darwin-arm64'],
    ['macos-15-intel', 'darwin-x64'],
    ['ubuntu-24.04', 'linux-x64'],
    ['ubuntu-24.04-arm', 'linux-arm64'],
    ['windows-2025', 'win32-x64'],
  ]) {
    assert.match(platformJob, new RegExp(`- os: ${runner}\\r?\\n\\s+platform: ${platform}`, 'u'));
  }
  assert.equal([...platformJob.matchAll(/run:\s*npm run verify:platform/gmu)].length, 1);
  assert.doesNotMatch(platformJob, /build-playwright-platform\.mjs|package-plugin-platform\.mjs|--replace-lfs-pointers/u);
  // 产物上传继续使用默认运行于 Node.js 24 的版本，避免恢复旧版 action 的弃用警告。
  assert.match(platformJob, /actions\/upload-artifact@v7/u);
  assert.doesNotMatch(platformJob, /actions\/upload-artifact@v[1-6]\b/u);
  assert.match(platformJob, /name:\s*plugin-package-report-\$\{\{ matrix\.platform \}\}/u);
  assert.match(platformJob, /dist\/frontend-ai-workflow-\$\{\{ matrix\.platform \}\}\/package-report\.json/u);
  assert.match(attributes, /^\* text=auto eol=lf$/mu);
  assert.doesNotMatch(attributes, /platform-assets\/\*\*|filter=lfs/u);
});

test('[TC-06] CI 平台矩阵验证运行时离线复验', () => {
  const workflow = fs.readFileSync(path.resolve('.github/workflows/validate.yml'), 'utf8');
  const platformStart = workflow.indexOf('\n  native-platform:');
  assert.notEqual(platformStart, -1);
  const platformJob = workflow.slice(platformStart, workflow.indexOf('\n  release-install:'));
  const setupNode = platformJob.indexOf('actions/setup-node@v6');
  const warmCache = platformJob.indexOf('Warm locked frontend test cache');
  const clearRuntime = platformJob.indexOf('Remove online frontend test runtime');
  const platformPrepare = platformJob.indexOf('Prepare native marketplace outside source runtime');
  const platformVerify = platformJob.indexOf('Verify native contracts and offline runtimes');

  assert.ok(setupNode < warmCache);
  assert.ok(warmCache < clearRuntime);
  assert.ok(clearRuntime < platformPrepare);
  assert.ok(platformPrepare < platformVerify);
  assert.equal([...platformJob.matchAll(/run:\s*npm run prepare:test-runtime/gmu)].length, 1);
  assert.equal([...platformJob.matchAll(/run:\s*npm run verify:platform/gmu)].length, 1);
  assert.doesNotMatch(platformJob, /verify:shared/u);
  assert.match(
    platformJob,
    /name:\s*Clean frontend test runtime\r?\n\s*if:\s*always\(\)\r?\n\s*run:\s*npm run cleanup:test-runtime/u,
  );
  assert.match(
    platformJob,
    /name:\s*Clean frontend test cache\r?\n\s*if:\s*always\(\)\r?\n\s*run:\s*npm run cleanup:test-cache/u,
  );
});

test('[TC-05] CI 同引用在途运行治理', () => {
  const workflow = fs.readFileSync(path.resolve('.github/workflows/validate.yml'), 'utf8');
  assert.match(
    workflow,
    /^concurrency:\r?\n\s+group:\s*\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\r?\n\s+cancel-in-progress:\s*true$/mu,
  );
  assert.match(workflow, /^on:\r?\n\s+push:\s*\r?\n\s+pull_request:\s*\r?\n\s+workflow_dispatch:/mu);
  assert.match(workflow, /^permissions:\r?\n\s+contents:\s*read$/mu);
  assert.doesNotMatch(workflow, /github\.head_ref|github\.ref_name/u);
  assert.doesNotMatch(workflow, /^\s*(?:schedule|paths|paths-ignore):/mu);
  assert.doesNotMatch(workflow, /actions\/cache|cache:/u);
});
test('[V-04] CI 完整性校验只检查已拉取平台，本地仍检查全部平台', (context) => {
  const runtimeRoot = createRuntimeFixture(context);
  const integrityPath = path.join(runtimeRoot, 'integrity');
  const nonTargetExecutable = path.join(runtimeRoot, platformMetadata('darwin', 'arm64').browser.executable);
  fs.writeFileSync(nonTargetExecutable, 'version https://git-lfs.github.com/spec/v1\noid sha256:fixture\nsize 123\n');
  const targetIntegrity = verifyConfiguredPlaywrightIntegrity({
    environment: { UI_REVIEW_EXPECT_PLATFORM: 'linux-x64' },
    runtimeRoot,
    integrityPath,
  });
  assert.equal(targetIntegrity.ok, true, targetIntegrity.errors.join('\n'));
  assert.deepEqual(Object.keys(targetIntegrity.platforms), ['linux-x64']);
  const localIntegrity = verifyPlaywrightIntegrity({
    runtimeRoot,
    integrityPath,
    ...resolvePlaywrightIntegrityScope({}),
  });
  assert.equal(localIntegrity.ok, false);
  assert.match(localIntegrity.errors.join('\n'), /Playwright darwin-arm64 运行包运行时文件摘要变化/u);
  assert.throws(
    () => resolvePlaywrightIntegrityScope({ UI_REVIEW_EXPECT_PLATFORM: 'win32-arm64' }),
    /不支持的 Playwright 完整性校验平台/u,
  );
});
test('[V-04] CI 命令行完整性入口和 UI 自动化检查都继承矩阵目标', (context) => {
  const target = resolvePlaywrightValidationTarget({ UI_REVIEW_EXPECT_PLATFORM: 'linux-arm64' });
  assert.deepEqual(target, { platform: 'linux', arch: 'arm64', platformKey: 'linux-arm64' });
  assert.deepEqual(
    resolvePlaywrightValidationTarget({}, 'darwin-x64'),
    { platform: 'darwin', arch: 'x64', platformKey: 'darwin-x64' },
  );
  const expectedPlatformKey = process.env.UI_REVIEW_EXPECT_PLATFORM || `${process.platform}-${process.arch}`;
  const runtimeRoot = createRuntimeFixture(context);
  const result = spawnSync(process.execPath, [playwrightRuntimeScript, '--check'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      UI_REVIEW_EXPECT_PLATFORM: expectedPlatformKey,
      UI_REVIEW_RUNTIME_ROOT: runtimeRoot,
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(Object.keys(JSON.parse(result.stdout).platforms), [expectedPlatformKey]);
});
