import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { runBootstrap } from './bootstrap-project.mjs';
import {
  MAX_CAPTURE_BYTES,
  DeveloperEffectivenessBenchmarkError,
  captureWorkspaceChanges,
  cleanupBoundedWorkspace,
  collectSourceBaseline,
  commitWorkspaceBaseline,
  prepareCommittedWorkspace,
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
    authorAttempts: DEFAULT_AUTHOR_ATTEMPTS,
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
  if (!Number.isInteger(result.authorAttempts) || result.authorAttempts < 1 || result.authorAttempts > 3) {
    throw new DeveloperEffectivenessBenchmarkError('invalid_author_attempts', '作者重试次数必须是 1 到 3 的整数', 'authorAttempts');
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
  const args = sessionId
    ? [...resolved.prefix, 'exec', 'resume', ...shared, sessionId, prompt]
    : [
      ...resolved.prefix, 'exec', ...shared, '--color', 'never', ...sandboxArgs, '--cd', workspace, prompt,
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
      resolve({ exitCode: null, launchError: true, timedOut: false, interrupted: false, stdout: '', stderr: error.message });
      return;
    }
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let timedOut = false;
    let interrupted = false;
    let settled = false;
    let terminationReason = null;
    let forceTimer = null;
    const append = (current, chunk) => {
      const combined = Buffer.concat([current, Buffer.from(chunk)]);
      return combined.byteLength > MAX_CAPTURE_BYTES ? combined.subarray(0, MAX_CAPTURE_BYTES) : combined;
    };
    child.stdout?.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr?.on('data', (chunk) => { stderr = append(stderr, chunk); });
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
        stdout: stdout.toString('utf8'), stderr: error.message,
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
        stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'),
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
  return { events, invalidLineCount, sessionId };
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
  const allowedPaths = ['AGENTS.md', 'openspec/', 'wayfinder/'];
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
      const unexpected = preparationChanges.changedPaths.filter((candidate) => !allowedPaths.some((allowed) => (
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
