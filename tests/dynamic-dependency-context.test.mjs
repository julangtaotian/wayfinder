import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  collectDependencyProfile,
  DEPENDENCY_PROFILE_VERSION,
  DEPENDENCY_SUMMARY_LIMIT,
} from '../plugins/frontend-ai-workflow/scripts/dependency-profile.mjs';
import { inspectProject } from '../plugins/frontend-ai-workflow/scripts/inspect-project.mjs';
import { runBootstrap } from '../plugins/frontend-ai-workflow/scripts/bootstrap-project.mjs';
import { checkProject } from '../plugins/frontend-ai-workflow/scripts/check-project.mjs';
import { runUpdate } from '../plugins/frontend-ai-workflow/scripts/update-project.mjs';

const validationRoot = path.resolve('outputs/dynamic-dependency-context');

function cleanupValidationRoot() {
  try {
    if (fs.existsSync(validationRoot) && fs.readdirSync(validationRoot).length === 0) {
      fs.rmdirSync(validationRoot);
    }
  } catch {
    // 并行用例仍在使用目录时由最后一个完成的用例负责清理。
  }
}

function createFixture(t, packageJson, prefix = 'fixture-') {
  fs.mkdirSync(validationRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(validationRoot, prefix));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    cleanupValidationRoot();
  });
  writeFile(root, 'package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFile(root, 'src/main.js', "export default 'fixture';\n");
  return root;
}

function writeFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function basePackage(overrides = {}) {
  return {
    name: 'dynamic-dependency-fixture',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      test: 'node --test',
      lint: 'eslint .',
      typecheck: 'tsc --noEmit',
    },
    ...overrides,
  };
}

function packageNames(profile) {
  return profile.packages.map(({ name }) => name);
}

