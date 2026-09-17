import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  DeveloperEffectivenessBenchmarkError,
  applyUnifiedPatch,
  cleanupBoundedWorkspace,
  collectSourceBaseline,
  prepareCommittedWorkspace,
} from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark-foundation.mjs';
import { normalizeUnifiedPatchHunkCounts } from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark-cases.mjs';
import { buildRunMetrics } from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark-metrics.mjs';
import { preparePluginBaselines } from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark-process.mjs';
import { authorPrompt } from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark-execution.mjs';
import {
  classifyReferenceAcceptanceFailure,
  runDeveloperEffectivenessBenchmark,
} from '../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark.mjs';

const repositoryRoot = path.resolve('.');
const testOutputRoot = path.join(repositoryRoot, '.frontend-ai-workflow', 'runs', 'developer-effectiveness-benchmark');

function write(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
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

function makeProject(root, id) {
  const projectRoot = path.join(root, id.toLowerCase());
  fs.mkdirSync(projectRoot, { recursive: true });
  git(projectRoot, ['init', '--quiet', '-b', 'main']);
  write(path.join(projectRoot, 'package.json'), `${JSON.stringify({ name: `fixture-${id.toLowerCase()}`, type: 'module' }, null, 2)}\n`);
  write(path.join(projectRoot, 'src', 'value.js'), 'export const value = 1;\n');
  git(projectRoot, ['add', '-A']);
  git(projectRoot, ['-c', 'user.name=Benchmark Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  return { id, name: `fixture-${id.toLowerCase()}`, root: projectRoot };
}

function makeProjects(context, label) {
  const root = makeFixture(context, label);
  return {
    root,
    projects: ['P1', 'P2', 'P3'].map((id) => makeProject(root, id)),
  };
}

function makeCandidate(projectId, complexity) {
  const id = `SYN-${projectId}-${{ small: 'S01', medium: 'M01', large: 'L01' }[complexity]}`;
  const evaluator = `.benchmark-evaluator/${id}.test.mjs`;
  return {
    id,
    projectId,
    title: `${id} 修复数值回归`,
    complexity,
    taskType: complexity === 'large' ? 'refactor' : 'bug',
    expectedRoute: (projectId === 'P3' ? complexity === 'medium' : complexity === 'large') ? 'full' : 'fast',
    publicRequirement: '修复当前数值模块的默认导出，使它重新返回公开约定的数值一；保持现有模块路径、导出名称和调用方式不变，不增加依赖，并确保项目已有的 Node.js 聚焦测试能够离线通过。',
    allowedPaths: ['src/value.js'],
    seedPatch: 'diff --git a/src/value.js b/src/value.js\n--- a/src/value.js\n+++ b/src/value.js\n@@ -1 +1 @@\n-export const value = 1;\n+export const value = 0;\n',
    referencePatch: 'diff --git a/src/value.js b/src/value.js\n--- a/src/value.js\n+++ b/src/value.js\n@@ -1 +1 @@\n-export const value = 0;\n+export const value = 1;\n',
    equivalentPatch: 'diff --git a/src/value.js b/src/value.js\n--- a/src/value.js\n+++ b/src/value.js\n@@ -1 +1 @@\n-export const value = 0;\n+export const value = Number(1);\n',
    mutantPatch: 'diff --git a/src/value.js b/src/value.js\n--- a/src/value.js\n+++ b/src/value.js\n@@ -1 +1 @@\n-export const value = 0;\n+export const value = 2;\n',
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

function authorTurnResult(cases) {
  return {
    processResult: { launchError: null, timedOut: false, interrupted: false, exitCode: 0 },
    finalResponse: { status: 'ready', cases },
  };
}

function prepareInjectedBaselines({ config, baselines }) {
  return new Map(config.projects.map((project) => {
    const baseline = baselines.find((item) => item.projectId === project.id);
    const prepared = prepareCommittedWorkspace({
      project, baseline, runRoot: config.runRoot, name: `${project.id.toLowerCase()}-author-retry-prepared`,
    });
    git(prepared.workspace, ['switch', '--quiet', '-c', 'author-retry-prepared']);
    return [project.id, {
      project: { ...project, root: prepared.workspace },
      baseline: collectSourceBaseline({ ...project, root: prepared.workspace }),
      workspace: prepared.workspace,
    }];
  }));
}

function metricRun(caseName, mode, projectName) {
  return {
    caseId: caseName,
    projectId: caseName.split('-')[1],
    projectName,
    complexity: 'small',
    taskType: 'bug',
    mode,
    route: mode === 'plugin' ? 'fast' : 'baseline',
    routeValid: true,
    status: 'passed',
    freezeDigest: { requirement: 'digest' },
    startedAt: '2026-09-16T00:00:00.000Z',
    firstDeliveredAt: '2026-09-16T00:00:00.000Z',
    firstDeliveryNullReason: null,
    endedAt: '2026-09-16T00:00:01.000Z',
    clarificationCount: 0,
    reworkCount: 0,
    blockerCount: 0,
    falseBlockerStatus: 'none',
    firstAcceptancePassed: true,
    finalAcceptancePassed: true,
    evidence: ['evidence.json'],
  };
}

function injectedExecution(fixture) {
  return async ({ candidate, mode }) => {
    const runResult = metricRun(candidate.id, mode, fixture.projects[0].name);
    return { runResult, metrics: buildRunMetrics(runResult) };
  };
}

test('[TC-01] 任务作者基础提示声明字段一致性', () => {
  const prompt = authorPrompt('P1', ['small', 'large']);
  assert.match(prompt, /seedPatch、referencePatch、equivalentPatch 和 mutantPatch 的每个业务目标都必须由 allowedPaths/u);
  assert.match(prompt, /第一项 expectedRoute=fast/u);
  assert.match(prompt, /第二项 expectedRoute=full/u);
  assert.match(prompt, /不得断言局部变量名、表达式顺序、分号、格式或完整参考源码文本/u);
  assert.match(prompt, /每个 target 都必须由 allowedPaths/u);
  assert.match(prompt, /行号与行数准确、没有省略内容的完整 unified diff/u);
  assert.match(prompt, /不得把 \.ts 或 \.vue 原文直接交给 eval、new Function 或 vm/u);
  assert.doesNotMatch(prompt, /上一次候选校验失败/u);
  const corrected = authorPrompt('P1', ['small', 'large'], {
    code: 'patch_apply_failed', target: '/private/tmp/sensitive/project.js', message: '不得进入提示的原始错误',
  });
  assert.match(corrected, /code=patch_apply_failed/u);
  assert.doesNotMatch(corrected, /target=|不得进入提示的原始错误|private\/tmp/u);
});

test('[TC-02] 任务作者重试只消费最近稳定诊断', async (context) => {
  const fixture = makeProjects(context, 'author-retry-success');
  const runId = `author-retry-success-${path.basename(fixture.root).toLowerCase()}`;
  context.after(() => fs.rmSync(path.join(testOutputRoot, runId), { recursive: true, force: true }));
  const prompts = [];
  const candidates = makeCandidates().filter((item) => item.projectId === 'P1');
  const invalid = structuredClone(candidates);
  invalid[1].availabilityChecks = [{ kind: 'file', target: 'src/outside.js' }];
  const result = await runDeveloperEffectivenessBenchmark(benchmarkOptions(fixture.projects, runId, {
    write: true, executeAgents: true, smokeCase: 'SYN-P1-S01', authorAttempts: 2,
  }), {
    authorTurn: async ({ prompt }) => {
      prompts.push(prompt);
      return authorTurnResult(prompts.length === 1 ? invalid : candidates);
    },
    preflightCase: async ({ candidate }) => ({ caseId: candidate.id, status: 'passed', code: 'fixture-preflight-passed' }),
    preparePluginBaselines: prepareInjectedBaselines,
    executeCaseRun: injectedExecution(fixture),
  });
  assert.equal(result.code, 'synthetic_benchmark_completed');
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /code=availability_check_outside_allowed_paths/u);
  assert.match(prompts[1], /target=src\/outside\.js/u);
  assert.doesNotMatch(prompts[1], /可用性检查越出允许路径/u);
  assert.doesNotMatch(prompts[1], new RegExp(fixture.root.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
});

test('[TC-03] 任务作者重试耗尽保留最后错误', async (context) => {
  const fixture = makeProjects(context, 'author-retry-exhausted');
  const runId = `author-retry-exhausted-${path.basename(fixture.root).toLowerCase()}`;
  context.after(() => fs.rmSync(path.join(testOutputRoot, runId), { recursive: true, force: true }));
  const prompts = [];
  await assert.rejects(
    runDeveloperEffectivenessBenchmark(benchmarkOptions(fixture.projects, runId, {
      write: true, executeAgents: true, smokeCase: 'SYN-P1-S01', authorAttempts: 2,
    }), {
      authorTurn: async ({ prompt }) => {
        prompts.push(prompt);
        throw new DeveloperEffectivenessBenchmarkError('fixture_author_contract', '不可泄露原始消息', null);
      },
    }),
    (error) => error.code === 'fixture_author_contract' && error.target === null,
  );
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /code=fixture_author_contract/u);
  assert.doesNotMatch(prompts[1], /target=|不可泄露原始消息/u);
});

test('[TC-04] 冻结前预检失败可触发作者纠正', async (context) => {
  const fixture = makeProjects(context, 'author-preflight-retry');
  const runId = `author-preflight-retry-${path.basename(fixture.root).toLowerCase()}`;
  context.after(() => fs.rmSync(path.join(testOutputRoot, runId), { recursive: true, force: true }));
  const prompts = [];
  let preflightCalls = 0;
  const candidates = makeCandidates().filter((item) => item.projectId === 'P1');
  const result = await runDeveloperEffectivenessBenchmark(benchmarkOptions(fixture.projects, runId, {
    write: true, executeAgents: true, smokeCase: 'SYN-P1-S01', authorAttempts: 2,
  }), {
    authorTurn: async ({ prompt }) => {
      prompts.push(prompt);
      return authorTurnResult(candidates);
    },
    preflightCase: async ({ candidate }) => {
      preflightCalls += 1;
      if (preflightCalls === 1) {
        throw new DeveloperEffectivenessBenchmarkError('patch_apply_failed', '不可泄露的补丁错误正文', `${candidate.id}.seed`);
      }
      return { caseId: candidate.id, status: 'passed', code: 'fixture-preflight-passed' };
    },
    preparePluginBaselines: prepareInjectedBaselines,
    executeCaseRun: injectedExecution(fixture),
  });
  assert.equal(result.code, 'synthetic_benchmark_completed');
  assert.equal(prompts.length, 2);
  assert.equal(preflightCalls, 3);
  assert.match(prompts[1], /code=patch_apply_failed/u);
  assert.match(prompts[1], /target=SYN-P1-S01\.seed/u);
  assert.doesNotMatch(prompts[1], /不可泄露的补丁错误正文/u);
});

test('[TC-05] hunk 声明行数只做确定性规范化', (context) => {
  const fixture = makeProjects(context, 'normalize-hunk-counts');
  const runRoot = path.join(testOutputRoot, `normalize-hunk-counts-${path.basename(fixture.root).toLowerCase()}`);
  context.after(() => fs.rmSync(runRoot, { recursive: true, force: true }));
  const candidate = makeCandidate('P1', 'small');
  candidate.seedPatch = candidate.seedPatch.replace('@@ -1 +1 @@', '@@ -1,9 +1,8 @@ value export');
  const normalized = normalizeUnifiedPatchHunkCounts(candidate.seedPatch);
  assert.match(normalized, /@@ -1,1 \+1,1 @@ value export/u);
  assert.equal(normalized.replace(/^@@.*$/gmu, ''), candidate.seedPatch.replace(/^@@.*$/gmu, ''));
  const baseline = collectSourceBaseline(fixture.projects[0]);
  const prepared = prepareCommittedWorkspace({
    project: fixture.projects[0], baseline, runRoot, name: 'normalized-hunk',
  });
  applyUnifiedPatch(prepared.workspace, normalized, `${candidate.id}.seed`, { env: prepared.environment });
  const wrongContext = candidate.referencePatch.replace('-export const value = 0;', '-export const value = 99;');
  assert.throws(
    () => applyUnifiedPatch(prepared.workspace, wrongContext, `${candidate.id}.wrong-context`, { env: prepared.environment }),
    (error) => error.code === 'patch_apply_failed',
  );
  assert.equal(cleanupBoundedWorkspace({ runRoot, workspace: prepared.workspace }).status, 'passed');
});

test('[TC-06] 插件基线复用共享管理路径合同', (context) => {
  const fixture = makeProjects(context, 'plugin-management-paths');
  const project = fixture.projects[0];
  const baseline = collectSourceBaseline(project);
  const successRoot = path.join(testOutputRoot, `plugin-management-success-${path.basename(fixture.root).toLowerCase()}`);
  const failureRoot = path.join(testOutputRoot, `plugin-management-failure-${path.basename(fixture.root).toLowerCase()}`);
  context.after(() => {
    fs.rmSync(successRoot, { recursive: true, force: true });
    fs.rmSync(failureRoot, { recursive: true, force: true });
  });
  let bootstrapCalls = 0;
  const prepared = preparePluginBaselines({
    config: { projects: [project], runRoot: successRoot },
    baselines: [baseline],
    operations: {
      bootstrap: ({ target }) => {
        bootstrapCalls += 1;
        if (bootstrapCalls === 1) {
          write(path.join(target, '.frontend-workflow.json'), '{"schemaVersion":2}\n');
          write(path.join(target, '.gitignore'), '.frontend-ai-workflow/\n');
        }
        return { ok: true, actions: [{ action: bootstrapCalls === 1 ? 'create' : 'keep' }] };
      },
    },
  });
  assert.equal(bootstrapCalls, 2);
  assert.deepEqual(prepared.get('P1').preparation.managementPaths, ['.frontend-workflow.json', '.gitignore']);
  assert.equal(cleanupBoundedWorkspace({ runRoot: successRoot, workspace: prepared.get('P1').workspace }).status, 'passed');
  assert.throws(
    () => preparePluginBaselines({
      config: { projects: [project], runRoot: failureRoot },
      baselines: [baseline],
      operations: {
        bootstrap: ({ target }) => {
          write(path.join(target, 'src', 'unexpected.js'), 'export const unexpected = true;\n');
          return { ok: true, actions: [{ action: 'keep' }] };
        },
      },
    }),
    (error) => error.code === 'plugin_prepare_source_changed' && error.target === 'src/unexpected.js',
  );
});

test('[TC-07] reference 验收失败只映射稳定分类', () => {
  const cases = [
    [{ launchError: 'private launch detail' }, 'case_reference_launch_failed'],
    [{ timedOut: true }, 'case_reference_timeout'],
    [{ interrupted: true }, 'case_reference_interrupted'],
    [{ stdout: 'SyntaxError: private source detail' }, 'case_reference_syntax_error'],
    [{ stderr: 'ERR_MODULE_NOT_FOUND: private module path' }, 'case_reference_module_load_failed'],
    [{ stdout: 'ReferenceError: private variable' }, 'case_reference_reference_error'],
    [{ stdout: 'TypeError: private value' }, 'case_reference_type_error'],
    [{ stdout: 'code: ERR_ASSERTION private values' }, 'case_reference_assertion_failed'],
    [{ stdout: 'unknown private failure' }, 'case_reference_failed'],
  ];
  for (const [result, expected] of cases) {
    assert.equal(classifyReferenceAcceptanceFailure(result), expected);
    const prompt = authorPrompt('P1', ['small', 'large'], {
      code: expected, target: 'SYN-P1-S01', message: JSON.stringify(result),
    });
    assert.match(prompt, new RegExp(`code=${expected}`, 'u'));
    assert.doesNotMatch(prompt, /private|SyntaxError|ERR_MODULE_NOT_FOUND|ReferenceError|TypeError|ERR_ASSERTION/u);
  }
});
