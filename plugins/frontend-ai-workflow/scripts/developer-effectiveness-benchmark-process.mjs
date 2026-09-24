import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { runBootstrap } from './bootstrap-project.mjs';
import { MANAGEMENT_PATHS } from './developer-effectiveness-benchmark-contract.mjs';
import {
  MAX_CAPTURE_BYTES,
  DeveloperEffectivenessBenchmarkError,
  captureWorkspaceChanges,
  cleanupBoundedWorkspace,
  collectSourceBaseline,
  commitWorkspaceBaseline,
  prepareCommittedWorkspace, sanitizeCapturedOutput, workspaceEnvironment, writeTextAtomic,
} from './developer-effectiveness-benchmark-foundation.mjs';

const PROJECT_OPTION = '--project';
const DEFAULT_TIMEOUT_MINUTES = 30;
const PROCESS_TERMINATION_GRACE_MS = 2_000;
export const DEFAULT_AUTHOR_ATTEMPTS = 2;

function requiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (typeof value !== 'string' || !value || value.startsWith('--')) {
    throw new DeveloperEffectivenessBenchmarkError('missing_cli_value', `参数 ${option} 缺少值`, option);
  }
  return value;
}

function readProjectName(projectRoot) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    return typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : path.basename(projectRoot);
  } catch {
    return path.basename(projectRoot);
  }
}

function parseProjectOption(value) {
  const separator = value.indexOf('=');
  if (separator <= 0 || separator === value.length - 1) {
    throw new DeveloperEffectivenessBenchmarkError('invalid_project_option', '--project 必须使用 P1=/absolute/path 格式', value);
  }
  const id = value.slice(0, separator);
  const root = value.slice(separator + 1);
  return { id, root, name: readProjectName(root) };
}

export function parseBenchmarkCliArgs(argv, { repositoryRoot = process.cwd() } = {}) {
  const result = {
    repositoryRoot,
    runId: null,
    model: null,
    reasoning: null,
    timeoutMinutes: DEFAULT_TIMEOUT_MINUTES,
    projects: [],
    codex: 'codex',
    write: false,
    executeAgents: false,
    keepWorkspaces: false,
    smokeCase: null,
    pairCase: null,
    reuseCasesFrom: null,
    comparison: 'no-plugin',
    oldSource: null,
    oldSourceDigest: null,
    oldInstall: null,
    candidateInstall: null,
    authorAttempts: DEFAULT_AUTHOR_ATTEMPTS,
    maxNewRuns: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === PROJECT_OPTION) {
      result.projects.push(parseProjectOption(requiredValue(argv, index, option)));
      index += 1;
      continue;
    }
    const valueOptions = {
      '--repository-root': 'repositoryRoot',
      '--run-id': 'runId',
      '--model': 'model',
      '--reasoning': 'reasoning',
      '--timeout-minutes': 'timeoutMinutes',
      '--codex': 'codex',
      '--author-attempts': 'authorAttempts',
      '--smoke-case': 'smokeCase',
      '--pair-case': 'pairCase',
      '--reuse-cases-from': 'reuseCasesFrom',
      '--max-new-runs': 'maxNewRuns',
      '--comparison': 'comparison',
      '--old-source': 'oldSource',
      '--old-source-digest': 'oldSourceDigest',
      '--old-install': 'oldInstall',
      '--candidate-install': 'candidateInstall',
    };
    if (valueOptions[option]) {
      result[valueOptions[option]] = requiredValue(argv, index, option);
      index += 1;
      continue;
    }
    if (option === '--write') result.write = true;
    else if (option === '--execute-agents') result.executeAgents = true;
    else if (option === '--keep-workspaces') result.keepWorkspaces = true;
    else throw new DeveloperEffectivenessBenchmarkError('unsupported_cli_argument', `不支持的参数：${option}`, option);
  }
  result.timeoutMinutes = Number(result.timeoutMinutes);
  result.authorAttempts = Number(result.authorAttempts);
  result.maxNewRuns = result.maxNewRuns === null ? null : Number(result.maxNewRuns);
  if (!Number.isInteger(result.authorAttempts) || result.authorAttempts < 1 || result.authorAttempts > 3) {
    throw new DeveloperEffectivenessBenchmarkError('invalid_author_attempts', '作者重试次数必须是 1 到 3 的整数', 'authorAttempts');
  }
  if (result.maxNewRuns !== null && (!Number.isInteger(result.maxNewRuns) || result.maxNewRuns < 1)) {
    throw new DeveloperEffectivenessBenchmarkError('invalid_max_new_runs', '单次新增运行数必须是正整数', 'maxNewRuns');
  }
  if (!['no-plugin', 'old-plugin'].includes(result.comparison)) {
    throw new DeveloperEffectivenessBenchmarkError('invalid_comparison', '主对照只能选 old-plugin，诊断对照只能选 no-plugin', 'comparison');
  }
  return result;
}

