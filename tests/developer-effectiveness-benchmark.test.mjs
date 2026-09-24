import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  DeveloperEffectivenessBenchmarkError,
  MAX_CAPTURE_BYTES,
  applyUnifiedPatch,
  assertSourceBaselineUnchanged,
  cleanupBoundedWorkspace,
  collectSourceBaseline,
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
  buildBenchmarkReviewMarkdown,
  buildBenchmarkSummary,
  buildRunMetrics,
  buildWorkbookImportCsv,
  classifyFalseBlocker,
  createRunState,
} from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark-metrics.mjs';
import {
  aggregateCodexTokenUsage,
  extractCodexTokenUsage,
  parseBenchmarkCliArgs,
  parseCodexJsonLines,
  runBoundedProcess,
} from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark-process.mjs';
import {
  createBenchmarkPreview,
  executeCaseRun,
  runDeveloperEffectivenessBenchmark,
} from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark.mjs';
import { assessWorkflowRouteHistory, executionPrompt } from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark-execution.mjs';
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
    expectedRoute: complexity === 'small' ? 'direct' : complexity === 'medium' ? 'light' : 'complex',
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
    equivalentPatch: [
      'diff --git a/src/value.js b/src/value.js',
      '--- a/src/value.js',
      '+++ b/src/value.js',
      '@@ -1 +1 @@',
      '-export const value = 0;',
      '+export const value = Number(1);',
      '',
    ].join('\n'),
    mutantPatch: [
      'diff --git a/src/value.js b/src/value.js',
      '--- a/src/value.js',
      '+++ b/src/value.js',
      '@@ -1 +1 @@',
      '-export const value = 0;',
      '+export const value = 2;',
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

  assert.equal(detectExecutionRoute({ mode: 'baseline', finalRoute: 'baseline', changedPaths: ['requirements/REQ.md'] }).valid, false);
  assert.equal(detectExecutionRoute({ mode: 'plugin', finalRoute: 'direct', expectedRoute: 'direct', changedPaths: ['src/value.js'] }).valid, false);
  cleanupBoundedWorkspace({ runRoot, workspace: left.workspace });
  cleanupBoundedWorkspace({ runRoot, workspace: right.workspace });
});

