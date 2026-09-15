import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { normalizeEvidenceCommand } from '../plugins/frontend-ai-workflow/scripts/verification-evidence.mjs';
import { changeScopeCandidates } from '../plugins/frontend-ai-workflow/scripts/validate-test-plan.mjs';
import {
  buildEvidenceReferenceRewrites,
  finalizeChange,
  rewriteRequirementForArchive,
} from '../plugins/frontend-ai-workflow/scripts/finalize-change.mjs';
import {
  createDeterministicReportContext,
  renderDeterministicAssessmentMarkdown,
} from '../plugins/frontend-ai-workflow/scripts/ui-review-report.mjs';
import { createFixture, write } from './helpers/verification-evidence-fixtures.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('[TC-04] 归档引用迁移与恢复', (context) => {
  const content = [
    '- 状态：待验证',
    '- 证据：`openspec/changes/evidence-change/verification.md`、`openspec/changes/evidence-change/evidence/V-01.json`',
    '- 其他：`openspec/changes/other-change/verification.md`',
    '- 外部：https://example.com/openspec/changes/evidence-change/verification.md',
    '',
  ].join('\n');
  const archiveName = '2026-08-18-evidence-change';
  assert.deepEqual(changeScopeCandidates('/project/openspec/changes/evidence-change'), ['evidence-change']);
  assert.deepEqual(
    changeScopeCandidates(`/project/openspec/changes/archive/${archiveName}`),
    [archiveName, 'evidence-change'],
  );
  const planned = buildEvidenceReferenceRewrites(content, 'evidence-change', archiveName);
  assert.equal(planned.rewrites.length, 2);
  assert.equal(planned.content.includes('openspec/changes/archive/2026-08-18-evidence-change/verification.md'), true);
  assert.equal(planned.content.includes('openspec/changes/other-change/verification.md'), true);
  assert.equal(planned.content.includes('https://example.com/openspec/changes/evidence-change/verification.md'), true);

  const completed = rewriteRequirementForArchive(content, 'evidence-change', archiveName);
  assert.match(completed.content, /- 状态：已验收/u);
  assert.equal(completed.rewrites.length, 2);
  const repeated = rewriteRequirementForArchive(completed.content, 'evidence-change', archiveName, { allowAccepted: true });
  assert.equal(repeated.content, completed.content);
  assert.equal(repeated.rewrites.length, 0);
  assert.doesNotMatch(repeated.content, /archive\/2026-08-18-archive\//u);

  const fixture = createFixture(context);
  fs.writeFileSync(fixture.requirementPath, content, 'utf8');
  const archiveTarget = path.join(fixture.root, 'openspec', 'changes', 'archive', archiveName);
  fs.mkdirSync(archiveTarget, { recursive: true });
  const check = {
    ok: true,
    root: fixture.root,
    requirementPath: fixture.requirementPath,
    changePath: fixture.changePath,
    changeName: 'evidence-change',
    archive: { available: true, targetPath: archiveTarget },
  };
  const partial = finalizeChange({
    target: fixture.root,
    requirement: 'requirements/REQ-2026-001-evidence.md',
    change: 'evidence-change',
    write: true,
  }, {
    checkChange: () => check,
    runOpenSpecSync: () => ({
      available: true,
      status: 0,
      stdout: JSON.stringify({ archive: { archivedAs: archiveName }, root: { path: fixture.root, source: 'nearest' } }),
      stderr: '',
    }),
    atomicWrite: () => { throw new Error('fixture rename failed'); },
    postArchiveAudit: () => ({ ok: true, errors: [], warnings: [] }),
  });
  assert.equal(partial.ok, false);
  assert.equal(partial.code, 'archive_partial_failure');
  assert.equal(partial.failedStage, 'requirement-write');
  assert.equal(partial.archiveTarget, archiveTarget);
  assert.equal(partial.recovery.repeatable, true);
  assert.equal(partial.recovery.projectCommandsExecuted, false);

  let unsafeWriteCalls = 0;
  const unsafeArchive = finalizeChange({
    target: fixture.root,
    requirement: 'requirements/REQ-2026-001-evidence.md',
    change: 'evidence-change',
    write: true,
  }, {
    checkChange: () => check,
    runOpenSpecSync: () => ({
      available: true,
      status: 0,
      stdout: JSON.stringify({ archive: { archivedAs: '../outside' }, root: { path: fixture.root, source: 'nearest' } }),
      stderr: '',
    }),
    atomicWrite: () => { unsafeWriteCalls += 1; },
    postArchiveAudit: () => ({ ok: true, errors: [], warnings: [] }),
  });
  assert.equal(unsafeArchive.ok, false);
  assert.equal(unsafeArchive.failedStage, 'archive-target');
  assert.equal(unsafeWriteCalls, 0);

  const successfulFixture = createFixture(context);
  fs.writeFileSync(successfulFixture.requirementPath, content, 'utf8');
  fs.writeFileSync(successfulFixture.changePath + '/test-plan.md', [
    '# 测试方案',
    '',
    '- 需求：`requirements/REQ-2026-001-evidence.md`',
    '- 变更：evidence-change',
    '- 证据：`openspec/changes/evidence-change/evidence/V-01.json`',
    '',
  ].join('\n'), 'utf8');
  write(successfulFixture.root, 'openspec/changes/evidence-change/evidence/V-01.json', `${JSON.stringify({
    evidenceId: 'V-01',
    requirement: 'requirements/REQ-2026-001-evidence.md',
  }, null, 2)}\n`);
  const successfulArchiveTarget = path.join(successfulFixture.root, 'openspec', 'changes', 'archive', archiveName);
  const successfulCheck = {
    ok: true,
    root: successfulFixture.root,
    requirementPath: successfulFixture.requirementPath,
    changePath: successfulFixture.changePath,
    changeName: 'evidence-change',
    archive: { available: true, targetPath: successfulArchiveTarget },
  };
  const preview = finalizeChange({
    target: successfulFixture.root,
    requirement: 'requirements/REQ-2026-001-evidence.md',
    change: 'evidence-change',
  }, {
    checkChange: () => successfulCheck,
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.testPlanRewrites.length, 1);
  assert.equal(preview.testPlanChangeRenamed, true);

  let auditCalls = 0;
  const finalized = finalizeChange({
    target: successfulFixture.root,
    requirement: 'requirements/REQ-2026-001-evidence.md',
    change: 'evidence-change',
    write: true,
  }, {
    checkChange: () => successfulCheck,
    runOpenSpecSync: () => {
      fs.mkdirSync(path.dirname(successfulArchiveTarget), { recursive: true });
      fs.renameSync(successfulFixture.changePath, successfulArchiveTarget);
      return {
        available: true,
        status: 0,
        stdout: JSON.stringify({ archive: { archivedAs: archiveName }, root: { path: successfulFixture.root, source: 'nearest' } }),
        stderr: '',
      };
    },
    postArchiveAudit: ({ requirementPath, changePath }) => {
      auditCalls += 1;
      const archivedRequirement = fs.readFileSync(requirementPath, 'utf8');
      const archivedPlan = fs.readFileSync(path.join(changePath, 'test-plan.md'), 'utf8');
      assert.match(archivedRequirement, /- 状态：已验收/u);
      assert.match(archivedRequirement, /openspec\/changes\/archive\/2026-08-18-evidence-change\/evidence\/V-01\.json/u);
      assert.match(archivedPlan, /- 变更：2026-08-18-evidence-change/u);
      assert.match(archivedPlan, /- 需求：`requirements\/archive\/2026\/REQ-2026-001-evidence\.md`/u);
      assert.match(archivedPlan, /openspec\/changes\/archive\/2026-08-18-evidence-change\/evidence\/V-01\.json/u);
      assert.doesNotMatch(archivedPlan, /openspec\/changes\/evidence-change\/evidence/u);
      const archivedEvidence = JSON.parse(fs.readFileSync(path.join(changePath, 'evidence', 'V-01.json'), 'utf8'));
      assert.equal(archivedEvidence.requirement, 'requirements/archive/2026/REQ-2026-001-evidence.md');
      return { ok: true, errors: [], warnings: [] };
    },
  });
  assert.equal(finalized.ok, true);
  assert.equal(finalized.code, 'finalized');
  assert.equal(finalized.testPlanRewrites.length, 1);
  assert.equal(finalized.testPlanChangeRenamed, true);
  assert.equal(auditCalls, 1);

  const writeFailureFixture = createFixture(context);
  fs.writeFileSync(writeFailureFixture.requirementPath, content, 'utf8');
  fs.writeFileSync(writeFailureFixture.changePath + '/test-plan.md', '- 变更：evidence-change\n- 证据：`openspec/changes/evidence-change/evidence/V-01.json`\n', 'utf8');
  const writeFailureArchiveTarget = path.join(writeFailureFixture.root, 'openspec', 'changes', 'archive', archiveName);
  const writeFailure = finalizeChange({
    target: writeFailureFixture.root,
    requirement: 'requirements/REQ-2026-001-evidence.md',
    change: 'evidence-change',
    write: true,
  }, {
    checkChange: () => ({
      ...successfulCheck,
      root: writeFailureFixture.root,
      requirementPath: writeFailureFixture.requirementPath,
      changePath: writeFailureFixture.changePath,
      archive: { available: true, targetPath: writeFailureArchiveTarget },
    }),
    runOpenSpecSync: () => {
      fs.mkdirSync(path.dirname(writeFailureArchiveTarget), { recursive: true });
      fs.renameSync(writeFailureFixture.changePath, writeFailureArchiveTarget);
      return {
        available: true,
        status: 0,
        stdout: JSON.stringify({ archive: { archivedAs: archiveName }, root: { path: writeFailureFixture.root, source: 'nearest' } }),
        stderr: '',
      };
    },
    atomicWrite: (file, nextContent) => {
      if (path.basename(file) === 'test-plan.md') throw new Error('fixture test plan rename failed');
      fs.writeFileSync(file, nextContent, 'utf8');
    },
    postArchiveAudit: () => ({ ok: true, errors: [], warnings: [] }),
  });
  assert.equal(writeFailure.ok, false);
  assert.equal(writeFailure.code, 'archive_partial_failure');
  assert.equal(writeFailure.failedStage, 'test-plan-write');
  assert.equal(writeFailure.archiveTarget, writeFailureArchiveTarget);
  assert.equal(writeFailure.recovery.repeatable, true);

  const recoveryFixture = createFixture(context);
  const recoveryArchiveTarget = path.join(recoveryFixture.root, 'openspec', 'changes', 'archive', archiveName);
  const acceptedRequirement = rewriteRequirementForArchive(content, 'evidence-change', archiveName);
  fs.writeFileSync(recoveryFixture.requirementPath, acceptedRequirement.content, 'utf8');
  fs.writeFileSync(recoveryFixture.changePath + '/test-plan.md', '- 需求：`requirements/REQ-2026-001-evidence.md`\n- 变更：evidence-change\n- 证据：`openspec/changes/evidence-change/evidence/V-01.json`\n', 'utf8');
  write(recoveryFixture.root, 'openspec/changes/evidence-change/evidence/V-01.json', `${JSON.stringify({
    evidenceId: 'V-01',
    requirement: 'requirements/REQ-2026-001-evidence.md',
  }, null, 2)}\n`);
  fs.mkdirSync(path.dirname(recoveryArchiveTarget), { recursive: true });
  fs.renameSync(recoveryFixture.changePath, recoveryArchiveTarget);
  let recoveryAuditCalls = 0;
  const recovered = finalizeChange({
    target: recoveryFixture.root,
    requirement: 'requirements/REQ-2026-001-evidence.md',
    change: 'evidence-change',
    write: true,
  }, {
    checkChange: () => { throw new Error('变更目录不存在：fixture'); },
    postArchiveAudit: ({ changePath }) => {
      recoveryAuditCalls += 1;
      const archivedPlan = fs.readFileSync(path.join(changePath, 'test-plan.md'), 'utf8');
      assert.match(archivedPlan, /- 变更：2026-08-18-evidence-change/u);
      assert.match(archivedPlan, /- 需求：`requirements\/archive\/2026\/REQ-2026-001-evidence\.md`/u);
      assert.match(archivedPlan, /openspec\/changes\/archive\/2026-08-18-evidence-change\/evidence\/V-01\.json/u);
      const archivedEvidence = JSON.parse(fs.readFileSync(path.join(changePath, 'evidence', 'V-01.json'), 'utf8'));
      assert.equal(archivedEvidence.requirement, 'requirements/archive/2026/REQ-2026-001-evidence.md');
      return { ok: true, errors: [], warnings: [] };
    },
  });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.code, 'archive_recovered');
  assert.equal(recovered.testPlanRewrites.length, 1);
  assert.equal(recovered.testPlanChangeRenamed, true);
  assert.equal(recoveryAuditCalls, 1);
});

