import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BENCHMARK_SCHEMA_VERSION, COMPLEXITY_MATRIX, EXPECTED_RUN_COUNT,
  MIN_DISK_RESERVE_BYTES, DeveloperEffectivenessBenchmarkError,
  applyUnifiedPatch, captureWorkspaceChanges, cleanupBoundedWorkspace, collectSourceBaseline,
  commitWorkspaceBaseline, detectExecutionRoute, freezeSyntheticCases, prepareCommittedWorkspace,
  publicSourceBaseline, sanitizeCapturedOutput, scopedBenchmarkProjects, sha256Json, validateBenchmarkConfig,
  validateSyntheticCase, verifyFrozenCases, workspaceEnvironment, writeImmutableJson,
  writeImmutableText, writeJsonAtomic, writeTextAtomic,
} from './developer-effectiveness-benchmark-foundation.mjs';
import {
  AUTHOR_RESPONSE_SCHEMA, EXECUTION_RESPONSE_SCHEMA, advanceRunState, buildBenchmarkReviewMarkdown,
  buildBenchmarkSummary, buildFailedRunEvidence, buildRunMetrics,
  buildWorkbookImportCsv,
  classifyFalseBlocker,
  createRunState,
  isFatalBenchmarkFailure,
  publicBenchmarkFailure,
} from './developer-effectiveness-benchmark-metrics.mjs';
import {
  DEFAULT_AUTHOR_ATTEMPTS,
  buildCodexInvocation,
  parseBenchmarkCliArgs,
  parseCodexJsonLines,
  preparePluginBaselines,
  runBoundedProcess,
} from './developer-effectiveness-benchmark-process.mjs';
import { resolveSafeProjectPath } from './project-path-safety.mjs';
const SMOKE_CASE_IDS = new Set(['SYN-P1-S01', 'SYN-P1-L01', 'SYN-P2-M01', 'SYN-P2-L01', 'SYN-P3-S01', 'SYN-P3-M01']);

function readFinalResponse(outputPath, processResult) {
  if (processResult.finalResponse) return processResult.finalResponse;
  if (!fs.existsSync(outputPath)) {
    throw new DeveloperEffectivenessBenchmarkError('codex_final_response_missing', 'Codex 没有生成结构化最终响应', 'codex');
  }
  try {
    return JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  } catch (error) {
    throw new DeveloperEffectivenessBenchmarkError('codex_final_response_invalid', `Codex 最终响应不是有效 JSON：${error.message}`, 'codex');
  }
}

function outputRedactions(config, baselines, workspace = null) {
  return [
    ...baselines.map((baseline) => ({ value: baseline.sourceRoot, replacement: `project:${baseline.projectId}` })),
    { value: workspace, replacement: '[workspace]' },
    { value: config.runRoot, replacement: '[run]' },
    { value: config.repositoryRoot, replacement: '[repository]' },
  ];
}

async function runCodexTurn({
  config,
  workspace,
  prompt,
  schemaPath,
  temporaryOutputPath,
  eventOutputPath,
  sandbox,
  sessionId,
  baselines,
  operations,
}) {
  const invocation = buildCodexInvocation({
    entry: config.codex,
    workspace,
    model: config.model,
    reasoning: config.reasoning,
    prompt,
    schemaPath,
    outputPath: temporaryOutputPath,
    sandbox,
    sessionId,
  });
  const execute = operations.runProcess || runBoundedProcess;
  const processResult = await execute({
    ...invocation,
    env: workspaceEnvironment(config.runRoot, workspace),
    timeoutMs: config.timeoutMinutes * 60_000,
  });
  const parsed = parseCodexJsonLines(processResult.stdout);
  const redactions = outputRedactions(config, baselines, workspace);
  const sanitized = sanitizeCapturedOutput(processResult.stdout, { redactions });
  const sanitizedError = sanitizeCapturedOutput(processResult.stderr, { redactions });
  if (!sanitized.safe || !sanitizedError.safe) {
    throw new DeveloperEffectivenessBenchmarkError('sensitive_agent_output', '代理事件包含敏感信息，已拒绝持久化原文', eventOutputPath);
  }
  writeTextAtomic(config.repositoryRoot, eventOutputPath, sanitized.text || '', { mustNotExist: true });
  const stderrOutputPath = eventOutputPath.replace(/events\.ndjson$/u, 'stderr.log');
  writeTextAtomic(config.repositoryRoot, stderrOutputPath, sanitizedError.text || '', { mustNotExist: true });
  let finalResponse = null;
  if (!processResult.launchError && !processResult.timedOut && !processResult.interrupted && processResult.exitCode === 0) {
    finalResponse = readFinalResponse(temporaryOutputPath, processResult);
  }
  if (fs.existsSync(temporaryOutputPath)) fs.unlinkSync(temporaryOutputPath);
  return {
    processResult, parsed, finalResponse,
    eventPaths: [eventOutputPath, stderrOutputPath].map((target) => path.relative(config.repositoryRoot, target).replaceAll('\\', '/')),
  };
}

