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
  sha256,
} from '../plugins/frontend-ai-workflow/scripts/lifecycle-contract.mjs';
import {
  appendLifecycleEvent,
  lifecycleEventIdsAtRevision,
  projectLifecycleState,
  readLifecycleEvents,
} from '../plugins/frontend-ai-workflow/scripts/lifecycle-history.mjs';
import { auditLifecycle } from '../plugins/frontend-ai-workflow/scripts/lifecycle-audit.mjs';
import {
  acquireLifecycleLock,
  inspectGitCompletionState,
  releaseLifecycleLock,
  writeLifecycleTransaction,
} from '../plugins/frontend-ai-workflow/scripts/lifecycle-transaction.mjs';
import {
  finalizeLifecycleV2,
  recoverLifecycleV2,
  stripLocalSpecProvenance,
} from '../plugins/frontend-ai-workflow/scripts/lifecycle-finalize.mjs';
import { auditRepositoryFootprint } from '../plugins/frontend-ai-workflow/scripts/repository-footprint.mjs';
import { recoverLifecycleTransition, transitionLifecycle } from '../plugins/frontend-ai-workflow/scripts/lifecycle-transition.mjs';
import { getLifecycleStatus } from '../plugins/frontend-ai-workflow/scripts/lifecycle-status.mjs';

const fixtureParent = path.resolve('.frontend-ai-workflow/runs/lifecycle-history-tests');

