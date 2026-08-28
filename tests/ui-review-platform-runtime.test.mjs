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
  playwrightLfsInclude,
  resolvePlaywrightIntegrityScope,
  resolvePlaywrightValidationTarget,
  smokeTestBundledPlaywright,
  verifyConfiguredPlaywrightIntegrity,
  verifyPlaywrightIntegrity,
  verifyPlaywrightSharedIntegrity,
  writePlaywrightIntegrity,
} from '../plugins/frontend-ai-workflow/scripts/playwright-runtime.mjs';
import { buildPlaywrightPlatform } from '../plugins/frontend-ai-workflow/scripts/build-playwright-platform.mjs';
import {
  PLATFORM_PLUGIN_SIZE_BUDGETS,
  PLATFORM_STAGE_RETRY_POLICY,
  packagePluginPlatform,
} from '../plugins/frontend-ai-workflow/scripts/package-plugin-platform.mjs';

const EXPECTED_PLATFORMS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-x64',
];
const packagePluginScript = fileURLToPath(new URL(
  '../plugins/frontend-ai-workflow/scripts/package-plugin-platform.mjs',
  import.meta.url,
));
const playwrightRuntimeScript = fileURLToPath(new URL(
  '../plugins/frontend-ai-workflow/scripts/playwright-runtime.mjs',
  import.meta.url,
));

function platformMetadata(platform, arch) {
  const key = `${platform}-${arch}`;
  const browsersPath = `platform-assets/${key}/.local-browsers`;
  return {
    schemaVersion: 2,
    platformKey: key,
    platform,
    arch,
    playwrightVersion: BUNDLED_PLAYWRIGHT_VERSION,
    browsersPath,
    browser: {
      name: 'chromium-headless-shell',
      revision: '1234',
      executable: `${browsersPath}/chromium/chrome-headless-shell`,
      license: `${browsersPath}/chromium/LICENSE.headless_shell`,
    },
    ffmpeg: {
      revision: '1011',
      executable: `${browsersPath}/ffmpeg/ffmpeg`,
      license: `${browsersPath}/ffmpeg/COPYING.LGPLv2.1`,
    },
  };
}