function authorPrompt(projectId, complexities) {
  const ids = complexities.map((complexity) => {
    const code = { small: 'S01', medium: 'M01', large: 'L01' }[complexity];
    return `SYN-${projectId}-${code}`;
  });
  return [
    '你是合成基准的用例作者，只读检查当前 Git 项目，不要修改工作区，也不要实现最终任务。',
    `请为项目 ${projectId} 生成恰好两个独立模拟需求，ID 和复杂度依次为：${ids.map((id, index) => `${id}(${complexities[index]})`).join('、')}。`,
    '每个用例必须来自当前仓库真实结构，能够由一个代理在局部范围实现，不需要登录、真实账号、生产接口、网络或安装依赖。',
    'seedPatch 必须能应用到当前 HEAD；referencePatch 必须能应用到 HEAD + seed；evaluatorPatch 必须能分别应用到 HEAD + seed 和 HEAD + seed + reference。三者都使用完整 unified diff，evaluator 只能新增 .benchmark-evaluator/ 下的 Node.js 标准库测试。',
    'acceptance.command 固定为 node，args 使用 ["--test", ".benchmark-evaluator/<case>.test.mjs"]；seed + evaluator 必须失败，seed + reference + evaluator 必须通过。',
    'allowedPaths 只列业务源码或测试相关的项目相对路径，不得包含 AGENTS.md、requirements、openspec、wayfinder、outputs、package manifest 或锁文件。',
    'publicRequirement 至少 80 个字符，描述可观察目标、边界和公开验证方式，但不得出现 evaluator、reference.patch、隐藏验收或参考实现等泄露词。',
    'clarifications 仅包含公开需求确实可能触发的问题与冻结答案；availabilityChecks 只列实现所依赖的已存在项目文件。maxReworks 和 maxClarifications 均不超过 2。',
    '最终仅返回符合给定 JSON schema 的对象；成功时 status=ready 且 cases 恰好两项，无法满足时 status=blocked 且 cases=[]。',
  ].join('\n');
}

function executionPrompt(candidate, mode) {
  const common = [
    `任务 ID：${candidate.id}`,
    candidate.publicRequirement,
    `只允许修改这些业务范围：${candidate.allowedPaths.join('、')}。`,
    '不要访问网络、真实账号或生产系统，不要安装依赖。请完成实现并运行你能执行的聚焦验证。',
    '若公开需求存在真正影响实现的空白，请返回 needs_clarification；无法继续时返回 blocked；完成可验收实现时返回 delivered。',
    '最终只返回符合 JSON schema 的对象，question、blockerCode、blockerCategory 不适用时使用空字符串。',
  ];
  if (mode === 'plugin') {
    common.unshift('请根据项目 AGENTS 和当前已安装的 frontend-ai-workflow 插件准入规则处理任务，选择快速通道或完整通道；完整通道若本轮只完成规划，请返回 status=planned、route=full。');
  } else {
    common.unshift('直接实现并验证下面的需求，不创建需求文档、OpenSpec 变更、Wayfinder 或其他工作流管理文件；route 固定返回 baseline。');
  }
  return common.join('\n\n');
}

function workflowContinuationPrompt(candidate) {
  return `继续实施并完成任务 ${candidate.id}。沿用已经建立的受管计划，完成业务代码和聚焦验证；可验收时返回 delivered，最终仍只返回 JSON schema 对象。`;
}

function clarificationPrompt(answer) {
  return `针对你的澄清问题，冻结答案是：${answer}\n请在不增加其他业务假设的前提下继续实现，最终仍只返回 JSON schema 对象。`;
}

function reworkPrompt(acceptance) {
  const detail = [acceptance.stdout, acceptance.stderr].filter(Boolean).join('\n').slice(0, 8_000);
  return `独立验收未通过，请只根据以下经过脱敏的失败摘要修正实现，不要猜测或查找隐藏测试。\n${detail}\n完成后返回 delivered，最终仍只返回 JSON schema 对象。`;
}

function checkDiskBudget(repositoryRoot) {
  if (typeof fs.statfsSync !== 'function') return { status: 'limited', code: 'disk_budget_unavailable', availableBytes: null };
  const stats = fs.statfsSync(repositoryRoot);
  const availableBytes = Number(stats.bavail) * Number(stats.bsize);
  if (availableBytes < MIN_DISK_RESERVE_BYTES) {
    throw new DeveloperEffectivenessBenchmarkError('disk_reserve_insufficient', '可用磁盘空间低于基准安全预留', 'disk');
  }
  return { status: 'passed', code: 'disk_budget_sufficient', availableBytes };
}

function publicConfig(config, baselines) {
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    synthetic: true,
    runId: config.runId,
    model: config.model,
    reasoning: config.reasoning,
    timeoutMinutes: config.timeoutMinutes,
    expectedCaseCount: scopedBenchmarkProjects(config).reduce((count, project) => count + COMPLEXITY_MATRIX[project.id].length, 0),
    expectedRunCount: config.smokeCase ? 1 : EXPECTED_RUN_COUNT,
    scope: config.smokeCase ? 'plugin-smoke' : 'full-paired',
    smokeCase: config.smokeCase,
    projects: baselines.map(publicSourceBaseline),
    output: config.runPath,
    write: config.write,
    executeAgents: config.executeAgents,
  };
}