function write(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

function fixture(context, mode = 'v2') {
  fs.mkdirSync(fixtureParent, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureParent, 'case-'));
  write(root, '.frontend-workflow.json', `${JSON.stringify({
    schemaVersion: 2,
    minimumWriterVersion: '0.19.0',
    lifecycleMode: mode,
    eventDirectory: '.workflow-history',
    runtimeDirectory: '.frontend-ai-workflow',
    strictEvidenceMaxBytes: 4096,
    eventMaxBytes: 4096,
  }, null, 2)}\n`);
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function event(overrides = {}) {
  const occurredAt = overrides.occurredAt || '2026-09-11T00:00:00.000Z';
  const specDigest = overrides.specDigest || sha256('spec\n');
  const changeId = overrides.changeId || 'change-one';
  const revision = overrides.revision || 1;
  return {
    schemaVersion: 2,
    eventId: overrides.eventId || createEventId({ changeId, revision, occurredAt, specDigest }),
    scope: '.',
    changeId,
    requirementId: 'REQ-2026-048',
    type: 'accepted',
    revision,
    occurredAt,
    baseRevision: null,
    capabilities: ['compact-lifecycle-history'],
    specDigest,
    checks: [{ name: 'focused', status: 'passed' }],
    trust: 'local-verified',
    supersedes: null,
    ...overrides,
  };
}

test('生命周期事件有界追加并确定性投影', (context) => {
  const root = fixture(context);
  const first = event();
  const appended = appendLifecycleEvent({ root, event: first, strictEvidence: { eventId: first.eventId, status: 'passed' } });
  assert.equal(appended.appended, true);
  assert.equal(appendLifecycleEvent({ root, event: first }).idempotent, true);
  assert.equal(readLifecycleEvents({ root }).events.length, 1);
  assert.equal(projectLifecycleState({ root, changeId: 'change-one' }).status, 'accepted-local');

  write(root, 'openspec/changes/change-one/tasks.md', '- [ ] reopen\n');
  assert.equal(projectLifecycleState({ root, changeId: 'change-one' }).status, 'unknown');
  const reopened = event({
    occurredAt: '2026-09-12T00:00:00.000Z',
    revision: 2,
    type: 'reopened',
    supersedes: first.eventId,
  });
  appendLifecycleEvent({ root, event: reopened });
  assert.equal(projectLifecycleState({ root, changeId: 'change-one' }).status, 'active');
  assert.throws(() => appendLifecycleEvent({ root, event: event({ revision: 2 }) }), /revision/u);
  assert.throws(() => normalizeLifecycleEvent({ ...first, eventId: 'bad' }), /eventId/u);
});

test('终态、跨年、分叉和事件预算保持确定性', (context) => {
  const root = fixture(context);
  const cancelled = event({ changeId: 'cancelled-change', type: 'cancelled', occurredAt: '2025-12-31T23:59:59.000Z' });
  appendLifecycleEvent({ root, event: cancelled });
  assert.equal(projectLifecycleState({ root, changeId: 'cancelled-change' }).status, 'cancelled');
  assert.equal(fs.existsSync(path.join(root, '.workflow-history/2025.jsonl')), true);

  const superseded = event({ changeId: 'superseded-change', type: 'superseded', occurredAt: '2026-01-01T00:00:00.000Z' });
  appendLifecycleEvent({ root, event: superseded });
  assert.equal(projectLifecycleState({ root, changeId: 'superseded-change' }).status, 'superseded');
  assert.equal(fs.existsSync(path.join(root, '.workflow-history/2026.jsonl')), true);

  const broken = event({
    changeId: 'broken-chain',
    revision: 2,
    supersedes: 'evt-12345678',
  });
  write(root, '.workflow-history/2027.jsonl', `${JSON.stringify({ ...broken, occurredAt: '2027-01-01T00:00:00.000Z' })}\n`);
  const brokenState = projectLifecycleState({ root, changeId: 'broken-chain' });
  assert.equal(brokenState.status, 'unknown');
  assert.equal(brokenState.diagnostics.some((item) => item.code === 'unknown_superseded_event'), true);

  assert.throws(
    () => normalizeLifecycleEvent(event({ capabilities: Array.from({ length: 65 }, (_, index) => `cap-${index}`) })),
    (error) => error.code === 'invalid_lifecycle_event',
  );
  assert.throws(
    () => normalizeLifecycleEvent(event({ checks: [{ name: 'bad\nname', status: 'passed' }] })),
    (error) => error.code === 'invalid_lifecycle_event',
  );
  assert.throws(
    () => normalizeLifecycleEvent(event({ capabilities: ['x'.repeat(240)] }), { maxBytes: 512 }),
    (error) => error.code === 'lifecycle_event_too_large',
  );
  assert.throws(
    () => appendLifecycleEvent({ root, event: event({ changeId: 'strict-budget' }), strictEvidence: { payload: 'x'.repeat(5000) } }),
    (error) => error.code === 'strict_evidence_too_large',
  );
  assert.equal(lifecycleEventIdsAtRevision({ root }).ok, false);
});

test('目标分支包含事件后状态才是 accepted-merged', (context) => {
  const root = fixture(context);
  spawnSync('git', ['init', '-q', root]);
  spawnSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
  spawnSync('git', ['-C', root, 'config', 'user.name', 'Test']);
  const accepted = event({ changeId: 'merged-change' });
  appendLifecycleEvent({ root, event: accepted });
  assert.equal(projectLifecycleState({ root, changeId: 'merged-change' }).status, 'accepted-local');
  spawnSync('git', ['-C', root, 'add', '.']);
  spawnSync('git', ['-C', root, 'commit', '-qm', 'accepted']);
  const revision = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  assert.equal(lifecycleEventIdsAtRevision({ root, revision }).eventIds.has(accepted.eventId), true);
  assert.equal(projectLifecycleState({ root, changeId: 'merged-change', mergedRevision: revision }).status, 'accepted-merged');
  const status = getLifecycleStatus({ root, changeId: 'merged-change', mergedRevision: revision });
  assert.equal(status.event.trust, 'local-verified');
  assert.equal(status.deliveryStatus, 'external-ci-pending');
  assert.equal(status.write, false);
});

test('CI 回执只读派生唯一候选提交的交付状态', (context) => {
  const root = fixture(context);
  spawnSync('git', ['init', '-q', root]);
  spawnSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
  spawnSync('git', ['-C', root, 'config', 'user.name', 'Test']);
  spawnSync('git', ['-C', root, 'add', '.']);
  spawnSync('git', ['-C', root, 'commit', '-qm', 'base']);
  const baseRevision = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const accepted = event({ changeId: 'post-ci-change' });
  appendLifecycleEvent({ root, event: accepted });
  const local = getLifecycleStatus({ root, changeId: 'post-ci-change' });
  assert.equal(local.status, 'accepted-local');
  assert.equal(local.deliveryStatus, 'commit-pending');

  spawnSync('git', ['-C', root, 'add', '.']);
  spawnSync('git', ['-C', root, 'commit', '-qm', 'accepted candidate']);
  const candidateRevision = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const receiptRelative = '.frontend-ai-workflow/runs/ci-receipts/run-200.json';
  const receipt = {
    schemaVersion: 1,
    status: 'recorded',
    revision: candidateRevision,
    reference: 'https://github.com/example/project/actions/runs/200',
    jobs: [{ name: 'shared', status: 'passed' }, { name: 'windows-x64', status: 'passed' }],
  };
  write(root, receiptRelative, `${JSON.stringify(receipt)}\n`);
  const before = spawnSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }).stdout;
  const delivered = getLifecycleStatus({
    root,
    changeId: 'post-ci-change',
    mergedRevision: candidateRevision,
    externalCiReceipt: receiptRelative,
  });
  const repeated = getLifecycleStatus({
    root,
    changeId: 'post-ci-change',
    mergedRevision: candidateRevision,
    externalCiReceipt: receiptRelative,
  });
  assert.equal(delivered.status, 'accepted-merged');
  assert.equal(delivered.deliveryStatus, 'external-ci-recorded');
  assert.equal(delivered.externalCi.revision, candidateRevision);
  assert.equal(delivered.externalCi.trust, 'external-recorded');
  assert.equal(delivered.externalCi.source, 'runtime-receipt');
  assert.deepEqual(repeated, delivered);
  assert.equal(spawnSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }).stdout, before);

  const command = spawnSync(process.execPath, [
    path.resolve('plugins/frontend-ai-workflow/scripts/lifecycle-status.mjs'),
    '--target', root,
    '--change', 'post-ci-change',
    '--base', candidateRevision,
    '--external-ci-receipt', receiptRelative,
  ], { encoding: 'utf8' });
  assert.equal(command.status, 0, command.stderr);
  assert.equal(JSON.parse(command.stdout).deliveryStatus, 'external-ci-recorded');

  assert.throws(
    () => getLifecycleStatus({ root, changeId: 'post-ci-change', externalCiReceipt: receiptRelative }),
    (error) => error.code === 'external_ci_base_required',
  );
  const missingBase = spawnSync(process.execPath, [
    path.resolve('plugins/frontend-ai-workflow/scripts/lifecycle-status.mjs'),
    '--target', root,
    '--change', 'post-ci-change',
    '--external-ci-receipt', receiptRelative,
  ], { encoding: 'utf8', env: { ...process.env, LIFECYCLE_BASE_SHA: '' } });
  assert.equal(missingBase.status, 1);
  assert.equal(JSON.parse(missingBase.stderr).code, 'external_ci_base_required');
  assert.throws(
    () => getLifecycleStatus({
      root,
      changeId: 'post-ci-change',
      mergedRevision: baseRevision,
      externalCiReceipt: receiptRelative,
    }),
    (error) => error.code === 'external_ci_event_not_in_revision',
  );
  write(root, receiptRelative, `${JSON.stringify({ ...receipt, revision: 'a'.repeat(40) })}\n`);
  assert.throws(
    () => getLifecycleStatus({
      root,
      changeId: 'post-ci-change',
      mergedRevision: candidateRevision,
      externalCiReceipt: receiptRelative,
    }),
    (error) => error.code === 'external_ci_revision_mismatch',
  );
  write(root, 'receipt.json', `${JSON.stringify(receipt)}\n`);
  assert.throws(
    () => getLifecycleStatus({
      root,
      changeId: 'post-ci-change',
      mergedRevision: candidateRevision,
      externalCiReceipt: 'receipt.json',
    }),
    (error) => error.code === 'external_ci_receipt_outside_runtime',
  );
});

