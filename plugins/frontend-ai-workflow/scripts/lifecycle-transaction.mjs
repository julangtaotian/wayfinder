import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { atomicWriteProjectFile, removeProjectFile } from './project-path-safety.mjs';
import { LifecycleError, normalizeRepositoryPath } from './lifecycle-contract.mjs';
import { ensureWorkflowRuntime, resolveWorkflowRuntime } from './lifecycle-runtime.mjs';

const TRANSACTION_STAGES = new Set(['prepare', 'archived', 'event-written', 'cleaned']);

function git(root, args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', shell: false });
}

function diagnostic(code, target, message) {
  return { code, status: 'blocked', target, message };
}

export function inspectGitCompletionState(root = process.cwd()) {
  // 纯检查路径不得创建 runs、cache 或 transactions，保证完成和迁移预览无副作用。
  const layout = resolveWorkflowRuntime(root);
  const gitDirResult = git(layout.config.root, ['rev-parse', '--git-dir']);
  if (gitDirResult.status !== 0) return { ok: true, available: false, baseRevision: null, diagnostics: [] };
  const rawGitDirectory = gitDirResult.stdout.trim();
  const gitDirectory = path.isAbsolute(rawGitDirectory)
    ? rawGitDirectory
    : path.resolve(layout.config.root, rawGitDirectory);
  const diagnostics = [];
  for (const [name, marker] of [['git_merge_in_progress', 'MERGE_HEAD'], ['git_cherry_pick_in_progress', 'CHERRY_PICK_HEAD']]) {
    if (fs.existsSync(path.join(gitDirectory, marker))) diagnostics.push(diagnostic(name, marker, 'Git 操作尚未完成'));
  }
  for (const directory of ['rebase-merge', 'rebase-apply']) {
    if (fs.existsSync(path.join(gitDirectory, directory))) diagnostics.push(diagnostic('git_rebase_in_progress', directory, 'Git rebase 尚未完成'));
  }
  const unmerged = git(layout.config.root, ['ls-files', '-u']);
  if (unmerged.status !== 0) diagnostics.push(diagnostic('git_index_unavailable', '.', '无法读取 Git index'));
  else if (unmerged.stdout.trim()) diagnostics.push(diagnostic('git_unmerged_entries', '.', 'Git index 存在未合并条目'));
  const sparse = git(layout.config.root, ['sparse-checkout', 'list']);
  if (sparse.status === 0) {
    const included = sparse.stdout.split(/\r?\n/u).map((line) => line.trim().replaceAll('\\', '/')).filter(Boolean);
    const coversSpecs = included.some((item) => item === 'openspec' || item === 'openspec/specs' || item.startsWith('openspec/specs/'));
    const coversChanges = included.some((item) => item === 'openspec' || item === 'openspec/changes' || item.startsWith('openspec/changes/'));
    if (!coversSpecs || !coversChanges) diagnostics.push(diagnostic('git_sparse_checkout_incomplete', 'openspec', 'sparse checkout 未覆盖完整规格和变更目录'));
  }
  const head = git(layout.config.root, ['rev-parse', '--verify', 'HEAD']);
  return {
    ok: diagnostics.length === 0,
    available: true,
    baseRevision: head.status === 0 ? head.stdout.trim() : null,
    diagnostics,
  };
}

function lockPath(layout) {
  return path.join(layout.transactions, 'completion.lock.json');
}

export function acquireLifecycleLock(root, transactionId, { recover = false } = {}) {
  const layout = ensureWorkflowRuntime(root);
  const target = lockPath(layout);
  const payload = { schemaVersion: 1, transactionId, pid: process.pid, startedAt: new Date().toISOString() };
  try {
    const descriptor = fs.openSync(target, 'wx');
    fs.writeFileSync(descriptor, `${JSON.stringify(payload)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    if (recover) {
      let previous = null;
      try {
        previous = JSON.parse(fs.readFileSync(target, 'utf8'));
        process.kill(previous.pid, 0);
      } catch (probeError) {
        if (previous?.transactionId === transactionId && probeError?.code === 'ESRCH') {
          fs.unlinkSync(target);
          return acquireLifecycleLock(root, transactionId);
        }
      }
    }
    throw new LifecycleError('lifecycle_busy', '另一个完成事务正在运行', path.relative(layout.config.root, target).replaceAll('\\', '/'));
  }
  return { layout, path: target, transactionId };
}

export function releaseLifecycleLock(lock) {
  if (!lock || !fs.existsSync(lock.path)) return false;
  const current = JSON.parse(fs.readFileSync(lock.path, 'utf8'));
  if (current.transactionId !== lock.transactionId) throw new LifecycleError('lifecycle_lock_changed', '完成锁已被其他事务替换', lock.transactionId);
  removeProjectFile(lock.layout.config.root, lock.path, { label: '完成事务锁' });
  return true;
}

export function writeLifecycleTransaction(root, transaction) {
  const layout = ensureWorkflowRuntime(root);
  const normalized = {
    schemaVersion: 1,
    transactionId: String(transaction.transactionId || ''),
    stage: String(transaction.stage || ''),
    changeId: String(transaction.changeId || ''),
    requirementPath: normalizeRepositoryPath(transaction.requirementPath, 'requirementPath'),
    archivePath: transaction.archivePath ? normalizeRepositoryPath(transaction.archivePath, 'archivePath') : null,
    eventId: transaction.eventId || null,
    revision: Number.isSafeInteger(transaction.revision) ? transaction.revision : 1,
    supersedes: transaction.supersedes || null,
    baseRevision: transaction.baseRevision || null,
    occurredAt: transaction.occurredAt || null,
    capabilities: Array.isArray(transaction.capabilities) ? [...transaction.capabilities] : [],
    evidenceMode: transaction.evidenceMode || 'default',
    event: transaction.event || null,
    updatedAt: new Date().toISOString(),
  };
  if (!/^[a-z0-9][a-z0-9-]{7,95}$/u.test(normalized.transactionId)) throw new LifecycleError('invalid_lifecycle_transaction', 'transactionId 格式无效');
  if (!TRANSACTION_STAGES.has(normalized.stage)) throw new LifecycleError('invalid_lifecycle_transaction', '事务 stage 无效');
  const target = path.join(layout.transactions, `${normalized.transactionId}.json`);
  atomicWriteProjectFile(layout.config.root, target, `${JSON.stringify(normalized, null, 2)}\n`, { label: '生命周期事务' });
  return { ...normalized, path: target };
}

export function readLifecycleTransaction(root, transactionId) {
  const layout = ensureWorkflowRuntime(root);
  const target = path.join(layout.transactions, `${transactionId}.json`);
  if (!fs.existsSync(target)) return null;
  const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (!TRANSACTION_STAGES.has(parsed.stage) || parsed.transactionId !== transactionId) {
    throw new LifecycleError('invalid_lifecycle_transaction', '事务文件内容无效', transactionId);
  }
  return { ...parsed, path: target };
}

export function completeLifecycleTransaction(root, transactionId) {
  const transaction = readLifecycleTransaction(root, transactionId);
  if (!transaction) return false;
  removeProjectFile(root, transaction.path, { label: '生命周期事务' });
  return true;
}