test('[TC-05] UI 报告运行身份一致性', () => {
  const context = createDeterministicReportContext({
    schemaVersion: 2,
    runId: 'review-200',
    scenarioFingerprint: 'f'.repeat(64),
    capture: 'project-playwright',
    baselineRunId: 'review-100',
    statePath: '.frontend-ui-review/runs/review-200/state.json',
    evidencePaths: [
      '.frontend-ui-review/runs/review-200/actual.png',
      '.frontend-ui-review/runs/review-200/review-input.json',
    ],
    status: 'passed',
    observationCount: 2,
    findingCount: 0,
  });
  const report = renderDeterministicAssessmentMarkdown({
    context,
    scenario: { id: 'checkout', url: 'http://127.0.0.1/', comparison: { scope: 'structure', mode: 'dom' } },
    assessment: { outcome: 'passed', observations: [], findings: [] },
  });
  assert.match(report, /运行 ID：`review-200`/u);
  assert.match(report, /基线运行 ID：`review-100`/u);
  assert.match(report, /采集器：`project-playwright`/u);
  assert.match(report, /场景指纹：`f{64}`/u);
  assert.match(report, /state\.json/u);
  assert.throws(
    () => createDeterministicReportContext({ ...context, runId: '' }),
    /runId/u,
  );
});

