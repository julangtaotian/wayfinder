import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runBootstrap } from '../plugins/frontend-ai-workflow/scripts/bootstrap-project.mjs';
import { checkProject } from '../plugins/frontend-ai-workflow/scripts/check-project.mjs';
import { formatProjectCheckOutput } from '../plugins/frontend-ai-workflow/scripts/check-project-output.mjs';
import {
  inspectPluginRepository,
  normalizePluginRepositoryPath,
  PLUGIN_REPOSITORY_KIND,
} from '../plugins/frontend-ai-workflow/scripts/plugin-repository-health.mjs';
import { createVueFixture, writeFixtureFile, writeLegacyWorkflow } from './helpers/workflow-fixtures.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkProjectScript = path.join(repositoryRoot, 'plugins', 'frontend-ai-workflow', 'scripts', 'check-project.mjs');

function writeJson(root, relativePath, value) {
  writeFixtureFile(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function pluginEntry(name, sourcePath = `./plugins/${name}`) {
  return { name, source: { source: 'local', path: sourcePath } };
}

function writePlugin(root, name, { manifest = null, sourcePath = `plugins/${name}`, createSkills = true } = {}) {
  writeJson(root, `${sourcePath}/.codex-plugin/plugin.json`, manifest || {
    name,
    version: '1.0.0',
    skills: './skills/',
  });
  const skillsPath = manifest?.skills === undefined ? './skills/' : manifest.skills;
  if (createSkills && typeof skillsPath === 'string' && skillsPath.startsWith('./') && skillsPath.endsWith('/')) {
    writeFixtureFile(root, `${sourcePath}/${skillsPath.slice(2)}SKILL.md`, '---\nname: fixture\ndescription: fixture\n---\n');
  }
}

function createPluginRepositoryFixture(t, {
  entries = [pluginEntry('alpha')],
  marketplace = null,
  plugins = [{ name: 'alpha' }],
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-repository-health-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeJson(root, 'package.json', {
    name: 'plugin-repository-health-fixture',
    private: true,
    type: 'module',
    scripts: { test: 'node --test', validate: 'node --check package.json' },
  });
  writeFixtureFile(root, 'openspec/config.yaml', 'schema: spec-driven\n');
  writeJson(root, '.agents/plugins/marketplace.json', marketplace || {
    name: 'fixture-marketplace',
    plugins: entries,
  });
  for (const plugin of plugins) writePlugin(root, plugin.name, plugin);
  return root;
}

function snapshotTree(root, current = root) {
  const entries = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(current, entry.name);
    const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
    if (entry.isDirectory()) {
      entries.push({ path: relativePath, type: 'directory' });
      entries.push(...snapshotTree(root, absolutePath));
    } else {
      entries.push({
        path: relativePath,
        type: entry.isSymbolicLink() ? 'symlink' : 'file',
        content: entry.isSymbolicLink() ? fs.readlinkSync(absolutePath) : fs.readFileSync(absolutePath, 'utf8'),
      });
    }
  }
  return entries;
}

function runCheckCli(root, ...args) {
  return spawnSync(process.execPath, [checkProjectScript, '--target', root, ...args], { encoding: 'utf8' });
}

function pluginCodes(result) {
  return result.pluginRepository.diagnostics.map((item) => item.code);
}

test('[TC-01] 有效插件仓库得到专属健康结果', (t) => {
  const root = createPluginRepositoryFixture(t);
  const result = checkProject(root);
  const summary = formatProjectCheckOutput(result, { summary: true });
  const cli = runCheckCli(root, '--summary');

  assert.equal(result.ok, true);
  assert.equal(result.layout, 'none');
  assert.equal(result.repositoryKind, PLUGIN_REPOSITORY_KIND);
  assert.equal(result.pluginRepository.status, 'healthy');
  assert.deepEqual(result.pluginRepository.plugins, [{
    name: 'alpha', path: 'plugins/alpha', manifestVersion: '1.0.0', status: 'healthy',
  }]);
  assert.equal(result.pluginRepository.commands.validate.command, 'npm run validate');
  assert.doesNotMatch(result.errors.join('\n'), /Wayfinder|受管标记/u);
  assert.doesNotMatch(result.warnings.join('\n'), /构建脚本|lint 脚本|类型检查/u);
  assert.equal(summary.repositoryKind, PLUGIN_REPOSITORY_KIND);
  assert.equal(summary.pluginRepository.totalPlugins, 1);
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).repositoryKind, PLUGIN_REPOSITORY_KIND);
});

