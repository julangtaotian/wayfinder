import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { runBootstrap } from '../plugins/frontend-ai-workflow/scripts/bootstrap-project.mjs';
import {
  createComplexChange,
  normalizeComparablePath,
} from '../plugins/frontend-ai-workflow/scripts/complex-change.mjs';
import { finalizeChange } from '../plugins/frontend-ai-workflow/scripts/finalize-change.mjs';
import { recoverLifecycleV2 } from '../plugins/frontend-ai-workflow/scripts/lifecycle-finalize.mjs';
import { writeLifecycleTransaction } from '../plugins/frontend-ai-workflow/scripts/lifecycle-transaction.mjs';
import { runWorkflowCli } from '../plugins/frontend-ai-workflow/scripts/workflow-cli.mjs';
import {
  createVueFixture,
  initializeGitBaseline,
  writeFixtureFile,
} from './helpers/workflow-fixtures.mjs';

function preparedFixture(t) {
  const root = createVueFixture(t);
  runBootstrap({ target: root, write: true });
  initializeGitBaseline(root);
  return root;
}

function createArgs(root, extra = []) {
  return ['create', '--target', root, '--change', 'add-search-filter', '--title', '支持搜索筛选', ...extra];
}

function authorComplexChange(root) {
  writeFixtureFile(root, 'openspec/changes/add-search-filter/proposal.md', `## Why

用户需要缩小商品列表范围，现有页面只能浏览全部结果。

## What Changes

- 增加可清除的关键词筛选，并保持现有列表加载行为。

## Capabilities

### New Capabilities

- \`add-search-filter\`：按关键词筛选当前商品列表。

### Modified Capabilities

- 无。

## Impact

- 影响搜索输入、列表过滤逻辑和邻近测试。
`);
  writeFixtureFile(root, 'openspec/changes/add-search-filter/specs/add-search-filter/spec.md', `## Purpose

让用户能够在不改变现有数据协议的前提下快速缩小商品列表范围。

## ADDED Requirements

### Requirement: 商品列表支持关键词筛选

系统 MUST 使用用户输入的关键词筛选当前商品列表，并允许清除筛选。

#### Scenario: 输入关键词后缩小结果

- **ACCEPTANCE** \`AC-01\`
- **WHEN** 用户输入能够命中部分商品的关键词
- **THEN** 页面只展示名称包含该关键词的商品

#### Scenario: 清除关键词后恢复结果

- **ACCEPTANCE** \`AC-02\`
- **WHEN** 用户清除已经生效的筛选关键词
- **THEN** 页面恢复展示未筛选的商品列表
`);
  writeFixtureFile(root, 'openspec/changes/add-search-filter/design.md', `## Context

商品数据已经在页面内存中，筛选不需要新增请求或持久化状态。

## Goals / Non-Goals

**Goals:** 复用当前列表数据完成可清除的关键词筛选。

**Non-Goals:** 不修改服务端查询协议或分页策略。

## Decisions

- 在现有列表派生层计算筛选结果，避免复制源数据。

## Risks / Trade-offs

- 大列表可能增加计算量，由邻近聚焦测试覆盖更新边界。

## Verification Strategy

- 验证命中部分结果和清除后恢复两个场景。
`);
  writeFixtureFile(root, 'openspec/changes/add-search-filter/tasks.md', `## 1. 实施

- [ ] 1.1 实现关键词输入与列表派生筛选。[AC-01]
- [ ] 1.2 实现清除筛选并恢复原始结果。[AC-02]
- [ ] 1.3 运行两个验收场景的聚焦测试。[AC-01][AC-02]
`);
}

function writeVerificationSummary(root, outcomes = [{
  acceptanceId: 'AC-01',
  status: 'passed',
  observation: '聚焦测试通过且筛选结果符合目标。',
}, {
  acceptanceId: 'AC-02',
  status: 'passed',
  observation: '清除关键词后恢复完整结果。',
}]) {
  writeFixtureFile(
    root,
    '.frontend-ai-workflow/runs/add-search-filter/verification-summary.json',
    `${JSON.stringify({
      schemaVersion: 1,
      changeId: 'add-search-filter',
      verificationLevel: 'Focused',
      outcomes,
    }, null, 2)}\n`,
  );
}

