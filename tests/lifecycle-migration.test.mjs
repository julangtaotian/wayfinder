import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  migrateLifecycle,
  paginateLifecycleMigrationResult,
  previewLifecycleMigration,
} from '../plugins/frontend-ai-workflow/scripts/lifecycle-migration.mjs';

const fixtureParent = path.resolve('.frontend-ai-workflow/runs/lifecycle-migration-tests');

function write(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

function fixture(context) {
  fs.mkdirSync(fixtureParent, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureParent, 'case-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, '.frontend-workflow.json', `${JSON.stringify({
    schemaVersion: 2,
    minimumWriterVersion: '0.19.0',
    lifecycleMode: 'legacy-readonly',
    eventDirectory: '.workflow-history',
    runtimeDirectory: '.frontend-ai-workflow',
    strictEvidenceMaxBytes: 4096,
    eventMaxBytes: 4096,
  })}\n`);
  write(root, 'openspec/changes/archive/2026-09-01-old-change/proposal.md', '# old\n');
  write(root, 'openspec/changes/archive/2026-09-01-old-change/specs/demo/spec.md', '### Requirement: old\n');
  write(root, 'requirements/archive/2026/REQ-2026-001-old.md', '# REQ-2026-001\n\n- 关联变更：`old-change`\n');
  spawnSync('git', ['init', '-q', root]);
  spawnSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
  spawnSync('git', ['-C', root, 'config', 'user.name', 'Test']);
  spawnSync('git', ['-C', root, 'add', '.']);
  spawnSync('git', ['-C', root, 'commit', '-qm', 'base']);
  return root;
}

test('存量迁移预览阻断和幂等写入', (context) => {
  const root = fixture(context);
  const preview = previewLifecycleMigration({ root });
  assert.equal(preview.ok, true);
  assert.equal(preview.counts.events, 1);
  assert.equal(fs.existsSync(path.join(root, '.workflow-history')), false);
  assert.equal(fs.existsSync(path.join(root, '.frontend-ai-workflow')), false);
  const page = paginateLifecycleMigrationResult(preview, { limit: 1 });
  assert.equal(page.candidateFiles.length, 1);
  assert.equal(page.page.remainingCandidateFiles > 0, true);
  assert.deepEqual(Object.keys(page.events[0]), ['eventId', 'changeId', 'requirementId', 'type', 'revision', 'occurredAt']);
  const migrated = migrateLifecycle({ root, write: true });
  assert.equal(migrated.ok, true);
  assert.equal(fs.existsSync(path.join(root, 'openspec/changes/archive')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.frontend-workflow.json'), 'utf8')).lifecycleMode, 'v2');
  const repeated = migrateLifecycle({ root, write: true });
  assert.equal(repeated.counts.candidateFiles, 0);
});

test('泛化路径说明不会误阻断精确迁移目标', (context) => {
  const root = fixture(context);
  write(root, 'README.md', '运行时不会继续写入普通 outputs/。\n');
  spawnSync('git', ['-C', root, 'add', 'README.md']);
  const preview = previewLifecycleMigration({ root });
  assert.equal(preview.blockers.some((item) => item.code === 'active_legacy_reference' && item.target === 'README.md'), false);
});

test('存量迁移拒绝未跟踪目标和活动引用', (context) => {
  const root = fixture(context);
  write(root, 'outputs/untracked.json', '{}\n');
  write(root, 'README.md', '引用 outputs/untracked.json\n');
  spawnSync('git', ['-C', root, 'add', 'README.md']);
  const preview = previewLifecycleMigration({ root });
  assert.equal(preview.ok, false);
  assert.equal(preview.blockers.some((item) => item.code === 'untracked_migration_target'), true);
  assert.equal(preview.blockers.some((item) => item.code === 'active_legacy_reference'), true);
  assert.equal(preview.blockerCounts.untracked_migration_target, 1);
});

test('迁移识别多变更需求并把旧索引与根存根纳入精确目标', (context) => {
  const root = fixture(context);
  write(root, 'openspec/changes/archive/2026-09-02-second-change/proposal.md', '# second\n');
  write(root, 'requirements/archive/2026/REQ-2026-001-old.md', '# REQ-2026-001\n\n- 关联变更：`old-change`、`second-change`\n');
  write(root, 'requirements/REQ-2026-001-old.md', '<!-- requirement-archive-stub:v1 -->\n- 完整正文：`requirements/archive/2026/REQ-2026-001-old.md`\n');
  write(root, 'requirements/index.json', '{"schemaVersion":1}\n');
  spawnSync('git', ['-C', root, 'add', '.']);
  spawnSync('git', ['-C', root, 'commit', '-qm', 'add legacy index and second change']);
  const preview = previewLifecycleMigration({ root });
  assert.equal(preview.events.some((item) => item.changeId === 'second-change'), true);
  assert.equal(preview.candidateFiles.includes('requirements/index.json'), true);
  assert.equal(preview.candidateFiles.includes('requirements/REQ-2026-001-old.md'), true);
  assert.equal(preview.blockers.some((item) => item.target === 'requirements/index.json'), false);
});

test('存量迁移拒绝无法转换成确定事件的归档目录', (context) => {
  const root = fixture(context);
  write(root, 'openspec/changes/archive/old-change-without-date/proposal.md', '# old\n');
  spawnSync('git', ['-C', root, 'add', 'openspec/changes/archive/old-change-without-date/proposal.md']);
  const preview = previewLifecycleMigration({ root });
  assert.equal(preview.ok, false);
  assert.equal(preview.blockers.some((item) => item.code === 'unrecognized_archive_name'), true);
});

test('存量迁移列出正式规格中的局部需求引用而不猜测改写', (context) => {
  const root = fixture(context);
  write(root, 'openspec/specs/demo/spec.md', '### Requirement: demo\n\n合同来源为 D-01，并由 A-01 验收。\n');
  spawnSync('git', ['-C', root, 'add', 'openspec/specs/demo/spec.md']);
  spawnSync('git', ['-C', root, 'commit', '-qm', 'add local references']);
  const preview = previewLifecycleMigration({ root });
  const blocker = preview.blockers.find((item) => item.code === 'local_spec_reference');
  assert.deepEqual(blocker.references, ['A-01', 'D-01']);
  assert.equal(fs.readFileSync(path.join(root, 'openspec/specs/demo/spec.md'), 'utf8').includes('D-01'), true);
});
