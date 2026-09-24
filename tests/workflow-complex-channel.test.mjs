import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { runBootstrap } from '../plugins/frontend-ai-workflow/scripts/bootstrap-project.mjs';
import {
  createComplexChange,
  normalizeComparablePath,
} from '../plugins/frontend-ai-workflow/scripts/complex-change.mjs';
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

function writeVerificationSummary(root, outcomes = [{
  acceptance: '搜索筛选行为可观察',
  status: 'passed',
  observation: '聚焦测试通过且筛选结果符合目标。',
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

test('create 默认预览，显式写入只创建一个 OpenSpec 身份', (t) => {
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
  assert.equal(fs.existsSync(path.join(changeRoot, 'design.md')), false);
  assert.equal(fs.existsSync(path.join(root, 'requirements')), false);
  assert.equal(fs.existsSync(path.join(changeRoot, 'test-plan.md')), false);
  assert.equal(fs.existsSync(path.join(changeRoot, 'evidence.json')), false);

  const conflict = runWorkflowCli(createArgs(root, ['--write']));
  assert.equal(conflict.exitCode, 1);
  assert.equal(conflict.value.code, 'complex_change_exists');
});

test('只有提供真实架构决策时 create 才生成 design', (t) => {
  const root = preparedFixture(t);
  const result = runWorkflowCli(createArgs(root, ['--design', '搜索索引必须与现有缓存共享失效边界。', '--write']));
  assert.equal(result.exitCode, 0, JSON.stringify(result.value));
  assert.match(fs.readFileSync(path.join(root, 'openspec/changes/add-search-filter/design.md'), 'utf8'), /共享失效边界/u);
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
  assert.equal(fs.existsSync(path.join(root, 'openspec/specs/add-search-filter/spec.md')), true);
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

test('complete 缺少临时摘要或 Outcome Gate 未通过时保持阻塞', (t) => {
  const root = preparedFixture(t);
  assert.equal(runWorkflowCli(createArgs(root, ['--write'])).exitCode, 0);
  const tasks = path.join(root, 'openspec/changes/add-search-filter/tasks.md');
  fs.writeFileSync(tasks, fs.readFileSync(tasks, 'utf8').replaceAll('- [ ]', '- [x]'));

  const missing = runWorkflowCli(['complete', '--target', root, '--change', 'add-search-filter']);
  assert.equal(missing.exitCode, 1);
  assert.equal(missing.value.check.verificationSummary.code, 'verification_summary_missing');

  writeVerificationSummary(root, [{ acceptance: '搜索筛选行为可观察', status: 'failed', observation: '仍有差异。' }]);
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