function populateRuntimeFixture(root) {
  fs.mkdirSync(path.join(root, 'node_modules', 'playwright'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules', 'playwright-core'), { recursive: true });
  fs.mkdirSync(path.join(root, 'platforms'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({ name: 'fixture-runtime', version: BUNDLED_PLAYWRIGHT_VERSION })}\n`);
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
  fs.writeFileSync(path.join(root, 'node_modules', 'playwright', 'package.json'), `${JSON.stringify({ version: BUNDLED_PLAYWRIGHT_VERSION })}\n`);
  fs.writeFileSync(path.join(root, 'node_modules', 'playwright', 'index.mjs'), 'export const chromium = {};\n');
  fs.writeFileSync(path.join(root, 'node_modules', 'playwright-core', 'package.json'), `${JSON.stringify({ version: BUNDLED_PLAYWRIGHT_VERSION })}\n`);

  for (const key of SUPPORTED_PLAYWRIGHT_PLATFORMS) {
    const [platform, ...archParts] = key.split('-');
    const metadata = platformMetadata(platform, archParts.join('-'));
    fs.writeFileSync(path.join(root, 'platforms', `${key}.json`), `${JSON.stringify(metadata, null, 2)}\n`);
    for (const relativePath of [
      metadata.browser.executable,
      metadata.browser.license,
      metadata.ffmpeg.executable,
      metadata.ffmpeg.license,
    ]) {
      const absolutePath = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, `${key}:${path.basename(relativePath)}\n`);
    }
  }
  writePlaywrightIntegrity({ runtimeRoot: root, integrityPath: path.join(root, 'integrity') });
}

function createRuntimeFixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-platform-runtime-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  populateRuntimeFixture(root);
  return root;
}

function createPluginFixture(context) {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-platform-plugin-'));
  context.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));
  const pluginRoot = path.join(repositoryRoot, 'plugins', 'frontend-ai-workflow');
  const runtimeRoot = path.join(pluginRoot, 'runtime', 'playwright');
  fs.mkdirSync(path.join(pluginRoot, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(pluginRoot, 'skills', 'fixture'), { recursive: true });
  fs.writeFileSync(path.join(repositoryRoot, 'package.json'), `${JSON.stringify({ name: 'fixture-repository', version: '0.13.0' })}\n`);
  fs.writeFileSync(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), `${JSON.stringify({
    name: 'frontend-ai-workflow',
    version: '0.13.0+codex.fixture',
    skills: './skills/',
  })}\n`);
  fs.writeFileSync(path.join(pluginRoot, 'skills', 'fixture', 'SKILL.md'), '# Fixture\n');
  populateRuntimeFixture(runtimeRoot);
  return { repositoryRoot, pluginRoot, runtimeRoot };
}

function packagingOptions(context, platformKey = 'darwin-arm64') {
  const fixture = createPluginFixture(context);
  const distRoot = path.join(fixture.repositoryRoot, 'dist');
  const outputRoot = path.join(distRoot, `frontend-ai-workflow-${platformKey}`);
  const [currentPlatform, ...archParts] = platformKey.split('-');
  return {
    ...fixture,
    platformKey,
    currentPlatform,
    currentArch: archParts.join('-'),
    distRoot,
    outputRoot,
    allowedRoots: [distRoot],
    validatePackage: async () => ({ ok: true }),
    smokeTest: async () => ({ ok: true, skipped: false, platformKey, screenshotBytes: 256 }),
  };
}

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

test('[V-04] 平台资产与 CI 按需拉取合同：LFS 诊断失败关闭', (context) => {
  const runtimeRoot = createRuntimeFixture(context);
  const metadata = platformMetadata('darwin', 'arm64');
  const executable = path.join(runtimeRoot, metadata.browser.executable);
  assert.equal(
    playwrightLfsInclude('darwin-arm64'),
    'plugins/frontend-ai-workflow/runtime/playwright/platform-assets/darwin-arm64/**',
  );
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
  const platformStart = workflow.indexOf('\n  platform:');
  assert.notEqual(sharedStart, -1);
  assert.ok(platformStart > sharedStart);
  const sharedJob = workflow.slice(sharedStart, platformStart);
  const platformJob = workflow.slice(platformStart);

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
  const platformStart = workflow.indexOf('\n  platform:');
  assert.notEqual(platformStart, -1);
  const platformJob = workflow.slice(platformStart);
  assert.match(workflow, /lfs:\s*false/u);
  assert.doesNotMatch(workflow, /lfs:\s*true/u);
  assert.match(platformJob, /needs:\s*shared/u);
  assert.match(platformJob, /fail-fast:\s*false/u);
  assert.match(platformJob, /UI_REVIEW_EXPECT_PLATFORM:\s*\$\{\{ matrix\.platform \}\}/u);
  assert.match(
    platformJob,
    /git lfs pull --include="plugins\/frontend-ai-workflow\/runtime\/playwright\/platform-assets\/\$\{\{ matrix\.platform \}\}\/\*\*" --exclude=""/u,
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
  assert.match(platformJob, /package-plugin-platform\.mjs --write --platform \$\{\{ matrix\.platform \}\}/u);
  // 产物上传继续使用默认运行于 Node.js 24 的版本，避免恢复旧版 action 的弃用警告。
  assert.match(platformJob, /actions\/upload-artifact@v7/u);
  assert.doesNotMatch(platformJob, /actions\/upload-artifact@v[1-6]\b/u);
  assert.match(platformJob, /name:\s*plugin-package-report-\$\{\{ matrix\.platform \}\}/u);
  assert.match(platformJob, /path:\s*dist\/frontend-ai-workflow-\$\{\{ matrix\.platform \}\}\/package-report\.json/u);
  assert.match(attributes, /^\* text=auto eol=lf$/mu);
  assert.match(attributes, /platform-assets\/\*\* filter=lfs diff=lfs merge=lfs -text/u);
});

test('[TC-05] CI 同引用在途运行治理', () => {
  const workflow = fs.readFileSync(path.resolve('.github/workflows/validate.yml'), 'utf8');
  assert.match(
    workflow,
    /^concurrency:\r?\n\s+group:\s*\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\r?\n\s+cancel-in-progress:\s*true$/mu,
  );
  assert.match(workflow, /^on:\r?\n\s+push:\s*\r?\n\s+pull_request:\s*$/mu);
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

test('[V-04] CI 命令行完整性入口和 UI 自动化检查都继承矩阵目标', () => {
  const target = resolvePlaywrightValidationTarget({ UI_REVIEW_EXPECT_PLATFORM: 'linux-arm64' });
  assert.deepEqual(target, { platform: 'linux', arch: 'arm64', platformKey: 'linux-arm64' });
  assert.deepEqual(
    resolvePlaywrightValidationTarget({}, 'darwin-x64'),
    { platform: 'darwin', arch: 'x64', platformKey: 'darwin-x64' },
  );

  const expectedPlatformKey = process.env.UI_REVIEW_EXPECT_PLATFORM || `${process.platform}-${process.arch}`;
  const result = spawnSync(process.execPath, [playwrightRuntimeScript, '--check'], {
    encoding: 'utf8',
    env: { ...process.env, UI_REVIEW_EXPECT_PLATFORM: expectedPlatformKey },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(Object.keys(JSON.parse(result.stdout).platforms), [expectedPlatformKey]);
});

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
  assert.equal(fs.existsSync(options.distRoot) ? fs.readdirSync(options.distRoot).some((name) => name.includes('.stage-')) : false, false);

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
      assert.match(path.basename(error.target), /\.stage-\d+-\d+$/u);
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
  writePlaywrightIntegrity({ runtimeRoot: options.runtimeRoot, integrityPath: path.join(options.runtimeRoot, 'integrity') });
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

test('当前受支持平台必须真实启动内置 Chromium 并截图', async () => {
  const expectedKey = `${process.platform}-${process.arch}`;
  assert.equal(SUPPORTED_PLAYWRIGHT_PLATFORMS.includes(expectedKey), true, `当前验证平台不在支持范围：${expectedKey}`);
  const runtime = inspectBundledPlaywright();
  assert.equal(runtime.available, true, runtime.reason);
  assert.equal(runtime.platformKey, expectedKey);
  const smoke = await smokeTestBundledPlaywright();
  assert.equal(smoke.ok, true);
  assert.equal(smoke.skipped, false);
  assert.equal(smoke.platformKey, expectedKey);
  assert.equal(smoke.screenshotBytes > 100, true);
});
