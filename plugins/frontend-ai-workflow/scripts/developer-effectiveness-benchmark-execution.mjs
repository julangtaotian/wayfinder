import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  BENCHMARK_SCHEMA_VERSION, DeveloperEffectivenessBenchmarkError,
  applyUnifiedPatch, captureWorkspaceChanges, cleanupBoundedWorkspace, commitWorkspaceBaseline,
  detectExecutionRoute, prepareCommittedWorkspace, sanitizeCapturedOutput, validateDeliveryScope, workspaceEnvironment,
  writeJsonAtomic,
} from './developer-effectiveness-benchmark-foundation.mjs';
import {
  buildRunMetrics, classifyFalseBlocker,
} from './developer-effectiveness-benchmark-metrics.mjs';
import { aggregateCodexTokenUsage, outputRedactions, runBoundedProcess, runCodexTurn } from './developer-effectiveness-benchmark-process.mjs';
import { resolveSafeProjectPath } from './project-path-safety.mjs';

export { validateDeliveryScope };
export { runCodexTurn };

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
  if (code === 'case_reference_assertion_failed') {
    return '重新生成时必须把 evaluatorPatch 的每条断言实际应用到 referencePatch 后逐项核对；文本验收需要兼容合法的引号、属性写法和等价格式，不能让参考实现因 evaluator 自身的正则或字符串假设失败。';
  }
  if (code === 'case_equivalent_failed') {
    return '重新生成时必须逐条对照 evaluatorPatch、referencePatch 与 equivalentPatch：验收断言必须同时接受两种语义等价但结构不同的实现，不能把独立实现限定为参考实现的赋值写法、语句顺序、中间变量或格式。';
  }
  if (code === 'unsafe_evaluator_source') {
    return '重新生成时禁止截取源码片段、动态执行源码或启动子进程探测；优先选择可由 Node.js 直接导入并行为验证的模块，否则只对完整源码中的稳定公共契约做不依赖局部结构的检查。';
  }
  if (code === 'case_allowed_paths_include_evaluator') {
    return '重新生成时 allowedPaths 只能包含执行代理可修改的业务源码或项目测试路径，禁止包含 .benchmark-evaluator；冻结验收器由基准隔离管理，不能向执行代理公开。';
  }
  if (code === 'patch_apply_failed') {
    return '重新读取 target 对应源码并按当前 HEAD 生成完整补丁，逐项核对上下文、行数和目标路径；返回前使用与基准一致的 git apply --check --ignore-space-change --ignore-whitespace 规则验证，不得沿用上一次补丁的行号假设。';
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
  const routeCoverage = {
    P1: '项目 P1 的第二项必须寻找一个真实 Light 任务：存在清晰有界的多文件或调用链，但不命中任何 Complex 硬触发；找不到时返回 blocked，禁止靠文件数伪装。',
    P3: '项目 P3 的第二项必须寻找一个真实 Complex 任务：必须命中架构、公共契约、权限、安全、依赖、构建、部署、CI、平台兼容或影响不可界定中的至少一项硬触发；找不到时返回 blocked，禁止靠复杂度标签伪装。',
  }[projectId] || null;
  const prompt = [
    '你是合成基准的用例作者，只读检查当前 Git 项目，不要修改工作区，也不要实现最终任务。',
    `请为项目 ${projectId} 生成恰好两个独立模拟需求，ID 和复杂度依次为：${ids.map((id, index) => `${id}(${complexities[index]})`).join('、')}。`,
    '每个用例必须来自当前仓库真实结构，不需要登录、真实账号、生产接口、网络或安装依赖。第一项 expectedRoute=direct，必须是边界明确的局部修改；第二项必须按真实风险选择 expectedRoute=light 或 expectedRoute=complex：有清晰有界调用链时选 light，涉及架构、公共契约、权限、安全、依赖、构建、部署、CI、平台兼容或影响不可界定时选 complex，不能只靠文件数、补丁行数或复杂度标签伪装。',
    'seedPatch 必须能应用到当前 HEAD；referencePatch、equivalentPatch 和 mutantPatch 必须各自能独立应用到 HEAD + seed；evaluatorPatch 必须能应用到上述四种状态。所有补丁都使用行号与行数准确、没有省略内容的完整 unified diff，并按 git apply --check --ignore-space-change --ignore-whitespace 的等价规则自检；evaluator 只能新增 .benchmark-evaluator/ 下的 Node.js 标准库测试。',
    'equivalentPatch 必须使用与 referencePatch 不同的局部结构或实现路径但满足同一公开行为，禁止复制参考补丁；mutantPatch 只破坏一个公开验收点并保持其余条件。acceptance.command 固定为 node，args 使用 ["--test", ".benchmark-evaluator/<case>.test.mjs"]；seed 和 mutant 必须失败，reference 和 equivalent 必须通过。',
    'evaluator 必须是 Node.js 可直接运行的纯 JavaScript ESM；不得把 .ts 或 .vue 原文交给 eval、new Function 或 vm 执行，不得用 slice、substring 或 substr 截取源码片段，也不得启动子进程探测命令；不得直接 import 依赖 Vite/TypeScript 转换的模块。需要观察这类源码时只能读取完整文本并验证公开行为或稳定公共契约；不得断言局部变量名、表达式顺序、分号、格式或完整参考源码文本。',
    '返回前必须逐项交叉检查 seed、reference、equivalent、mutant 四种状态：seed 和 mutant 应失败，reference 和 equivalent 应通过。尤其要把 evaluatorPatch 的每条断言同时对照 referencePatch 与 equivalentPatch，语义等价的链式赋值、中间变量、属性顺序或控制流差异不得被误判。',
    'allowedPaths 只列执行代理可修改的业务源码或项目测试相对路径，严禁包含 .benchmark-evaluator 或其子路径，也不得包含 AGENTS.md、requirements、openspec、wayfinder、outputs、package manifest 或锁文件；冻结 evaluatorPatch 由基准隔离管理，不向执行代理公开；seedPatch、referencePatch、equivalentPatch 和 mutantPatch 的每个业务目标都必须由 allowedPaths 中的文件或目录覆盖。',
    'publicRequirement 至少 80 个字符，描述可观察目标、边界和公开验证方式，但不得出现 evaluator、reference.patch、隐藏验收或参考实现等泄露词。',
    'publicRequirement 中“仅修改”“保持不变”“不得影响”等范围限制必须与 referencePatch 和 equivalentPatch 完全一致；seedPatch 不得制造只能通过违反这些公开限制才能修复的矛盾起点。',
    'clarifications 仅包含公开需求确实可能触发的问题与冻结答案；availabilityChecks 只列实现所依赖的已存在项目文件，并且每个 target 都必须由 allowedPaths 中的文件或目录覆盖。maxReworks 和 maxClarifications 均不超过 2。',
    '最终仅返回符合给定 JSON schema 的对象；成功时 status=ready 且 cases 恰好两项，无法满足时 status=blocked 且 cases=[]。',
  ];
  if (routeCoverage) prompt.push(routeCoverage);
  if (correction) {
    prompt.push(`上一次候选校验失败，请只纠正该合同错误：code=${correction.code}${correction.target ? `，target=${correction.target}` : ''}。${authorCorrectionGuidance(correction.code)}`);
  }
  return prompt.join('\n');
}

