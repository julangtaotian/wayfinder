import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  DeveloperEffectivenessBenchmarkError,
  applyUnifiedPatch,
  assertSourceBaselineUnchanged,
  cleanupBoundedWorkspace,
  collectSourceBaseline,
  comparablePathsEqual,
  detectExecutionRoute,
  freezeSyntheticCases,
  prepareCommittedWorkspace,
  scopedBenchmarkProjects,
  sanitizeCapturedOutput,
  validateBenchmarkConfig,
  validateSyntheticCase,
  verifyFrozenCases,
  writeImmutableJson,
  writeImmutableText,
} from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark-foundation.mjs';
import {
  advanceRunState,
  buildBenchmarkSummary,
  buildRunMetrics,
  buildWorkbookImportCsv,
  classifyFalseBlocker,
  createRunState,
} from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark-metrics.mjs';
import {
  buildCodexInvocation,
  runBoundedProcess,
} from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark-process.mjs';
import {
  createBenchmarkPreview,
  executeCaseRun,
  runDeveloperEffectivenessBenchmark,
} from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark.mjs';
import { TEST_GROUPS } from '../scripts/test-groups.mjs';

const repositoryRoot = path.resolve('.');
const testOutputRoot = path.join(repositoryRoot, '.frontend-ai-workflow', 'runs', 'developer-effectiveness-benchmark');

function write(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

// Git 在 Windows 检出为 CRLF 时，源码语义比较统一换行为 LF。
function normalizeLineEndings(content) {
  return String(content).replace(/\r\n/gu, '\n');
}

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr || `git ${args.join(' ')} 执行失败`);
  return result.stdout.trim();
}

