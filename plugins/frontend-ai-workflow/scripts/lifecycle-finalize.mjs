import fs from 'node:fs';
import path from 'node:path';
import {
  removeProjectDirectory,
  removeProjectFile,
} from './project-path-safety.mjs';
import {
  createEventId,
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

function parseEngineJson(output) {
  const start = String(output || '').indexOf('{');
  if (start < 0) return null;
  try {
    return JSON.parse(output.slice(start));
  } catch {
    return null;
  }
}

function listSpecCapabilities(changePath) {
  const root = path.join(changePath, 'specs');
  if (!fs.existsSync(root)) return [];
  const capabilities = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name === 'spec.md') capabilities.push(path.relative(root, path.dirname(target)).replaceAll('\\', '/'));
    }
  }
  visit(root);
  return capabilities.filter(Boolean).sort();
}

export function digestMainSpecs(root, capabilities) {
  const parts = [];
  for (const capability of capabilities) {
    const file = path.join(root, 'openspec', 'specs', capability, 'spec.md');
    if (fs.existsSync(file)) parts.push(`${capability}\n${fs.readFileSync(file, 'utf8')}`);
  }
  return sha256(parts.join('\n---\n'));
}

export function requirementId(requirementPath) {
  const match = path.basename(requirementPath).match(/^(REQ-\d{4}-\d+)/u);
  if (!match) throw new Error('需求文件名缺少稳定 REQ ID');
  return match[1];
}

function archiveResultDetails(result, predictedTarget) {
  const parsed = parseEngineJson(result.stdout);
  const archive = parsed?.archive || parsed;
  const archiveName = archive?.archivedAs || path.basename(predictedTarget);
  return { parsed, archive, archiveName };
}

export function finalizeLifecycleV2({ check, write = false, evidenceMode = 'default' }, services) {
  const capabilities = listSpecCapabilities(check.changePath);
  const gitState = inspectGitCompletionState(check.root);
  const actions = [
    { action: 'validate', target: check.changeName },
    { action: 'sync-specs-temporarily', target: check.archive?.targetPath || null },
    { action: 'append-lifecycle-event', target: check.changeName },
    { action: 'remove-active-requirement', target: path.relative(check.root, check.requirementPath).replaceAll('\\', '/') },
    { action: 'remove-temporary-archive', target: check.archive?.targetPath || null },
  ];
  if (!gitState.ok) return { ok: false, code: 'lifecycle_git_blocked', status: 'blocked', write, check, gitState, actions: [] };
  const existing = projectLifecycleState({ root: check.root, scope: '.', changeId: check.changeName });
  if (existing.event?.type === 'accepted' && !existing.active) {
    return { ok: true, code: 'lifecycle_already_finalized', status: existing.status, write, check, event: existing.event, actions: [] };
  }
  if (existing.event && (existing.status !== 'active' || existing.event.type !== 'reopened')) {
    return {
      ok: false,
      code: 'lifecycle_state_blocked',
      status: 'blocked',
      write,
      check,
      lifecycleState: existing,
      actions: [],
    };
  }
  const nextRevision = existing.event ? existing.event.revision + 1 : 1;
  const supersedes = existing.event?.eventId || null;
  if (!write) {
    return {
      ok: true,
      code: 'lifecycle_finalize_ready',
      status: 'ready',
      write,
      check,
      gitState,
      capabilities,
      evidenceMode,
      actions,
    };
  }

  const now = new Date().toISOString();
  const seedDigest = sha256(`${check.changeName}\n${now}\n${gitState.baseRevision || ''}`);
  const transactionId = `txn-${seedDigest.slice(0, 24)}`;
  const lock = acquireLifecycleLock(check.root, transactionId);
  let transaction = writeLifecycleTransaction(check.root, {
    transactionId,
    stage: 'prepare',
    changeId: check.changeName,
    requirementPath: path.relative(check.root, check.requirementPath).replaceAll('\\', '/'),
    archivePath: path.relative(check.root, check.archive.targetPath).replaceAll('\\', '/'),
    baseRevision: gitState.baseRevision,
    occurredAt: now,
    revision: nextRevision,
    supersedes,
    capabilities,
    evidenceMode,
  });
  try {
    const archived = services.runOpenSpecSync(
      ['archive', check.changeName, '--json', '--yes'],
      { cwd: check.root, encoding: 'utf8' },
    );
    if (!archived.available || archived.status !== 0) {
      const activeStillPresent = fs.existsSync(check.changePath);
      if (activeStillPresent) completeLifecycleTransaction(check.root, transactionId);
      return {
        ok: false,
        code: 'archive_failed',
        status: 'failed',
        write,
        check,
        actions,
        transaction: activeStillPresent ? null : transaction,
        recoveryRequired: !activeStillPresent,
        errors: [(archived.stderr || archived.stdout || archived.error?.message || '未知错误').trim()],
      };
    }
    const details = archiveResultDetails(archived, check.archive.targetPath);
    const archiveTarget = path.join(check.root, 'openspec', 'changes', 'archive', details.archiveName);
    const specDigest = digestMainSpecs(check.root, capabilities);
    const event = {
      schemaVersion: 2,
      eventId: createEventId({ changeId: check.changeName, revision: nextRevision, occurredAt: now, specDigest }),
      scope: '.',
      changeId: check.changeName,
      requirementId: requirementId(check.requirementPath),
      type: 'accepted',
      revision: nextRevision,
      occurredAt: now,
      baseRevision: gitState.baseRevision,
      capabilities,
      specDigest,
      checks: [
        { name: 'requirement', status: 'passed' },
        { name: 'openspec-strict', status: 'passed' },
        { name: 'test-plan', status: check.testPlanRequired ? 'passed' : 'recorded' },
        { name: 'external-ci', status: 'pending' },
      ],
      trust: 'local-verified',
      supersedes,
    };
    transaction = writeLifecycleTransaction(check.root, {
      ...transaction,
      stage: 'archived',
      archivePath: path.relative(check.root, archiveTarget).replaceAll('\\', '/'),
      event,
    });
    const strictEvidence = evidenceMode === 'strict' ? {
      schemaVersion: 1,
      eventId: event.eventId,
      requirementId: event.requirementId,
      capabilities,
      checks: event.checks,
      baseRevision: event.baseRevision,
      specDigest,
    } : null;
    const appended = appendLifecycleEvent({ root: check.root, event, strictEvidence });
    transaction = writeLifecycleTransaction(check.root, { ...transaction, stage: 'event-written', eventId: event.eventId });

    if (fs.existsSync(archiveTarget)) removeProjectDirectory(check.root, archiveTarget, { label: 'OpenSpec 临时归档' });
    if (fs.existsSync(check.requirementPath)) removeProjectFile(check.root, check.requirementPath, { label: '已完成活动需求' });
    transaction = writeLifecycleTransaction(check.root, { ...transaction, stage: 'cleaned', eventId: event.eventId });
    completeLifecycleTransaction(check.root, transactionId);
    return {
      ok: true,
      code: 'lifecycle_finalized',
      status: 'accepted-local',
      write,
      check,
      actions,
      event: appended.event,
      eventAppended: appended.appended,
      evidencePath: appended.evidencePath,
      archiveResult: details.archive,
      archiveWarnings: details.parsed?.warnings || [],
      requirementStatus: 'accepted-local',
    };
  } finally {
    releaseLifecycleLock(lock);
  }
}