function resolveCodexEntry(entry) {
  if (typeof entry !== 'string' || !entry.trim()) {
    throw new DeveloperEffectivenessBenchmarkError('codex_entry_missing', '缺少 Codex 可执行入口', 'codex');
  }
  const selected = entry.trim();
  if (/\.(?:cmd|bat)$/iu.test(selected)) {
    throw new DeveloperEffectivenessBenchmarkError('windows_wrapper_not_supported', '不得直接启动 Windows .cmd 或 .bat 包装器', 'codex');
  }
  if (/\.(?:c?js|mjs)$/iu.test(selected)) return { command: process.execPath, prefix: [selected], kind: 'javascript' };
  return { command: selected, prefix: [], kind: 'executable' };
}

export function buildCodexInvocation({
  entry,
  workspace,
  model,
  reasoning,
  prompt,
  schemaPath,
  outputPath,
  sandbox = 'workspace-write',
  sessionId = null,
  mode = 'plugin',
  comparison = 'no-plugin',
}) {
  const resolved = resolveCodexEntry(entry);
  const shared = [
    '--json', '--model', model,
    '--config', `model_reasoning_effort="${reasoning}"`,
    '--output-schema', schemaPath,
    '--output-last-message', outputPath,
  ];
  // 当前 Codex CLI 中自动审批本身已选择 workspace-write，不能再与 --sandbox 同传。
  const sandboxArgs = sandbox === 'workspace-write' ? ['--approve-for-me'] : ['--sandbox', sandbox];
  // resume 不接受 --sandbox；每轮显式恢复首轮权限，防止返工轮回落为只读。
  const resumePermissions = sandbox === 'workspace-write'
    ? ['--config', 'sandbox_mode="workspace-write"', '--config', 'approval_policy="on-request"', '--config', 'approvals_reviewer="auto_review"']
    : ['--config', `sandbox_mode="${sandbox}"`];
  const isolationArgs = comparison === 'old-plugin'
    ? [
      '--ignore-user-config', '--enable', 'plugins', '--enable', 'skip_host_skill_discovery',
      '--config', `plugins.frontend-ai-workflow@frontend-ai-workflow.enabled=${mode === 'plugin'}`,
      '--config', `plugins.frontend-ai-workflow@p9-old-plugin.enabled=${mode === 'baseline'}`,
    ]
    : (mode === 'baseline' ? ['--ignore-user-config', '--disable', 'plugins', '--enable', 'skip_host_skill_discovery'] : []);
  const args = sessionId
    ? [...resolved.prefix, 'exec', ...isolationArgs, 'resume', ...resumePermissions, ...shared, sessionId, prompt]
    : [
      ...resolved.prefix, 'exec', ...isolationArgs, ...shared, '--color', 'never', ...sandboxArgs, '--cd', workspace, prompt,
    ];
  return { command: resolved.command, args, cwd: workspace, shell: false, entryKind: resolved.kind };
}