test('[TC-02] 多插件 summary 有界且完整结果保留全部事实', (t) => {
  const names = Array.from({ length: 23 }, (_, index) => `plugin-${String(23 - index).padStart(2, '0')}`);
  const root = createPluginRepositoryFixture(t, {
    entries: names.map((name) => pluginEntry(name)),
    plugins: names.map((name) => ({ name })),
  });
  const full = checkProject(root);
  const summary = formatProjectCheckOutput(full, { summary: true });

  assert.equal(full.pluginRepository.plugins.length, 23);
  assert.equal(summary.pluginRepository.totalPlugins, 23);
  assert.equal(summary.pluginRepository.displayedPlugins, 20);
  assert.equal(summary.pluginRepository.omittedPlugins, 3);
  assert.deepEqual(summary.pluginRepository.pluginStatusCounts, { healthy: 23 });
  assert.deepEqual(summary.pluginRepository.plugins.map((item) => item.name), [...summary.pluginRepository.plugins]
    .map((item) => item.name).sort());
});

test('[TC-03] 重复检查只读并反映当前 marketplace 与 manifest', (t) => {
  const root = createPluginRepositoryFixture(t);
  const before = snapshotTree(root);
  const first = checkProject(root);
  const afterFirst = snapshotTree(root);
  writeJson(root, 'plugins/alpha/.codex-plugin/plugin.json', {
    name: 'renamed', version: '1.0.0', skills: './skills/',
  });
  const invalid = checkProject(root);
  writePlugin(root, 'alpha');
  const recovered = checkProject(root);

  assert.equal(first.ok, true);
  assert.deepEqual(afterFirst, before, '健康检查不得写入 fixture');
  assert.equal(invalid.ok, false);
  assert.ok(pluginCodes(invalid).includes('plugin_manifest_name_mismatch'));
  assert.equal(recovered.ok, true);
});

test('[TC-04] 空本地条目与损坏 JSON 失败关闭', (t) => {
  const noLocalRoot = createPluginRepositoryFixture(t, {
    entries: [{ name: 'remote', source: { source: 'remote', url: 'https://example.invalid/plugin' } }],
    plugins: [],
  });
  const noLocal = checkProject(noLocalRoot);
  assert.equal(noLocal.ok, false);
  assert.ok(pluginCodes(noLocal).includes('plugin_local_entries_missing'));

  const invalidMarketplaceRoot = createPluginRepositoryFixture(t);
  writeFixtureFile(invalidMarketplaceRoot, '.agents/plugins/marketplace.json', '{\n');
  const invalidMarketplace = checkProject(invalidMarketplaceRoot);
  assert.equal(invalidMarketplace.ok, false);
  assert.ok(pluginCodes(invalidMarketplace).includes('plugin_marketplace_invalid_json'));

  const invalidManifestRoot = createPluginRepositoryFixture(t);
  writeFixtureFile(invalidManifestRoot, 'plugins/alpha/.codex-plugin/plugin.json', '{\n');
  const invalidManifest = checkProject(invalidManifestRoot);
  const cli = runCheckCli(invalidManifestRoot, '--summary');
  assert.equal(invalidManifest.ok, false);
  assert.ok(pluginCodes(invalidManifest).includes('plugin_manifest_invalid_json'));
  assert.notEqual(cli.status, 0);
  assert.equal(JSON.parse(cli.stdout).pluginRepository.status, 'invalid');
});