test('严格证据可在事件已追加后幂等补齐', (context) => {
  const root = fixture(context);
  const accepted = event({ changeId: 'strict-change' });
  appendLifecycleEvent({ root, event: accepted });
  const repeated = appendLifecycleEvent({ root, event: accepted, strictEvidence: { eventId: accepted.eventId } });
  assert.equal(repeated.idempotent, true);
  assert.equal(fs.existsSync(repeated.evidencePath), true);
  assert.throws(
    () => appendLifecycleEvent({ root, event: accepted, strictEvidence: { eventId: accepted.eventId, changed: true } }),
    (error) => error.code === 'strict_evidence_conflict',
  );
});

test('[TC-01] 正式规格清理全部本地 provenance 格式', () => {
  assert.equal(canonicalText('a\r\nb\r'), 'a\nb\n');
  assert.equal(sha256('规格\r\n内容'), sha256('规格\n内容'));
  assert.equal(normalizeRepositoryPath('apps\\admin\\'), 'apps/admin');
  assert.throws(() => normalizeRepositoryPath('D:\\workspace\\project'), /仓库相对路径/u);
  assert.throws(() => normalizeRepositoryPath('a'.repeat(241)), /240/u);
  assert.equal(normalizeRepositoryPath('cafe\u0301'), 'café');
  assert.equal(stripLocalSpecProvenance('系统 MUST 保持稳定。（D-01～D-03；A-01）'), '系统 MUST 保持稳定。');
  const source = '系统 MUST 保持稳定。\r\n<!-- provenance: D-01、D-02；A-01 -->\r\n<!-- provenance: external-contract -->\r\n对应 REQ-2026-001 D-01。\r\n';
  const normalized = '系统 MUST 保持稳定。\r\n<!-- provenance: external-contract -->\r\n对应 REQ-2026-001 D-01。\r\n';
  assert.equal(stripLocalSpecProvenance(source), normalized);
  assert.equal(stripLocalSpecProvenance(normalized), normalized);
  const trailingSource = '系统 MUST 保持稳定。<!-- provenance: D-01,D-02; A-01 -->\r\n<!-- ordinary: D-03 -->\r\n';
  const trailingNormalized = '系统 MUST 保持稳定。\r\n<!-- ordinary: D-03 -->\r\n';
  assert.equal(stripLocalSpecProvenance(trailingSource), trailingNormalized);
  assert.equal(stripLocalSpecProvenance(trailingNormalized), trailingNormalized);
  assert.equal(
    stripLocalSpecProvenance('系统 MUST 保持稳定。<!-- provenance: external-contract -->'),
    '系统 MUST 保持稳定。<!-- provenance: external-contract -->',
  );
  assert.equal(stripLocalSpecProvenance('对应 REQ-2026-001 D-01。'), '对应 REQ-2026-001 D-01。');
});