export function runBoundedProcess(
  { command, args, cwd, env, timeoutMs, input = null },
  { spawnProcess = spawn, terminationGraceMs = PROCESS_TERMINATION_GRACE_MS } = {},
) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnProcess(command, args, { cwd, env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({
        exitCode: null, launchError: true, timedOut: false, interrupted: false,
        stdout: '', stderr: error.message, stdoutTruncated: false, stderrTruncated: false,
      });
      return;
    }
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let interrupted = false;
    let settled = false;
    let terminationReason = null;
    let forceTimer = null;
    const append = (current, chunk, stream) => {
      const incoming = Buffer.from(chunk);
      const remaining = MAX_CAPTURE_BYTES - current.byteLength;
      if (incoming.byteLength > remaining) {
        if (stream === 'stdout') stdoutTruncated = true;
        else stderrTruncated = true;
        return remaining > 0 ? Buffer.concat([current, incoming.subarray(0, remaining)]) : current;
      }
      return Buffer.concat([current, incoming]);
    };
    child.stdout?.on('data', (chunk) => { stdout = append(stdout, chunk, 'stdout'); });
    child.stderr?.on('data', (chunk) => { stderr = append(stderr, chunk, 'stderr'); });
    const stop = (reason) => {
      if (!child || settled || terminationReason) return;
      terminationReason = reason;
      timedOut = reason === 'timeout';
      interrupted = reason === 'interrupt';
      child.kill('SIGTERM');
      // killed 只表示信号已发送，不能证明进程已经退出；宽限期后按真实退出状态强制终止。
      forceTimer = setTimeout(() => {
        if (!settled && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }, terminationGraceMs);
    };
    const interruptHandler = () => stop('interrupt');
    process.once('SIGINT', interruptHandler);
    process.once('SIGTERM', interruptHandler);
    const timeout = setTimeout(() => stop('timeout'), timeoutMs);
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceTimer) clearTimeout(forceTimer);
      process.removeListener('SIGINT', interruptHandler);
      process.removeListener('SIGTERM', interruptHandler);
      resolve({
        exitCode: null, launchError: true, timedOut, interrupted,
        stdout: stdout.toString('utf8'), stderr: error.message, stdoutTruncated, stderrTruncated,
      });
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceTimer) clearTimeout(forceTimer);
      process.removeListener('SIGINT', interruptHandler);
      process.removeListener('SIGTERM', interruptHandler);
      resolve({
        exitCode: code, launchError: false, timedOut, interrupted,
        stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), stdoutTruncated, stderrTruncated,
      });
    });
    if (input !== null) child.stdin?.end(input);
    else child.stdin?.end();
  });
}

export function parseCodexJsonLines(content) {
  const events = [];
  let invalidLineCount = 0;
  let sessionId = null;
  for (const line of String(content || '').split('\n').filter(Boolean)) {
    try {
      const event = JSON.parse(line);
      events.push(event);
      sessionId ||= event.thread_id || event.session_id || event.thread?.id || null;
    } catch {
      invalidLineCount += 1;
    }
  }
  return { events, invalidLineCount, sessionId, tokenUsage: extractCodexTokenUsage(events), activity: summarizeCodexActivity(events) };
}

export function summarizeCodexActivity(events) {
  const commands = (Array.isArray(events) ? events : [])
    .filter((event) => event?.type === 'item.completed' && event.item?.type === 'command_execution')
    .map((event) => String(event.item.command || ''));
  return {
    commandCount: commands.length,
    observedSkillReadCommands: commands.filter((command) => /SKILL\.md/u.test(command)).length,
    observedAgentsReadCommands: commands.filter((command) => /(?:^|[\s/])AGENTS\.md/u.test(command)).length,
    observedTestCommands: commands.filter((command) => /(?:npm\s+test|node\s+--test|vitest|playwright\s+test)/u.test(command)).length,
  };
}

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

export function outputRedactions(config, baselines, workspace = null) {
  return [
    ...baselines.map((baseline) => ({ value: baseline.sourceRoot, replacement: `project:${baseline.projectId}` })),
    { value: workspace, replacement: '[workspace]' },
    { value: config.runRoot, replacement: '[run]' },
    { value: config.repositoryRoot, replacement: '[repository]' },
  ];
}