test('复杂通道只公开四个自描述命令，帮助保持只读', () => {
  const top = runWorkflowCli(['--help']);
  assert.equal(top.exitCode, 0);
  assert.match(top.text, /create\|status\|validate\|complete/u);
  for (const command of ['create', 'status', 'validate', 'complete']) {
    const result = runWorkflowCli([command, '--help']);
    assert.equal(result.exitCode, 0);
    assert.match(result.text, new RegExp(`workflow-cli\\.mjs ${command}`, 'u'));
  }
  for (const retired of ['route', 'begin', 'next']) {
    const result = runWorkflowCli([retired, '--help']);
    assert.equal(result.exitCode, 1);
    assert.equal(result.value.code, 'complex_invalid_arguments');
  }
});

test('create 默认预览，显式写入创建未完成的五文件 OpenSpec 骨架', (t) => {
  const root = preparedFixture(t);
  const preview = runWorkflowCli(createArgs(root));
  assert.equal(preview.exitCode, 0);
  assert.equal(preview.value.write, false);
  assert.equal(fs.existsSync(path.join(root, 'openspec/changes/add-search-filter')), false);

  const written = runWorkflowCli(createArgs(root, ['--write']));
  assert.equal(written.exitCode, 0, JSON.stringify(written.value));
  const changeRoot = path.join(root, 'openspec/changes/add-search-filter');
  assert.equal(fs.existsSync(path.join(changeRoot, 'proposal.md')), true);
  assert.equal(fs.existsSync(path.join(changeRoot, 'specs/add-search-filter/spec.md')), true);
  assert.equal(fs.existsSync(path.join(changeRoot, 'tasks.md')), true);
  assert.equal(fs.existsSync(path.join(changeRoot, 'design.md')), true);
  assert.equal(fs.existsSync(path.join(root, 'requirements')), false);
  assert.equal(fs.existsSync(path.join(changeRoot, 'test-plan.md')), false);
  assert.equal(fs.existsSync(path.join(changeRoot, 'evidence.json')), false);
  const initialSpec = fs.readFileSync(path.join(changeRoot, 'specs/add-search-filter/spec.md'), 'utf8');
  assert.match(initialSpec, /^## Purpose$/mu);
  assert.match(initialSpec, /\[TODO:[^\]]+\]/u);
  const status = runWorkflowCli(['status', '--target', root, '--change', 'add-search-filter']);
  assert.equal(status.exitCode, 1);
  assert.ok(status.value.blockers.some((item) => item.code === 'complex_placeholder_present'));
  const validation = runWorkflowCli(['validate', '--target', root, '--change', 'add-search-filter']);
  assert.equal(validation.exitCode, 1);
  assert.ok(validation.value.diagnostics.some((item) => item.code === 'complex_placeholder_present'));

  const conflict = runWorkflowCli(createArgs(root, ['--write']));
  assert.equal(conflict.exitCode, 1);
  assert.equal(conflict.value.code, 'complex_change_exists');
});

test('create 可把已有架构事实放入始终存在的待完善 design', (t) => {
  const root = preparedFixture(t);
  const result = runWorkflowCli(createArgs(root, ['--design', '搜索索引必须与现有缓存共享失效边界。', '--write']));
  assert.equal(result.exitCode, 0, JSON.stringify(result.value));
  assert.match(fs.readFileSync(path.join(root, 'openspec/changes/add-search-filter/design.md'), 'utf8'), /共享失效边界/u);
});