export function createBenchmarkPreview(options) {
  const config = validateBenchmarkConfig(options);
  config.codex = options.codex || 'codex';
  config.keepWorkspaces = Boolean(options.keepWorkspaces);
  config.smokeCase = options.smokeCase || null;
  if (config.smokeCase && !SMOKE_CASE_IDS.has(config.smokeCase)) {
    throw new DeveloperEffectivenessBenchmarkError('invalid_smoke_case', 'smoke 用例不属于第一轮固定矩阵', 'smokeCase');
  }
  config.authorAttempts = options.authorAttempts ?? DEFAULT_AUTHOR_ATTEMPTS;
  if (!Number.isInteger(config.authorAttempts) || config.authorAttempts < 1 || config.authorAttempts > 3) {
    throw new DeveloperEffectivenessBenchmarkError('invalid_author_attempts', '作者重试次数必须是 1 到 3 的整数', 'authorAttempts');
  }
  const baselines = config.projects.map(collectSourceBaseline);
  const disk = checkDiskBudget(config.repositoryRoot);
  const preview = {
    ok: true,
    status: 'ready',
    code: 'benchmark_preview_ready',
    ...publicConfig(config, baselines),
    disk,
    limitations: [
      '本轮结果是合成基准，不能替代真实开发者数据。',
      '业务项目已有未提交内容只记录摘要，不进入隔离副本。',
      '真实代理只有同时显式启用写入与代理执行才会启动。',
    ],
  };
  return { config, baselines, preview };
}

function writeSchemas(config) {
  const schemaRoot = path.join(config.runRoot, 'schemas');
  const author = path.join(schemaRoot, 'author-response.schema.json');
  const execution = path.join(schemaRoot, 'execution-response.schema.json');
  writeImmutableJson(config.repositoryRoot, author, AUTHOR_RESPONSE_SCHEMA);
  writeImmutableJson(config.repositoryRoot, execution, EXECUTION_RESPONSE_SCHEMA);
  return { author, execution };
}

function readJson(target) {
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function nextAttemptDirectory(root) {
  const indexes = fs.existsSync(root)
    ? fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d{2}$/u.test(entry.name)).map((entry) => Number(entry.name))
    : [];
  return path.join(root, String(Math.max(0, ...indexes) + 1).padStart(2, '0'));
}

function persistFrozenCases(config, manifest) {
  for (const candidate of manifest.cases) {
    const caseRoot = path.join(config.runRoot, 'cases', candidate.id);
    writeTextAtomic(config.repositoryRoot, path.join(caseRoot, 'public-requirement.md'), `${candidate.publicRequirement.trim()}\n`, { mustNotExist: true });
    writeTextAtomic(config.repositoryRoot, path.join(caseRoot, 'seed.patch'), `${candidate.seedPatch.trimEnd()}\n`, { mustNotExist: true });
    writeTextAtomic(config.repositoryRoot, path.join(caseRoot, 'evaluator.patch'), `${candidate.evaluatorPatch.trimEnd()}\n`, { mustNotExist: true });
    writeTextAtomic(config.repositoryRoot, path.join(caseRoot, 'reference.patch'), `${candidate.referencePatch.trimEnd()}\n`, { mustNotExist: true });
    writeJsonAtomic(config.repositoryRoot, path.join(caseRoot, 'clarifications.json'), candidate.clarifications, { mustNotExist: true });
    writeJsonAtomic(config.repositoryRoot, path.join(caseRoot, 'acceptance.json'), candidate.acceptance, { mustNotExist: true });
    writeJsonAtomic(config.repositoryRoot, path.join(caseRoot, 'case.json'), {
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      synthetic: true,
      id: candidate.id,
      projectId: candidate.projectId,
      title: candidate.title,
      complexity: candidate.complexity,
      taskType: candidate.taskType,
      allowedPaths: candidate.allowedPaths,
      availabilityChecks: candidate.availabilityChecks,
      maxReworks: candidate.maxReworks,
      maxClarifications: candidate.maxClarifications,
      assetDigests: candidate.assetDigests,
      patchPaths: candidate.patchPaths,
    }, { mustNotExist: true });
  }
  writeImmutableJson(config.repositoryRoot, path.join(config.runRoot, 'cases', 'frozen-manifest.json'), manifest);
}