test('[TC-06] 跨平台证据执行与发布边界', () => {
  const npmEntry = path.resolve('/virtual/npm-cli.js');
  const windowsNpm = normalizeEvidenceCommand(['npm', 'run', 'test'], {
    platform: 'win32',
    environment: { npm_execpath: npmEntry },
    nodePath: 'C:\\Program Files\\nodejs\\node.exe',
    fileExists: (candidate) => candidate === npmEntry,
  });
  assert.equal(windowsNpm.command, 'C:\\Program Files\\nodejs\\node.exe');
  assert.deepEqual(windowsNpm.args, [npmEntry, 'run', 'test']);
  assert.equal(windowsNpm.source, 'npm_execpath');
  assert.equal(windowsNpm.shell, false);

  assert.throws(
    () => normalizeEvidenceCommand(['npm.cmd', 'run', 'test'], {
      platform: 'win32',
      environment: {},
      nodePath: 'C:\\node.exe',
      fileExists: () => false,
    }),
    (error) => error.code === 'npm_js_entry_missing',
  );
  assert.throws(
    () => normalizeEvidenceCommand(['tool.cmd'], {
      platform: 'win32',
      environment: {},
      nodePath: 'C:\\node.exe',
      fileExists: () => false,
    }),
    (error) => error.code === 'unsafe_command_wrapper',
  );

  const frontendTestSkill = fs.readFileSync(path.join(repositoryRoot, 'plugins/frontend-ai-workflow/skills/frontend-test/SKILL.md'), 'utf8');
  const frontendChangeSkill = fs.readFileSync(path.join(repositoryRoot, 'plugins/frontend-ai-workflow/skills/frontend-change/SKILL.md'), 'utf8');
  const structure = fs.readFileSync(path.join(repositoryRoot, 'plugins/frontend-ai-workflow/scripts/validate-structure.mjs'), 'utf8');
  // 入口负责路由，证据保护规则仍在可达的受管流程中校验。
  assert.match(frontendTestSkill, /\]\(\.\.\/\.\.\/references\/managed-test-workflow\.md\)/u);
  const frontendTestWorkflow = fs.readFileSync(path.join(repositoryRoot, 'plugins/frontend-ai-workflow/references/managed-test-workflow.md'), 'utf8');
  assert.match(frontendTestWorkflow, /verification-evidence\.mjs/u);
  assert.match(frontendTestWorkflow, /zero-locator run must not overwrite an existing passed manifest/u);
  assert.match(frontendTestWorkflow, /result value is exactly one allowed status/u);
  assert.match(frontendTestWorkflow, /evidence value contains only one or more backtick-wrapped, safe project-relative paths/u);
  assert.match(frontendTestWorkflow, /never append them to the result or evidence value/u);
  assert.match(frontendTestWorkflow, /openspec\/changes\/add-math\/evidence\/V-01\.json/u);
  assert.match(frontendChangeSkill, /must not rerun project tests, builds, browsers or external CI/u);
  assert.match(frontendChangeSkill, /archive_partial_failure/u);
  assert.match(structure, /scripts\/verification-evidence\.mjs/u);
});