test('[TC-01] 动态直接依赖事实合同', (t) => {
  const largeDependencies = Object.fromEntries(
    Array.from({ length: DEPENDENCY_SUMMARY_LIMIT + 5 }, (_, index) => [
      `framework-${String(DEPENDENCY_SUMMARY_LIMIT + 5 - index).padStart(2, '0')}`,
      `^${index + 1}.0.0`,
    ]),
  );
  const packageJson = basePackage({
    workspaces: ['packages/*'],
    dependencies: {
      angular: '^20.0.0',
      '@private/design-system': 'workspace:*',
      'shared-runtime': '^1.0.0',
      '../escape': '^1.0.0',
      ...largeDependencies,
    },
    devDependencies: {
      astro: '^5.0.0',
      'shared-runtime': '~1.2.0',
    },
    peerDependencies: {
      'shared-runtime': '>=1',
      'invalid-version': 42,
    },
    optionalDependencies: {
      svelte: '^5.0.0',
      'blank-version': '   ',
    },
  });

  const profile = collectDependencyProfile(packageJson);
  assert.equal(profile.schemaVersion, DEPENDENCY_PROFILE_VERSION);
  assert.equal(profile.source, 'root-package-json');
  assert.equal(profile.totalPackages, DEPENDENCY_SUMMARY_LIMIT + 10);
  assert.deepEqual(profile.groupCounts, {
    dependencies: DEPENDENCY_SUMMARY_LIMIT + 8,
    devDependencies: 2,
    peerDependencies: 1,
    optionalDependencies: 1,
  });
  assert.deepEqual(profile.packages.find(({ name }) => name === 'shared-runtime'), {
    name: 'shared-runtime',
    declarations: [
      { group: 'dependencies', specifier: '^1.0.0' },
      { group: 'devDependencies', specifier: '~1.2.0' },
      { group: 'peerDependencies', specifier: '>=1' },
    ],
  });
  assert.deepEqual(profile.diagnostics, [
    { code: 'invalid-dependency-name', status: 'ignored', target: 'dependencies.../escape' },
    { code: 'invalid-dependency-specifier', status: 'ignored', target: 'peerDependencies.invalid-version' },
    { code: 'invalid-dependency-specifier', status: 'ignored', target: 'optionalDependencies.blank-version' },
  ]);
  assert.deepEqual(packageNames(profile), [...packageNames(profile)].sort());
  assert.equal(profile.summary.status, 'truncated');
  assert.equal(profile.summary.displayedPackages, DEPENDENCY_SUMMARY_LIMIT);
  assert.equal(profile.summary.omittedPackages, 10);
  assert.match(profile.summary.text, new RegExp(`共 ${DEPENDENCY_SUMMARY_LIMIT + 10} 项`));
  assert.match(profile.summary.text, /完整事实：dependencyProfile\.packages/u);
  assert.doesNotMatch(JSON.stringify(profile), new RegExp(process.cwd().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const reordered = collectDependencyProfile({
    ...packageJson,
    dependencies: Object.fromEntries(Object.entries(packageJson.dependencies).reverse()),
  });
  assert.deepEqual(reordered, profile, '对象插入顺序不得改变画像');

  const empty = collectDependencyProfile(basePackage());
  assert.deepEqual(empty.groupCounts, {
    dependencies: 0,
    devDependencies: 0,
    peerDependencies: 0,
    optionalDependencies: 0,
  });
  assert.equal(empty.totalPackages, 0);
  assert.equal(empty.summary.status, 'empty');
  assert.match(empty.summary.text, /未声明合法直接依赖/u);

  const invalidGroups = collectDependencyProfile(basePackage({
    dependencies: [],
    devDependencies: null,
    peerDependencies: 'react',
    optionalDependencies: 1,
  }));
  assert.equal(invalidGroups.totalPackages, 0);
  assert.deepEqual(invalidGroups.diagnostics, [
    { code: 'invalid-dependency-group', status: 'ignored', target: 'dependencies' },
    { code: 'invalid-dependency-group', status: 'ignored', target: 'devDependencies' },
    { code: 'invalid-dependency-group', status: 'ignored', target: 'peerDependencies' },
    { code: 'invalid-dependency-group', status: 'ignored', target: 'optionalDependencies' },
  ]);

  const root = createFixture(t, packageJson, 'root-only-');
  writeFile(root, 'packages/child/package.json', JSON.stringify({
    name: 'child-app',
    dependencies: { 'child-only-framework': '^9.0.0' },
  }));
  writeFile(root, 'node_modules/installed-only/package.json', JSON.stringify({
    name: 'installed-only',
    version: '1.0.0',
  }));
  const inspected = inspectProject(root);
  assert.deepEqual(inspected.dependencyProfile, profile);
  assert.equal(packageNames(inspected.dependencyProfile).includes('child-only-framework'), false);
  assert.equal(packageNames(inspected.dependencyProfile).includes('installed-only'), false);
});

test('[TC-02] 共享上下文与有限兼容信号', (t) => {
  const extraDependencies = Object.fromEntries(
    Array.from({ length: DEPENDENCY_SUMMARY_LIMIT }, (_, index) => [
      `tool-${String(index + 1).padStart(2, '0')}`,
      `^${index + 1}.0.0`,
    ]),
  );
  const root = createFixture(t, basePackage({
    dependencies: {
      '@private/ui': 'workspace:*',
      svelte: '^5.0.0',
      ...extraDependencies,
    },
    devDependencies: { vite: '^7.0.0' },
  }), 'shared-context-');

  const preview = runBootstrap({ target: root });
  assert.equal(preview.ok, true);
  assert.equal(preview.write, false);
  assert.equal(preview.inspection.preset, 'generic-frontend');
  assert.equal(preview.inspection.dependencyProfile.totalPackages, DEPENDENCY_SUMMARY_LIMIT + 3);
  assert.equal(preview.inspection.dependencyProfile.summary.omittedPackages, 3);
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false);

  const initialized = runBootstrap({ target: root, write: true });
  assert.equal(initialized.ok, true);
  const files = {
    agents: path.join(root, 'AGENTS.md'),
    wayfinder: path.join(root, 'wayfinder/frontend.md'),
    openspec: path.join(root, 'openspec/config.yaml'),
  };
  const initialContent = Object.fromEntries(
    Object.entries(files).map(([name, file]) => [name, fs.readFileSync(file, 'utf8')]),
  );
  for (const content of Object.values(initialContent)) {
    assert.match(content, new RegExp(`共 ${DEPENDENCY_SUMMARY_LIMIT + 3} 项`));
    assert.match(content, /遗漏 3 项/u);
    assert.match(content, /完整事实/u);
    assert.match(content, /有限兼容/u);
  }
  assert.match(initialContent.agents, /@private\/ui/u);
  assert.match(initialContent.wayfinder, /dependencyProfileSchema: "1\.0\.0"/u);
  assert.match(initialContent.wayfinder, new RegExp(`dependencyPackageCount: ${DEPENDENCY_SUMMARY_LIMIT + 3}`));
  assert.match(initialContent.wayfinder, /dependencySummaryStatus: "truncated"/u);
  assert.match(initialContent.openspec, /必须读取完整 `dependencyProfile\.packages` 或根 `package\.json`/u);
  assert.deepEqual(checkProject(root).dependencyProfile, initialized.inspection.dependencyProfile);
  assert.deepEqual(checkProject(root).managedContentFreshness, { checked: true, stale: false, files: [] });

  fs.appendFileSync(files.agents, '\n项目自定义 AGENTS 内容。\n', 'utf8');
  fs.appendFileSync(files.wayfinder, '\n项目自定义 Wayfinder 内容。\n', 'utf8');
  fs.appendFileSync(files.openspec, '\n# 项目自定义 OpenSpec 内容。\n', 'utf8');
  writeFile(root, 'package.json', `${JSON.stringify(basePackage({
    dependencies: {
      angular: '^20.0.0',
      '@private/ui-next': '^2.0.0',
    },
    devDependencies: { vite: '^7.0.0' },
  }), null, 2)}\n`);

  const stale = checkProject(root);
  assert.equal(stale.managedContentFreshness.stale, true);
  assert.deepEqual(stale.managedContentFreshness.files.sort(), [
    'AGENTS.md',
    'openspec/config.yaml',
    'wayfinder/frontend.md',
  ]);
  const upgraded = runUpdate({ target: root, write: true });
  assert.equal(upgraded.ok, true);
  assert.equal(upgraded.inspection.preset, 'generic-frontend');
  assert.deepEqual(packageNames(upgraded.inspection.dependencyProfile), [
    '@private/ui-next',
    'angular',
    'vite',
  ]);
  const nextContent = Object.fromEntries(
    Object.entries(files).map(([name, file]) => [name, fs.readFileSync(file, 'utf8')]),
  );
  assert.match(nextContent.agents, /@private\/ui-next/u);
  assert.doesNotMatch(nextContent.agents, /@private\/ui(?:[^-]|$)/u);
  assert.match(nextContent.agents, /项目自定义 AGENTS 内容/u);
  assert.match(nextContent.wayfinder, /项目自定义 Wayfinder 内容/u);
  assert.match(nextContent.openspec, /项目自定义 OpenSpec 内容/u);
  assert.deepEqual(runUpdate({ target: root, write: true }).actions.map(({ action }) => action), [
    'unchanged',
    'unchanged',
    'unchanged',
  ]);
});

test('[TC-03] 动态依赖上下文统一验证合同', () => {
  const moduleSource = fs.readFileSync(
    path.resolve('plugins/frontend-ai-workflow/scripts/dependency-profile.mjs'),
    'utf8',
  );
  assert.doesNotMatch(moduleSource, /node:child_process|node:https|node:http|\bfetch\s*\(/u);
  assert.doesNotMatch(moduleSource, /AI-code-start/u);

  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(packageJson.dependencies, undefined);
  assert.equal(packageJson.devDependencies, undefined);

  const profile = collectDependencyProfile({ dependencies: { react: '^19.0.0' } });
  assert.deepEqual(Object.keys(profile), [
    'schemaVersion',
    'source',
    'totalPackages',
    'groupCounts',
    'packages',
    'diagnostics',
    'summary',
  ]);
  assert.deepEqual(Object.keys(profile.diagnostics), []);
  assert.deepEqual(Object.keys(profile.summary), [
    'status',
    'totalPackages',
    'displayedPackages',
    'omittedPackages',
    'text',
  ]);
});