test('完整规划通过，重复验收或任务覆盖缺失时阻断', (t) => {
  const root = preparedFixture(t);
  assert.equal(runWorkflowCli(createArgs(root, ['--write'])).exitCode, 0);
  authorComplexChange(root);
  assert.equal(runWorkflowCli(['validate', '--target', root, '--change', 'add-search-filter']).exitCode, 0);

  const designPath = 'openspec/changes/add-search-filter/design.md';
  const design = fs.readFileSync(path.join(root, designPath), 'utf8');
  fs.rmSync(path.join(root, designPath));
  const missingDesign = runWorkflowCli(['validate', '--target', root, '--change', 'add-search-filter']);
  assert.equal(missingDesign.exitCode, 1);
  assert.ok(missingDesign.value.diagnostics.some((item) => item.code === 'complex_artifact_missing'));
  writeFixtureFile(root, designPath, design);

  const specPath = 'openspec/changes/add-search-filter/specs/add-search-filter/spec.md';
  const spec = fs.readFileSync(path.join(root, specPath), 'utf8');
  writeFixtureFile(root, specPath, spec.replace(
    '让用户能够在不改变现有数据协议的前提下快速缩小商品列表范围。',
    'TBD - created by archiving change add-search-filter. Update Purpose after archive.',
  ));
  const placeholderPurpose = runWorkflowCli(['validate', '--target', root, '--change', 'add-search-filter']);
  assert.equal(placeholderPurpose.exitCode, 1);
  assert.ok(placeholderPurpose.value.diagnostics.some((item) => item.code === 'complex_spec_purpose_invalid'));

  writeFixtureFile(root, specPath, spec.replace('`AC-02`', '`AC-01`'));
  const duplicate = runWorkflowCli(['validate', '--target', root, '--change', 'add-search-filter']);
  assert.equal(duplicate.exitCode, 1);
  assert.ok(duplicate.value.diagnostics.some((item) => item.code === 'complex_acceptance_duplicate'));

  writeFixtureFile(root, specPath, spec);
  writeFixtureFile(root, 'openspec/changes/add-search-filter/tasks.md', '## 1. 实施\n\n- [ ] 1.1 只实现第一个场景。[AC-01]\n');
  const uncovered = runWorkflowCli(['validate', '--target', root, '--change', 'add-search-filter']);
  assert.equal(uncovered.exitCode, 1);
  assert.ok(uncovered.value.diagnostics.some((item) => item.code === 'complex_acceptance_uncovered'));
});

test('创建中途失败会清理本次变更且不会留下管理残片', (t) => {
  const root = preparedFixture(t);
  let writes = 0;
  assert.throws(() => createComplexChange({
    target: root,
    change: 'atomic-cleanup',
    title: '验证原子清理',
    write: true,
  }, {
    atomicWriteProjectFile(projectRoot, target, content, options) {
      writes += 1;
      if (writes === 2) throw new Error('注入写入失败');
      const file = path.join(projectRoot, target);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content, options.encoding || 'utf8');
    },
  }), (error) => error.code === 'complex_create_failed');
  assert.equal(fs.existsSync(path.join(root, 'openspec/changes/atomic-cleanup')), false);
});

test('status 不返回正文，validate 使用 strict 并报告稳定诊断', (t) => {
  const root = preparedFixture(t);
  assert.equal(runWorkflowCli(createArgs(root, ['--write'])).exitCode, 0);
  authorComplexChange(root);
  const status = runWorkflowCli(['status', '--target', root, '--change', 'add-search-filter']);
  assert.equal(status.exitCode, 0, JSON.stringify(status.value));
  assert.deepEqual(Object.keys(status.value).sort(), [
    'artifacts', 'blockers', 'change', 'code', 'ok', 'progress', 'root', 'schemaVersion', 'status',
  ]);
  assert.equal(JSON.stringify(status.value).includes('## Why'), false);

  const validation = runWorkflowCli(['validate', '--target', root, '--change', 'add-search-filter']);
  assert.equal(validation.exitCode, 0, JSON.stringify(validation.value));
  assert.equal(validation.value.code, 'complex_validation_passed');

  writeFixtureFile(root, 'openspec/changes/add-search-filter/test-plan.md', '# 退役产物\n');
  const blocked = runWorkflowCli(['validate', '--target', root, '--change', 'add-search-filter']);
  assert.equal(blocked.exitCode, 1);
  assert.ok(blocked.value.diagnostics.some((item) => item.code === 'complex_retired_artifact'));
});