test('完成事务锁定 Git 特殊状态并可恢复', (context) => {
  const root = fixture(context);
  spawnSync('git', ['init', '-q', root]);
  spawnSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
  spawnSync('git', ['-C', root, 'config', 'user.name', 'Test']);
  spawnSync('git', ['-C', root, 'add', '.']);
  spawnSync('git', ['-C', root, 'commit', '-qm', 'base']);
  const state = inspectGitCompletionState(root);
  assert.equal(state.ok, true);
  const lock = acquireLifecycleLock(root, 'txn-12345678');
  assert.throws(() => acquireLifecycleLock(root, 'txn-87654321'), (error) => error.code === 'lifecycle_busy');
  assert.equal(releaseLifecycleLock(lock), true);
  const gitDirectory = path.join(root, '.git');
  write(gitDirectory, 'MERGE_HEAD', 'deadbeef\n');
  const blocked = inspectGitCompletionState(root);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.diagnostics.some((item) => item.code === 'git_merge_in_progress'), true);
  fs.rmSync(path.join(gitDirectory, 'MERGE_HEAD'));
  write(gitDirectory, 'CHERRY_PICK_HEAD', 'deadbeef\n');
  assert.equal(inspectGitCompletionState(root).diagnostics.some((item) => item.code === 'git_cherry_pick_in_progress'), true);
  fs.rmSync(path.join(gitDirectory, 'CHERRY_PICK_HEAD'));
  fs.mkdirSync(path.join(gitDirectory, 'rebase-merge'));
  assert.equal(inspectGitCompletionState(root).diagnostics.some((item) => item.code === 'git_rebase_in_progress'), true);
  fs.rmSync(path.join(gitDirectory, 'rebase-merge'), { recursive: true });
  assert.equal(spawnSync('git', ['-C', root, 'sparse-checkout', 'init', '--cone']).status, 0);
  assert.equal(spawnSync('git', ['-C', root, 'sparse-checkout', 'set', 'requirements']).status, 0);
  assert.equal(inspectGitCompletionState(root).diagnostics.some((item) => item.code === 'git_sparse_checkout_incomplete'), true);
});

