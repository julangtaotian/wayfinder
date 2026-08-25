import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { inspectTestContext } from '../plugins/frontend-ai-workflow/scripts/inspect-test-context.mjs';
import { validateTestPlan } from '../plugins/frontend-ai-workflow/scripts/validate-test-plan.mjs';
import { validateDeclaredTestPlan } from '../plugins/frontend-ai-workflow/scripts/check-change.mjs';
import {
  prepareFrontendTestRuntime,
  resolveNpmInvocation,
} from '../scripts/prepare-frontend-test-runtime.mjs';

function writeFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function createFixture(t, { testScript = 'vitest run', revision = 'R-01', verificationResult = '计划' } = {}) {
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
  writeFile(root, 'artifacts/TC-01.txt', 'TC-01 passed\n');
  const requirementPath = writeFile(root, 'requirements/REQ-2026-001-fixture.md', renderRequirement({
    revision,
    verificationResult,
  }));
  const changePath = path.join(root, 'openspec', 'changes', 'add-fixture-test');
  fs.mkdirSync(changePath, { recursive: true });
  writeFile(root, 'openspec/changes/add-fixture-test/.openspec.yaml', 'schema: spec-driven\ntest_plan: required\n');
  return { root, requirementPath, changePath };
}

function renderRequirement({ revision = 'R-01', verificationResult = '计划' } = {}) {
  const extraRevision = revision === 'R-02'
    ? '| R-02 | 2026-08-17 | D-01 | A-01 | 行为修订。 |\n'
    : '';
  const verificationDate = verificationResult === '通过' ? '2026-08-17' : '待执行';
  return `# Fixture requirement

## 基本信息

- 状态：实施中

## 决策台账

| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 加法行为 | 已确认 | 返回两数之和 | fixture |

## 关联变更范围

| 变更 | 决策范围 | 验收范围 |
| --- | --- | --- |
| add-fixture-test | D-01 | A-01 |

## 修订记录

| 修订 | 日期 | 影响决策 | 影响验收 | 验证与任务处理 |
| --- | --- | --- | --- | --- |
| R-01 | 2026-08-17 | D-01 | A-01 | 建立需求。 |
${extraRevision}
## 验证记录

| 验证ID | 验证类型 | 执行内容或环境 | 执行日期 | 结果 | 证据位置 |
| --- | --- | --- | --- | --- | --- |
| V-01 | 自动 | Vitest 聚焦测试 | ${verificationDate} | ${verificationResult} | \`artifacts/TC-01.txt\` |

## 验收标准

- [ ] [A-01] add(1, 2) 返回 3。
`;
}

function renderPlan({
  baseline = 'R-01',
  planStatus = '就绪',
  caseStatus = '计划',
  target = 'tests/math.spec.js',
  result = '未执行',
  evidence = '待执行',
  duplicate = false,
} = {}) {
  const caseBlock = (id = 'TC-01') => `### ${id}：两数相加

- 状态：${caseStatus}
- 优先级：P1
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-01
- 关联验收：A-01
- 关联规格：fixture / 两数相加
- 状态矩阵：用户操作
- 前置条件：加载纯函数模块
- 测试数据：1 与 2
- 测试替身：不适用
- 操作：调用 add(1, 2)
- 可观察断言：返回值严格等于 3
- 目标测试：\`${target}\`
- 测试定位：\`[TC-01] 两数相加\`
- 聚焦命令：\`npm run test -- ${target}\`
- 关联验证：V-01
- 结果分类：${result}
- 证据：${evidence === '待执行' ? evidence : `\`${evidence}\``}
`;
  return `# 测试方案：fixture

## 基本信息

- 状态：${planStatus}
- 需求：\`requirements/REQ-2026-001-fixture.md\`
- 变更：add-fixture-test
- 需求修订基线：${baseline}
- 默认聚焦命令：\`npm run test -- tests/math.spec.js\`

## 测试上下文

- 测试命令状态：detected
- 测试命令：\`npm run test\`
- 测试运行器：Vitest
- 测试目录：\`tests\`
- Git 基线：unavailable
- 兼容说明：Vue 3 + Vite + Vitest fixture。

## 测试用例

${caseBlock()}${duplicate ? caseBlock() : ''}`;
}

function writePlan(fixture, options) {
  return writeFile(fixture.root, 'openspec/changes/add-fixture-test/test-plan.md', renderPlan(options));
}

function validate(fixture, planPath, stage) {
  return validateTestPlan(planPath, {
    requirement: fixture.requirementPath,
    change: fixture.changePath,
    stage,
  });
}

