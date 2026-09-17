import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  collectSourceBaseline,
  detectExecutionRoute,
  freezeSyntheticCases,
  validateSyntheticCase,
} from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark-foundation.mjs';
import { buildCodexInvocation } from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark-process.mjs';
import { preflightOneCase } from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark.mjs';

const repositoryRoot = path.resolve('.');
const testOutputRoot = path.join(repositoryRoot, '.frontend-ai-workflow', 'runs', 'developer-effectiveness-benchmark');

function write(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr || `git ${args.join(' ')} 执行失败`);
}

function makeFixture(context, label) {
  fs.mkdirSync(testOutputRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(testOutputRoot, `${label}-`));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, 'source project');
  fs.mkdirSync(projectRoot, { recursive: true });
  git(projectRoot, ['init', '--quiet', '-b', 'main']);
  write(path.join(projectRoot, 'package.json'), '{"name":"validity-fixture","type":"module"}\n');
  write(path.join(projectRoot, 'src', 'value.js'), 'export const value = 1;\n');
  git(projectRoot, ['add', '-A']);
  git(projectRoot, ['-c', 'user.name=Benchmark Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  const project = { id: 'P1', name: 'validity-fixture', root: projectRoot };
  return { root, project, baseline: collectSourceBaseline(project) };
}

function evaluatorPatch(id, assertionLines) {
  const target = `.benchmark-evaluator/${id}.test.mjs`;
  const lines = [
    `diff --git a/${target} b/${target}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${target}`,
    `@@ -0,0 +1,${assertionLines.length} @@`,
    ...assertionLines.map((line) => `+${line}`),
    '',
  ];
  return lines.join('\n');
}

function makeCandidate({ evaluatorKind = 'behavior', expectedRoute = 'fast', projectId = 'P1', complexity = 'small' } = {}) {
  const id = `SYN-${projectId}-${{ small: 'S01', medium: 'M01', large: 'L01' }[complexity]}`;
  const evaluator = `.benchmark-evaluator/${id}.test.mjs`;
  const assertions = evaluatorKind === 'source-answer'
    ? [
      "import assert from 'node:assert/strict';",
      "import fs from 'node:fs';",
      "import test from 'node:test';",
      "const source = fs.readFileSync(new URL('../src/value.js', import.meta.url), 'utf8');",
      `test('${id}', () => assert.equal(source.includes('export const value = 1;'), true));`,
    ]
    : [
      "import assert from 'node:assert/strict';",
      "import test from 'node:test';",
      "import { value } from '../src/value.js';",
      evaluatorKind === 'weak-mutant'
        ? `test('${id}', () => assert.notEqual(value, 0));`
        : `test('${id}', () => assert.equal(value, 1));`,
    ];
  return {
    id,
    projectId,
    title: `${id} 验证语义门禁`,
    complexity,
    taskType: 'bug',
    expectedRoute,
    publicRequirement: '修复当前数值模块的公开导出，使它在所有调用方式下都返回数值一；保持模块路径、导出名称、现有调用方式和离线运行能力不变，不增加依赖，不引入网络访问，并允许任何满足该可观察行为与边界条件的等价实现通过项目聚焦验收。',
    allowedPaths: ['src/value.js'],
    seedPatch: 'diff --git a/src/value.js b/src/value.js\n--- a/src/value.js\n+++ b/src/value.js\n@@ -1 +1 @@\n-export const value = 1;\n+export const value = 0;\n',
    referencePatch: 'diff --git a/src/value.js b/src/value.js\n--- a/src/value.js\n+++ b/src/value.js\n@@ -1 +1 @@\n-export const value = 0;\n+export const value = 1;\n',
    equivalentPatch: 'diff --git a/src/value.js b/src/value.js\n--- a/src/value.js\n+++ b/src/value.js\n@@ -1 +1 @@\n-export const value = 0;\n+export const value = Number(1);\n',
    mutantPatch: 'diff --git a/src/value.js b/src/value.js\n--- a/src/value.js\n+++ b/src/value.js\n@@ -1 +1 @@\n-export const value = 0;\n+export const value = 2;\n',
    evaluatorPatch: evaluatorPatch(id, assertions),
    clarifications: [],
    acceptance: { command: 'node', args: ['--test', evaluator], timeoutMs: 60_000 },
    availabilityChecks: [{ kind: 'file', target: 'src/value.js' }],
    maxReworks: 1,
    maxClarifications: 1,
    requiresExternalSystem: false,
    usesNetwork: false,
  };
}

function makeMatrix() {
  return [
    makeCandidate({ projectId: 'P1', complexity: 'small', expectedRoute: 'fast' }),
    makeCandidate({ projectId: 'P1', complexity: 'large', expectedRoute: 'full' }),
    makeCandidate({ projectId: 'P2', complexity: 'medium', expectedRoute: 'fast' }),
    makeCandidate({ projectId: 'P2', complexity: 'large', expectedRoute: 'full' }),
    makeCandidate({ projectId: 'P3', complexity: 'small', expectedRoute: 'fast' }),
    makeCandidate({ projectId: 'P3', complexity: 'medium', expectedRoute: 'full' }),
  ];
}

async function runPreflight(context, candidate) {
  const fixture = makeFixture(context, 'validity-preflight');
  const validated = validateSyntheticCase(candidate);
  return preflightOneCase({
    config: {
      repositoryRoot,
      runRoot: path.join(fixture.root, 'run'),
      timeoutMinutes: 1,
    },
    project: fixture.project,
    baseline: fixture.baseline,
    candidate: validated,
    baselines: [fixture.baseline],
    operations: {},
  });
}

test('[TC-01] baseline 初始与续轮都关闭插件和宿主技能发现', () => {
  const common = {
    entry: 'codex', workspace: '/tmp/基准 workspace', model: 'gpt-test', reasoning: 'medium', prompt: '执行',
    schemaPath: '/tmp/schema.json', outputPath: '/tmp/result.json', mode: 'baseline',
  };
  for (const invocation of [buildCodexInvocation(common), buildCodexInvocation({ ...common, sessionId: 'session-1' })]) {
    assert.equal(invocation.shell, false);
    assert.equal(invocation.args.includes('--ignore-user-config'), true);
    assert.deepEqual(invocation.args.slice(invocation.args.indexOf('--disable'), invocation.args.indexOf('--disable') + 2), ['--disable', 'plugins']);
    assert.deepEqual(invocation.args.slice(invocation.args.indexOf('--enable'), invocation.args.indexOf('--enable') + 2), ['--enable', 'skip_host_skill_discovery']);
    assert.equal(invocation.cwd, '/tmp/基准 workspace');
  }
  const plugin = buildCodexInvocation({ ...common, mode: 'plugin' });
  assert.equal(plugin.args.includes('--ignore-user-config'), false);
});

test('[TC-02] baseline 事件出现插件技能证据时失败关闭', () => {
  const contaminated = detectExecutionRoute({
    mode: 'baseline',
    eventText: 'loaded frontend-ai-workflow:frontend-fast-change',
    finalRoute: 'baseline',
    changedPaths: ['src/value.js'],
  });
  assert.equal(contaminated.valid, false);
  assert.equal(contaminated.code, 'baseline_plugin_contamination');
  assert.equal(contaminated.evidence.pluginSkillEvidence, true);
});

test('[TC-03] 四态预检允许独立等价实现并拒绝错误变体', async (context) => {
  const result = await runPreflight(context, makeCandidate());
  assert.equal(result.status, 'passed');
  assert.equal(result.qualityStatus, 'behavior-validated');
  assert.deepEqual(result.checks.map((item) => [item.variant, item.passed]), [
    ['seed', false], ['reference', true], ['equivalent', true], ['mutant', false],
  ]);
});

test('[TC-04] 答案匹配 evaluator 无法冻结', async (context) => {
  await assert.rejects(
    runPreflight(context, makeCandidate({ evaluatorKind: 'source-answer' })),
    (error) => error.code === 'case_equivalent_failed',
  );
});

test('[TC-05] 无法拒绝错误变体的 evaluator 无法冻结', async (context) => {
  await assert.rejects(
    runPreflight(context, makeCandidate({ evaluatorKind: 'weak-mutant' })),
    (error) => error.code === 'case_mutant_unexpected_pass',
  );
});

test('[TC-06] 完整矩阵缺少 full 路线时在冻结阶段失败', () => {
  const allFast = makeMatrix().map((candidate) => ({ ...candidate, expectedRoute: 'fast' }));
  assert.throws(
    () => freezeSyntheticCases(allFast, '2026-09-17T00:00:00.000Z'),
    (error) => error.code === 'case_route_matrix_incomplete',
  );
  const smokeProject = makeMatrix().filter((candidate) => candidate.projectId === 'P1').map((candidate) => ({ ...candidate, expectedRoute: 'fast' }));
  assert.equal(freezeSyntheticCases(smokeProject, '2026-09-17T00:00:00.000Z', ['P1']).caseCount, 2);
});

test('[TC-07] 实际路线与冻结路线不一致时样本无效', () => {
  const mismatch = detectExecutionRoute({
    mode: 'plugin',
    eventText: 'frontend-fast-change',
    finalRoute: 'fast',
    expectedRoute: 'full',
    changedPaths: ['src/value.js'],
  });
  assert.equal(mismatch.valid, false);
  assert.equal(mismatch.code, 'plugin_route_mismatch');
});