test('原生归档后中断可由事务恢复且不会重复追加事件', (context) => {
  const root = fixture(context);
  const requirementPath = write(root, 'requirements/REQ-2026-048-crash.md', '# REQ-2026-048\n');
  write(root, 'openspec/specs/demo/spec.md', '# demo\n\n系统 MUST 可恢复。（D-01；A-01）\n');
  const archivePath = 'openspec/changes/archive/2026-09-11-crash-change';
  write(root, `${archivePath}/specs/demo/spec.md`, '### Requirement: demo\n');
  writeLifecycleTransaction(root, {
    transactionId: 'txn-crash-12345678',
    stage: 'archived',
    scope: 'apps/admin',
    changeId: 'crash-change',
    requirementPath: path.relative(root, requirementPath),
    archivePath,
    baseRevision: null,
    occurredAt: '2026-09-11T00:00:00.000Z',
    revision: 1,
    supersedes: null,
    capabilities: ['demo'],
    evidenceMode: 'default',
  });
  const recovered = recoverLifecycleV2({ root, transactionId: 'txn-crash-12345678' });
  assert.equal(recovered.code, 'lifecycle_recovered');
  assert.equal(fs.existsSync(requirementPath), false);
  assert.equal(fs.existsSync(path.join(root, archivePath)), false);
  assert.equal(readLifecycleEvents({ root }).events.length, 1);
  assert.equal(readLifecycleEvents({ root }).events[0].scope, 'apps/admin');
  assert.equal(fs.readFileSync(path.join(root, 'openspec/specs/demo/spec.md'), 'utf8').includes('D-01'), false);
  assert.equal(recoverLifecycleV2({ root, transactionId: 'txn-crash-12345678' }).code, 'lifecycle_recovery_not_needed');
});

test('生命周期 Git 差异保护追加历史', (context) => {
  const root = fixture(context);
  spawnSync('git', ['init', '-q', root]);
  spawnSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
  spawnSync('git', ['-C', root, 'config', 'user.name', 'Test']);
  write(root, 'openspec/changes/remove-me/tasks.md', '- [x] done\n');
  spawnSync('git', ['-C', root, 'add', '.']);
  spawnSync('git', ['-C', root, 'commit', '-qm', 'base']);
  const base = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  fs.rmSync(path.join(root, 'openspec/changes/remove-me'), { recursive: true });
  const missing = auditLifecycle({ root, baseRevision: base });
  assert.equal(missing.diagnostics.some((item) => item.code === 'missing_lifecycle_event'), true);
  appendLifecycleEvent({ root, event: event({ changeId: 'remove-me' }) });
  const paired = auditLifecycle({ root, baseRevision: base });
  assert.equal(paired.diagnostics.some((item) => item.code === 'missing_lifecycle_event'), false);
});

