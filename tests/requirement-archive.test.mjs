import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  archiveAcceptedRequirements,
  archiveRequirement,
  listRequirementEntries,
  readRequirementIndex,
} from '../plugins/frontend-ai-workflow/scripts/requirement-archive.mjs';
import { previewRequirementUpgrade } from '../plugins/frontend-ai-workflow/scripts/preview-requirement-upgrade.mjs';
import { auditProjectVerificationEvidence } from '../plugins/frontend-ai-workflow/scripts/verification-evidence-foundation.mjs';

const repositoryRoot = path.resolve('.');

function createFixture(context) {
  const fixtureRoot = fs.mkdtempSync(path.join(repositoryRoot, 'outputs', 'requirement-archive-test-'));
  context.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fixtureRoot, 'requirements'), { recursive: true });
  return fixtureRoot;
}

function acceptedRequirement(id, change = 'fixture-change') {
  return `# ${id}：归档示例

## 基本信息

- 状态：已验收
- 关联变更：\`${change}\`

## 验收标准

- [x] [A-01] 示例已经验收。
`;
}

test('[V-02] 需求生命周期分层合同：写入后保留根存根、年度正文和稳定索引', (context) => {
  const root = createFixture(context);
  const requirementPath = path.join(root, 'requirements', 'REQ-2026-001-fixture.md');
  fs.writeFileSync(requirementPath, acceptedRequirement('REQ-2026-001'), 'utf8');

  const preview = archiveRequirement({ root, requirementPath });
  assert.equal(preview.code, 'requirement_archive_ready');
  assert.equal(preview.write, false);
  assert.equal(fs.existsSync(preview.archivePath), false);
  assert.match(fs.readFileSync(requirementPath, 'utf8'), /## 验收标准/u);

  const written = archiveRequirement({ root, requirementPath, write: true });
  assert.equal(written.code, 'requirement_archived');
  assert.equal(written.target, 'requirements/REQ-2026-001-fixture.md');
  assert.equal(written.archiveTarget, 'requirements/archive/2026/REQ-2026-001-fixture.md');
  assert.match(fs.readFileSync(requirementPath, 'utf8'), /完整正文：`requirements\/archive\/2026\/REQ-2026-001-fixture\.md`/u);
  assert.match(fs.readFileSync(written.archivePath, 'utf8'), /## 验收标准/u);

  const index = readRequirementIndex(root);
  assert.equal(index.schemaVersion, 1);
  assert.deepEqual(index.entries.map((entry) => entry.id), ['REQ-2026-001']);
  assert.equal(JSON.stringify(index).includes(root), false);
  assert.equal(JSON.stringify(index).includes('generatedAt'), false);
});

test('[V-02] 需求生命周期分层合同：默认读取有界且显式历史可定位', (context) => {
  const root = createFixture(context);
  const requirementPath = path.join(root, 'requirements', 'REQ-2026-002-history.md');
  fs.writeFileSync(requirementPath, `${acceptedRequirement('REQ-2026-002', 'history-change')}
## 验证记录

| 验证ID | 验证类型 | 结果 | 证据位置 |
| --- | --- | --- | --- |
| V-01 | 自动 | 通过 | \`outputs/history-evidence.md\` |
`, 'utf8');
  archiveRequirement({ root, requirementPath, write: true });

  const daily = listRequirementEntries(root);
  assert.deepEqual(daily.map((entry) => entry.kind), ['stub']);
  assert.deepEqual(daily.map((entry) => entry.path), ['requirements/REQ-2026-002-history.md']);

  const history = listRequirementEntries(root, { includeArchive: true });
  assert.deepEqual(history.map((entry) => entry.kind), ['archive']);
  assert.deepEqual(history.map((entry) => entry.path), ['requirements/archive/2026/REQ-2026-002-history.md']);

  const dailyPreview = previewRequirementUpgrade(root);
  assert.deepEqual(dailyPreview.requirements.map((entry) => entry.path), ['requirements/REQ-2026-002-history.md']);
  const historyPreview = previewRequirementUpgrade(root, { includeArchive: true });
  assert.deepEqual(historyPreview.requirements.map((entry) => entry.path), ['requirements/archive/2026/REQ-2026-002-history.md']);

  const dailyAudit = auditProjectVerificationEvidence(root);
  assert.equal(dailyAudit.records, 0);
  const historyAudit = auditProjectVerificationEvidence(root, { includeArchive: true });
  assert.equal(historyAudit.records, 1);
  assert.equal(historyAudit.counts.legacy_markdown_evidence, 1);
});

test('[V-02] 需求生命周期分层合同：批量迁移幂等并阻止正文冲突', (context) => {
  const root = createFixture(context);
  const first = path.join(root, 'requirements', 'REQ-2025-003-first.md');
  const second = path.join(root, 'requirements', 'REQ-2026-004-second.md');
  fs.writeFileSync(first, acceptedRequirement('REQ-2025-003'), 'utf8');
  fs.writeFileSync(second, acceptedRequirement('REQ-2026-004'), 'utf8');

  const migrated = archiveAcceptedRequirements({ root, write: true });
  assert.equal(migrated.code, 'requirements_archived');
  assert.equal(migrated.archived, 2);
  const repeated = archiveAcceptedRequirements({ root, write: true });
  assert.equal(repeated.archived, 0);
  assert.equal(repeated.alreadyArchived, 2);

  const conflicting = path.join(root, 'requirements', 'REQ-2026-005-conflict.md');
  const archive = path.join(root, 'requirements', 'archive', '2026', path.basename(conflicting));
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  fs.writeFileSync(conflicting, acceptedRequirement('REQ-2026-005'), 'utf8');
  fs.writeFileSync(archive, '# 不同正文\n', 'utf8');
  assert.throws(
    () => archiveRequirement({ root, requirementPath: conflicting, write: true }),
    (error) => error.code === 'requirement_archive_conflict',
  );
});

test('需求归档拒绝根目录、越界路径和 requirements 符号链接', (context) => {
  const root = createFixture(context);
  assert.throws(() => archiveAcceptedRequirements({ root: path.parse(root).root }), /项目根目录/u);
  assert.throws(
    () => archiveRequirement({ root, requirementPath: path.join(root, '..', 'outside.md') }),
    (error) => error.code === 'unsafe_requirement_path',
  );

  const linkedRoot = fs.mkdtempSync(path.join(repositoryRoot, 'outputs', 'requirement-archive-link-'));
  context.after(() => fs.rmSync(linkedRoot, { recursive: true, force: true }));
  fs.symlinkSync(path.join(root, 'requirements'), path.join(linkedRoot, 'requirements'));
  assert.throws(
    () => archiveAcceptedRequirements({ root: linkedRoot }),
    (error) => error.code === 'unsafe_requirement_root',
  );
});
