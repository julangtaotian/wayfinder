import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptsRoot = path.join(repositoryRoot, 'plugins', 'frontend-ai-workflow', 'scripts');

const CLI_CASES = [
  { id: 'inspect', script: 'inspect-project.mjs', writeCapable: false },
  { id: 'check', script: 'check-project.mjs', writeCapable: false },
  { id: 'bootstrap', script: 'bootstrap-project.mjs', writeCapable: true },
  { id: 'update', script: 'update-project.mjs', writeCapable: true },
  { id: 'migrate', script: 'migrate-wayfinder-project.mjs', writeCapable: true },
];

function writeFile(root, relativePath, content) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function createFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-argument-safety-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFile(root, 'package.json', `${JSON.stringify({
    name: 'cli-argument-safety-fixture',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      test: 'node --test',
      lint: 'eslint .',
    },
    dependencies: {
      vue: '^3.5.0',
    },
    devDependencies: {
      vite: '^6.0.0',
    },
  }, null, 2)}\n`);
  writeFile(root, 'src/views/Home.vue', '<template><main>CLI fixture</main></template>\n');
  return root;
}

function runCli(script, args, cwd) {
  return spawnSync(process.execPath, [path.join(scriptsRoot, script), ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function parseOutput(result, label) {
  assert.notEqual(result.stdout.trim(), '', `${label} 应输出 JSON`);
  return JSON.parse(result.stdout);
}

// 用稳定的相对路径和文件内容快照证明参数失败没有产生项目副作用。
function snapshotTree(root, current = root) {
  const entries = [];
  for (const dirent of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(current, dirent.name);
    const relativePath = path.relative(root, absolutePath);
    if (dirent.isDirectory()) {
      entries.push({ path: relativePath, type: 'directory' });
      entries.push(...snapshotTree(root, absolutePath));
    } else {
      entries.push({
        path: relativePath,
        type: dirent.isSymbolicLink() ? 'symlink' : 'file',
        content: dirent.isSymbolicLink() ? fs.readlinkSync(absolutePath) : fs.readFileSync(absolutePath, 'utf8'),
      });
    }
  }
  return entries;
}

function initializeWorkflow(root) {
  const initialized = runCli('bootstrap-project.mjs', ['--target', root, '--write'], root);
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.equal(parseOutput(initialized, '初始化').ok, true);
}

test('五个入口保持合法参数和默认 dry-run 兼容', (t) => {
  const root = createFixture(t);

  const defaultInspect = runCli('inspect-project.mjs', [], root);
  assert.equal(defaultInspect.status, 0, defaultInspect.stderr);
  assert.equal(parseOutput(defaultInspect, '默认项目识别').root, fs.realpathSync(root));

  const defaultBootstrap = runCli('bootstrap-project.mjs', [], root);
  assert.equal(defaultBootstrap.status, 0, defaultBootstrap.stderr);
  const defaultBootstrapOutput = parseOutput(defaultBootstrap, '默认初始化预览');
  assert.equal(defaultBootstrapOutput.write, false);
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false);

  initializeWorkflow(root);

  const legalCalls = [
    {
      label: '显式项目识别',
      script: 'inspect-project.mjs',
      args: ['--target', root],
      expectedStatus: 0,
      assertOutput: (output) => assert.equal(output.root, fs.realpathSync(root)),
    },
    {
      label: '健康检查',
      script: 'check-project.mjs',
      args: ['--target', root],
      expectedStatus: 0,
      assertOutput: (output) => assert.equal(output.ok, true),
    },
    {
      label: '深度受管初始化预览',
      script: 'bootstrap-project.mjs',
      args: ['--target', root, '--deep', '--update-managed', '--only-managed'],
      expectedStatus: 0,
      assertOutput: (output) => assert.equal(output.write, false),
    },
    {
      label: '深度升级预览',
      script: 'update-project.mjs',
      args: ['--target', root, '--deep'],
      expectedStatus: 0,
      assertOutput: (output) => assert.equal(output.write, false),
    },
    {
      label: '非旧布局迁移',
      script: 'migrate-wayfinder-project.mjs',
      args: ['--target', root, '--write'],
      expectedStatus: 1,
      assertOutput: (output) => assert.equal(output.layout, 'wayfinder'),
    },
  ];

  for (const call of legalCalls) {
    const before = snapshotTree(root);
    const result = runCli(call.script, call.args, root);
    assert.equal(result.status, call.expectedStatus, `${call.label}: ${result.stderr}`);
    call.assertOutput(parseOutput(result, call.label));
    if (call.script === 'migrate-wayfinder-project.mjs') {
      assert.deepEqual(snapshotTree(root), before, '非旧布局迁移不得修改文件');
    }
  }
});

test('五个入口拒绝未知参数且不修改目标项目', (t) => {
  const root = createFixture(t);
  initializeWorkflow(root);

  for (const cliCase of CLI_CASES) {
    const before = snapshotTree(root);
    const args = cliCase.writeCapable ? ['--write', '--bogus'] : ['--bogus'];
    const result = runCli(cliCase.script, args, root);
    assert.notEqual(result.status, 0, `${cliCase.id} 应拒绝未知参数`);
    assert.match(result.stderr, /不支持的参数：--bogus/u, cliCase.id);
    assert.equal(result.stdout, '', `${cliCase.id} 参数失败不得输出项目 JSON`);
    assert.deepEqual(snapshotTree(root), before, `${cliCase.id} 参数失败不得修改文件`);
  }
});

test('五个入口拒绝缺失、空白和选项令牌目标值', (t) => {
  const root = createFixture(t);
  initializeWorkflow(root);
  const invalidTargetArgs = [
    ['--target'],
    ['--target', ''],
    ['--target', '--write'],
    ['--write', '--target'],
  ];

  for (const cliCase of CLI_CASES) {
    const applicableArgs = cliCase.writeCapable ? invalidTargetArgs : invalidTargetArgs.slice(0, -1);
    for (const args of applicableArgs) {
      const before = snapshotTree(root);
      const result = runCli(cliCase.script, args, root);
      assert.notEqual(result.status, 0, `${cliCase.id} 应拒绝 ${JSON.stringify(args)}`);
      assert.match(result.stderr, /参数 --target 缺少值/u, `${cliCase.id}: ${JSON.stringify(args)}`);
      assert.equal(result.stdout, '', `${cliCase.id} 目标值失败不得输出项目 JSON`);
      assert.deepEqual(snapshotTree(root), before, `${cliCase.id} 目标值失败不得修改文件`);
    }
  }
});
