import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  canonicalText,
  createEventId,
  normalizeLifecycleEvent,
  normalizeRepositoryPath,
  readLifecycleConfig,
  sha256,
} from '../plugins/frontend-ai-workflow/scripts/lifecycle-contract.mjs';
import {
  appendLifecycleEvent,
  lifecycleEventIdsAtRevision,
  projectLifecycleState,
  readLifecycleEvents,
} from '../plugins/frontend-ai-workflow/scripts/lifecycle-history.mjs';
import {
  acquireLifecycleLock,
  inspectGitCompletionState,
  readLifecycleTransaction,
  releaseLifecycleLock,
  writeLifecycleTransaction,
} from '../plugins/frontend-ai-workflow/scripts/lifecycle-transaction.mjs';
import { stripLocalSpecProvenance } from '../plugins/frontend-ai-workflow/scripts/lifecycle-finalize.mjs';

const fixtureParent = path.resolve('.frontend-ai-workflow/runs/lifecycle-history-tests');

function write(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

function fixture(context, config = {}) {
  fs.mkdirSync(fixtureParent, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureParent, 'case-'));
  write(root, '.frontend-workflow.json', `${JSON.stringify({
    schemaVersion: 2,
    minimumWriterVersion: '0.19.0',
    lifecycleMode: 'v2',
    eventDirectory: '.workflow-history',
    runtimeDirectory: '.frontend-ai-workflow',
    eventMaxBytes: 4096,
    ...config,
  }, null, 2)}\n`);
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function event(overrides = {}) {
  const occurredAt = overrides.occurredAt || '2026-09-20T00:00:00.000Z';
  const specDigest = overrides.specDigest || sha256('spec\n');
  const changeId = overrides.changeId || 'change-one';
  const revision = overrides.revision || 1;
  return {
    schemaVersion: 2,
    eventId: overrides.eventId || createEventId({ changeId, revision, occurredAt, specDigest }),
    scope: '.',
    changeId,
    type: 'accepted',
    revision,
    occurredAt,
    baseRevision: null,
    capabilities: ['compact-lifecycle-history'],
    specDigest,
    supersedes: null,
    ...overrides,
  };
}

test('生命周期只接受 v2 单轨配置和仓库相对路径', (context) => {
  const root = fixture(context);
  assert.equal(readLifecycleConfig(root).lifecycleMode, 'v2');
  assert.equal(normalizeRepositoryPath('apps\\admin\\'), 'apps/admin');
  assert.equal(canonicalText('a\r\nb\r'), 'a\nb\n');
  assert.equal(sha256('规格\r\n内容'), sha256('规格\n内容'));
  assert.throws(() => normalizeRepositoryPath('D:\\workspace\\project'), /仓库相对路径/u);
  const legacy = fixture(context, { lifecycleMode: 'legacy' });
  assert.throws(() => readLifecycleConfig(legacy), (error) => error.code === 'invalid_lifecycle_config');
});

test('紧凑事件拒绝 requirement、checks、trust 和 evidence 字段', () => {
  const compact = normalizeLifecycleEvent(event());
  assert.deepEqual(Object.keys(compact).sort(), [
    'baseRevision', 'capabilities', 'changeId', 'eventId', 'occurredAt',
    'revision', 'schemaVersion', 'scope', 'specDigest', 'supersedes', 'type',
  ].sort());
  for (const field of ['requirementId', 'checks', 'trust', 'evidence', 'evidencePath']) {
    assert.throws(
      () => normalizeLifecycleEvent({ ...event(), [field]: field === 'checks' ? [] : 'legacy' }),
      (error) => error.code === 'retired_lifecycle_field' && error.target === field,
    );
  }
});

test('年度事件追加幂等并投影 accepted-local 与 accepted-merged', (context) => {
  const root = fixture(context);
  spawnSync('git', ['init', '-q', root]);
  spawnSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
  spawnSync('git', ['-C', root, 'config', 'user.name', 'Test']);
  const accepted = event({ changeId: 'merged-change' });
  const first = appendLifecycleEvent({ root, event: accepted });
  const repeated = appendLifecycleEvent({ root, event: accepted });
  assert.equal(first.appended, true);
  assert.equal(repeated.idempotent, true);
  assert.equal(readLifecycleEvents({ root }).events.length, 1);
  assert.equal(projectLifecycleState({ root, changeId: 'merged-change' }).status, 'accepted-local');

  spawnSync('git', ['-C', root, 'add', '.']);
  spawnSync('git', ['-C', root, 'commit', '-qm', 'accepted']);
  const revision = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  assert.equal(lifecycleEventIdsAtRevision({ root, revision }).eventIds.has(accepted.eventId), true);
  assert.equal(projectLifecycleState({ root, changeId: 'merged-change', mergedRevision: revision }).status, 'accepted-merged');
});

test('事务只保存恢复所需路径，不携带 requirement 或外部 CI 投影', (context) => {
  const root = fixture(context);
  const transaction = writeLifecycleTransaction(root, {
    transactionId: 'txn-compact-lifecycle',
    stage: 'prepare',
    scope: '.',
    changeId: 'compact-change',
    changePath: 'openspec/changes/compact-change',
    archivePath: 'openspec/changes/archive/compact-change',
    verificationSummaryPath: '.frontend-ai-workflow/runs/compact-change/verification-summary.json',
  });
  const stored = readLifecycleTransaction(root, transaction.transactionId);
  assert.equal(stored.verificationSummaryPath, '.frontend-ai-workflow/runs/compact-change/verification-summary.json');
  assert.equal('requirementPath' in stored, false);
  assert.equal('externalCiCheck' in stored, false);
});

test('完成锁互斥且 Git 完成检查保持只读', (context) => {
  const root = fixture(context);
  const before = fs.readdirSync(root).sort();
  const state = inspectGitCompletionState(root);
  assert.equal(state.ok, true);
  assert.deepEqual(fs.readdirSync(root).sort(), before);
  const lock = acquireLifecycleLock(root, 'txn-lock-contract');
  assert.throws(() => acquireLifecycleLock(root, 'txn-second-contract'), (error) => error.code === 'lifecycle_busy');
  assert.equal(releaseLifecycleLock(lock), true);
});

test('正式规格清理全部本地 provenance 格式', () => {
  const source = [
    'Requirement text （D-01、A-01）',
    '<!-- provenance: D-02, A-02 -->',
    'Next line <!-- D-03、A-03 -->',
    '',
  ].join('\n');
  const cleaned = stripLocalSpecProvenance(source);
  assert.doesNotMatch(cleaned, /[DA]-\d+/u);
  assert.match(cleaned, /Requirement text/u);
  assert.match(cleaned, /Next line/u);
});
