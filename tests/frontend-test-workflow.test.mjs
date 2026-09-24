import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { inspectTestContext } from '../plugins/frontend-ai-workflow/scripts/inspect-test-context.mjs';
import {
  parseFrontendTestRuntimeArgs,
  prepareFrontendTestRuntime,
  resolveFrontendTestRuntimeFixture,
  resolveNpmInvocation,
} from '../scripts/prepare-frontend-test-runtime.mjs';
import {
  cleanupFrontendTestCache,
  cleanupFrontendTestRuntime,
} from '../scripts/cleanup-frontend-test-runtime.mjs';
import { runFrontendTestRuntimeSmoke } from '../scripts/frontend-test-runtime-smoke.mjs';
import {
  parseVerificationArgs,
  runVerification,
} from '../scripts/verify.mjs';

function writeFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function createFixture(t, { testScript = 'vitest run' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-test-workflow-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFile(root, 'package.json', `${JSON.stringify({
    name: 'vue-vitest-fixture',
    scripts: testScript ? { test: testScript } : {},
    dependencies: { vue: '^3.5.0' },
    devDependencies: { vite: '^6.0.0', vitest: '^3.0.0' },
  }, null, 2)}\n`);
  writeFile(root, 'vitest.config.js', "export default { test: { environment: 'node' } };\n");
  writeFile(root, 'src/math.js', 'export const add = (left, right) => left + right;\n');
  writeFile(root, 'tests/existing.spec.js', "import { test } from 'vitest';\ntest('existing', () => {});\n");
  writeFile(root, 'tests/snapshot.generated.spec.js', "export default 'baseline';\n");
  return { root };
}

test('[TC-01] 测试上下文只读识别 Vue 3、Vitest、手写测试和生成基线', (t) => {
  const fixture = createFixture(t);
  writeFile(fixture.root, 'outputs/legacy/tests/ignored.test.js', "throw new Error('不应读取');\n");
  writeFile(fixture.root, '.frontend-ai-workflow/runs/tests/ignored.test.js', "throw new Error('不应读取');\n");
  writeFile(fixture.root, 'openspec/changes/archive/old/tests/ignored.test.js', "throw new Error('不应读取');\n");
  const packageBefore = fs.readFileSync(path.join(fixture.root, 'package.json'), 'utf8');
  const context = inspectTestContext(fixture.root);
  assert.equal(context.preset, 'vue3-vite');
  assert.equal(context.testCommand.status, 'detected');
  assert.equal(context.runner.name, 'Vitest');
  assert.equal(context.runner.certification, 'verified-vue3-vite-vitest');
  assert.deepEqual(context.handwrittenTests, ['tests/existing.spec.js']);
  assert.deepEqual(context.generatedBaselines, ['tests/snapshot.generated.spec.js']);
  assert.equal(context.testFiles.some((file) => file.includes('ignored.test.js')), false);
  assert.equal(context.scan.sourceContentRead, false);
  assert.equal(fs.readFileSync(path.join(fixture.root, 'package.json'), 'utf8'), packageBefore);
});

test('测试命令优先于仅用于开发验证的 runner 依赖', (t) => {
  const fixture = createFixture(t, { testScript: 'node --test' });
  const context = inspectTestContext(fixture.root);
  assert.equal(context.runner.name, 'Node Test Runner');
  assert.equal(context.runner.source, 'script');
  assert.equal(context.runner.certification, 'project-evidence-only');
});

test('[TC-09] 测试启动脚本不计入测试文件', (t) => {
  const outputsRoot = path.resolve('.frontend-ai-workflow', 'runs', 'frontend-test-workflow-fixtures');
  fs.mkdirSync(outputsRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(outputsRoot, 'frontend-test-launcher-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFile(root, 'package.json', `${JSON.stringify({
    name: 'test-launcher-fixture',
    scripts: { test: 'node scripts/test.js' },
    devDependencies: { jest: '^29.0.0' },
  }, null, 2)}\n`);
  writeFile(root, 'yarn.lock', '# fixture\n');
  writeFile(root, 'scripts/test.js', "process.stdout.write('launcher');\n");
  writeFile(root, 'scripts/spec.js', "process.stdout.write('launcher');\n");
  writeFile(root, 'test.js', "process.stdout.write('root launcher');\n");
  writeFile(root, 'tests/test.js', "export default 'directory test';\n");
  writeFile(root, 'src/component.test.tsx', "export default 'suffix test';\n");
  writeFile(root, 'specs/component.spec.mjs', "export default 'suffix spec';\n");
  assert.equal(spawnSync('git', ['init', '-q', root], { encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync('git', ['-C', root, 'add', '.'], { encoding: 'utf8' }).status, 0);

  const context = inspectTestContext(root);
  assert.equal(context.testCommand.status, 'detected');
  assert.equal(context.testCommand.executed, false);
  assert.equal(context.runner.name, 'Jest');
  assert.equal(context.runner.source, 'dependency');
  assert.deepEqual(context.testFiles, [
    'specs/component.spec.mjs',
    'src/component.test.tsx',
    'tests/test.js',
  ]);
  assert.deepEqual(context.handwrittenTests, context.testFiles);
  assert.deepEqual(context.git.trackedTests, context.testFiles);
  assert.equal(context.scan.sourceContentRead, false);
});

test('frontend-test Skill 保持显式测试入口和最低充分验证边界', () => {
  const skill = fs.readFileSync(
    path.resolve('plugins/frontend-ai-workflow/skills/frontend-test/SKILL.md'),
    'utf8',
  );
  assert.match(skill, /explicitly asks for test work/u);
  assert.match(skill, /Do not use for ordinary product-code implementation/u);
  assert.match(skill, /zero-test result is a failure/iu);
  assert.match(skill, /frontend-ui-review/u);
  assert.doesNotMatch(skill, /test-plan|verification-evidence|D-\*|A-\*|V-\*/u);
});

test('[TC-07] Windows npm 使用 JS 入口准备验证运行时', (t) => {
  const fixtureRoot = path.resolve('.frontend-ai-workflow', 'runs', 'frontend-test-workflow-fixtures');
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureRoot, 'frontend-test-prepare-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const npmEntry = path.resolve(root, 'virtual', 'npm-cli.js');
  const nodePath = path.resolve(root, 'virtual', 'node.exe');
  const invocation = resolveNpmInvocation({
    platform: 'win32',
    environment: { npm_execpath: npmEntry },
    nodePath,
    fileExists: (target) => target === npmEntry,
  });
  assert.deepEqual(invocation, {
    command: nodePath,
    args: [npmEntry],
    source: 'npm_execpath',
  });

  let executed = null;
  const prepared = prepareFrontendTestRuntime({
    repositoryRoot: root,
    platform: 'win32',
    environment: { npm_execpath: npmEntry },
    nodePath,
    fileExists: (target) => target === npmEntry || target.endsWith(path.join('vitest', 'vitest.mjs')),
    execute: (command, args, options) => {
      executed = { command, args, options };
      return { status: 0 };
    },
    report: () => {},
  });
  assert.equal(executed.command, nodePath);
  assert.equal(executed.args[0], npmEntry);
  assert.equal(executed.args.includes('ci'), true);
  assert.equal(executed.command.endsWith('npm.cmd'), false);
  assert.equal(prepared.npmSource, 'npm_execpath');
  assert.ok(prepared.runtimeRoot.startsWith(path.join(root, '.frontend-ai-workflow', 'runs')));
});

test('[TC-12] 锁定输入与缓存路径', (t) => {
  const fixtureRoot = path.resolve('.frontend-ai-workflow', 'runs', 'frontend-test-workflow-fixtures');
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureRoot, 'frontend-test-runtime-locked-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let executed = null;
  const prepared = prepareFrontendTestRuntime({
    repositoryRoot: root,
    platform: 'linux',
    fileExists: (target) => target.endsWith(path.join('vitest', 'vitest.mjs')),
    execute: (command, args, options) => {
      executed = { command, args, options };
      return { status: 0 };
    },
    report: () => {},
  });
  const fixture = resolveFrontendTestRuntimeFixture();

  assert.equal(executed.command, 'npm');
  assert.equal(executed.args.includes('ci'), true);
  assert.equal(executed.args.includes('install'), false);
  assert.equal(executed.args.includes('--prefer-offline'), true);
  assert.equal(executed.options.env.npm_config_cache, prepared.cacheRoot);
  assert.equal(prepared.cacheRoot, path.join(root, '.frontend-ai-workflow', 'cache', 'frontend-test-cache'));
  assert.equal(fs.readFileSync(path.join(prepared.runtimeRoot, 'package.json'), 'utf8'), fs.readFileSync(path.join(fixture.root, 'package.json'), 'utf8'));
  assert.equal(fs.readFileSync(path.join(prepared.runtimeRoot, 'package-lock.json'), 'utf8'), fs.readFileSync(path.join(fixture.root, 'package-lock.json'), 'utf8'));
  assert.equal(fs.existsSync(path.join(root, 'node_modules')), false);
});

test('[TC-13] 显式离线模式失败关闭', (t) => {
  const fixtureRoot = path.resolve('.frontend-ai-workflow', 'runs', 'frontend-test-workflow-fixtures');
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureRoot, 'frontend-test-runtime-offline-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let args = null;
  const prepared = prepareFrontendTestRuntime({
    repositoryRoot: root,
    platform: 'linux',
    offline: true,
    fileExists: (target) => target.endsWith(path.join('vitest', 'vitest.mjs')),
    execute: (_command, receivedArgs) => {
      args = receivedArgs;
      return { status: 0 };
    },
    report: () => {},
  });
  assert.equal(prepared.offline, true);
  assert.equal(args.includes('--offline'), true);
  assert.deepEqual(parseFrontendTestRuntimeArgs(['--offline']), { offline: true });
  assert.throws(
    () => parseFrontendTestRuntimeArgs(['--offline', '--offline']),
    (error) => error.code === 'frontend_test_runtime_argument_invalid' && error.status === 1,
  );
  assert.throws(
    () => prepareFrontendTestRuntime({
      repositoryRoot: root,
      platform: 'linux',
      offline: true,
      execute: () => ({ status: 17 }),
      report: () => {},
    }),
    (error) => error.code === 'frontend_test_runtime_prepare_failed'
      && error.target === path.join(root, '.frontend-ai-workflow', 'runs', 'frontend-test-runtime')
      && error.status === 17,
  );
});

test('[TC-16] 离线运行时 smoke 只执行一个固定最小测试并清理运行时', (t) => {
  const root = path.resolve('.');
  const lifecycle = [];
  const calls = [];
  const result = runFrontendTestRuntimeSmoke({
    repositoryRoot: root,
    prepareRuntime: () => {
      lifecycle.push('prepare-offline');
      return { vitestEntry: path.join(root, 'fixture-vitest.mjs') };
    },
    cleanupRuntime: () => lifecycle.push('cleanup'),
    execute: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0, stdout: '1 passed', stderr: '' };
    },
  });

  assert.deepEqual(result, {
    ok: true,
    code: 'frontend_test_runtime_smoke_passed',
    offline: true,
    test: 'TC-03',
    status: 0,
  });
  assert.deepEqual(lifecycle, ['prepare-offline', 'cleanup']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.includes('TC-03'), true);
  assert.equal(calls[0].args.includes('run'), true);
});

test('[TC-03] 运行时与缓存的分离清理', (t) => {
  const fixtureRoot = path.resolve('.frontend-ai-workflow', 'runs', 'frontend-test-workflow-fixtures');
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureRoot, 'frontend-test-runtime-cleanup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runtimeRoot = path.join(root, '.frontend-ai-workflow', 'runs', 'frontend-test-runtime');
  const cacheRoot = path.join(root, '.frontend-ai-workflow', 'cache', 'frontend-test-cache');
  const persistentEvidence = path.join(root, 'proof', 'persistent-evidence', 'result.txt');
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.mkdirSync(cacheRoot, { recursive: true });
  fs.mkdirSync(path.dirname(persistentEvidence), { recursive: true });
  fs.writeFileSync(path.join(runtimeRoot, 'runtime.txt'), 'runtime\n', 'utf8');
  fs.writeFileSync(path.join(cacheRoot, 'cache.txt'), 'cache\n', 'utf8');
  fs.writeFileSync(persistentEvidence, 'evidence\n', 'utf8');

  cleanupFrontendTestRuntime({ repositoryRoot: root, report: () => {} });
  assert.equal(fs.existsSync(runtimeRoot), false);
  assert.equal(fs.existsSync(cacheRoot), true);
  assert.equal(fs.existsSync(persistentEvidence), true);

  cleanupFrontendTestCache({ repositoryRoot: root, report: () => {} });
  assert.equal(fs.existsSync(cacheRoot), false);
  assert.equal(fs.existsSync(persistentEvidence), true);
});

test('[TC-14] 统一验证传播离线选项', (t) => {
  const fixturesRoot = path.resolve('.frontend-ai-workflow', 'runs', 'frontend-test-runtime-verify');
  fs.mkdirSync(fixturesRoot, { recursive: true });
  const root = fs.realpathSync(fs.mkdtempSync(path.join(fixturesRoot, 'fixture-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  for (const name of [
    'ordinary.test.mjs',
    'platform-marketplace-install.test.mjs',
    'platform-package-runtime.test.mjs',
    'project-platform-profile.test.mjs',
    'ui-review-automation.test.mjs',
    'ui-review-platform-runtime.test.mjs',
    'workflow-trust-boundary.test.mjs',
  ]) {
    fs.writeFileSync(path.join(root, 'tests', name), 'export {};\n', 'utf8');
  }
  let prepared = null;
  const result = runVerification({
    repositoryRoot: root,
    scope: 'shared',
    offline: true,
    prepareRuntime: (_root, options) => {
      prepared = options;
    },
    cleanupRuntime: () => {},
    execute: () => ({ status: 0 }),
    environment: {},
    report: () => {},
    reportError: () => {},
  });

  assert.deepEqual(parseVerificationArgs(['--offline', '--scope', 'shared']), { scope: 'shared', offline: true });
  assert.throws(
    () => parseVerificationArgs(['--offline', '--offline']),
    (error) => error.code === 'verification_offline_duplicate' && error.status === 1,
  );
  assert.deepEqual(prepared, { offline: true });
  assert.equal(result.ok, true);
  assert.equal(result.offline, true);
});

test('[TC-15] Vue Vitest fixture 真实发现 TC，零测试失败且重复执行不改文件', (t) => {
  const fixtureRoot = path.resolve('tests/fixtures/frontend-test-vue-vitest');
  const vitestEntry = path.resolve('.frontend-ai-workflow/runs/frontend-test-runtime/node_modules/vitest/vitest.mjs');
  const configPath = path.join(fixtureRoot, 'vitest.config.mjs');
  const testPath = path.join(fixtureRoot, 'tests/math.spec.js');
  const sourceBefore = fs.readFileSync(testPath, 'utf8');
  assert.equal(fs.existsSync(path.resolve('node_modules/vitest/vitest.mjs')), false, '根目录不得保留验证专用 Vitest');
  if (!fs.existsSync(vitestEntry)) {
    t.skip('未准备固定 Vitest 运行时');
    return;
  }
  const context = inspectTestContext(fixtureRoot);
  assert.equal(context.runner.certification, 'verified-vue3-vite-vitest');
  assert.deepEqual(context.handwrittenTests, ['tests/math.spec.js']);

  const run = (pattern, target = testPath) => spawnSync(process.execPath, [
    vitestEntry,
    'run',
    '--config',
    configPath,
    '--configLoader',
    'runner',
    '--reporter=verbose',
    '--testNamePattern',
    pattern,
    target,
  ], { cwd: fixtureRoot, encoding: 'utf8' });

  const first = run('TC-03');
  assert.equal(first.status, 0, first.stderr || first.stdout);
  assert.match(`${first.stdout}\n${first.stderr}`, /TC-03/u);
  const second = run('TC-03');
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.equal(fs.readFileSync(testPath, 'utf8'), sourceBefore);
  const zero = run('TC-99', path.join(fixtureRoot, 'tests/missing.spec.js'));
  assert.notEqual(zero.status, 0, '零测试发现不得被记为通过');
});