test('[TC-03A] 续轮保持首轮原生路线', () => {
  assert.deepEqual(assessWorkflowRouteHistory(['light', 'light']), { valid: true, code: 'workflow_route_history_consistent', routeHistory: ['light', 'light'] });
  assert.deepEqual(assessWorkflowRouteHistory(['complex', 'light']), { valid: false, code: 'workflow_route_transition_mismatch', routeHistory: ['complex', 'light'] });
  const prompt = executionPrompt(makeCandidate('P3', 'medium'), 'plugin');
  assert.match(prompt, /不得通过 eval、new Function、vm 或截取、改写源码临时构造执行器/u);
  assert.match(prompt, /完成业务修改和一次可靠检查或人工复核后直接返回 delivered/u);
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
  const times = [0, 1, 10, 10, 11, 19, 20, 20, 20, 20]
    .map((seconds) => new Date(Date.UTC(2026, 8, 4, 0, 0, seconds)).toISOString());
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
  assert.equal(executed.metrics.phaseTimes.acceptance.length, 2);
  assert.equal(executed.metrics.phaseTimes.preparation.startedAt, '2026-09-04T00:00:00.000Z');
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
    route: mode === 'plugin' ? 'direct' : 'baseline',
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

test('[TC-08] 普通仓库验证不启动真实代理', async (context) => {
  const fixture = makeProjects(context, 'tc08');
  const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['benchmark:developer-effectiveness'], 'node plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark.mjs');
  assert.equal(TEST_GROUPS.workflow.includes('tests/developer-effectiveness-benchmark.test.mjs'), true);
  assert.equal(TEST_GROUPS.workflow.includes('tests/developer-effectiveness-benchmark-authoring.test.mjs'), true);
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
  const paired = createBenchmarkPreview(benchmarkOptions(fixture.projects, `${runId}-paired`, { pairCase: 'SYN-P2-M01' })).preview;
  assert.equal(paired.expectedRunCount, 2);
  assert.equal(paired.expectedCaseCount, 2);
  assert.equal(paired.scope, 'single-paired');
  assert.deepEqual(scopedBenchmarkProjects({ projects: fixture.projects, pairCase: 'SYN-P2-M01' }).map((item) => item.id), ['P2']);
  assert.throws(
    () => createBenchmarkPreview(benchmarkOptions(fixture.projects, `${runId}-bad-smoke`, { smokeCase: 'SYN-P1-M01' })),
    (error) => error.code === 'invalid_smoke_case',
  );
  assert.throws(
    () => createBenchmarkPreview(benchmarkOptions(fixture.projects, `${runId}-bad-pair`, { pairCase: 'SYN-P1-M01' })),
    (error) => error.code === 'invalid_pair_case',
  );
  assert.throws(
    () => createBenchmarkPreview(benchmarkOptions(fixture.projects, `${runId}-conflict`, {
      smokeCase: 'SYN-P1-S01', pairCase: 'SYN-P1-S01',
    })),
    (error) => error.code === 'conflicting_case_scope',
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

test('[TC-10] Codex Token 用量保持可累计与未知语义', () => {
  const parsed = parseCodexJsonLines([
    JSON.stringify({ type: 'thread.started', thread_id: 'session-token' }),
    JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 20, reasoning_output_tokens: 5 },
    }),
    JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 50, cached_input_tokens: 40, output_tokens: 10, reasoning_output_tokens: 2 },
    }),
  ].join('\n'));
  assert.deepEqual(parsed.tokenUsage, {
    status: 'available', reason: null, turnCount: 2,
    inputTokens: 150, cachedInputTokens: 120, outputTokens: 30, reasoningOutputTokens: 7, totalTokens: 180,
  });
  const activity = parseCodexJsonLines(JSON.stringify({
    type: 'item.completed', item: { type: 'command_execution', command: 'sed -n 1,80p AGENTS.md && node --test tests/value.test.mjs' },
  })).activity;
  assert.deepEqual(activity, {
    commandCount: 1, observedSkillReadCommands: 0, observedAgentsReadCommands: 1, observedTestCommands: 1,
  });
  assert.equal(extractCodexTokenUsage([{ type: 'turn.completed' }]).status, 'missing');
  assert.equal(extractCodexTokenUsage([{
    type: 'turn.completed',
    usage: { input_tokens: -1, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 },
  }]).status, 'invalid');
  for (const inputTokens of [1.5, '1']) {
    assert.equal(extractCodexTokenUsage([{
      type: 'turn.completed',
      usage: { input_tokens: inputTokens, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 },
    }]).status, 'invalid');
  }
  assert.equal(extractCodexTokenUsage([{
    type: 'turn.completed',
    usage: { input_tokens: 1, cached_input_tokens: 2, output_tokens: 1, reasoning_output_tokens: 0 },
  }]).status, 'invalid');
  assert.equal(extractCodexTokenUsage([
    { type: 'turn.completed' },
    {
      type: 'turn.completed',
      usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 },
    },
  ]).status, 'missing');
  assert.deepEqual(aggregateCodexTokenUsage([parsed.tokenUsage, parsed.tokenUsage]), {
    status: 'available', reason: null, turnCount: 4,
    inputTokens: 300, cachedInputTokens: 240, outputTokens: 60, reasoningOutputTokens: 14, totalTokens: 360,
  });

  const plugin = buildRunMetrics(metricRun('SYN-P1-S01', 'plugin', { tokenUsage: parsed.tokenUsage }));
  const baselineUsage = extractCodexTokenUsage([{
    type: 'turn.completed',
    usage: { input_tokens: 200, cached_input_tokens: 100, output_tokens: 40, reasoning_output_tokens: 8 },
  }]);
  const baseline = buildRunMetrics(metricRun('SYN-P1-S01', 'baseline', { tokenUsage: baselineUsage }));
  const summary = buildBenchmarkSummary([plugin, baseline], { expectedPairs: 1 });
  assert.equal(summary.groups.mode.plugin.tokenSampleCount, 1);
  assert.equal(summary.groups.mode.plugin.averageTotalTokens, 180);
  assert.equal(summary.pairs[0].delta.tokenUsage.totalTokens, -60);
  assert.match(buildWorkbookImportCsv(summary), /input_tokens,cached_input_tokens,output_tokens/u);
  assert.match(buildBenchmarkReviewMarkdown(summary), /Token 有效运行：2\/2/u);

  const legacyMetrics = [
    buildRunMetrics(metricRun('SYN-P1-S02', 'plugin')),
    buildRunMetrics(metricRun('SYN-P1-S02', 'baseline')),
  ].map(({ tokenUsage, tokenDataQualityReasons, ...item }) => item);
  const legacy = buildBenchmarkSummary(legacyMetrics, { expectedPairs: 1 });
  assert.equal(legacy.runs.every((item) => item.tokenUsage.status === 'missing'), true);
  assert.equal(legacy.pairs[0].delta.tokenUsage, null);
  assert.doesNotThrow(() => buildWorkbookImportCsv(legacy));
});