export function executionPrompt(candidate, mode, comparison = 'no-plugin') {
  const common = [
    `任务 ID：${candidate.id}`,
    candidate.publicRequirement,
    `只允许修改这些业务范围：${candidate.allowedPaths.join('、')}。`,
    '不要访问网络、真实账号或生产系统，不要安装依赖。请完成实现并运行你能执行的聚焦验证；只能使用项目已有入口、直接模块导入或可重复的人工检查，不得通过 eval、new Function、vm 或截取、改写源码临时构造执行器。若缺少可靠入口，记录人工检查后返回 delivered，由独立验收判断结果。',
    '若公开需求存在真正影响实现的空白，请返回 needs_clarification；无法继续时返回 blocked；完成可验收实现时返回 delivered。',
    '最终只返回符合 JSON schema 的对象，question、blockerCode、blockerCategory 不适用时使用空字符串。',
  ];
  if (mode === 'plugin') {
    common.push('本基准的 delivered 只表示业务实现已可交给独立验收，不要求在隔离样本内完成生命周期；完成业务修改和一次可靠检查或人工复核后直接返回 delivered，不为 Direct 或 Light 创建管理产物，也不伪造 Complex 完成状态。');
    const lifecycle = candidate.expectedRoute === 'complex'
      ? '本轮已明确授权在隔离副本内写入管理产物；必须在业务实现前使用插件 workflow-cli create --write 建立恰好一个 OpenSpec change，并把它保留为活动 change 直到返回 delivered，本基准内不要执行 complete。'
      : 'Direct 与 Light 不得创建 OpenSpec change 或其他管理产物。';
    common.unshift(`请根据项目 AGENTS 和当前已安装的 frontend-ai-workflow 插件准入规则处理任务，本用例冻结预期路线为 ${candidate.expectedRoute}。必须返回一致的原生 route。${lifecycle}`);
  } else if (comparison === 'old-plugin') {
    common.push('按旧版原生流程达到可交给独立业务验收的状态后返回 delivered；旧版若要求需求或 OpenSpec 管理产物，允许按其合同建立，并单独记录这些额外输入与产物。');
    common.unshift('请使用当前隔离加载的改造前 frontend-ai-workflow 插件，按旧版 Skill 的原生准入规则处理任务。走 frontend-fast-change 时 route 返回 legacy-fast-change；走 frontend-change 时返回 legacy-managed-change。不要使用新版 frontend-delivery，也不要为满足新版路线人为改变旧版流程。');
  } else {
    common.unshift('直接实现并验证下面的需求，不创建需求文档、OpenSpec 变更、Wayfinder 或其他工作流管理文件；route 固定返回 baseline。');
  }
  return common.join('\n\n');
}