test('complete 默认预览，写入后同步规格、追加事件并清除活动目录', (t) => {
  const root = preparedFixture(t);
  assert.equal(runWorkflowCli(createArgs(root, ['--write'])).exitCode, 0);
  authorComplexChange(root);
  const tasks = path.join(root, 'openspec/changes/add-search-filter/tasks.md');
  fs.writeFileSync(tasks, fs.readFileSync(tasks, 'utf8').replaceAll('- [ ]', '- [x]'));
  writeVerificationSummary(root);

  const preview = runWorkflowCli(['complete', '--target', root, '--change', 'add-search-filter']);
  assert.equal(preview.exitCode, 0, JSON.stringify(preview.value));
  assert.equal(preview.value.write, false);
  assert.equal(fs.existsSync(path.join(root, 'openspec/changes/add-search-filter')), true);

  const completed = runWorkflowCli(['complete', '--target', root, '--change', 'add-search-filter', '--write']);
  assert.equal(completed.exitCode, 0, JSON.stringify(completed.value));
  assert.equal(fs.existsSync(path.join(root, 'openspec/changes/add-search-filter')), false);
  const formalSpecPath = path.join(root, 'openspec/specs/add-search-filter/spec.md');
  assert.equal(fs.existsSync(formalSpecPath), true);
  const formalSpec = fs.readFileSync(formalSpecPath, 'utf8');
  assert.match(formalSpec, /## Purpose\s+让用户能够/u);
  assert.doesNotMatch(formalSpec, /(?:\[TODO|\bTBD\b|created by archiving|Update Purpose after archive)/iu);
  assert.equal(fs.existsSync(path.join(root, 'openspec/changes/archive')), false);
  assert.equal(fs.existsSync(path.join(root, '.frontend-ai-workflow/runs/add-search-filter/verification-summary.json')), false);
  const history = path.join(root, '.workflow-history');
  const eventFiles = fs.readdirSync(history).filter((file) => file.endsWith('.jsonl'));
  assert.equal(eventFiles.length, 1);
  const event = JSON.parse(fs.readFileSync(path.join(history, eventFiles[0]), 'utf8').trim());
  assert.equal(event.changeId, 'add-search-filter');
  for (const field of ['requirementId', 'checks', 'trust', 'evidence', 'evidencePath']) {
    assert.equal(field in event, false, field);
  }
});

test('complete 在正式规格同步后发现占位符时不写 accepted 事件，修复后可恢复', (t) => {
  const root = preparedFixture(t);
  assert.equal(runWorkflowCli(createArgs(root, ['--write'])).exitCode, 0);
  authorComplexChange(root);
  const tasks = path.join(root, 'openspec/changes/add-search-filter/tasks.md');
  fs.writeFileSync(tasks, fs.readFileSync(tasks, 'utf8').replaceAll('- [ ]', '- [x]'));
  writeVerificationSummary(root);
  const archiveName = '2099-01-01-add-search-filter';

  const completed = finalizeChange({
    target: root,
    change: 'add-search-filter',
    write: true,
  }, {
    runOpenSpecSync(args) {
      assert.equal(args[0], 'archive');
      const active = path.join(root, 'openspec/changes/add-search-filter');
      const archived = path.join(root, 'openspec/changes/archive', archiveName);
      fs.mkdirSync(path.dirname(archived), { recursive: true });
      fs.renameSync(active, archived);
      writeFixtureFile(root, 'openspec/specs/add-search-filter/spec.md', `# add-search-filter Specification

## Purpose
TBD - created by archiving change add-search-filter. Update Purpose after archive.

## Requirements

### Requirement: 商品列表支持关键词筛选
系统 MUST 支持关键词筛选。
`);
      return {
        available: true,
        status: 0,
        stdout: JSON.stringify({ archive: { archivedAs: archiveName } }),
        stderr: '',
      };
    },
  });

  assert.equal(completed.ok, false);
  assert.equal(completed.code, 'formal_spec_invalid');
  assert.equal(completed.recoveryRequired, true);
  assert.equal(fs.existsSync(path.join(root, '.workflow-history')), false);
  const transactions = fs.readdirSync(path.join(root, '.frontend-ai-workflow/transactions'))
    .filter((file) => file.endsWith('.json'));
  assert.equal(transactions.length, 1);
  const transactionId = transactions[0].replace(/\.json$/u, '');

  const blockedRecovery = recoverLifecycleV2({ root, transactionId });
  assert.equal(blockedRecovery.ok, false);
  assert.equal(blockedRecovery.code, 'formal_spec_invalid');
  assert.equal(fs.existsSync(path.join(root, '.workflow-history')), false);

  const formalSpecPath = path.join(root, 'openspec/specs/add-search-filter/spec.md');
  fs.writeFileSync(
    formalSpecPath,
    fs.readFileSync(formalSpecPath, 'utf8').replace(
      'TBD - created by archiving change add-search-filter. Update Purpose after archive.',
      '让用户能够在不改变现有数据协议的前提下快速缩小商品列表范围。',
    ),
  );
  const recovered = recoverLifecycleV2({ root, transactionId });
  assert.equal(recovered.ok, true, JSON.stringify(recovered));
  assert.equal(recovered.code, 'lifecycle_recovered');
  assert.equal(fs.existsSync(path.join(root, 'openspec/changes/archive')), false);
  const eventFiles = fs.readdirSync(path.join(root, '.workflow-history')).filter((file) => file.endsWith('.jsonl'));
  assert.equal(eventFiles.length, 1);
});

test('complete 缺少临时摘要或 Outcome Gate 未通过时保持阻塞', (t) => {
  const root = preparedFixture(t);
  assert.equal(runWorkflowCli(createArgs(root, ['--write'])).exitCode, 0);
  authorComplexChange(root);
  const tasks = path.join(root, 'openspec/changes/add-search-filter/tasks.md');
  fs.writeFileSync(tasks, fs.readFileSync(tasks, 'utf8').replaceAll('- [ ]', '- [x]'));

  const missing = runWorkflowCli(['complete', '--target', root, '--change', 'add-search-filter']);
  assert.equal(missing.exitCode, 1);
  assert.equal(missing.value.check.verificationSummary.code, 'verification_summary_missing');

  writeVerificationSummary(root, [
    { acceptanceId: 'AC-01', status: 'failed', observation: '仍有差异。' },
    { acceptanceId: 'AC-02', status: 'passed', observation: '清除后已恢复。' },
  ]);
  const failed = runWorkflowCli(['complete', '--target', root, '--change', 'add-search-filter']);
  assert.equal(failed.exitCode, 1);
  assert.equal(failed.value.check.verificationSummary.code, 'outcome_gate_failed');
});

test('路径比较覆盖 POSIX 与 Windows，危险标识在读取项目事实前被拒绝', (t) => {
  assert.equal(normalizeComparablePath('/workspace/app/', 'linux'), '/workspace/app');
  assert.equal(normalizeComparablePath(String.raw`D:\\Workspace\\App`, 'win32'), 'd:/workspace/app');
  assert.equal(normalizeComparablePath('D:/workspace/app/', 'win32'), 'd:/workspace/app');
  const root = preparedFixture(t);
  const unsafe = runWorkflowCli(['create', '--target', root, '--change', '../escape', '--title', '越界', '--write']);
  assert.equal(unsafe.exitCode, 1);
  assert.equal(unsafe.value.code, 'complex_invalid_change');
});

test('归档前中断事务可恢复到活动状态并清除事务文件', (t) => {
  const root = preparedFixture(t);
  assert.equal(runWorkflowCli(createArgs(root, ['--write'])).exitCode, 0);
  const transaction = writeLifecycleTransaction(root, {
    transactionId: 'txn-interruption-recovery',
    stage: 'prepare',
    scope: '.',
    changeId: 'add-search-filter',
    changePath: 'openspec/changes/add-search-filter',
    archivePath: 'openspec/changes/archive/2099-01-01-add-search-filter',
    occurredAt: '2026-09-20T00:00:00.000Z',
    revision: 1,
    capabilities: ['add-search-filter'],
  });
  assert.equal(fs.existsSync(transaction.path), true);
  const recovered = recoverLifecycleV2({ root, transactionId: 'txn-interruption-recovery' });
  assert.equal(recovered.code, 'lifecycle_recovery_reset');
  assert.equal(fs.existsSync(transaction.path), false);
  assert.equal(fs.existsSync(path.join(root, 'openspec/changes/add-search-filter')), true);
});