test('[TC-05] 不安全路径与 manifest 结构失配可定位', (t) => {
  assert.equal(normalizePluginRepositoryPath('./plugins/alpha'), 'plugins/alpha');
  assert.equal(path.posix.isAbsolute('/workspace/plugins/alpha'), true);
  assert.equal(path.win32.isAbsolute('D:/workspace/plugins/alpha'), true);
  assert.equal(path.win32.isAbsolute('D:\\workspace\\plugins\\alpha'), true);
  for (const unsafe of ['/workspace/plugins/alpha', 'D:/workspace/plugins/alpha', 'D:\\workspace\\plugins\\alpha']) {
    assert.throws(() => normalizePluginRepositoryPath(unsafe), /项目相对路径/u);
  }

  const traversalRoot = createPluginRepositoryFixture(t, {
    entries: [pluginEntry('alpha', '../outside')],
    plugins: [],
  });
  const traversal = checkProject(traversalRoot);
  assert.equal(traversal.ok, false);
  assert.ok(pluginCodes(traversal).includes('plugin_source_path_invalid'));
  assert.ok(traversal.pluginRepository.diagnostics.every((item) => (
    typeof item.code === 'string'
      && item.status === 'error'
      && !path.isAbsolute(item.target)
      && !item.target.startsWith('../')
  )));

  const windowsPathRoot = createPluginRepositoryFixture(t, {
    entries: [pluginEntry('alpha', 'D:/workspace/plugins/alpha')],
    plugins: [],
  });
  const windowsPath = checkProject(windowsPathRoot);
  assert.deepEqual(windowsPath.pluginRepository.diagnostics[0], {
    code: 'plugin_source_path_invalid',
    status: 'error',
    target: '.agents/plugins/marketplace.json#plugins[0]',
    message: '插件 source.path必须是使用正斜杠的项目相对路径',
  });

  const backslashPathRoot = createPluginRepositoryFixture(t, {
    entries: [pluginEntry('alpha', 'plugins\\alpha')],
    plugins: [],
  });
  assert.ok(pluginCodes(checkProject(backslashPathRoot)).includes('plugin_source_path_invalid'));

  const missingManifestRoot = createPluginRepositoryFixture(t, {
    entries: [pluginEntry('missing')],
    plugins: [],
  });
  writeFixtureFile(missingManifestRoot, 'plugins/missing/.gitkeep', '');
  assert.ok(pluginCodes(checkProject(missingManifestRoot)).includes('plugin_manifest_missing'));

  const mismatchRoot = createPluginRepositoryFixture(t, {
    plugins: [{
      name: 'alpha',
      manifest: { name: 'beta', version: '', skills: './missing/' },
      createSkills: false,
    }],
  });
  const mismatch = checkProject(mismatchRoot);
  assert.equal(mismatch.ok, false);
  assert.ok(pluginCodes(mismatch).includes('plugin_manifest_name_mismatch'));
  assert.ok(pluginCodes(mismatch).includes('plugin_manifest_version_missing'));
  assert.ok(pluginCodes(mismatch).includes('plugin_manifest_skills_missing'));

  const missingManifestNameRoot = createPluginRepositoryFixture(t, {
    plugins: [{ name: 'alpha', manifest: { version: '1.0.0', skills: './skills/' } }],
  });
  const missingManifestName = checkProject(missingManifestNameRoot);
  assert.ok(pluginCodes(missingManifestName).includes('plugin_manifest_name_missing'));
  assert.equal(missingManifestName.pluginRepository.plugins[0].status, 'invalid');

  const linkRoot = createPluginRepositoryFixture(t, {
    entries: [pluginEntry('linked', './plugins/linked')],
    plugins: [],
  });
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-repository-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.mkdirSync(path.join(linkRoot, 'plugins'), { recursive: true });
  fs.symlinkSync(outside, path.join(linkRoot, 'plugins', 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const linked = inspectPluginRepository(linkRoot);
  assert.equal(linked.status, 'invalid');
  assert.ok(linked.diagnostics.some((item) => item.code === 'plugin_source_path_invalid'));
});

test('[TC-06] 非插件项目保持现有工作流行为', (t) => {
  const wayfinderRoot = createVueFixture(t);
  runBootstrap({ target: wayfinderRoot, write: true });
  const wayfinder = checkProject(wayfinderRoot);
  assert.equal(wayfinder.ok, true);
  assert.equal(wayfinder.layout, 'wayfinder');
  assert.equal('repositoryKind' in wayfinder, false);

  const legacyRoot = createVueFixture(t);
  runBootstrap({ target: legacyRoot, write: true });
  writeLegacyWorkflow(legacyRoot);
  const legacy = checkProject(legacyRoot);
  assert.equal(legacy.layout, 'legacy');
  assert.equal('repositoryKind' in legacy, false);

  const localManifestRoot = createVueFixture(t);
  writePlugin(localManifestRoot, 'isolated');
  const uninitialized = checkProject(localManifestRoot);
  assert.equal(uninitialized.layout, 'none');
  assert.equal('repositoryKind' in uninitialized, false);
});
