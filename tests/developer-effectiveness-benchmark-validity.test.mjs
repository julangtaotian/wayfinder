import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  collectSourceBaseline,
  comparablePathsEqual,
  detectExecutionRoute,
  freezeSyntheticCases,
  snapshotPluginTree,
  validateSyntheticCase,
  verifyComparisonSnapshots,
} from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark-foundation.mjs';
import { buildCodexInvocation } from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark-process.mjs';
import { validateDeliveryScope } from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark-execution.mjs';
import { runBoundedProcess } from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark-process.mjs';
import { executeCaseRun, preflightOneCase } from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark.mjs';

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

function makeCandidate({ evaluatorKind = 'behavior', expectedRoute = 'direct', projectId = 'P1', complexity = 'small' } = {}) {
  const id = `SYN-${projectId}-${{ small: 'S01', medium: 'M01', large: 'L01' }[complexity]}`;
  const evaluator = `.benchmark-evaluator/${id}.test.mjs`;
  const assertions = evaluatorKind === 'source-slice'
    ? [
      "const source = readFileSync(new URL('../src/value.js', import.meta.url), 'utf8');",
      "assert.match(source.slice(0, 40), /value = 1/);",
    ]
    : evaluatorKind === 'source-answer'
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
    makeCandidate({ projectId: 'P1', complexity: 'small', expectedRoute: 'direct' }),
    makeCandidate({ projectId: 'P1', complexity: 'large', expectedRoute: 'complex' }),
    makeCandidate({ projectId: 'P2', complexity: 'medium', expectedRoute: 'light' }),
    makeCandidate({ projectId: 'P2', complexity: 'large', expectedRoute: 'complex' }),
    makeCandidate({ projectId: 'P3', complexity: 'small', expectedRoute: 'direct' }),
    makeCandidate({ projectId: 'P3', complexity: 'medium', expectedRoute: 'light' }),
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
    eventText: 'loaded frontend-ai-workflow:frontend-delivery',
    finalRoute: 'baseline',
    changedPaths: ['src/value.js'],
  });
  assert.equal(contaminated.valid, false);
  assert.equal(contaminated.code, 'baseline_plugin_contamination');
  assert.equal(contaminated.evidence.pluginSkillEvidence, true);
});

test('[TC-02A] 双版本首轮和续轮只启用对应插件', () => {
  const common = {
    entry: 'codex', workspace: '/tmp/基准 workspace', model: 'gpt-test', reasoning: 'medium',
    prompt: '执行', schemaPath: '/tmp/schema.json', outputPath: '/tmp/result.json', comparison: 'old-plugin',
  };
  for (const sessionId of [null, 'session-1']) {
    for (const mode of ['plugin', 'baseline']) {
      const invocation = buildCodexInvocation({ ...common, mode, sessionId });
      const joined = invocation.args.join(' ');
      assert.match(joined, /--ignore-user-config --enable plugins --enable skip_host_skill_discovery/u);
      assert.match(joined, new RegExp(`frontend-ai-workflow@frontend-ai-workflow.enabled=${mode === 'plugin'}`, 'u'));
      assert.match(joined, new RegExp(`frontend-ai-workflow@p9-old-plugin.enabled=${mode === 'baseline'}`, 'u'));
      assert.equal(invocation.args.includes('--disable'), false);
      if (sessionId) assert.match(joined, /sandbox_mode="workspace-write"/u);
      else assert.equal(invocation.args.includes('--approve-for-me'), true);
    }
  }
});

test('[TC-02B] 旧版原生 Skill、管理产物和跨侧污染分别判定', () => {
  const fast = detectExecutionRoute({
    mode: 'baseline', comparison: 'old-plugin', finalRoute: 'legacy-fast-change',
    eventText: 'read frontend-fast-change/SKILL.md', changedPaths: ['src/value.js'],
  });
  assert.equal(fast.valid, true);
  const managed = detectExecutionRoute({
    mode: 'baseline', comparison: 'old-plugin', finalRoute: 'legacy-managed-change',
    eventText: 'read frontend-change/SKILL.md', changedPaths: ['src/value.js', 'openspec/changes/example/tasks.md'],
  });
  assert.equal(managed.valid, true);
  assert.equal(detectExecutionRoute({
    mode: 'baseline', comparison: 'old-plugin', finalRoute: 'legacy-fast-change',
    eventText: 'read frontend-fast-change/SKILL.md and frontend-delivery/SKILL.md', changedPaths: ['src/value.js'],
  }).code, 'legacy_new_plugin_contamination');
  assert.equal(detectExecutionRoute({
    mode: 'plugin', finalRoute: 'direct', expectedRoute: 'direct',
    eventText: 'read frontend-delivery/SKILL.md and frontend-change/SKILL.md', changedPaths: ['src/value.js'],
  }).valid, false);
});