test('[TC-02] 完成事务清理全部正式规格并通过零引用门禁', (context) => {
  const root = fixture(context);
  spawnSync('git', ['init', '-q', root]);
  spawnSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
  spawnSync('git', ['-C', root, 'config', 'user.name', 'Test']);
  const requirementPath = write(root, 'requirements/REQ-2026-048-demo.md', '# REQ-2026-048\n');
  const changePath = path.join(root, 'openspec/changes/demo-change');
  write(root, 'openspec/changes/demo-change/specs/demo/spec.md', '### Requirement: demo\n');
  write(root, 'openspec/specs/existing/spec.md', '# existing\n\n<!-- provenance: D-09；A-09 -->\n<!-- provenance: external-contract -->\n');
  spawnSync('git', ['-C', root, 'add', '.']);
  spawnSync('git', ['-C', root, 'commit', '-qm', 'base']);
  const archiveTarget = path.join(root, 'openspec/changes/archive/2026-09-11-demo-change');
  const check = {
    root,
    requirementPath,
    changePath,
    changeName: 'demo-change',
    archive: { targetPath: archiveTarget },
    testPlanRequired: false,
  };
  const preview = finalizeLifecycleV2({ check, write: false }, { runOpenSpecSync: () => null });
  assert.equal(preview.code, 'lifecycle_finalize_ready');
  const result = finalizeLifecycleV2({ check, write: true }, {
    runOpenSpecSync: () => {
      write(root, 'openspec/specs/demo/spec.md', '# demo\n\n系统 MUST 完成。（D-01；A-01）<!-- provenance: D-02,D-03; A-02 -->\n');
      fs.mkdirSync(path.dirname(archiveTarget), { recursive: true });
      fs.renameSync(changePath, archiveTarget);
      return { available: true, status: 0, stdout: `${JSON.stringify({ archive: { archivedAs: path.basename(archiveTarget) } })}\n`, stderr: '' };
    },
  });
  assert.equal(result.status, 'accepted-local');
  assert.equal(fs.existsSync(requirementPath), false);
  assert.equal(fs.existsSync(archiveTarget), false);
  assert.equal(readLifecycleEvents({ root }).events.length, 1);
  assert.equal(fs.readFileSync(path.join(root, 'openspec/specs/demo/spec.md'), 'utf8').includes('D-01'), false);
  const existingSpec = fs.readFileSync(path.join(root, 'openspec/specs/existing/spec.md'), 'utf8');
  assert.equal(/\b[DA]-\d+\b/u.test(existingSpec), false);
  assert.equal(existingSpec.includes('<!-- provenance: external-contract -->'), true);
  const footprint = auditRepositoryFootprint({ root });
  assert.equal(footprint.code, 'repository_footprint_ok');
  assert.equal(footprint.counts.localSpecReferences, 0);
  assert.equal(projectLifecycleState({ root, changeId: 'demo-change' }).status, 'accepted-local');
  assert.equal(fs.readdirSync(path.join(root, '.frontend-ai-workflow/transactions')).length, 0);
  assert.equal(recoverLifecycleV2({ root, transactionId: 'txn-does-not-exist' }).code, 'lifecycle_recovery_not_needed');
});

test('生命周期状态入口与非根 scope 保持一致', (context) => {
  const root = fixture(context);
  spawnSync('git', ['init', '-q', root]);
  spawnSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
  spawnSync('git', ['-C', root, 'config', 'user.name', 'Test']);
  const requirementRelative = 'requirements/REQ-2026-048-scoped.md';
  const changeRelative = 'openspec/changes/scoped-change';
  let requirementPath = write(root, requirementRelative, '# REQ-2026-048\n');
  let changePath = path.join(root, changeRelative);
  write(root, `${changeRelative}/specs/demo/spec.md`, '### Requirement: scoped\n');
  spawnSync('git', ['-C', root, 'add', '.']);
  spawnSync('git', ['-C', root, 'commit', '-qm', 'base']);
  const archiveTarget = path.join(root, 'openspec/changes/archive/2026-09-14-scoped-change');
  const result = finalizeLifecycleV2({
    check: { root, requirementPath, changePath, changeName: 'scoped-change', archive: { targetPath: archiveTarget }, testPlanRequired: false },
    write: true,
    scope: 'apps/admin',
  }, {
    runOpenSpecSync: () => {
      write(root, 'openspec/specs/demo/spec.md', '# demo\n');
      fs.mkdirSync(path.dirname(archiveTarget), { recursive: true });
      fs.renameSync(changePath, archiveTarget);
      return { available: true, status: 0, stdout: `${JSON.stringify({ archive: { archivedAs: path.basename(archiveTarget) } })}\n`, stderr: '' };
    },
  });
  assert.equal(result.event.scope, 'apps/admin');
  assert.equal(projectLifecycleState({ root, scope: 'apps/admin', changeId: 'scoped-change' }).status, 'accepted-local');

  requirementPath = write(root, requirementRelative, '# REQ-2026-048\n');
  changePath = path.join(root, changeRelative);
  write(root, `${changeRelative}/specs/demo/spec.md`, '### Requirement: reopened\n');
  const reopened = transitionLifecycle({ root, requirement: requirementRelative, change: changeRelative, type: 'reopened', scope: 'apps\\admin', write: true });
  assert.equal(reopened.status, 'active');
  assert.equal(reopened.event.scope, 'apps/admin');
  const cancelled = transitionLifecycle({ root, requirement: requirementRelative, change: changeRelative, type: 'cancelled', scope: 'apps/admin', write: true });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(fs.existsSync(requirementPath), false);
  assert.equal(fs.existsSync(changePath), false);
  assert.equal(projectLifecycleState({ root, scope: 'apps/admin', changeId: 'scoped-change' }).status, 'cancelled');

  const invalidRequirementRelative = 'requirements/REQ-2026-049-invalid.md';
  write(root, invalidRequirementRelative, '# REQ-2026-049\n');
  write(root, 'openspec/changes/invalid-reopen/specs/demo/spec.md', '### Requirement: invalid\n');
  const invalid = transitionLifecycle({
    root,
    requirement: invalidRequirementRelative,
    change: 'openspec/changes/invalid-reopen',
    type: 'reopened',
    scope: 'apps/admin',
  });
  assert.equal(invalid.code, 'lifecycle_state_blocked');

  const supersededRequirementRelative = 'requirements/REQ-2026-050-superseded.md';
  write(root, supersededRequirementRelative, '# REQ-2026-050\n');
  write(root, 'openspec/changes/superseded-entry/specs/demo/spec.md', '### Requirement: superseded\n');
  const superseded = transitionLifecycle({
    root,
    requirement: supersededRequirementRelative,
    change: 'openspec/changes/superseded-entry',
    type: 'superseded',
    scope: 'apps/admin',
    write: true,
  });
  assert.equal(superseded.status, 'superseded');
  assert.equal(projectLifecycleState({ root, scope: 'apps/admin', changeId: 'superseded-entry' }).status, 'superseded');
  assert.equal(recoverLifecycleTransition({ root, transactionId: 'txn-does-not-exist' }).code, 'lifecycle_recovery_not_needed');
});