export function recoverLifecycleV2({ root = process.cwd(), transactionId } = {}) {
  const transaction = readLifecycleTransaction(root, transactionId);
  if (!transaction) return { ok: true, code: 'lifecycle_recovery_not_needed', status: 'cleaned', transactionId };
  const lock = acquireLifecycleLock(root, transactionId, { recover: true });
  try {
    let current = transaction;
    const archiveTarget = path.join(lock.layout.config.root, current.archivePath);
    let event = current.event;
    if (!event && fs.existsSync(archiveTarget)) {
      const specDigest = digestMainSpecs(lock.layout.config.root, current.capabilities);
      event = {
        schemaVersion: 2,
        eventId: createEventId({ changeId: current.changeId, revision: current.revision, occurredAt: current.occurredAt, specDigest }),
        scope: '.',
        changeId: current.changeId,
        requirementId: requirementId(path.join(lock.layout.config.root, current.requirementPath)),
        type: 'accepted',
        revision: current.revision,
        occurredAt: current.occurredAt,
        baseRevision: current.baseRevision,
        capabilities: current.capabilities,
        specDigest,
        checks: [
          { name: 'requirement', status: 'passed' },
          { name: 'openspec-strict', status: 'passed' },
          { name: 'test-plan', status: 'recorded' },
          { name: 'external-ci', status: 'pending' },
        ],
        trust: 'local-verified',
        supersedes: current.supersedes,
      };
      current = writeLifecycleTransaction(root, { ...current, stage: 'archived', event });
    }
    if (current.stage === 'prepare' && !fs.existsSync(archiveTarget)) {
      const activeChange = path.join(lock.layout.config.root, 'openspec', 'changes', current.changeId);
      if (fs.existsSync(activeChange)) {
        completeLifecycleTransaction(root, transactionId);
        return { ok: true, code: 'lifecycle_recovery_reset', status: 'active', transactionId };
      }
      throw new Error('事务仍处于 prepare 且没有原生归档，需重新执行正常完成预览');
    }
    if (['prepare', 'archived'].includes(current.stage)) {
      const strictEvidence = current.evidenceMode === 'strict' ? {
        schemaVersion: 1,
        eventId: event.eventId,
        requirementId: event.requirementId,
        capabilities: event.capabilities,
        checks: event.checks,
        baseRevision: event.baseRevision,
        specDigest: event.specDigest,
      } : null;
      appendLifecycleEvent({ root, event, strictEvidence });
      current = writeLifecycleTransaction(root, { ...current, stage: 'event-written', eventId: event.eventId, event });
    }
    if (current.stage === 'event-written') {
      if (fs.existsSync(archiveTarget)) removeProjectDirectory(root, archiveTarget, { label: 'OpenSpec 临时归档' });
      const requirementPath = path.join(lock.layout.config.root, current.requirementPath);
      if (fs.existsSync(requirementPath)) removeProjectFile(root, requirementPath, { label: '已完成活动需求' });
      current = writeLifecycleTransaction(root, { ...current, stage: 'cleaned', eventId: event.eventId, event });
    }
    completeLifecycleTransaction(root, transactionId);
    return { ok: true, code: 'lifecycle_recovered', status: 'accepted-local', transactionId, event };
  } finally {
    releaseLifecycleLock(lock);
  }
}