test('[TC-10A] 用量缺失与事件截断自动否决正式观测合同', async () => {
  const completeUsage = {
    status: 'available', reason: null, turnCount: 1,
    inputTokens: 10, cachedInputTokens: 2, outputTokens: 3, reasoningOutputTokens: 1, totalTokens: 13,
  };
  const duration = {
    deliveryCycleMs: 10, preparationMs: 1, agentExecutionMs: 7,
    acceptanceMs: 2, cleanupMs: 1, acceptanceDurationsMs: [2],
  };
  const phaseTimes = {
    preparation: { startedAt: '2026-09-04T00:00:00.000Z', endedAt: '2026-09-04T00:00:01.000Z' },
    delivery: { startedAt: '2026-09-04T00:00:01.000Z', endedAt: '2026-09-04T00:00:03.000Z' },
    acceptance: [{ startedAt: '2026-09-04T00:00:02.000Z', endedAt: '2026-09-04T00:00:03.000Z' }],
    cleanup: { startedAt: '2026-09-04T00:00:03.000Z', endedAt: '2026-09-04T00:00:04.000Z' },
  };
  const strict = (mode, overrides = {}) => buildRunMetrics(metricRun('SYN-P1-S01', mode, {
    telemetryContract: 'complete-turn-usage-v1',
    turns: [{ invalidEventLines: 0, stdoutTruncated: false, stderrTruncated: false }],
    tokenUsage: completeUsage,
    duration,
    phaseTimes,
    ...overrides,
  }));
  const valid = strict('plugin');
  assert.equal(valid.effective, true);
  assert.equal(valid.duration.deliveryCycleMs, 10);
  const noUsage = strict('baseline', { tokenUsage: { status: 'missing', reason: 'missing-token-usage' } });
  assert.equal(noUsage.effective, false);
  assert.equal(noUsage.dataQualityReasons.includes('missing-token-usage'), true);
  const truncated = strict('baseline', {
    turns: [{ invalidEventLines: 0, stdoutTruncated: true, stderrTruncated: false }],
  });
  assert.equal(truncated.effective, false);
  assert.equal(truncated.dataQualityReasons.includes('incomplete-event-stream'), true);
  const noPhaseTimes = strict('baseline', { phaseTimes: null });
  assert.equal(noPhaseTimes.effective, false);
  assert.equal(noPhaseTimes.dataQualityReasons.includes('missing-phase-timestamps'), true);
  const summary = buildBenchmarkSummary([valid, noUsage], { expectedPairs: 1 });
  assert.equal(summary.validPairCount, 0);
  assert.equal(summary.pairs[0].effective, false);
  const captured = await runBoundedProcess({
    command: process.execPath,
    args: ['-e', `process.stdout.write('x'.repeat(${MAX_CAPTURE_BYTES + 1}))`],
    cwd: repositoryRoot,
    env: process.env,
    timeoutMs: 10_000,
  });
  assert.equal(captured.exitCode, 0);
  assert.equal(captured.stdoutTruncated, true);
  assert.equal(Buffer.byteLength(captured.stdout), MAX_CAPTURE_BYTES);
});