function makeFixture(context, label) {
  fs.mkdirSync(testOutputRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(testOutputRoot, `${label}-`));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function makeProject(root, id, { dirty = false } = {}) {
  const projectRoot = path.join(root, id.toLowerCase());
  fs.mkdirSync(projectRoot, { recursive: true });
  git(projectRoot, ['init', '--quiet', '-b', 'main']);
  write(path.join(projectRoot, 'package.json'), `${JSON.stringify({ name: `fixture-${id.toLowerCase()}`, type: 'module' }, null, 2)}\n`);
  write(path.join(projectRoot, 'src', 'value.js'), 'export const value = 1;\n');
  git(projectRoot, ['add', '-A']);
  git(projectRoot, ['-c', 'user.name=Benchmark Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  if (dirty) write(path.join(projectRoot, 'user-uncommitted.txt'), '用户内容不得进入副本\n');
  return { id, name: `fixture-${id.toLowerCase()}`, root: projectRoot };
}

function makeProjects(context, label, { dirtyP1 = false } = {}) {
  const root = makeFixture(context, label);
  return {
    root,
    projects: [
      makeProject(root, 'P1', { dirty: dirtyP1 }),
      makeProject(root, 'P2'),
      makeProject(root, 'P3'),
    ],
  };
}

function caseId(projectId, complexity) {
  return `SYN-${projectId}-${{ small: 'S01', medium: 'M01', large: 'L01' }[complexity]}`;
}

function makeCandidate(projectId, complexity) {
  const id = caseId(projectId, complexity);
  const evaluator = `.benchmark-evaluator/${id}.test.mjs`;
  return {
    id,
    projectId,
    title: `${id} 修复数值回归`,
    complexity,
    taskType: complexity === 'large' ? 'refactor' : 'bug',
    publicRequirement: '修复当前数值模块的默认导出，使它重新返回公开约定的数值一；保持现有模块路径、导出名称和调用方式不变，不增加依赖，并确保项目已有的 Node.js 聚焦测试能够离线通过。',
    allowedPaths: ['src/value.js'],
    seedPatch: [
      'diff --git a/src/value.js b/src/value.js',
      '--- a/src/value.js',
      '+++ b/src/value.js',
      '@@ -1 +1 @@',
      '-export const value = 1;',
      '+export const value = 0;',
      '',
    ].join('\n'),
    referencePatch: [
      'diff --git a/src/value.js b/src/value.js',
      '--- a/src/value.js',
      '+++ b/src/value.js',
      '@@ -1 +1 @@',
      '-export const value = 0;',
      '+export const value = 1;',
      '',
    ].join('\n'),
    evaluatorPatch: [
      `diff --git a/${evaluator} b/${evaluator}`,
      'new file mode 100644',
      '--- /dev/null',
      `+++ b/${evaluator}`,
      '@@ -0,0 +1,4 @@',
      "+import assert from 'node:assert/strict';",
      "+import test from 'node:test';",
      "+import { value } from '../src/value.js';",
      `+test('${id}', () => assert.equal(value, 1));`,
      '',
    ].join('\n'),
    clarifications: [{ pattern: '数值', answer: '公开约定值为数值一，导出名称保持 value。' }],
    acceptance: { command: 'node', args: ['--test', evaluator], timeoutMs: 10_000 },
    availabilityChecks: [{ kind: 'file', target: 'src/value.js' }],
    maxReworks: 1,
    maxClarifications: 1,
    requiresExternalSystem: false,
    usesNetwork: false,
  };
}

function makeCandidates() {
  return [
    makeCandidate('P1', 'small'),
    makeCandidate('P1', 'large'),
    makeCandidate('P2', 'medium'),
    makeCandidate('P2', 'large'),
    makeCandidate('P3', 'small'),
    makeCandidate('P3', 'medium'),
  ];
}

function benchmarkOptions(projects, runId, overrides = {}) {
  return {
    repositoryRoot,
    runId,
    model: 'gpt-test',
    reasoning: 'medium',
    timeoutMinutes: 1,
    projects,
    write: false,
    executeAgents: false,
    ...overrides,
  };
}

function runAcceptance(workspace, candidate) {
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, candidate.acceptance.args, {
    cwd: workspace,
    encoding: 'utf8',
    shell: false,
    env: environment,
  });
}

test('[TC-01] 安全预览固定基线且排除已有未提交内容', (context) => {
  const fixture = makeProjects(context, 'tc01', { dirtyP1: true });
  const runId = `tc01-${path.basename(fixture.root).toLowerCase()}`;
  const { config, baselines, preview } = createBenchmarkPreview(benchmarkOptions(fixture.projects, runId));
  assert.equal(preview.expectedCaseCount, 6);
  assert.equal(preview.expectedRunCount, 12);
  assert.equal(preview.projects[0].existingChangesExcluded, true);
  assert.equal(fs.existsSync(config.runRoot), false);

  const isolated = prepareCommittedWorkspace({
    project: fixture.projects[0],
    baseline: baselines[0],
    runRoot: config.runRoot,
    name: 'p1-clone',
  });
  assert.equal(fs.existsSync(path.join(isolated.workspace, 'user-uncommitted.txt')), false);
  assertSourceBaselineUnchanged(baselines[0], fixture.projects[0]);
  write(path.join(fixture.projects[0].root, 'drift.txt'), '漂移\n');
  assert.throws(
    () => assertSourceBaselineUnchanged(baselines[0], fixture.projects[0]),
    (error) => error.code === 'source_baseline_drifted',
  );
  fs.rmSync(path.join(fixture.projects[0].root, 'drift.txt'));
  assert.equal(cleanupBoundedWorkspace({ runRoot: config.runRoot, workspace: isolated.workspace }).status, 'passed');
  assert.throws(
    () => createBenchmarkPreview({ ...benchmarkOptions(fixture.projects, runId), projects: [{ ...fixture.projects[0], root: path.parse(repositoryRoot).root }, ...fixture.projects.slice(1)] }),
    (error) => error.code === 'dangerous_project_root',
  );
});

test('[TC-02] 模拟需求通过双向预检后冻结', (context) => {
  const fixture = makeProjects(context, 'tc02');
  const manifest = freezeSyntheticCases(makeCandidates(), '2026-09-04T00:00:00.000Z');
  assert.equal(verifyFrozenCases(manifest).manifestDigest, manifest.manifestDigest);
  assert.deepEqual([...new Set(manifest.cases.map((item) => item.complexity))].sort(), ['large', 'medium', 'small']);
  const smokeManifest = freezeSyntheticCases(
    makeCandidates().filter((item) => item.projectId === 'P1'),
    '2026-09-04T00:00:00.000Z',
    ['P1'],
  );
  assert.equal(verifyFrozenCases(smokeManifest).caseCount, 2);
  assert.deepEqual(smokeManifest.projectIds, ['P1']);
  assert.equal(normalizeLineEndings('export const value = 0;\r\n'), 'export const value = 0;\n');

  const project = fixture.projects[0];
  const baseline = collectSourceBaseline(project);
  const candidate = manifest.cases.find((item) => item.projectId === 'P1' && item.complexity === 'small');
  for (const variant of ['seed', 'reference']) {
    const runRoot = path.join(fixture.root, 'outputs');
    const prepared = prepareCommittedWorkspace({ project, baseline, runRoot, category: 'evaluations', name: variant });
    applyUnifiedPatch(prepared.workspace, candidate.seedPatch, 'seed', { env: prepared.environment });
    if (variant === 'reference') applyUnifiedPatch(prepared.workspace, candidate.referencePatch, 'reference', { env: prepared.environment });
    applyUnifiedPatch(prepared.workspace, candidate.evaluatorPatch, 'evaluator', { env: prepared.environment });
    assert.equal(
      normalizeLineEndings(fs.readFileSync(path.join(prepared.workspace, 'src/value.js'), 'utf8')),
      `export const value = ${variant === 'reference' ? 1 : 0};\n`,
    );
    const result = runAcceptance(prepared.workspace, candidate);
    assert.equal(result.status === 0, variant === 'reference', `${result.stdout}\n${result.stderr}`);
    cleanupBoundedWorkspace({ runRoot, workspace: prepared.workspace });
  }
  assert.throws(() => freezeSyntheticCases([...makeCandidates().slice(0, 5), makeCandidates()[0]]), (error) => error.code === 'duplicate_case_id');
  assert.throws(() => validateSyntheticCase({ ...makeCandidates()[0], requiresExternalSystem: true }), (error) => error.code === 'case_requires_external_system');
});

test('[TC-03] 插件组和对照组保持配对公平与隔离', (context) => {
  const fixture = makeProjects(context, 'tc03');
  const project = fixture.projects[0];
  const baseline = collectSourceBaseline(project);
  const runRoot = path.join(fixture.root, 'outputs');
  const left = prepareCommittedWorkspace({ project, baseline, runRoot, name: 'plugin' });
  const right = prepareCommittedWorkspace({ project, baseline, runRoot, name: 'baseline' });
  applyUnifiedPatch(left.workspace, makeCandidates()[0].seedPatch, 'seed', { env: left.environment });
  applyUnifiedPatch(right.workspace, makeCandidates()[0].seedPatch, 'seed', { env: right.environment });
  assert.notEqual(left.workspace, right.workspace);
  assert.equal(fs.readFileSync(path.join(left.workspace, 'src/value.js'), 'utf8'), fs.readFileSync(path.join(right.workspace, 'src/value.js'), 'utf8'));

  assert.equal(detectExecutionRoute({ mode: 'plugin', eventText: 'frontend-fast-change', finalRoute: 'fast', changedPaths: ['src/value.js'] }).valid, true);
  assert.equal(detectExecutionRoute({ mode: 'plugin', eventText: 'frontend-ai-workflow:frontend-change', finalRoute: 'full', changedPaths: ['requirements/REQ.md', 'openspec/changes/a/proposal.md'] }).valid, true);
  assert.equal(detectExecutionRoute({ mode: 'baseline', finalRoute: 'baseline', changedPaths: ['requirements/REQ.md'] }).valid, false);
  assert.equal(detectExecutionRoute({ mode: 'plugin', finalRoute: 'fast', changedPaths: ['src/value.js'] }).valid, false);
  cleanupBoundedWorkspace({ runRoot, workspace: left.workspace });
  cleanupBoundedWorkspace({ runRoot, workspace: right.workspace });
});

test('[TC-04] 澄清首次交付和返工在同一会话闭环', async (context) => {
  const fixture = makeProjects(context, 'tc04');
  const runId = `tc04-${path.basename(fixture.root).toLowerCase()}`;
  const { config, baselines } = createBenchmarkPreview(benchmarkOptions(fixture.projects, runId, { write: true, executeAgents: true }));
  const manifest = freezeSyntheticCases(makeCandidates());
  const candidate = manifest.cases.find((item) => item.id === 'SYN-P1-S01');
  const invocations = [];
  let turn = 0;
  const responses = [
    { status: 'needs_clarification', summary: '需要确认', route: 'baseline', question: '目标数值是否仍为一？', blockerCode: '', blockerCategory: '' },
    { status: 'delivered', summary: '首次交付', route: 'baseline', question: '', blockerCode: '', blockerCategory: '' },
    { status: 'delivered', summary: '返工完成', route: 'baseline', question: '', blockerCode: '', blockerCategory: '' },
  ];
  const times = ['2026-09-04T00:00:00.000Z', '2026-09-04T00:00:10.000Z', '2026-09-04T00:00:20.000Z'];
  const executed = await executeCaseRun({
    config,
    sourceProject: fixture.projects[0],
    sourceBaseline: baselines[0],
    runSource: { project: fixture.projects[0], baseline: baselines[0] },
    candidate,
    mode: 'baseline',
    schemas: { execution: path.join(config.runRoot, 'schema.json') },
    baselines,
    operations: {
      now: () => new Date(times.shift()),
      runProcess: async (invocation) => {
        invocations.push(invocation.args);
        turn += 1;
        if (turn === 2) write(path.join(invocation.cwd, 'src/value.js'), 'export const value = 2;\n');
        if (turn === 3) write(path.join(invocation.cwd, 'src/value.js'), 'export const value = 1;\n');
        return {
          exitCode: 0,
          launchError: false,
          timedOut: false,
          interrupted: false,
          stdout: `${JSON.stringify({ thread_id: 'session-1', type: 'turn.completed' })}\n`,
          stderr: '',
          finalResponse: responses[turn - 1],
        };
      },
      runAcceptanceProcess: (invocation) => runBoundedProcess(invocation),
    },
  });
  assert.equal(executed.runResult.status, 'passed');
  assert.equal(executed.runResult.clarificationCount, 1);
  assert.equal(executed.runResult.reworkCount, 1);
  assert.equal(executed.runResult.firstAcceptancePassed, false);
  assert.equal(executed.runResult.finalAcceptancePassed, true);
  assert.equal(executed.metrics.firstDeliveryMs, 10_000);
  assert.equal(executed.metrics.totalCycleMs, 20_000);
  assert.equal(invocations.slice(1).every((args) => args.includes('resume') && args.includes('session-1')), true);

  const unavailable = manifest.cases.find((item) => item.id === 'SYN-P1-L01');
  await assert.rejects(executeCaseRun({
    config,
    sourceProject: fixture.projects[0],
    sourceBaseline: baselines[0],
    runSource: { project: fixture.projects[0], baseline: baselines[0] },
    candidate: unavailable,
    mode: 'baseline',
    schemas: { execution: path.join(config.runRoot, 'schema.json') },
    baselines,
    operations: {
      runProcess: async () => ({
        exitCode: 1, launchError: false, timedOut: false, interrupted: false,
        stdout: '', stderr: 'usage limit reached', finalResponse: null,
      }),
    },
  }), (error) => error.code === 'agent_process_unavailable');
  assert.equal(fs.existsSync(path.join(config.runRoot, 'runs', unavailable.id, 'baseline', 'result.json')), false);
});

function metricRun(caseName, mode, overrides = {}) {
  return {
    caseId: caseName,
    projectId: caseName.split('-')[1],
    projectName: 'fixture',
    complexity: 'small',
    taskType: 'bug',
    mode,
    route: mode === 'plugin' ? 'fast' : 'baseline',
    routeValid: true,
    status: 'passed',
    freezeDigest: { requirement: 'digest' },
    startedAt: '2026-09-04T00:00:00.000Z',
    firstDeliveredAt: '2026-09-04T00:00:00.000Z',
    firstDeliveryNullReason: null,
    endedAt: '2026-09-04T00:00:01.000Z',
    clarificationCount: 0,
    reworkCount: 0,
    blockerCount: 0,
    falseBlockerStatus: 'none',
    firstAcceptancePassed: true,
    finalAcceptancePassed: true,
    evidence: ['evidence.json'],
    ...overrides,
  };
}

test('[TC-05] 指标保留未知语义并只汇总有效配对', () => {
  const zero = buildRunMetrics(metricRun('SYN-P1-S01', 'plugin'));
  assert.equal(zero.firstDeliveryMs, 0);
  assert.equal(zero.clarificationCount, 0);
  const blocked = buildRunMetrics(metricRun('SYN-P1-S01', 'baseline', {
    status: 'blocked',
    firstDeliveredAt: null,
    firstDeliveryNullReason: 'blocked-before-delivery',
    blockerCount: 1,
    firstAcceptancePassed: false,
    finalAcceptancePassed: false,
  }));
  assert.equal(blocked.effective, true);
  assert.equal(blocked.firstDeliveryMs, null);
  assert.equal(classifyFalseBlocker({ blocked: true, blockerCategory: 'missing-file', availabilityChecks: [{ deterministic: true, available: true }] }), 'confirmed');
  assert.equal(classifyFalseBlocker({ blocked: true, blockerCategory: 'semantic', availabilityChecks: [] }), 'review-required');

  const metrics = makeCandidates().flatMap((item) => [
    buildRunMetrics(metricRun(item.id, 'plugin')),
    buildRunMetrics(metricRun(item.id, 'baseline')),
  ]);
  const complete = buildBenchmarkSummary(metrics);
  assert.equal(complete.conclusionStatus, 'descriptive-comparison');
  assert.equal(complete.validPairCount, 6);
  assert.match(buildWorkbookImportCsv(complete), /synthetic-plugin/u);
  assert.equal(buildBenchmarkSummary(metrics.slice(0, -1)).conclusionStatus, 'insufficient-pairs');
});

test('[TC-06] 证据脱敏原子恢复和有界清理', (context) => {
  const fixture = makeFixture(context, 'tc06');
  const safe = sanitizeCapturedOutput('/business/project/src/a.js\n内容内容内容', {
    redactions: [{ value: '/business/project', replacement: 'project:P1' }],
    maxBytes: 24,
  });
  assert.equal(safe.safe, true);
  assert.equal(safe.truncated, true);
  assert.doesNotMatch(safe.text, /business/u);
  assert.equal(sanitizeCapturedOutput('Authorization: Bearer secret-value').safe, false);
  const redactedAssignment = sanitizeCapturedOutput('access_token: response.data.accessToken');
  assert.equal(redactedAssignment.safe, true);
  assert.equal(redactedAssignment.code, 'output_redacted');
  assert.equal(redactedAssignment.redacted, true);
  assert.equal(redactedAssignment.text.includes('response.data.accessToken'), false);
  assert.equal(sanitizeCapturedOutput('{"password":"real-looking-value"}').redacted, true);

  const evidence = path.join(fixture, 'evidence.json');
  assert.equal(writeImmutableJson(repositoryRoot, evidence, { value: 1 }).status, 'created');
  assert.equal(writeImmutableJson(repositoryRoot, evidence, { value: 1 }).status, 'reused');
  assert.throws(() => writeImmutableJson(repositoryRoot, evidence, { value: 2 }), (error) => error.code === 'resume_input_mismatch');
  const textEvidence = path.join(fixture, 'evidence.txt');
  writeImmutableText(repositoryRoot, textEvidence, '固定\n');
  assert.equal(writeImmutableText(repositoryRoot, textEvidence, '固定\n').status, 'reused');

  const state = createRunState({ runId: 'tc06', inputDigest: 'input', createdAt: '2026-09-04T00:00:00.000Z' });
  assert.equal(advanceRunState(state, 'authored', { inputDigest: 'input' }).stage, 'authored');
  assert.throws(() => advanceRunState(state, 'frozen', { inputDigest: 'input' }), (error) => error.code === 'invalid_stage_transition');
  assert.throws(() => advanceRunState(state, 'authored', { inputDigest: 'changed' }), (error) => error.code === 'resume_input_mismatch');

  const runRoot = path.join(fixture, 'run');
  const workspace = path.join(runRoot, 'workspaces', 'bounded');
  fs.mkdirSync(workspace, { recursive: true });
  assert.equal(cleanupBoundedWorkspace({ runRoot, workspace }).status, 'passed');
  assert.equal(cleanupBoundedWorkspace({ runRoot, workspace: fixture }).code, 'unsafe_cleanup_target');
  const outside = path.join(fixture, 'outside');
  fs.mkdirSync(outside, { recursive: true });
  const link = path.join(runRoot, 'workspaces', 'link');
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(outside, link, 'dir');
  assert.equal(cleanupBoundedWorkspace({ runRoot, workspace: link }).code, 'cleanup_target_symlink');
});

test('[TC-07] 跨平台路径和无 shell 子进程保持稳定诊断', async (context) => {
  const fixture = makeFixture(context, 'tc07 空格');
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

test('[TC-08] 普通仓库验证不启动真实代理', async (context) => {
  const fixture = makeProjects(context, 'tc08');
  const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['benchmark:developer-effectiveness'], 'node plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark.mjs');
  assert.equal(TEST_GROUPS.workflow.includes('tests/developer-effectiveness-benchmark.test.mjs'), true);
  assert.doesNotMatch(packageJson.scripts.test, /developer-effectiveness-benchmark\.mjs/u);
  assert.doesNotMatch(packageJson.scripts.validate, /developer-effectiveness-benchmark\.mjs/u);

  let agentCalls = 0;
  const runId = `tc08-${path.basename(fixture.root).toLowerCase()}`;
  const preview = await runDeveloperEffectivenessBenchmark(benchmarkOptions(fixture.projects, runId), {
    runProcess: async () => { agentCalls += 1; },
  });
  assert.equal(preview.code, 'benchmark_preview_ready');
  assert.equal(agentCalls, 0);
  assert.equal(fs.existsSync(path.join(testOutputRoot, runId)), false);
  const smoke = createBenchmarkPreview(benchmarkOptions(fixture.projects, `${runId}-smoke`, { smokeCase: 'SYN-P1-S01' })).preview;
  assert.equal(smoke.expectedRunCount, 1);
  assert.equal(smoke.expectedCaseCount, 2);
  assert.equal(smoke.scope, 'plugin-smoke');
  assert.deepEqual(scopedBenchmarkProjects({ projects: fixture.projects, smokeCase: 'SYN-P1-S01' }).map((item) => item.id), ['P1']);
  assert.throws(
    () => createBenchmarkPreview(benchmarkOptions(fixture.projects, `${runId}-bad-smoke`, { smokeCase: 'SYN-P1-M01' })),
    (error) => error.code === 'invalid_smoke_case',
  );

  const executionRunId = `tc08-run-${path.basename(fixture.root).toLowerCase()}`;
  const executionRoot = path.join(testOutputRoot, executionRunId);
  context.after(() => fs.rmSync(executionRoot, { recursive: true, force: true }));
  let executionCalls = 0;
  const operations = {
    authorCases: async () => makeCandidates(),
    preflightCase: async ({ candidate }) => ({ caseId: candidate.id, status: 'passed', code: 'fixture-preflight-passed' }),
    preparePluginBaselines: ({ config, baselines }) => new Map(config.projects.map((project) => {
      const baseline = baselines.find((item) => item.projectId === project.id);
      const prepared = prepareCommittedWorkspace({
        project,
        baseline,
        runRoot: config.runRoot,
        name: `${project.id.toLowerCase()}-fixture-prepared`,
      });
      git(prepared.workspace, ['switch', '--quiet', '-c', 'fixture-prepared']);
      return [project.id, { project: { ...project, root: prepared.workspace }, baseline: collectSourceBaseline({ ...project, root: prepared.workspace }), workspace: prepared.workspace }];
    })),
    executeCaseRun: async ({ candidate, mode }) => {
      executionCalls += 1;
      if (executionCalls === 1) {
        throw new DeveloperEffectivenessBenchmarkError('fixture_case_failed', '注入单样本失败', candidate.id);
      }
      const runResult = metricRun(candidate.id, mode, {
        projectName: fixture.projects.find((item) => item.id === candidate.projectId).name,
        complexity: candidate.complexity,
        taskType: candidate.taskType,
      });
      return { runResult, metrics: buildRunMetrics(runResult) };
    },
  };
  const executionOptions = benchmarkOptions(fixture.projects, executionRunId, { write: true, executeAgents: true });
  const first = await runDeveloperEffectivenessBenchmark(executionOptions, operations);
  assert.equal(first.code, 'synthetic_benchmark_completed');
  assert.equal(first.validPairCount, 5);
  assert.equal(first.conclusionStatus, 'insufficient-pairs');
  assert.equal(executionCalls, 12);
  const resumed = await runDeveloperEffectivenessBenchmark(executionOptions, operations);
  assert.equal(resumed.code, 'synthetic_benchmark_completed');
  assert.equal(executionCalls, 12);
  assert.equal(fs.existsSync(path.join(executionRoot, 'runs', 'SYN-P1-L01', 'plugin', 'failures', '01', 'failure.json')), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(executionRoot, 'state.json'), 'utf8')).stage, 'cleaned');
});

test('[TC-01] 基准兼容入口保持单向模块边界', () => {
  const limits = new Map([
    ['developer-effectiveness-benchmark.mjs', 500],
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
  assert.doesNotMatch(sources.get('developer-effectiveness-benchmark-cases.mjs'), /from '\.\/developer-effectiveness-benchmark-foundation\.mjs'/u);
  assert.doesNotMatch(sources.get('developer-effectiveness-benchmark-contract.mjs'), /developer-effectiveness-benchmark-(?:foundation|cases|execution)\.mjs/u);
});