test('[TC-02C] 双版本摘要包含未跟踪文件并拒绝安装漂移', (context) => {
  fs.mkdirSync(testOutputRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(testOutputRoot, 'plugin-snapshot-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const oldSource = path.join(root, 'old-source');
  const oldInstall = path.join(root, 'old-install');
  for (const directory of [oldSource, oldInstall]) {
    write(path.join(directory, '.codex-plugin', 'plugin.json'), '{"name":"frontend-ai-workflow","version":"old"}\n');
    write(path.join(directory, 'skills', 'frontend-change', 'SKILL.md'), '# 旧版\n');
  }
  const candidateInstall = path.join(repositoryRoot, 'plugins', 'frontend-ai-workflow');
  const options = { oldSource, oldInstall, candidateInstall, oldSourceDigest: snapshotPluginTree(oldSource).digest };
  const verified = verifyComparisonSnapshots(repositoryRoot, options);
  assert.equal(verified.summaries.old.fileCount, 2);
  write(path.join(oldInstall, 'untracked.txt'), '未跟踪输入也必须计入摘要\n');
  assert.throws(() => verifyComparisonSnapshots(repositoryRoot, options), (error) => error.code === 'plugin_snapshot_mismatch');
});

test('[TC-02D] 双版本失败验收后沿原生路线续轮返工并保留完整用量', async (context) => {
  const fixture = makeFixture(context, 'dual-version-rework');
  const candidate = freezeSyntheticCases([
    makeCandidate(), makeCandidate({ complexity: 'large', expectedRoute: 'complex' }),
  ], '2026-09-24T00:00:00.000Z', ['P1']).cases.find((item) => item.id === 'SYN-P1-S01');
  const config = {
    repositoryRoot,
    runRoot: path.join(fixture.root, 'run'),
    codex: 'codex',
    model: 'gpt-test',
    reasoning: 'medium',
    timeoutMinutes: 1,
    comparison: 'old-plugin',
  };
  for (const mode of ['baseline', 'plugin']) {
    let turnCount = 0;
    const nativeRoute = mode === 'baseline' ? 'legacy-fast-change' : 'direct';
    const skill = mode === 'baseline' ? 'frontend-fast-change/SKILL.md' : 'frontend-ai-workflow:frontend-delivery';
    const result = await executeCaseRun({
      config,
      sourceProject: fixture.project,
      sourceBaseline: fixture.baseline,
      runSource: { project: fixture.project, baseline: fixture.baseline },
      candidate,
      mode,
      schemas: { execution: path.join(fixture.root, 'schema.json') },
      baselines: [fixture.baseline],
      operations: {
        runProcess: async (invocation) => {
          turnCount += 1;
          // 首轮交付故意违反验收；续轮修复同一文件，检验真实返工闭环。
          write(path.join(invocation.cwd, 'src', 'value.js'), `export const value = ${turnCount === 1 ? 2 : 1};\n`);
          const events = [
            { type: 'thread.started', thread_id: `${mode}-session` },
            { type: 'item.completed', item: { type: 'command_execution', command: `read ${skill}` } },
            { type: 'turn.completed', usage: {
              input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 2,
            } },
          ];
          return {
            exitCode: 0, launchError: false, timedOut: false, interrupted: false,
            stdoutTruncated: false, stderrTruncated: false,
            stdout: `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, stderr: '',
            finalResponse: { status: 'delivered', summary: '已完成', route: nativeRoute, question: '', blockerCode: '', blockerCategory: '' },
          };
        },
        runAcceptanceProcess: (invocation) => runBoundedProcess(invocation),
      },
    });
    assert.equal(result.runResult.status, 'passed');
    assert.equal(result.runResult.routeValid, true);
    assert.equal(result.runResult.firstAcceptancePassed, false);
    assert.equal(result.runResult.finalAcceptancePassed, true);
    assert.equal(result.runResult.reworkCount, 1);
    assert.equal(result.runResult.turns.length, 2);
    assert.equal(result.runResult.tokenUsage.status, 'available');
    assert.equal(result.runResult.tokenUsage.totalTokens, 220);
    assert.deepEqual(result.runResult.turns.map((turn) => turn.tokenUsage.nonCachedInputTokens), [80, 80]);
    assert.equal(result.metrics.effective, true, JSON.stringify(result.metrics));
  }
});

test('[TC-02E] 跨平台路径和无 shell 子进程保持稳定诊断', async (context) => {
  const fixture = makeFixture(context, '跨平台空格').root;
  assert.equal(comparablePathsEqual('d:/Workspace/demo/', 'D:\\Workspace\\demo', 'win32'), true);
  assert.equal(comparablePathsEqual('/tmp/demo/', '/tmp/demo', 'posix'), true);
  const initial = buildCodexInvocation({
    entry: path.join(fixture, 'codex cli.mjs'), workspace: fixture, model: 'gpt-test', reasoning: 'medium',
    prompt: '执行', schemaPath: path.join(fixture, 'schema.json'), outputPath: path.join(fixture, 'result.json'),
  });
  assert.equal(initial.command, process.execPath);
  assert.equal(initial.shell, false);
  assert.equal(initial.args.includes('--color'), true);
  assert.equal(initial.args.includes('--approve-for-me'), true);
  assert.equal(initial.args.includes('--sandbox'), false);
  const readOnly = buildCodexInvocation({
    entry: 'codex', workspace: fixture, model: 'gpt-test', reasoning: 'medium', prompt: '只读分析',
    schemaPath: path.join(fixture, 'schema.json'), outputPath: path.join(fixture, 'result.json'), sandbox: 'read-only',
  });
  assert.equal(readOnly.args.includes('--approve-for-me'), false);
  assert.deepEqual(readOnly.args.slice(readOnly.args.indexOf('--sandbox'), readOnly.args.indexOf('--sandbox') + 2), ['--sandbox', 'read-only']);
  const resumed = buildCodexInvocation({
    entry: 'codex', workspace: fixture, model: 'gpt-test', reasoning: 'medium', prompt: '继续',
    schemaPath: path.join(fixture, 'schema.json'), outputPath: path.join(fixture, 'result.json'), sessionId: 'session-1',
  });
  assert.equal(resumed.args.includes('--color'), false);
  assert.equal(resumed.args.includes('resume'), true);
  assert.match(resumed.args.join(' '), /sandbox_mode="workspace-write".*approval_policy="on-request".*approvals_reviewer="auto_review"/u);
  assert.throws(() => buildCodexInvocation({ entry: 'codex.cmd' }), (error) => error.code === 'windows_wrapper_not_supported');

  const failed = await runBoundedProcess({
    command: process.execPath, args: ['-e', 'process.exit(7)'], cwd: fixture, env: process.env, timeoutMs: 5_000,
  });
  assert.equal(failed.exitCode, 7);
  const timedOut = await runBoundedProcess({
    command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], cwd: fixture, env: process.env, timeoutMs: 30,
  });
  assert.equal(timedOut.timedOut, true);
  const forced = await runBoundedProcess({
    command: process.execPath,
    args: ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
    cwd: fixture,
    env: process.env,
    timeoutMs: 30,
  }, { terminationGraceMs: 30 });
  assert.equal(forced.timedOut, true);
  assert.equal(forced.exitCode, null);
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

test('[TC-05A] 源码切片验收器在冻结前被拒绝', () => {
  assert.throws(
    () => validateSyntheticCase(makeCandidate({ evaluatorKind: 'source-slice' })),
    (error) => error.code === 'unsafe_evaluator_source',
  );
});

test('[TC-05B] 执行代理不能获知或修改冻结验收器', () => {
  const candidate = makeCandidate();
  assert.throws(
    () => validateSyntheticCase({ ...candidate, allowedPaths: [...candidate.allowedPaths, `.benchmark-evaluator/${candidate.id}.test.mjs`] }),
    (error) => error.code === 'case_allowed_paths_include_evaluator',
  );
  assert.throws(
    () => validateDeliveryScope({
      candidate,
      mode: 'plugin',
      route: 'direct',
      changedPaths: ['src/value.js', `.benchmark-evaluator/${candidate.id}.test.mjs`],
    }),
    (error) => error.code === 'agent_scope_violation',
  );
  assert.equal(validateDeliveryScope({
    candidate: { ...candidate, expectedRoute: 'complex' },
    mode: 'plugin',
    route: 'complex',
    changedPaths: ['src/value.js', 'openspec/changes/syn-p1-s01/proposal.md'],
  }).code, 'agent_scope_confirmed');
  assert.throws(
    () => validateDeliveryScope({
      candidate: { ...candidate, expectedRoute: 'complex' },
      mode: 'plugin',
      route: 'complex',
      changedPaths: ['src/value.js', 'requirements/leak.md'],
    }),
    (error) => error.code === 'agent_scope_violation',
  );
});

test('[TC-06] 完整矩阵缺少任一实施路线时在冻结阶段失败', () => {
  const allFast = makeMatrix().map((candidate) => ({ ...candidate, expectedRoute: 'direct' }));
  assert.throws(
    () => freezeSyntheticCases(allFast, '2026-09-17T00:00:00.000Z'),
    (error) => error.code === 'case_route_matrix_incomplete',
  );
  const noComplex = makeMatrix().map((candidate) => ({
    ...candidate,
    expectedRoute: candidate.expectedRoute === 'complex' ? 'light' : candidate.expectedRoute,
  }));
  assert.throws(
    () => freezeSyntheticCases(noComplex, '2026-09-17T00:00:00.000Z'),
    (error) => error.code === 'case_route_matrix_incomplete',
  );
  const noLight = makeMatrix().map((candidate) => ({
    ...candidate,
    expectedRoute: candidate.expectedRoute === 'light' ? 'complex' : candidate.expectedRoute,
  }));
  assert.throws(
    () => freezeSyntheticCases(noLight, '2026-09-17T00:00:00.000Z'),
    (error) => error.code === 'case_route_matrix_incomplete',
  );
  const smokeProject = makeMatrix().filter((candidate) => candidate.projectId === 'P1').map((candidate) => ({ ...candidate, expectedRoute: 'direct' }));
  assert.equal(freezeSyntheticCases(smokeProject, '2026-09-17T00:00:00.000Z', ['P1']).caseCount, 2);
});

test('[TC-07] 实际路线与冻结路线不一致时样本无效', () => {
  const mismatch = detectExecutionRoute({
    mode: 'plugin',
    eventText: 'frontend-ai-workflow:frontend-delivery',
    finalRoute: 'direct',
    expectedRoute: 'complex',
    changedPaths: ['src/value.js'],
  });
  assert.equal(mismatch.valid, false);
  assert.equal(mismatch.code, 'plugin_route_mismatch');
});

test('Direct、Light 与 Complex 使用同一交付入口并遵守产物边界', () => {
  const direct = detectExecutionRoute({
    mode: 'plugin',
    eventText: 'frontend-ai-workflow:frontend-delivery',
    finalRoute: 'direct',
    expectedRoute: 'direct',
    changedPaths: ['src/value.js'],
  });
  const light = detectExecutionRoute({
    mode: 'plugin',
    eventText: 'frontend-ai-workflow:frontend-delivery',
    finalRoute: 'light',
    expectedRoute: 'light',
    changedPaths: ['src/value.js', 'src/caller.js'],
  });
  const complex = detectExecutionRoute({
    mode: 'plugin',
    eventText: 'frontend-ai-workflow:frontend-delivery',
    finalRoute: 'complex',
    expectedRoute: 'complex',
    changedPaths: ['openspec/changes/a/proposal.md'],
  });
  const forbiddenManagement = detectExecutionRoute({
    mode: 'plugin',
    eventText: 'frontend-ai-workflow:frontend-delivery',
    finalRoute: 'light',
    expectedRoute: 'light',
    changedPaths: ['openspec/changes/a/proposal.md'],
  });

  assert.equal(direct.valid, true);
  assert.equal(light.valid, true);
  assert.equal(complex.valid, true);
  assert.equal(forbiddenManagement.valid, false);
  assert.equal(forbiddenManagement.code, 'plugin_route_evidence_missing');
});

test('[TC-09] 基准兼容入口保持单向模块边界', () => {
  const limits = new Map([
    ['developer-effectiveness-benchmark.mjs', 500],
    ['developer-effectiveness-benchmark-case-bundle.mjs', 220],
    ['developer-effectiveness-benchmark-execution.mjs', 500],
    ['developer-effectiveness-benchmark-foundation.mjs', 600],
    ['developer-effectiveness-benchmark-cases.mjs', 350],
    ['developer-effectiveness-benchmark-contract.mjs', 220],
  ]);
  const sources = new Map();
  for (const [file, limit] of limits) {
    const source = fs.readFileSync(path.join(repositoryRoot, 'plugins', 'frontend-ai-workflow', 'scripts', file), 'utf8');
    sources.set(file, source);
    assert.equal(source.trimEnd().split(/\r?\n/u).length <= limit, true, `${file} 超过 ${limit} 行`);
  }

  assert.match(sources.get('developer-effectiveness-benchmark.mjs'), /from '\.\/developer-effectiveness-benchmark-execution\.mjs'/u);
  assert.match(sources.get('developer-effectiveness-benchmark-foundation.mjs'), /from '\.\/developer-effectiveness-benchmark-cases\.mjs'/u);
  assert.match(sources.get('developer-effectiveness-benchmark-foundation.mjs'), /from '\.\/developer-effectiveness-benchmark-contract\.mjs'/u);
  assert.doesNotMatch(sources.get('developer-effectiveness-benchmark-execution.mjs'), /from '\.\/developer-effectiveness-benchmark\.mjs'/u);
  assert.doesNotMatch(sources.get('developer-effectiveness-benchmark-case-bundle.mjs'), /from '\.\/developer-effectiveness-benchmark\.mjs'/u);
  assert.doesNotMatch(sources.get('developer-effectiveness-benchmark-cases.mjs'), /from '\.\/developer-effectiveness-benchmark-foundation\.mjs'/u);
  assert.doesNotMatch(sources.get('developer-effectiveness-benchmark-contract.mjs'), /developer-effectiveness-benchmark-(?:foundation|cases|execution)\.mjs/u);
});