test('外部 CI 回执与提交解耦', (context) => {
  const root = fixture(context);
  spawnSync('git', ['init', '-q', root]);
  spawnSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
  spawnSync('git', ['-C', root, 'config', 'user.name', 'Test']);
  const requirementPath = write(root, 'requirements/REQ-2026-051-ci.md', '# REQ-2026-051\n');
  const changePath = path.join(root, 'openspec/changes/ci-change');
  write(root, 'openspec/changes/ci-change/specs/demo/spec.md', '### Requirement: ci\n');
  spawnSync('git', ['-C', root, 'add', '.']);
  spawnSync('git', ['-C', root, 'commit', '-qm', 'base']);
  const baseRevision = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const receiptRelative = '.frontend-ai-workflow/runs/ci-receipts/run-100.json';
  const receipt = {
    schemaVersion: 1,
    status: 'recorded',
    revision: baseRevision,
    reference: 'https://github.com/example/project/actions/runs/100',
    jobs: [{ name: 'shared', status: 'passed' }, { name: 'windows-x64', status: 'passed' }],
  };
  write(root, receiptRelative, `${JSON.stringify(receipt)}\n`);
  const archiveTarget = path.join(root, 'openspec/changes/archive/2026-09-14-ci-change');
  const check = {
    root,
    requirementPath,
    changePath,
    changeName: 'ci-change',
    archive: { targetPath: archiveTarget },
    testPlanRequired: false,
  };
  const pending = finalizeLifecycleV2({ check, write: false }, { runOpenSpecSync: () => null });
  assert.equal(pending.externalCi, null);
  const preview = finalizeLifecycleV2({ check, write: false, externalCiReceipt: receiptRelative }, { runOpenSpecSync: () => null });
  assert.equal(preview.externalCi.revision, baseRevision);
  write(root, 'receipt.json', `${JSON.stringify(receipt)}\n`);
  assert.throws(
    () => finalizeLifecycleV2({ check, write: false, externalCiReceipt: 'receipt.json' }, { runOpenSpecSync: () => null }),
    (error) => error.code === 'external_ci_receipt_outside_runtime',
  );
  write(root, receiptRelative, `${JSON.stringify({ ...receipt, revision: 'a'.repeat(40) })}\n`);
  assert.throws(
    () => finalizeLifecycleV2({ check, write: false, externalCiReceipt: receiptRelative }, { runOpenSpecSync: () => null }),
    (error) => error.code === 'external_ci_revision_mismatch',
  );
  write(root, receiptRelative, `${JSON.stringify(receipt)}\n`);
  const result = finalizeLifecycleV2({ check, write: true, externalCiReceipt: receiptRelative }, {
    runOpenSpecSync: () => {
      write(root, 'openspec/specs/demo/spec.md', '# demo\n');
      fs.mkdirSync(path.dirname(archiveTarget), { recursive: true });
      fs.renameSync(changePath, archiveTarget);
      return { available: true, status: 0, stdout: `${JSON.stringify({ archive: { archivedAs: path.basename(archiveTarget) } })}\n`, stderr: '' };
    },
  });
  const externalCheck = result.event.checks.find((item) => item.name === 'external-ci');
  assert.deepEqual(externalCheck, {
    name: 'external-ci',
    status: 'recorded',
    reference: receipt.reference,
    revision: baseRevision,
  });
  assert.equal(result.event.trust, 'external-recorded');
});

