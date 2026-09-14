import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createEventId,
  LifecycleError,
  normalizeRepositoryPath,
  readLifecycleConfig,
  sha256,
} from './lifecycle-contract.mjs';
import { appendLifecycleEvent, projectLifecycleState } from './lifecycle-history.mjs';
import {
  acquireLifecycleLock,
  completeLifecycleTransaction,
  inspectGitCompletionState,
  readLifecycleTransaction,
  releaseLifecycleLock,
  writeLifecycleTransaction,
} from './lifecycle-transaction.mjs';
import { removeProjectDirectory, removeProjectFile, resolveSafeProjectPath } from './project-path-safety.mjs';

const TERMINAL_TYPES = new Set(['cancelled', 'superseded']);
const TRANSITION_TYPES = new Set([...TERMINAL_TYPES, 'reopened']);

function requirementId(requirementPath) {
  const match = path.basename(requirementPath).match(/^(REQ-\d{4}-\d+)/u);
  if (!match) throw new LifecycleError('invalid_requirement_id', '需求文件名缺少稳定 REQ ID');
  return match[1];
}

function changeFacts(changePath) {
  const specRoot = path.join(changePath, 'specs');
  const files = [];
  if (fs.existsSync(specRoot)) {
    const visit = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(target);
        else if (entry.isFile() && entry.name.endsWith('.md')) files.push(target);
      }
    };
    visit(specRoot);
  }
  files.sort((left, right) => left.localeCompare(right));
  const capabilities = [...new Set(files.map((file) => path.relative(specRoot, path.dirname(file)).replaceAll('\\', '/')))]
    .filter(Boolean)
    .sort();
  const digestInput = files.map((file) => `${path.relative(changePath, file).replaceAll('\\', '/')}\n${fs.readFileSync(file, 'utf8')}`).join('\n---\n');
  return { capabilities, specDigest: sha256(digestInput) };
}

function transitionStateAllowed(state, type) {
  if (TERMINAL_TYPES.has(type)) return state.active && state.status === 'active';
  const onlyExpectedConflict = state.diagnostics.every((item) => item.code === 'active_terminal_conflict');
  return state.active
    && ['accepted', 'cancelled', 'superseded'].includes(state.event?.type)
    && onlyExpectedConflict;
}

function cleanupActiveMaterials(root, transaction) {
  const changePath = path.join(root, transaction.changePath);
  const requirementPath = path.join(root, transaction.requirementPath);
  if (fs.existsSync(changePath)) removeProjectDirectory(root, changePath, { label: '终态活动变更' });
  if (fs.existsSync(requirementPath)) removeProjectFile(root, requirementPath, { label: '终态活动需求' });
}

export function recoverLifecycleTransition({ root = process.cwd(), transactionId } = {}) {
  let transaction = readLifecycleTransaction(root, transactionId);
  if (!transaction) return { ok: true, code: 'lifecycle_recovery_not_needed', status: 'cleaned', transactionId };
  if (!TERMINAL_TYPES.has(transaction.operationType)) {
    throw new LifecycleError('invalid_lifecycle_transaction', '该事务不是可恢复的取消或替代操作', transactionId);
  }
  const lock = acquireLifecycleLock(root, transactionId, { recover: true });
  try {
    if (transaction.stage === 'prepare') {
      appendLifecycleEvent({ root, event: transaction.event });
      transaction = writeLifecycleTransaction(root, { ...transaction, stage: 'event-written', eventId: transaction.event.eventId });
    }
    if (transaction.stage === 'event-written') {
      cleanupActiveMaterials(lock.layout.config.root, transaction);
      transaction = writeLifecycleTransaction(root, { ...transaction, stage: 'cleaned' });
    }
    completeLifecycleTransaction(root, transactionId);
    return { ok: true, code: 'lifecycle_transition_recovered', status: transaction.operationType, transactionId, event: transaction.event };
  } finally {
    releaseLifecycleLock(lock);
  }
}

