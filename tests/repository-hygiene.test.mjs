import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return result;
}

function inspectIgnore(relativePath) {
  const check = runGit(['check-ignore', '--no-index', '-q', '--', relativePath]);
  assert.ok(
    check.status === 0 || check.status === 1,
    `Git 无法判断忽略状态：${relativePath}\n${check.stderr}`,
  );
  const detail = runGit(['check-ignore', '--no-index', '-v', '--', relativePath]);
  return {
    ignored: check.status === 0,
    detail: detail.stdout.trim() || detail.stderr.trim() || '未命中任何规则',
  };
}

function assertIgnored(relativePath) {
  const result = inspectIgnore(relativePath);
  assert.equal(result.ignored, true, `路径应被忽略：${relativePath}\n${result.detail}`);
}

function assertNotIgnored(relativePath) {
  const result = inspectIgnore(relativePath);
  assert.equal(result.ignored, false, `路径不应被忽略：${relativePath}\n${result.detail}`);
}

test('本机、敏感、缓存和测试临时文件不会进入候选提交', () => {
  const ignoredPaths = [
    '.env',
    '.env.local',
    'packages/app/.env.production',
    '.vscode/settings.json',
    '.history/editor-state.json',
    'Thumbs.db',
    'Desktop.ini',
    'packages/app/.component.vue.swp',
    'packages/app/config.js~',
    'packages/app/result.tmp',
    '.npm/cache/index.json',
    '.pnpm-store/v3/files/index.json',
    '.yarn/cache/package.zip',
    '.cache/tool/state.json',
    '.turbo/cache/result.json',
    '.vite/deps/chunk.js',
    '.parcel-cache/data.bin',
    '.eslintcache',
    'packages/app/tsconfig.tsbuildinfo',
    'coverage/lcov.info',
    'test-results/results.json',
    'playwright-report/index.html',
    'blob-report/report.zip',
    'packages/app/debug.log',
    'node_modules/example/index.js',
    'outputs/example-app/node_modules/example/index.js',
  ];

  for (const relativePath of ignoredPaths) assertIgnored(relativePath);
});

test('公开环境模板、内置运行时和持久交付物保持可提交', () => {
  const retainedPaths = [
    '.env.example',
    '.env.development.example',
    'packages/app/.env.example',
    'plugins/frontend-ai-workflow/runtime/openspec/package.json',
    'plugins/frontend-ai-workflow/runtime/openspec/node_modules/yaml/package.json',
    'plugins/frontend-ai-workflow/runtime/playwright/package-lock.json',
    'plugins/frontend-ai-workflow/runtime/playwright/node_modules/playwright/package.json',
    'plugins/frontend-ai-workflow/runtime/playwright/platform-assets/linux-x64/.local-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
    '.frontend-ui-review/config.json',
    'outputs/lanhu-design-spec/README.md',
    'requirements/REQ-2026-021-openspec-1-8-upgrade.md',
    'openspec/specs/bundled-openspec-runtime/spec.md',
    'openspec/changes/archive/2026-08-12-upgrade-openspec-1-8/proposal.md',
  ];

  for (const relativePath of retainedPaths) assertNotIgnored(relativePath);
});

test('两套内置运行时的可重建命令链接和缓存保持忽略', () => {
  const ignoredRuntimePaths = [
    'plugins/frontend-ai-workflow/runtime/openspec/node_modules/.bin/openspec',
    'plugins/frontend-ai-workflow/runtime/openspec/node_modules/.cache/state.json',
    'plugins/frontend-ai-workflow/runtime/openspec/node_modules/.DS_Store',
    'plugins/frontend-ai-workflow/runtime/playwright/node_modules/.bin/playwright',
    'plugins/frontend-ai-workflow/runtime/playwright/node_modules/.cache/state.json',
    'plugins/frontend-ai-workflow/runtime/playwright/node_modules/.DS_Store',
  ];

  for (const relativePath of ignoredRuntimePaths) assertIgnored(relativePath);
});

test('代表性运行时、LFS、验收证据和规划资产仍受 Git 跟踪', () => {
  const trackedPaths = [
    'plugins/frontend-ai-workflow/runtime/openspec/package.json',
    'plugins/frontend-ai-workflow/runtime/openspec/node_modules/yaml/package.json',
    'plugins/frontend-ai-workflow/runtime/playwright/node_modules/playwright/package.json',
    'plugins/frontend-ai-workflow/runtime/playwright/platform-assets/linux-x64/.local-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
    '.frontend-ui-review/config.json',
    'outputs/lanhu-design-spec/README.md',
    'requirements/REQ-2026-021-openspec-1-8-upgrade.md',
    'openspec/specs/bundled-openspec-runtime/spec.md',
    'openspec/changes/archive/2026-08-12-upgrade-openspec-1-8/proposal.md',
  ];

  for (const relativePath of trackedPaths) {
    const result = runGit(['ls-files', '--error-unmatch', '--', relativePath]);
    assert.equal(result.status, 0, `关键交付文件未受 Git 跟踪：${relativePath}\n${result.stderr}`);
  }

  const lfsPath = trackedPaths[3];
  const attribute = runGit(['check-attr', 'filter', '--', lfsPath]);
  assert.equal(attribute.status, 0, attribute.stderr);
  assert.match(attribute.stdout, /: filter: lfs\s*$/u, `平台资产未使用 Git LFS：${lfsPath}`);
});

test('可重建的 OpenSpec 命令链接不再作为仓库内容保留', () => {
  const generatedLinks = [
    'plugins/frontend-ai-workflow/runtime/openspec/node_modules/.bin/node-which',
    'plugins/frontend-ai-workflow/runtime/openspec/node_modules/.bin/yaml',
  ];

  for (const relativePath of generatedLinks) {
    const tracked = runGit(['ls-files', '--error-unmatch', '--', relativePath]);
    if (tracked.status === 1) continue;
    assert.equal(tracked.status, 0, tracked.stderr);
    const deleted = runGit(['ls-files', '--deleted', '--', relativePath]);
    assert.equal(
      deleted.stdout.trim(),
      relativePath,
      `可重建命令链接仍作为有效仓库内容保留：${relativePath}`,
    );
  }
});