async function authorSyntheticCases({ config, baselines, schemas, operations }) {
  const candidates = [];
  for (const project of scopedBenchmarkProjects(config)) {
    const baseline = baselines.find((item) => item.projectId === project.id);
    let response = null;
    let lastError = null;
    for (let attempt = 1; attempt <= config.authorAttempts && !response; attempt += 1) {
      const name = `${project.id.toLowerCase()}-author-${attempt}`;
      const prepared = prepareCommittedWorkspace({ project, baseline, runRoot: config.runRoot, category: 'author', name, recoverExisting: true });
      const temporaryOutputPath = path.join(config.runRoot, 'tmp', `${name}-final.json`);
      const authorAttemptRoot = nextAttemptDirectory(path.join(config.runRoot, 'authors', project.id, 'attempts'));
      const eventOutputPath = path.join(authorAttemptRoot, 'events.ndjson');
      try {
        const turn = await runCodexTurn({
          config,
          workspace: prepared.workspace,
          prompt: authorPrompt(project.id, COMPLEXITY_MATRIX[project.id]),
          schemaPath: schemas.author,
          temporaryOutputPath,
          eventOutputPath,
          sandbox: 'read-only',
          sessionId: null,
          baselines,
          operations,
        });
        if (turn.processResult.launchError || turn.processResult.timedOut || turn.processResult.interrupted || turn.processResult.exitCode !== 0) {
          lastError = new DeveloperEffectivenessBenchmarkError('case_author_process_failed', `项目 ${project.id} 的需求作者进程失败`, project.id);
        } else if (turn.finalResponse?.status !== 'ready' || !Array.isArray(turn.finalResponse.cases)) {
          lastError = new DeveloperEffectivenessBenchmarkError('case_author_blocked', `项目 ${project.id} 的需求作者没有返回可冻结用例`, project.id);
        } else if (turn.finalResponse.cases.length !== COMPLEXITY_MATRIX[project.id].length) {
          lastError = new DeveloperEffectivenessBenchmarkError('case_author_count_mismatch', `项目 ${project.id} 的需求作者返回数量不正确`, project.id);
        } else {
          try {
            response = turn.finalResponse.cases.map(validateSyntheticCase);
          } catch (error) {
            lastError = error;
          }
        }
      } catch (error) {
        lastError = error;
      } finally {
        if (fs.existsSync(temporaryOutputPath)) fs.unlinkSync(temporaryOutputPath);
        const cleanup = cleanupBoundedWorkspace({ runRoot: config.runRoot, workspace: prepared.workspace });
        if (cleanup.status !== 'passed' && !lastError) {
          lastError = new DeveloperEffectivenessBenchmarkError(cleanup.code, '需求作者工作区清理失败', cleanup.target);
        }
      }
    }
    if (!response) throw lastError || new DeveloperEffectivenessBenchmarkError('case_author_failed', `项目 ${project.id} 无法生成用例`, project.id);
    candidates.push(...response);
  }
  return freezeSyntheticCases(candidates, undefined, scopedBenchmarkProjects(config).map((project) => project.id));
}

async function runAcceptance({ config, candidate, workspace, baselines, operations }) {
  const execute = operations.runAcceptanceProcess || operations.runProcess || runBoundedProcess;
  const processResult = await execute({
    command: process.execPath,
    args: candidate.acceptance.args,
    cwd: workspace,
    env: workspaceEnvironment(config.runRoot, workspace),
    timeoutMs: candidate.acceptance.timeoutMs,
  });
  const redactions = outputRedactions(config, baselines, workspace);
  const stdout = sanitizeCapturedOutput(processResult.stdout, { redactions });
  const stderr = sanitizeCapturedOutput(processResult.stderr, { redactions });
  if (!stdout.safe || !stderr.safe) {
    throw new DeveloperEffectivenessBenchmarkError('sensitive_acceptance_output', '验收输出包含敏感信息，已拒绝持久化原文', candidate.id);
  }
  return {
    passed: !processResult.launchError && !processResult.timedOut && !processResult.interrupted && processResult.exitCode === 0,
    exitCode: processResult.exitCode,
    launchError: processResult.launchError,
    timedOut: processResult.timedOut,
    interrupted: processResult.interrupted,
    stdout: stdout.text,
    stderr: stderr.text,
  };
}

async function preflightOneCase({ config, project, baseline, candidate, baselines, operations }) {
  const checks = [];
  for (const variant of ['seed', 'reference']) {
    const name = `${candidate.id.toLowerCase()}-${variant}-preflight`;
    const prepared = prepareCommittedWorkspace({ project, baseline, runRoot: config.runRoot, category: 'evaluations', name, recoverExisting: true });
    try {
      applyUnifiedPatch(prepared.workspace, candidate.seedPatch, `${candidate.id}.seed`, { env: prepared.environment });
      if (variant === 'reference') {
        applyUnifiedPatch(prepared.workspace, candidate.referencePatch, `${candidate.id}.reference`, { env: prepared.environment });
      }
      applyUnifiedPatch(prepared.workspace, candidate.evaluatorPatch, `${candidate.id}.evaluator`, { env: prepared.environment });
      const result = await runAcceptance({ config, candidate, workspace: prepared.workspace, baselines, operations });
      checks.push({ variant, ...result });
      if (variant === 'seed' && result.passed) {
        throw new DeveloperEffectivenessBenchmarkError('case_seed_unexpected_pass', `用例 ${candidate.id} 的 seed 状态意外通过验收`, candidate.id);
      }
      if (variant === 'reference' && !result.passed) {
        throw new DeveloperEffectivenessBenchmarkError('case_reference_failed', `用例 ${candidate.id} 的参考实现没有通过验收`, candidate.id);
      }
    } finally {
      const cleanup = cleanupBoundedWorkspace({ runRoot: config.runRoot, workspace: prepared.workspace });
      if (cleanup.status !== 'passed') {
        throw new DeveloperEffectivenessBenchmarkError(cleanup.code, `用例 ${candidate.id} 的预检工作区清理失败`, cleanup.target);
      }
    }
  }
  return { caseId: candidate.id, status: 'passed', code: 'case_preflight_passed', checks };
}