test('重新打开的变更再次验收时延续同一事件版本链', (context) => {
  const root = fixture(context);
  spawnSync('git', ['init', '-q', root]);
  spawnSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
  spawnSync('git', ['-C', root, 'config', 'user.name', 'Test']);
  const requirementRelative = 'requirements/REQ-2026-048-reopened.md';
  const changeRelative = 'openspec/changes/reopened-change';
  let requirementPath = write(root, requirementRelative, '# REQ-2026-048\n');
  let changePath = path.join(root, changeRelative);
  write(root, `${changeRelative}/specs/demo/spec.md`, '### Requirement: first\n');
  spawnSync('git', ['-C', root, 'add', '.']);
  spawnSync('git', ['-C', root, 'commit', '-qm', 'base']);
  const finalize = () => {
    const archiveTarget = path.join(root, 'openspec/changes/archive/2026-09-11-reopened-change');
    return finalizeLifecycleV2({
      check: {
        root,
        requirementPath,
        changePath,
        changeName: 'reopened-change',
        archive: { targetPath: archiveTarget },
        testPlanRequired: false,
      },
      write: true,
    }, {
      runOpenSpecSync: () => {
        write(root, 'openspec/specs/demo/spec.md', '# demo\n');
        fs.mkdirSync(path.dirname(archiveTarget), { recursive: true });
        fs.renameSync(changePath, archiveTarget);
        return { available: true, status: 0, stdout: `${JSON.stringify({ archive: { archivedAs: path.basename(archiveTarget) } })}\n`, stderr: '' };
      },
    });
  };

  const first = finalize().event;
  requirementPath = write(root, requirementRelative, '# REQ-2026-048\n');
  changePath = path.join(root, changeRelative);
  write(root, `${changeRelative}/specs/demo/spec.md`, '### Requirement: second\n');
  const reopened = event({
    changeId: 'reopened-change',
    requirementId: 'REQ-2026-048',
    occurredAt: '2026-09-12T00:00:00.000Z',
    revision: 2,
    type: 'reopened',
    supersedes: first.eventId,
  });
  appendLifecycleEvent({ root, event: reopened });

  const acceptedAgain = finalize().event;
  assert.equal(acceptedAgain.revision, 3);
  assert.equal(acceptedAgain.supersedes, reopened.eventId);
  assert.equal(projectLifecycleState({ root, changeId: 'reopened-change' }).status, 'accepted-local');
});

test('CI 保留期和混合格式门禁', () => {
  const workflow = fs.readFileSync(path.resolve('.github/workflows/validate.yml'), 'utf8');
  assert.match(workflow, /retention-days:\s*14/u);
  assert.match(workflow, /Upload optional platform install evidence/u);
  assert.match(workflow, /LIFECYCLE_BASE_SHA:[^\n]+github\.event\.before/u);
  assert.match(workflow, /fetch-depth:\s*2/u);
  assert.doesNotMatch(workflow, /run:.*lifecycle.*>>/u);
});