export async function runCodexTurn({
  config, workspace, prompt, schemaPath, temporaryOutputPath, eventOutputPath,
  sandbox, sessionId, mode = 'plugin', baselines, operations,
}) {
  const invocation = buildCodexInvocation({
    entry: config.codex, workspace, model: config.model, reasoning: config.reasoning,
    prompt, schemaPath, outputPath: temporaryOutputPath, sandbox, sessionId, mode,
    comparison: config.comparison,
  });
  const execute = operations.runProcess || runBoundedProcess;
  const startedAt = new Date().toISOString();
  const processResult = await execute({
    ...invocation,
    env: workspaceEnvironment(config.runRoot, workspace),
    timeoutMs: config.timeoutMinutes * 60_000,
  });
  const endedAt = new Date().toISOString();
  const parsed = parseCodexJsonLines(processResult.stdout);
  // 截断后的事件流即使用量事件恰好仍在前缀中，也不能作为完整用量证据。
  if (processResult.stdoutTruncated || processResult.stderrTruncated || parsed.invalidLineCount > 0) {
    parsed.tokenUsage = {
      status: 'invalid', reason: processResult.stdoutTruncated || processResult.stderrTruncated
        ? 'truncated-agent-output' : 'invalid-event-stream',
      turnCount: 0, inputTokens: null, cachedInputTokens: null,
      outputTokens: null, reasoningOutputTokens: null, totalTokens: null,
    };
  }
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
    processResult, parsed, finalResponse, startedAt, endedAt,
    eventPaths: [eventOutputPath, stderrOutputPath].map((target) => path.relative(config.repositoryRoot, target).replaceAll('\\', '/')),
  };
}

const TOKEN_USAGE_FIELDS = Object.freeze([
  ['inputTokens', 'input_tokens'],
  ['cachedInputTokens', 'cached_input_tokens'],
  ['outputTokens', 'output_tokens'],
  ['reasoningOutputTokens', 'reasoning_output_tokens'],
]);

function emptyTokenUsage(status, reason) {
  return {
    status,
    reason,
    turnCount: 0,
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    reasoningOutputTokens: null,
    totalTokens: null,
  };
}

export function extractCodexTokenUsage(events) {
  const totals = Object.fromEntries(TOKEN_USAGE_FIELDS.map(([field]) => [field, 0]));
  let turnCount = 0;
  let missingUsage = false;
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type !== 'turn.completed') continue;
    if (event.usage === undefined) {
      missingUsage = true;
      continue;
    }
    if (!event.usage || typeof event.usage !== 'object' || Array.isArray(event.usage)) {
      return emptyTokenUsage('invalid', 'invalid-token-usage');
    }
    for (const [field, source] of TOKEN_USAGE_FIELDS) {
      const value = event.usage[source];
      if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(totals[field] + value)) {
        return emptyTokenUsage('invalid', 'invalid-token-usage');
      }
      totals[field] += value;
    }
    if (event.usage.cached_input_tokens > event.usage.input_tokens
      || event.usage.reasoning_output_tokens > event.usage.output_tokens) {
      return emptyTokenUsage('invalid', 'invalid-token-usage');
    }
    turnCount += 1;
  }
  if (missingUsage || turnCount === 0) return emptyTokenUsage('missing', 'missing-token-usage');
  if (totals.cachedInputTokens > totals.inputTokens || totals.reasoningOutputTokens > totals.outputTokens) {
    return emptyTokenUsage('invalid', 'invalid-token-usage');
  }
  const totalTokens = totals.inputTokens + totals.outputTokens;
  if (!Number.isSafeInteger(totalTokens)) return emptyTokenUsage('invalid', 'invalid-token-usage');
  return { status: 'available', reason: null, turnCount, ...totals, totalTokens };
}