async function preflightCases({ config, baselines, manifest, operations }) {
  const results = [];
  for (const candidate of manifest.cases) {
    const project = config.projects.find((item) => item.id === candidate.projectId);
    const baseline = baselines.find((item) => item.projectId === candidate.projectId);
    const result = operations.preflightCase
      ? await operations.preflightCase({ config, project, baseline, candidate })
      : await preflightOneCase({ config, project, baseline, candidate, baselines, operations });
    if (result.status !== 'passed') {
      throw new DeveloperEffectivenessBenchmarkError(result.code || 'case_preflight_failed', `用例 ${candidate.id} 预检失败`, candidate.id);
    }
    results.push(result);
  }
  return { schemaVersion: BENCHMARK_SCHEMA_VERSION, synthetic: true, manifestDigest: manifest.manifestDigest, results };
}

function matchClarification(question, clarifications) {
  const normalized = String(question || '').toLocaleLowerCase('zh-CN');
  return clarifications.find((item) => normalized.includes(item.pattern.toLocaleLowerCase('zh-CN'))) || null;
}

function availabilityEvidence(workspace, checks) {
  return checks.map((check) => {
    const checked = resolveSafeProjectPath(workspace, check.target, '阻断可用性检查', { mustExist: false });
    return { kind: check.kind, target: check.target, deterministic: true, available: checked.exists };
  });
}

async function evaluateDelivery({ config, project, baseline, candidate, agentPatch, attempt, baselines, operations }) {
  const name = `${candidate.id.toLowerCase()}-${attempt}-evaluation`;
  const prepared = prepareCommittedWorkspace({ project, baseline, runRoot: config.runRoot, category: 'evaluations', name, recoverExisting: true });
  try {
    applyUnifiedPatch(prepared.workspace, candidate.seedPatch, `${candidate.id}.seed`, { env: prepared.environment });
    commitWorkspaceBaseline(prepared.workspace, 'benchmark seeded evaluation', { env: prepared.environment });
    applyUnifiedPatch(prepared.workspace, agentPatch, `${candidate.id}.agent`, { env: prepared.environment });
    applyUnifiedPatch(prepared.workspace, candidate.evaluatorPatch, `${candidate.id}.evaluator`, { env: prepared.environment });
    return await runAcceptance({ config, candidate, workspace: prepared.workspace, baselines, operations });
  } finally {
    const cleanup = cleanupBoundedWorkspace({ runRoot: config.runRoot, workspace: prepared.workspace });
    if (cleanup.status !== 'passed') {
      throw new DeveloperEffectivenessBenchmarkError(cleanup.code, `用例 ${candidate.id} 的评估副本清理失败`, cleanup.target);
    }
  }
}

function turnFailureStatus(result) {
  if (result.launchError) return 'launch-failed';
  if (result.timedOut) return 'timeout';
  if (result.interrupted) return 'interrupted';
  return 'failed';
}

function isoNow(operations) {
  return (operations.now ? operations.now() : new Date()).toISOString();
}