test('[TC-01] 测试上下文只读识别 Vue 3、Vitest、手写测试和生成基线', (t) => {
  const fixture = createFixture(t);
  const packageBefore = fs.readFileSync(path.join(fixture.root, 'package.json'), 'utf8');
  const context = inspectTestContext(fixture.root);
  assert.equal(context.preset, 'vue3-vite');
  assert.equal(context.testCommand.status, 'detected');
  assert.equal(context.runner.name, 'Vitest');
  assert.equal(context.runner.certification, 'verified-vue3-vite-vitest');
  assert.deepEqual(context.handwrittenTests, ['tests/existing.spec.js']);
  assert.deepEqual(context.generatedBaselines, ['tests/snapshot.generated.spec.js']);
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
  const outputsRoot = path.resolve('outputs');
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

test('[TC-02] 三阶段测试方案校验接受完整 TC，并拒绝非法规划输入', async (t) => {
  await t.test('完整方案通过', () => {
    const fixture = createFixture(t);
    const result = validate(fixture, writePlan(fixture), 'plan');
    assert.equal(result.ok, true, result.errors.join('\n'));
    assert.equal(result.caseCount, 1);
    assert.equal(result.automaticCases, 1);
  });
  await t.test('重复 ID 被拒绝', () => {
    const fixture = createFixture(t);
    const result = validate(fixture, writePlan(fixture, { duplicate: true }), 'plan');
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /ID 重复/u);
  });
  await t.test('危险和生成路径被拒绝', () => {
    const fixture = createFixture(t);
    const unsafe = validate(fixture, writePlan(fixture, { target: '../outside.spec.js' }), 'plan');
    assert.match(unsafe.errors.join('\n'), /项目相对路径/u);
    const generated = validate(fixture, writePlan(fixture, { target: 'tests/math.generated.spec.js' }), 'plan');
    assert.match(generated.errors.join('\n'), /不得修改生成测试/u);
  });
});

test('implement 阶段阻止缺失测试命令和过期需求修订', async (t) => {
  await t.test('没有测试命令', () => {
    const fixture = createFixture(t, { testScript: '' });
    const result = validate(fixture, writePlan(fixture), 'implement');
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /detected 测试命令/u);
  });
  await t.test('需求修订晚于方案基线', () => {
    const fixture = createFixture(t, { revision: 'R-02' });
    const result = validate(fixture, writePlan(fixture, { baseline: 'R-01' }), 'implement');
    assert.equal(result.stale, true);
    assert.match(result.errors.join('\n'), /测试方案已过期/u);
  });
});

test('complete 阶段要求真实测试文件、通过状态、V 记录和持久证据', (t) => {
  const fixture = createFixture(t, { verificationResult: '通过' });
  writeFile(fixture.root, 'tests/math.spec.js', "import { test } from 'vitest';\ntest('[TC-01] 两数相加', () => {});\n");
  const result = validate(fixture, writePlan(fixture, {
    planStatus: '已验证',
    caseStatus: '通过',
    result: '通过',
    evidence: 'artifacts/TC-01.txt',
  }), 'complete');
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('[TC-04] 测试方案完成门禁与历史兼容仅对 test_plan: required 的变更生效', (t) => {
  const fixture = createFixture(t);
  const declared = validateDeclaredTestPlan({
    changePath: fixture.changePath,
    requirementPath: fixture.requirementPath,
    stage: 'implement',
  });
  assert.equal(declared.required, true);
  assert.equal(declared.validation, null);
  assert.match(declared.errors.join('\n'), /测试方案不存在/u);

  fs.writeFileSync(path.join(fixture.changePath, '.openspec.yaml'), 'schema: spec-driven\n', 'utf8');
  const historical = validateDeclaredTestPlan({
    changePath: fixture.changePath,
    requirementPath: fixture.requirementPath,
    stage: 'precomplete',
  });
  assert.deepEqual(historical, { required: false, validation: null, errors: [], warnings: [] });
});

test('[TC-05] frontend-test Skill 合同声明四类意图、测试专属写入和 UI Review 交接', () => {
  const skill = fs.readFileSync(
    path.resolve('plugins/frontend-ai-workflow/skills/frontend-test/SKILL.md'),
    'utf8',
  );
  for (const expected of ['Analyze', 'Plan', 'Implement', 'Verify', 'test_plan: required', '$frontend-ui-review']) {
    assert.match(skill, new RegExp(expected.replace('$', '\\$'), 'u'));
  }
  assert.match(skill, /Never modify business source/u);
  assert.match(skill, /zero-test result is blocked/u);
  assert.match(skill, /updates the same case rather than appending a duplicate/u);
});

test('[TC-07] Windows npm 使用 JS 入口准备验证运行时', (t) => {
  const root = fs.mkdtempSync(path.join(path.resolve('outputs'), 'frontend-test-prepare-'));
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
  assert.equal(executed.args.includes('install'), true);
  assert.equal(executed.command.endsWith('npm.cmd'), false);
  assert.equal(prepared.npmSource, 'npm_execpath');
  assert.ok(prepared.runtimeRoot.startsWith(path.join(root, 'outputs')));
});

test('[TC-03] Vue Vitest fixture 真实发现 TC，零测试失败且重复执行不改文件', () => {
  const fixtureRoot = path.resolve('tests/fixtures/frontend-test-vue-vitest');
  const vitestEntry = path.resolve('outputs/frontend-test-runtime/node_modules/vitest/vitest.mjs');
  const configPath = path.join(fixtureRoot, 'vitest.config.mjs');
  const testPath = path.join(fixtureRoot, 'tests/math.spec.js');
  const sourceBefore = fs.readFileSync(testPath, 'utf8');
  assert.equal(fs.existsSync(path.resolve('node_modules/vitest/vitest.mjs')), false, '根目录不得保留验证专用 Vitest');
  assert.equal(fs.existsSync(vitestEntry), true, '请先运行 npm run prepare:test-runtime');
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
