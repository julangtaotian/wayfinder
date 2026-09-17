import fs from 'node:fs';
import path from 'node:path';
import {
  BENCHMARK_SCHEMA_VERSION, DeveloperEffectivenessBenchmarkError,
  applyUnifiedPatch, captureWorkspaceChanges, cleanupBoundedWorkspace, commitWorkspaceBaseline,
  detectExecutionRoute, prepareCommittedWorkspace, sanitizeCapturedOutput, workspaceEnvironment,
  writeJsonAtomic, writeTextAtomic,
} from './developer-effectiveness-benchmark-foundation.mjs';
import {
  buildRunMetrics, classifyFalseBlocker,
} from './developer-effectiveness-benchmark-metrics.mjs';
import {
  aggregateCodexTokenUsage, buildCodexInvocation, parseCodexJsonLines, runBoundedProcess,
} from './developer-effectiveness-benchmark-process.mjs';
import { resolveSafeProjectPath } from './project-path-safety.mjs';

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

export async function runCodexTurn({
  config,
  workspace,
  prompt,
  schemaPath,
  temporaryOutputPath,
  eventOutputPath,
  sandbox,
  sessionId,
  mode = 'plugin',
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
    mode,
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

function safeAuthorCorrection(error) {
  if (!error) return null;
  const rawCode = typeof error.code === 'string' ? error.code.trim() : '';
  const code = /^[a-z0-9_]{1,80}$/u.test(rawCode) ? rawCode : 'case_author_validation_failed';
  const rawTarget = typeof error.target === 'string' ? error.target.trim() : '';
  const target = rawTarget
    && rawTarget.length <= 240
    && !/[\r\n\0]/u.test(rawTarget)
    && !path.isAbsolute(rawTarget)
    && !path.win32.isAbsolute(rawTarget)
    ? rawTarget.replaceAll('\\', '/')
    : null;
  return { code, target };
}

function authorCorrectionGuidance(code) {
  if (code === 'case_equivalent_failed') {
    return '重新生成时必须逐条对照 evaluatorPatch、referencePatch 与 equivalentPatch：验收断言必须同时接受两种语义等价但结构不同的实现，不能把独立实现限定为参考实现的赋值写法、语句顺序、中间变量或格式。';
  }
  if (code === 'patch_apply_failed') {
    return '重新读取 target 对应源码并按当前 HEAD 生成完整补丁，逐项核对上下文、行数和目标路径，不得沿用上一次补丁的行号假设。';
  }
  if (code === 'case_mutant_unexpected_pass') {
    return '重新生成时确保 mutantPatch 只破坏一个公开行为，并让 evaluatorPatch 对该行为有能够稳定失败的断言。';
  }
  if (code === 'case_seed_unexpected_pass') {
    return '重新生成时确保 seedPatch 确实留下公开需求尚未满足的行为，并让 evaluatorPatch 能稳定识别该缺口。';
  }
  return '重新生成全部候选并针对该稳定错误代码完成四种状态的交叉检查。';
}

export function authorPrompt(projectId, complexities, previousError = null) {
  const ids = complexities.map((complexity) => {
    const code = { small: 'S01', medium: 'M01', large: 'L01' }[complexity];
    return `SYN-${projectId}-${code}`;
  });
  const correction = safeAuthorCorrection(previousError);
  const prompt = [
    '你是合成基准的用例作者，只读检查当前 Git 项目，不要修改工作区，也不要实现最终任务。',
    `请为项目 ${projectId} 生成恰好两个独立模拟需求，ID 和复杂度依次为：${ids.map((id, index) => `${id}(${complexities[index]})`).join('、')}。`,
    '每个用例必须来自当前仓库真实结构，不需要登录、真实账号、生产接口、网络或安装依赖。第一项 expectedRoute=fast，必须是边界明确的局部修改；第二项 expectedRoute=full，必须涉及真实共享契约、跨模块边界或需要显式规划的产品决策，不能只靠文件数、补丁行数或复杂度标签伪装。',
    'seedPatch 必须能应用到当前 HEAD；referencePatch、equivalentPatch 和 mutantPatch 必须各自能独立应用到 HEAD + seed；evaluatorPatch 必须能应用到上述四种状态。所有补丁都使用行号与行数准确、没有省略内容的完整 unified diff，evaluator 只能新增 .benchmark-evaluator/ 下的 Node.js 标准库测试。',
    'equivalentPatch 必须使用与 referencePatch 不同的局部结构或实现路径但满足同一公开行为，禁止复制参考补丁；mutantPatch 只破坏一个公开验收点并保持其余条件。acceptance.command 固定为 node，args 使用 ["--test", ".benchmark-evaluator/<case>.test.mjs"]；seed 和 mutant 必须失败，reference 和 equivalent 必须通过。',
    'evaluator 必须是 Node.js 可直接运行的纯 JavaScript ESM；不得把 .ts 或 .vue 原文直接交给 eval、new Function 或 vm 执行，也不得直接 import 依赖 Vite/TypeScript 转换的模块。需要观察这类源码时只能读取文本并验证公开行为或稳定公共契约；不得断言局部变量名、表达式顺序、分号、格式或完整参考源码文本。',
    '返回前必须逐项交叉检查 seed、reference、equivalent、mutant 四种状态：seed 和 mutant 应失败，reference 和 equivalent 应通过。尤其要把 evaluatorPatch 的每条断言同时对照 referencePatch 与 equivalentPatch，语义等价的链式赋值、中间变量、属性顺序或控制流差异不得被误判。',
    'allowedPaths 只列业务源码或测试相关的项目相对路径，不得包含 AGENTS.md、requirements、openspec、wayfinder、outputs、package manifest 或锁文件；seedPatch、referencePatch、equivalentPatch 和 mutantPatch 的每个业务目标都必须由 allowedPaths 中的文件或目录覆盖。',
    'publicRequirement 至少 80 个字符，描述可观察目标、边界和公开验证方式，但不得出现 evaluator、reference.patch、隐藏验收或参考实现等泄露词。',
    'publicRequirement 中“仅修改”“保持不变”“不得影响”等范围限制必须与 referencePatch 和 equivalentPatch 完全一致；seedPatch 不得制造只能通过违反这些公开限制才能修复的矛盾起点。',
    'clarifications 仅包含公开需求确实可能触发的问题与冻结答案；availabilityChecks 只列实现所依赖的已存在项目文件，并且每个 target 都必须由 allowedPaths 中的文件或目录覆盖。maxReworks 和 maxClarifications 均不超过 2。',
    '最终仅返回符合给定 JSON schema 的对象；成功时 status=ready 且 cases 恰好两项，无法满足时 status=blocked 且 cases=[]。',
  ];
  if (correction) {
    prompt.push(`上一次候选校验失败，请只纠正该合同错误：code=${correction.code}${correction.target ? `，target=${correction.target}` : ''}。${authorCorrectionGuidance(correction.code)}`);
  }
  return prompt.join('\n');
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
    common.unshift(`请根据项目 AGENTS 和当前已安装的 frontend-ai-workflow 插件准入规则处理任务，本用例冻结预期路线为 ${candidate.expectedRoute}；必须按该路线执行并返回一致的 route。完整通道若本轮只完成规划，请返回 status=planned、route=full。`);
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

export function nextAttemptDirectory(root) {
  const indexes = fs.existsSync(root)
    ? fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d{2}$/u.test(entry.name)).map((entry) => Number(entry.name))
    : [];
  return path.join(root, String(Math.max(0, ...indexes) + 1).padStart(2, '0'));
}

export async function runAcceptance({ config, candidate, workspace, baselines, operations }) {
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

export function isoNow(operations) {
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
        mode,
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
        tokenUsage: turn.parsed.tokenUsage,
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
        expectedRoute: candidate.expectedRoute,
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
    expectedRoute: candidate.expectedRoute,
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
    tokenUsage: aggregateCodexTokenUsage(turns.map((turn) => turn.tokenUsage)),
    turns,
    evidence,
  };
  const metrics = buildRunMetrics(runResult);
  return { runResult, metrics };
}