export async function executeCaseRun({
  config,
  sourceProject,
  sourceBaseline,
  runSource,
  candidate,
  mode,
  schemas,
  baselines,
  operations,
}) {
  const runName = `${candidate.id.toLowerCase()}-${mode}`;
  const prepared = prepareCommittedWorkspace({
    project: runSource.project,
    baseline: runSource.baseline,
    runRoot: config.runRoot,
    name: runName,
    recoverExisting: true,
  });
  const resultRoot = path.join(config.runRoot, 'runs', candidate.id, mode);
  const runRoot = nextAttemptDirectory(path.join(resultRoot, 'attempts'));
  const evidence = [];
  const turns = [];
  const acceptanceAttempts = [];
  let finalStatus = 'failed';
  let firstDeliveredAt = null;
  let firstAcceptancePassed = false;
  let finalAcceptancePassed = false;
  let clarificationCount = 0;
  let reworkCount = 0;
  let blockerCount = 0;
  let falseBlockerStatus = 'none';
  let route = mode === 'baseline' ? 'baseline' : 'unknown';
  let routeValid = false;
  let sessionId = null;
  let prompt = executionPrompt(candidate, mode);
  let eventText = '';
  let turnIndex = 0;
  let workflowTransitions = 0;
  let latestChanges = { patch: '', changedPaths: [], diffstat: { files: 0, insertions: 0, deletions: 0 } };
  const startedAt = isoNow(operations);
  try {
    applyUnifiedPatch(prepared.workspace, candidate.seedPatch, `${candidate.id}.seed`, { env: prepared.environment });
    commitWorkspaceBaseline(prepared.workspace, `benchmark seed ${candidate.id}`, { env: prepared.environment });
    while (turnIndex < 12) {
      turnIndex += 1;
      const temporaryOutputPath = path.join(config.runRoot, 'tmp', `${runName}-${turnIndex}-final.json`);
      const eventOutputPath = path.join(runRoot, `turn-${String(turnIndex).padStart(2, '0')}.events.ndjson`);
      const turn = await runCodexTurn({
        config,
        workspace: prepared.workspace,
        prompt,
        schemaPath: schemas.execution,
        temporaryOutputPath,
        eventOutputPath,
        sandbox: 'workspace-write',
        sessionId,
        baselines,
        operations,
      });
      evidence.push(...turn.eventPaths);
      eventText += `\n${turn.processResult.stdout || ''}`;
      sessionId ||= turn.parsed.sessionId;
      turns.push({
        index: turnIndex,
        exitCode: turn.processResult.exitCode,
        launchError: turn.processResult.launchError,
        timedOut: turn.processResult.timedOut,
        interrupted: turn.processResult.interrupted,
        invalidEventLines: turn.parsed.invalidLineCount,
        response: turn.finalResponse,
        eventPaths: turn.eventPaths,
      });
      if (turn.processResult.launchError || turn.processResult.interrupted
        || (!turn.processResult.timedOut && turn.processResult.exitCode !== 0)) {
        throw new DeveloperEffectivenessBenchmarkError('agent_process_unavailable',
          `用例 ${candidate.id} 的代理进程不可用，已暂停运行以保留可恢复样本`, `${candidate.id}:${mode}`);
      }
      if (turn.processResult.launchError || turn.processResult.timedOut || turn.processResult.interrupted || turn.processResult.exitCode !== 0 || !turn.finalResponse) {
        finalStatus = turnFailureStatus(turn.processResult);
        break;
      }
      const response = turn.finalResponse;
      if (response.status === 'planned') {
        if (mode !== 'plugin' || workflowTransitions >= 2) {
          finalStatus = 'failed';
          break;
        }
        workflowTransitions += 1;
        prompt = workflowContinuationPrompt(candidate);
        continue;
      }
      if (response.status === 'needs_clarification') {
        const matched = matchClarification(response.question, candidate.clarifications);
        if (!matched || clarificationCount >= candidate.maxClarifications) {
          finalStatus = 'blocked';
          blockerCount += 1;
          falseBlockerStatus = 'review-required';
          break;
        }
        clarificationCount += 1;
        prompt = clarificationPrompt(matched.answer);
        continue;
      }
      latestChanges = captureWorkspaceChanges(prepared.workspace, { env: prepared.environment });
      const routeResult = detectExecutionRoute({
        mode,
        eventText,
        finalRoute: response.route,
        changedPaths: latestChanges.changedPaths,
      });
      route = routeResult.route;
      routeValid = routeResult.valid;
      if (response.status === 'blocked') {
        blockerCount += 1;
        finalStatus = 'blocked';
        const checks = availabilityEvidence(prepared.workspace, candidate.availabilityChecks);
        falseBlockerStatus = classifyFalseBlocker({
          blocked: true,
          blockerCategory: response.blockerCategory,
          availabilityChecks: checks,
        });
        break;
      }
      if (response.status !== 'delivered') {
        finalStatus = 'failed';
        break;
      }
      firstDeliveredAt ||= isoNow(operations);
      const acceptance = await evaluateDelivery({
        config,
        project: sourceProject,
        baseline: sourceBaseline,
        candidate,
        agentPatch: latestChanges.patch,
        attempt: acceptanceAttempts.length + 1,
        baselines,
        operations,
      });
      const acceptancePath = path.join(runRoot, `acceptance-${String(acceptanceAttempts.length + 1).padStart(2, '0')}.json`);
      writeJsonAtomic(config.repositoryRoot, acceptancePath, acceptance, { mustNotExist: true });
      evidence.push(path.relative(config.repositoryRoot, acceptancePath).replaceAll('\\', '/'));
      acceptanceAttempts.push(acceptance);
      if (acceptanceAttempts.length === 1) firstAcceptancePassed = acceptance.passed;
      if (acceptance.passed) {
        finalAcceptancePassed = true;
        finalStatus = 'passed';
        break;
      }
      if (reworkCount >= candidate.maxReworks) {
        finalStatus = 'failed';
        break;
      }
      reworkCount += 1;
      prompt = reworkPrompt(acceptance);
    }
  } finally {
    const cleanup = config.keepWorkspaces
      ? { status: 'limited', code: 'workspace_retained_by_request', target: runName }
      : cleanupBoundedWorkspace({ runRoot: config.runRoot, workspace: prepared.workspace });
    const cleanupPath = path.join(runRoot, 'cleanup.json');
    writeJsonAtomic(config.repositoryRoot, cleanupPath, cleanup, { mustNotExist: true });
    evidence.push(path.relative(config.repositoryRoot, cleanupPath).replaceAll('\\', '/'));
  }
  const endedAt = isoNow(operations);
  const runResult = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    synthetic: true,
    caseId: candidate.id,
    projectId: candidate.projectId,
    projectName: sourceProject.name,
    complexity: candidate.complexity,
    taskType: candidate.taskType,
    mode,
    freezeDigest: candidate.assetDigests,
    status: finalStatus,
    route,
    routeValid,
    startedAt,
    firstDeliveredAt,
    firstDeliveryNullReason: finalStatus === 'blocked' && !firstDeliveredAt ? 'blocked-before-delivery' : null,
    endedAt,
    clarificationCount,
    reworkCount,
    blockerCount,
    falseBlockerStatus,
    firstAcceptancePassed,
    finalAcceptancePassed,
    diffstat: latestChanges.diffstat,
    workflowTransitions,
    turns,
    evidence,
  };
  const metrics = buildRunMetrics(runResult);
  return { runResult, metrics };
}

