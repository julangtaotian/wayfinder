import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BUNDLED_PLAYWRIGHT_VERSION,
  PLAYWRIGHT_PLATFORM_CONFIGS,
  SUPPORTED_PLAYWRIGHT_PLATFORMS,
  buildPlaywrightIntegrityManifest,
  inspectBundledPlaywright,
  smokeTestBundledPlaywright,
  verifyPlaywrightIntegrity,
  writePlaywrightIntegrity,
} from '../plugins/frontend-ai-workflow/scripts/playwright-runtime.mjs';
import { buildPlaywrightPlatform } from '../plugins/frontend-ai-workflow/scripts/build-playwright-platform.mjs';

const EXPECTED_PLATFORMS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-x64',
];

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

function createRuntimeFixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-platform-runtime-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
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
  return root;
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