export function aggregateCodexTokenUsage(usages) {
  const items = Array.isArray(usages) ? usages : [];
  if (items.some((item) => item?.status === 'invalid')) return emptyTokenUsage('invalid', 'invalid-token-usage');
  if (!items.length || items.some((item) => item?.status !== 'available')) {
    return emptyTokenUsage('missing', 'missing-token-usage');
  }
  const totals = Object.fromEntries(TOKEN_USAGE_FIELDS.map(([field]) => [field, 0]));
  let turnCount = 0;
  for (const item of items) {
    turnCount += item.turnCount;
    for (const [field] of TOKEN_USAGE_FIELDS) {
      if (!Number.isSafeInteger(item[field]) || item[field] < 0 || !Number.isSafeInteger(totals[field] + item[field])) {
        return emptyTokenUsage('invalid', 'invalid-token-usage');
      }
      totals[field] += item[field];
    }
  }
  if (totals.cachedInputTokens > totals.inputTokens || totals.reasoningOutputTokens > totals.outputTokens) {
    return emptyTokenUsage('invalid', 'invalid-token-usage');
  }
  const totalTokens = totals.inputTokens + totals.outputTokens;
  if (!Number.isSafeInteger(totalTokens)) return emptyTokenUsage('invalid', 'invalid-token-usage');
  return { status: 'available', reason: null, turnCount, ...totals, totalTokens };
}

function runGit(workspace, args, env) {
  const result = spawnSync('git', ['-C', workspace, ...args], {
    encoding: 'utf8', maxBuffer: MAX_CAPTURE_BYTES, shell: false, env,
  });
  if (result.error || result.status !== 0) {
    throw new DeveloperEffectivenessBenchmarkError('workspace_git_failed', `隔离工作区 Git 操作失败：${args[0]}`, args[0]);
  }
}

function isoNow(operations) {
  return (operations.now ? operations.now() : new Date()).toISOString();
}

export function preparePluginBaselines({ config, baselines, operations }) {
  const preparedProjects = new Map();
  let active = null;
  try {
    for (const project of config.projects) {
      const startedAt = isoNow(operations);
      const sourceBaseline = baselines.find((item) => item.projectId === project.id);
      active = prepareCommittedWorkspace({
        project, baseline: sourceBaseline, runRoot: config.runRoot,
        name: `${project.id.toLowerCase()}-plugin-prepared`, recoverExisting: true,
      });
      const bootstrap = operations.bootstrap || runBootstrap;
      const first = bootstrap({ target: active.workspace, write: true });
      const repeated = bootstrap({ target: active.workspace, write: true });
      if (!first?.ok || !repeated?.ok || repeated.actions?.some((item) => ['create', 'update'].includes(item.action))) {
        throw new DeveloperEffectivenessBenchmarkError('plugin_prepare_failed', `项目 ${project.id} 的插件基线初始化或幂等检查失败`, project.id);
      }
      const preparationChanges = captureWorkspaceChanges(active.workspace, { env: active.environment });
      const unexpected = preparationChanges.changedPaths.filter((candidate) => !MANAGEMENT_PATHS.some((allowed) => (
        candidate === allowed.replace(/\/$/u, '') || candidate.startsWith(allowed)
      )));
      if (unexpected.length) {
        throw new DeveloperEffectivenessBenchmarkError('plugin_prepare_source_changed', `项目 ${project.id} 的插件准备修改了业务路径`, unexpected[0]);
      }
      commitWorkspaceBaseline(active.workspace, 'benchmark plugin prepared', { env: active.environment });
      runGit(active.workspace, ['switch', '--quiet', '-c', 'benchmark-plugin-prepared'], active.environment);
      const preparedProject = { id: project.id, name: project.name, root: active.workspace };
      const preparedBaseline = collectSourceBaseline(preparedProject);
      const endedAt = isoNow(operations);
      preparedProjects.set(project.id, {
        project: preparedProject,
        baseline: preparedBaseline,
        workspace: active.workspace,
        preparation: {
          status: 'passed', code: 'plugin_baseline_prepared',
          actionCount: first.actions?.length || 0,
          repeatedActionCount: repeated.actions?.filter((item) => ['create', 'update'].includes(item.action)).length || 0,
          managementPaths: preparationChanges.changedPaths,
          startedAt, endedAt, durationMs: Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)),
        },
      });
      active = null;
    }
  } catch (error) {
    if (active) cleanupBoundedWorkspace({ runRoot: config.runRoot, workspace: active.workspace });
    for (const prepared of preparedProjects.values()) {
      cleanupBoundedWorkspace({ runRoot: config.runRoot, workspace: prepared.workspace });
    }
    throw error;
  }
  return preparedProjects;
}