function loadOrCreateState(config, inputDigest) {
  const statePath = path.join(config.runRoot, 'state.json');
  if (!fs.existsSync(statePath)) {
    const state = createRunState({ runId: config.runId, inputDigest });
    writeJsonAtomic(config.repositoryRoot, statePath, state, { mustNotExist: true });
    return { state, statePath };
  }
  const state = readJson(statePath);
  if (state.inputDigest !== inputDigest) {
    throw new DeveloperEffectivenessBenchmarkError('resume_input_mismatch', '恢复输入摘要与既有运行不一致', config.runId);
  }
  return { state, statePath };
}

function updateState(config, statePath, state, targetStage, inputDigest) {
  let next = state;
  const current = ['previewed', 'authored', 'frozen', 'prepared', 'executing', 'evaluated', 'summarized', 'cleaned'].indexOf(next.stage);
  const target = ['previewed', 'authored', 'frozen', 'prepared', 'executing', 'evaluated', 'summarized', 'cleaned'].indexOf(targetStage);
  for (let index = current + 1; index <= target; index += 1) {
    next = advanceRunState(next, ['previewed', 'authored', 'frozen', 'prepared', 'executing', 'evaluated', 'summarized', 'cleaned'][index], { inputDigest });
  }
  writeJsonAtomic(config.repositoryRoot, statePath, next);
  return next;
}

function cleanupPreparedProjects(config, preparedProjects) {
  const results = [];
  for (const prepared of preparedProjects.values()) {
    if (config.keepWorkspaces) {
      results.push({ projectId: prepared.project.id, status: 'limited', code: 'workspace_retained_by_request' });
      continue;
    }
    results.push({ projectId: prepared.project.id, ...cleanupBoundedWorkspace({ runRoot: config.runRoot, workspace: prepared.workspace }) });
  }
  return results;
}