export function transitionLifecycle({
  root = process.cwd(),
  requirement,
  change,
  type,
  scope = '.',
  write = false,
} = {}) {
  if (!TRANSITION_TYPES.has(type)) throw new LifecycleError('invalid_lifecycle_transition', 'type 必须是 cancelled、superseded 或 reopened', type);
  const config = readLifecycleConfig(root);
  if (config.lifecycleMode !== 'v2') throw new LifecycleError('lifecycle_write_disabled', '当前仓库处于 legacy-readonly，禁止写入 v2 事件');
  const normalizedScope = normalizeRepositoryPath(scope, 'scope', { allowRoot: true });
  const requirementTarget = resolveSafeProjectPath(config.root, requirement, '需求路径', { mustExist: true, allowDirectory: false });
  const changeTarget = resolveSafeProjectPath(config.root, change, '变更路径', { mustExist: true });
  if (changeTarget.kind !== 'directory') throw new LifecycleError('invalid_lifecycle_transition', '变更路径必须是目录', changeTarget.projectPath);
  const changeId = path.basename(changeTarget.absolutePath);
  const state = projectLifecycleState({ root: config.root, scope: normalizedScope, changeId });
  if (!transitionStateAllowed(state, type)) {
    return { ok: false, code: 'lifecycle_state_blocked', status: 'blocked', write, type, scope: normalizedScope, lifecycleState: state, actions: [] };
  }
  const gitState = inspectGitCompletionState(config.root);
  if (!gitState.ok) return { ok: false, code: 'lifecycle_git_blocked', status: 'blocked', write, type, scope: normalizedScope, gitState, actions: [] };
  const facts = changeFacts(changeTarget.absolutePath);
  const actions = [
    { action: 'append-lifecycle-event', target: changeId, type, scope: normalizedScope },
    ...(TERMINAL_TYPES.has(type) ? [
      { action: 'remove-active-change', target: changeTarget.projectPath },
      { action: 'remove-active-requirement', target: requirementTarget.projectPath },
    ] : []),
  ];
  if (!write) return { ok: true, code: 'lifecycle_transition_ready', status: 'ready', write, type, scope: normalizedScope, gitState, actions };

  const occurredAt = new Date().toISOString();
  const revision = state.event ? state.event.revision + 1 : 1;
  const supersedes = state.event?.eventId || null;
  const event = {
    schemaVersion: 2,
    eventId: createEventId({ changeId, revision, occurredAt, specDigest: facts.specDigest }),
    scope: normalizedScope,
    changeId,
    requirementId: requirementId(requirementTarget.absolutePath),
    type,
    revision,
    occurredAt,
    baseRevision: gitState.baseRevision,
    capabilities: facts.capabilities,
    specDigest: facts.specDigest,
    checks: [{ name: 'lifecycle-transition', status: 'recorded' }],
    trust: 'declared',
    supersedes,
  };
  const transactionId = `txn-${sha256(`${event.eventId}\n${type}`).slice(0, 24)}`;
  const lock = acquireLifecycleLock(config.root, transactionId);
  try {
    const lockedState = projectLifecycleState({ root: config.root, scope: normalizedScope, changeId });
    if (!transitionStateAllowed(lockedState, type)
      || lockedState.event?.eventId !== state.event?.eventId) {
      throw new LifecycleError('lifecycle_state_changed', '生命周期状态在预检后发生变化，请重新预览', changeId);
    }
    if (type === 'reopened') {
      const appended = appendLifecycleEvent({ root: config.root, event });
      return { ok: true, code: 'lifecycle_transitioned', status: 'active', write, type, scope: normalizedScope, event: appended.event, actions };
    }
    let transaction = writeLifecycleTransaction(config.root, {
      transactionId,
      stage: 'prepare',
      operationType: type,
      scope: normalizedScope,
      changeId,
      changePath: changeTarget.projectPath,
      requirementPath: requirementTarget.projectPath,
      archivePath: null,
      baseRevision: gitState.baseRevision,
      occurredAt,
      revision,
      supersedes,
      capabilities: facts.capabilities,
      evidenceMode: 'default',
      event,
    });
    const appended = appendLifecycleEvent({ root: config.root, event });
    transaction = writeLifecycleTransaction(config.root, { ...transaction, stage: 'event-written', eventId: appended.event.eventId });
    cleanupActiveMaterials(config.root, transaction);
    writeLifecycleTransaction(config.root, { ...transaction, stage: 'cleaned' });
    completeLifecycleTransaction(config.root, transactionId);
    return { ok: true, code: 'lifecycle_transitioned', status: type, write, type, scope: normalizedScope, event: appended.event, actions };
  } finally {
    releaseLifecycleLock(lock);
  }
}

function parseArgs(argv) {
  const args = { root: process.cwd(), requirement: null, change: null, type: null, scope: '.', write: false, recover: null };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--write') args.write = true;
    else if (['--target', '--requirement', '--change', '--type', '--scope', '--recover'].includes(option)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`参数 ${option} 缺少值`);
      args[option === '--target' ? 'root' : option.slice(2)] = value;
      index += 1;
    } else throw new Error(`不支持的参数：${option}`);
  }
  if (!args.recover && (!args.requirement || !args.change || !args.type)) throw new Error('必须提供 --requirement、--change 和 --type');
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = args.recover
      ? recoverLifecycleTransition({ root: args.root, transactionId: args.recover })
      : transitionLifecycle(args);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: error.code || 'lifecycle_transition_failed', status: error.status || 'failed', target: error.target || null, errors: [error.message] }, null, 2));
    process.exitCode = 1;
  }
}