test('[TC-11] 单次新增运行预算可安全暂停和恢复', async (context) => {
  const fixture = makeProjects(context, 'tc11');
  const runId = `tc11-${path.basename(fixture.root).toLowerCase()}`;
  const runRoot = path.join(testOutputRoot, runId);
  context.after(() => fs.rmSync(runRoot, { recursive: true, force: true }));
  let executionCalls = 0;
  const operations = {
    authorCases: async () => makeCandidates(),
    preflightCase: async ({ candidate }) => ({ caseId: candidate.id, status: 'passed', code: 'fixture-preflight-passed' }),
    preparePluginBaselines: ({ config, baselines }) => new Map(config.projects.map((project) => [project.id, {
      project,
      baseline: baselines.find((item) => item.projectId === project.id),
      workspace: path.join(config.runRoot, 'workspaces', `${project.id.toLowerCase()}-budget`),
    }])),
    executeCaseRun: async ({ candidate, mode }) => {
      executionCalls += 1;
      const runResult = metricRun(candidate.id, mode, {
        projectName: fixture.projects.find((item) => item.id === candidate.projectId).name,
        complexity: candidate.complexity,
        taskType: candidate.taskType,
      });
      return { runResult, metrics: buildRunMetrics(runResult) };
    },
  };
  const bounded = benchmarkOptions(fixture.projects, runId, {
    write: true, executeAgents: true, maxNewRuns: 1,
  });
  const preview = createBenchmarkPreview(bounded).preview;
  assert.equal(preview.maxNewRuns, 1);
  const first = await runDeveloperEffectivenessBenchmark(bounded, operations);
  assert.deepEqual(
    { code: first.code, new: first.newRunCount, complete: first.completedRunCount, remaining: first.remainingRunCount },
    { code: 'synthetic_benchmark_paused', new: 1, complete: 1, remaining: 11 },
  );
  assert.equal(JSON.parse(fs.readFileSync(path.join(runRoot, 'state.json'), 'utf8')).stage, 'executing');
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(path.join(runRoot, 'input.json'), 'utf8')), 'maxNewRuns'), false);

  const second = await runDeveloperEffectivenessBenchmark(bounded, operations);
  assert.deepEqual(
    { new: second.newRunCount, complete: second.completedRunCount, remaining: second.remainingRunCount },
    { new: 1, complete: 2, remaining: 10 },
  );
  assert.equal(executionCalls, 2);
  const completed = await runDeveloperEffectivenessBenchmark({ ...bounded, maxNewRuns: null }, operations);
  assert.equal(completed.code, 'synthetic_benchmark_completed');
  assert.equal(executionCalls, 12);
  assert.equal(JSON.parse(fs.readFileSync(path.join(runRoot, 'state.json'), 'utf8')).stage, 'cleaned');
  for (const attempt of ['01', '02', '03']) {
    const cleanup = JSON.parse(fs.readFileSync(path.join(runRoot, 'prepared', 'attempts', attempt, 'cleanup.json'), 'utf8'));
    assert.equal(cleanup.every((item) => item.status === 'passed'), true);
  }
  assert.throws(() => parseBenchmarkCliArgs(['--max-new-runs', '0']), (error) => error.code === 'invalid_max_new_runs');
  assert.throws(() => parseBenchmarkCliArgs(['--max-new-runs', '-1']), (error) => error.code === 'invalid_max_new_runs');
  assert.throws(() => parseBenchmarkCliArgs(['--max-new-runs', '1.5']), (error) => error.code === 'invalid_max_new_runs');
  assert.throws(() => parseBenchmarkCliArgs(['--max-new-runs']), (error) => error.code === 'missing_cli_value');
  assert.equal(parseBenchmarkCliArgs(['--pair-case', 'SYN-P1-S01']).pairCase, 'SYN-P1-S01');
});