export async function runDeveloperEffectivenessBenchmark(options, operations = {}) {
  const { config, baselines, preview } = createBenchmarkPreview(options);
  if (!config.write) return preview;
  const input = publicConfig(config, baselines);
  const inputDigest = sha256Json(input);
  writeImmutableJson(config.repositoryRoot, path.join(config.runRoot, 'input.json'), input);
  const loaded = loadOrCreateState(config, inputDigest);
  let state = loaded.state;
  if (!config.executeAgents) {
    return { ...preview, write: true, code: 'benchmark_manifest_written', inputDigest };
  }
  const schemas = writeSchemas(config);
  let manifest;
  const manifestPath = path.join(config.runRoot, 'cases', 'frozen-manifest.json');
  if (fs.existsSync(manifestPath)) manifest = verifyFrozenCases(readJson(manifestPath));
  else {
    manifest = operations.authorCases
      ? freezeSyntheticCases(await operations.authorCases({ config, baselines }), undefined, scopedBenchmarkProjects(config).map((project) => project.id))
      : await authorSyntheticCases({ config, baselines, schemas, operations });
    persistFrozenCases(config, manifest);
  }
  state = updateState(config, loaded.statePath, state, 'frozen', inputDigest);
  const preflightPath = path.join(config.runRoot, 'cases', 'preflight.json');
  if (!fs.existsSync(preflightPath)) {
    const preflight = await preflightCases({ config, baselines, manifest, operations });
    writeImmutableJson(config.repositoryRoot, preflightPath, preflight);
  } else {
    const preflight = readJson(preflightPath);
    if (preflight.manifestDigest !== manifest.manifestDigest) {
      throw new DeveloperEffectivenessBenchmarkError('preflight_manifest_mismatch', '预检证据与冻结清单不一致', 'preflight');
    }
  }
  const scopedConfig = { ...config, projects: scopedBenchmarkProjects(config) };
  const preparedProjects = await Promise.resolve(operations.preparePluginBaselines
    ? operations.preparePluginBaselines({ config: scopedConfig, baselines })
    : preparePluginBaselines({ config: scopedConfig, baselines, operations }));
  const preparationAttemptRoot = nextAttemptDirectory(path.join(config.runRoot, 'prepared', 'attempts'));
  for (const prepared of preparedProjects.values()) {
    writeImmutableJson(config.repositoryRoot, path.join(preparationAttemptRoot, `${prepared.project.id}.json`), {
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      synthetic: true,
      projectId: prepared.project.id,
      source: publicSourceBaseline(prepared.baseline),
      preparation: prepared.preparation || { status: 'limited', code: 'injected_preparation_without_timing' },
    });
  }
  state = updateState(config, loaded.statePath, state, 'prepared', inputDigest);
  state = updateState(config, loaded.statePath, state, 'executing', inputDigest);
  const metrics = [];
  const runOrder = [];
  try {
    const selectedCases = config.smokeCase ? manifest.cases.filter((item) => item.id === config.smokeCase) : manifest.cases;
    if (config.smokeCase && selectedCases.length !== 1) {
      throw new DeveloperEffectivenessBenchmarkError('smoke_case_not_found', '冻结清单中不存在指定 smoke 用例', config.smokeCase);
    }
    for (const [caseIndex, candidate] of selectedCases.entries()) {
      const sourceProject = config.projects.find((item) => item.id === candidate.projectId);
      const sourceBaseline = baselines.find((item) => item.projectId === candidate.projectId);
      const order = config.smokeCase ? ['plugin'] : (caseIndex % 2 === 0 ? ['plugin', 'baseline'] : ['baseline', 'plugin']);
      for (const mode of order) {
        runOrder.push({ caseId: candidate.id, mode, index: runOrder.length + 1 });
        const resultPath = path.join(config.runRoot, 'runs', candidate.id, mode, 'result.json');
        const metricsPath = path.join(config.runRoot, 'runs', candidate.id, mode, 'metrics.json');
        if (fs.existsSync(resultPath) && fs.existsSync(metricsPath)) {
          metrics.push(readJson(metricsPath));
          continue;
        }
        const pluginPrepared = preparedProjects.get(candidate.projectId);
        const runSource = mode === 'plugin'
          ? { project: pluginPrepared.project, baseline: pluginPrepared.baseline }
          : { project: sourceProject, baseline: sourceBaseline };
        let executed;
        try {
          executed = operations.executeCaseRun
            ? await operations.executeCaseRun({ config, sourceProject, sourceBaseline, runSource, candidate, mode, schemas, baselines })
            : await executeCaseRun({ config, sourceProject, sourceBaseline, runSource, candidate, mode, schemas, baselines, operations });
        } catch (error) {
          if (isFatalBenchmarkFailure(error)) throw error;
          const failurePath = path.join(nextAttemptDirectory(path.join(config.runRoot, 'runs', candidate.id, mode, 'failures')), 'failure.json');
          const evidencePath = path.relative(config.repositoryRoot, failurePath).replaceAll('\\', '/');
          executed = buildFailedRunEvidence({
            candidate, mode, projectName: sourceProject.name, error, evidencePath, timestamp: isoNow(operations),
          });
          writeImmutableJson(config.repositoryRoot, failurePath, executed.failure);
        }
        writeImmutableJson(config.repositoryRoot, resultPath, executed.runResult);
        writeImmutableJson(config.repositoryRoot, metricsPath, executed.metrics);
        metrics.push(executed.metrics);
      }
    }
  } finally {
    const cleanup = cleanupPreparedProjects(config, preparedProjects);
    writeImmutableJson(config.repositoryRoot, path.join(preparationAttemptRoot, 'cleanup.json'), cleanup);
  }
  state = updateState(config, loaded.statePath, state, 'evaluated', inputDigest);
  const summary = buildBenchmarkSummary(metrics);
  const summaryPath = path.join(config.runRoot, 'summary.json');
  writeImmutableJson(config.repositoryRoot, summaryPath, { ...summary, runId: config.runId, runOrder, inputDigest });
  writeImmutableJson(config.repositoryRoot, path.join(config.runRoot, 'pair-metrics.json'), {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    synthetic: true,
    conclusionStatus: summary.conclusionStatus,
    expectedPairCount: summary.expectedPairCount,
    validPairCount: summary.validPairCount,
    pairs: summary.pairs,
  });
  writeImmutableText(config.repositoryRoot, path.join(config.runRoot, 'workbook-import.csv'), buildWorkbookImportCsv(summary));
  writeImmutableText(config.repositoryRoot, path.join(config.runRoot, 'review.md'), buildBenchmarkReviewMarkdown(summary));
  state = updateState(config, loaded.statePath, state, 'summarized', inputDigest);
  for (const [index, project] of config.projects.entries()) {
    const after = collectSourceBaseline(project);
    if (sha256Json(publicSourceBaseline(after)) !== sha256Json(publicSourceBaseline(baselines[index]))) {
      throw new DeveloperEffectivenessBenchmarkError('source_baseline_drifted', `项目 ${project.id} 在整轮运行期间发生变化`, project.id, 'defect');
    }
  }
  state = updateState(config, loaded.statePath, state, 'cleaned', inputDigest);
  return {
    ok: true,
    status: 'completed',
    code: 'synthetic_benchmark_completed',
    runId: config.runId,
    synthetic: true,
    conclusionStatus: summary.conclusionStatus,
    validPairCount: summary.validPairCount,
    expectedPairCount: summary.expectedPairCount,
    summary: path.relative(config.repositoryRoot, summaryPath).replaceAll('\\', '/'),
    limitations: summary.limitations,
  };
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const result = await runDeveloperEffectivenessBenchmark(parseBenchmarkCliArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify(publicBenchmarkFailure(error), null, 2));
    process.exitCode = 1;
  }
}
