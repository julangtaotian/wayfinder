import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUNDLED_PLAYWRIGHT_VERSION,
  SUPPORTED_PLAYWRIGHT_PLATFORMS,
  writePlaywrightIntegrity,
} from '../../plugins/frontend-ai-workflow/scripts/playwright-runtime.mjs';

export const EXPECTED_PLATFORMS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-x64',
];
export const packagePluginScript = fileURLToPath(new URL('../../plugins/frontend-ai-workflow/scripts/package-plugin-platform.mjs', import.meta.url));
export const playwrightRuntimeScript = fileURLToPath(new URL('../../plugins/frontend-ai-workflow/scripts/playwright-runtime.mjs', import.meta.url));
export const preparePlatformMarketplaceScript = fileURLToPath(new URL('../../plugins/frontend-ai-workflow/scripts/prepare-platform-marketplace.mjs', import.meta.url));
export function platformMetadata(platform, arch) {
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
export function populateRuntimeFixture(root) {
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
  writePlaywrightIntegrity({
    runtimeRoot: root,
    integrityPath: path.join(root, 'integrity'),
    platformKeys: EXPECTED_PLATFORMS,
  });
}
export function createRuntimeFixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-platform-runtime-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  populateRuntimeFixture(root);
  return root;
}
export function writeDownloadedFixture(runtimeRoot, platformKey, browsersPath, { includeBrowserLicense = true } = {}) {
  const metadata = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'platforms', `${platformKey}.json`), 'utf8'));
  const relativePaths = [metadata.browser.executable, metadata.ffmpeg.executable, metadata.ffmpeg.license];
  if (includeBrowserLicense) relativePaths.push(metadata.browser.license);
  for (const relativePath of relativePaths) {
    const stagedPath = path.join(browsersPath, path.relative(metadata.browsersPath, relativePath));
    fs.mkdirSync(path.dirname(stagedPath), { recursive: true });
    fs.writeFileSync(stagedPath, `${platformKey}:${path.basename(stagedPath)}\n`);
  }
}
export function createPluginFixture(context) {
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
export function packagingOptions(context, platformKey = 'darwin-arm64') {
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