function workflowContinuationPrompt(candidate, route) {
  return `继续任务 ${candidate.id}。沿用已经建立的 ${route} 路线；若 Complex 规划尚未完整，先补齐必要事实并可再返回一次 planned，不要重建身份；随后完成业务代码和充分验证，可验收时返回 delivered，最终仍只返回 JSON schema 对象。`;
}

export function assessWorkflowRouteHistory(routes = []) {
  const routeHistory = routes.filter((route) => ['direct', 'light', 'complex'].includes(route));
  const uniqueRoutes = [...new Set(routeHistory)];
  return {
    valid: uniqueRoutes.length <= 1,
    code: uniqueRoutes.length <= 1 ? 'workflow_route_history_consistent' : 'workflow_route_transition_mismatch',
    routeHistory,
  };
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
    infrastructureFailed: Boolean(processResult.launchError || processResult.timedOut || processResult.interrupted
      || processResult.stdoutTruncated || processResult.stderrTruncated),
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
  // 准备耗时从创建隔离副本前开始，避免遗漏 Git 克隆与固定提交检出。
  const startedAt = isoNow(operations);
  const preparationStartedTick = performance.now();
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
  let route = mode === 'baseline' && config.comparison !== 'old-plugin' ? 'baseline' : 'unknown';
  let routeValid = false;
  let sessionId = null;
  let prompt = executionPrompt(candidate, mode, config.comparison);
  let eventText = '';
  let turnIndex = 0;
  let workflowTransitions = 0;
  const workflowRouteHistory = [];
  let routeEvidenceCode = null;
  let latestChanges = { patch: '', changedPaths: [], diffstat: { files: 0, insertions: 0, deletions: 0 } };
  let preparationMs = null;
  let deliveryCycleMs = null;
  let firstDeliveryCycleMs = null;
  let reworkCycleMs = 0;
  let firstFailedAcceptanceTick = null;
  let agentExecutionMs = 0;
  let acceptanceMs = 0;
  let cleanupMs = 0;
  const acceptanceDurationsMs = [];
  const phaseTimes = {
    preparation: { startedAt, endedAt: null },
    delivery: { startedAt: null, endedAt: null },
    acceptance: [],
    cleanup: { startedAt: null, endedAt: null },
  };
  try {
    applyUnifiedPatch(prepared.workspace, candidate.seedPatch, `${candidate.id}.seed`, { env: prepared.environment });
    commitWorkspaceBaseline(prepared.workspace, `benchmark seed ${candidate.id}`, { env: prepared.environment });
    preparationMs = performance.now() - preparationStartedTick;
    phaseTimes.preparation.endedAt = isoNow(operations);
    phaseTimes.delivery.startedAt = phaseTimes.preparation.endedAt;
    const deliveryStartedTick = performance.now();
    while (turnIndex < 12) {
      turnIndex += 1;
      const temporaryOutputPath = path.join(config.runRoot, 'tmp', `${runName}-${turnIndex}-final.json`);
      const eventOutputPath = path.join(runRoot, `turn-${String(turnIndex).padStart(2, '0')}.events.ndjson`);
      const turnStartedTick = performance.now();
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
      const turnDurationMs = performance.now() - turnStartedTick;
      agentExecutionMs += turnDurationMs;
      evidence.push(...turn.eventPaths);
      eventText += `\n${turn.processResult.stdout || ''}`;
      sessionId ||= turn.parsed.sessionId;
      turns.push({
        index: turnIndex,
        startedAt: turn.startedAt || null,
        endedAt: turn.endedAt || null,
        exitCode: turn.processResult.exitCode,
        launchError: turn.processResult.launchError,
        timedOut: turn.processResult.timedOut,
        interrupted: turn.processResult.interrupted,
        invalidEventLines: turn.parsed.invalidLineCount,
        stdoutTruncated: turn.processResult.stdoutTruncated === true,
        stderrTruncated: turn.processResult.stderrTruncated === true,
        durationMs: turnDurationMs,
        tokenUsage: {
          ...turn.parsed.tokenUsage,
          // 非缓存输入只在逐轮用量完整时计算，不用文本长度估算。
          nonCachedInputTokens: turn.parsed.tokenUsage.status === 'available'
            ? turn.parsed.tokenUsage.inputTokens - turn.parsed.tokenUsage.cachedInputTokens : null,
        },
        activity: turn.parsed.activity,
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
      if (mode === 'plugin' && ['direct', 'light', 'complex'].includes(response.route)) {
        workflowRouteHistory.push(response.route);
      }
      if (response.status === 'planned') {
        if (mode !== 'plugin' || workflowTransitions >= 2) {
          finalStatus = 'failed';
          break;
        }
        workflowTransitions += 1;
        prompt = workflowContinuationPrompt(candidate, response.route);
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
      validateDeliveryScope({ candidate, mode, comparison: config.comparison, route: response.route, changedPaths: latestChanges.changedPaths });
      const routeResult = detectExecutionRoute({
        mode,
        comparison: config.comparison,
        eventText,
        finalRoute: response.route,
        changedPaths: latestChanges.changedPaths,
        expectedRoute: candidate.expectedRoute,
      });
      route = routeResult.route;
      const routeHistory = assessWorkflowRouteHistory(workflowRouteHistory);
      routeValid = routeResult.valid && routeHistory.valid;
      routeEvidenceCode = routeHistory.valid ? routeResult.code : routeHistory.code;
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
      if (!firstDeliveredAt) {
        firstDeliveredAt = isoNow(operations);
        firstDeliveryCycleMs = performance.now() - deliveryStartedTick;
      }
      const acceptanceStartedAt = isoNow(operations);
      const acceptanceStartedTick = performance.now();
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
      const acceptanceDurationMs = performance.now() - acceptanceStartedTick;
      acceptanceMs += acceptanceDurationMs;
      acceptanceDurationsMs.push(acceptanceDurationMs);
      phaseTimes.acceptance.push({
        startedAt: acceptanceStartedAt,
        endedAt: isoNow(operations),
        durationMs: acceptanceDurationMs,
        passed: acceptance.passed,
      });
      const acceptancePath = path.join(runRoot, `acceptance-${String(acceptanceAttempts.length + 1).padStart(2, '0')}.json`);
      writeJsonAtomic(config.repositoryRoot, acceptancePath, acceptance, { mustNotExist: true });
      evidence.push(path.relative(config.repositoryRoot, acceptancePath).replaceAll('\\', '/'));
      acceptanceAttempts.push(acceptance);
      if (acceptance.infrastructureFailed) {
        throw new DeveloperEffectivenessBenchmarkError('acceptance_infrastructure_failed', '独立验收器异常，不能把该次失败当作业务返工', candidate.id);
      }
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
      firstFailedAcceptanceTick ||= performance.now();
      prompt = reworkPrompt(acceptance);
    }
    deliveryCycleMs = performance.now() - deliveryStartedTick;
    if (firstFailedAcceptanceTick !== null) reworkCycleMs = performance.now() - firstFailedAcceptanceTick;
    phaseTimes.delivery.endedAt = isoNow(operations);
  } finally {
    phaseTimes.cleanup.startedAt = isoNow(operations);
    const cleanupStartedTick = performance.now();
    const cleanup = config.keepWorkspaces
      ? { status: 'limited', code: 'workspace_retained_by_request', target: runName }
      : cleanupBoundedWorkspace({ runRoot: config.runRoot, workspace: prepared.workspace });
    const cleanupPath = path.join(runRoot, 'cleanup.json');
    writeJsonAtomic(config.repositoryRoot, cleanupPath, cleanup, { mustNotExist: true });
    evidence.push(path.relative(config.repositoryRoot, cleanupPath).replaceAll('\\', '/'));
    cleanupMs = performance.now() - cleanupStartedTick;
    phaseTimes.cleanup.endedAt = isoNow(operations);
  }
  const endedAt = phaseTimes.cleanup.endedAt;
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
    workflowRouteHistory,
    routeEvidenceCode,
    telemetryContract: 'complete-turn-usage-v1',
    // 主交付周期从首轮代理调用开始，到最终独立验收或停止为止；种子准备与清理单列。
    duration: {
      deliveryCycleMs, firstDeliveryCycleMs, reworkCycleMs, preparationMs,
      agentExecutionMs, acceptanceMs, cleanupMs, acceptanceDurationsMs,
    },
    phaseTimes,
    tokenUsage: aggregateCodexTokenUsage(turns.map((turn) => turn.tokenUsage)),
    turns,
    evidence,
  };
  const metrics = buildRunMetrics(runResult);
  return { runResult, metrics };
}
