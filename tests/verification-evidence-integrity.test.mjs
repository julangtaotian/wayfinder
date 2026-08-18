import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  EVIDENCE_SCHEMA_VERSION,
  auditProjectVerificationEvidence,
  computeWorkspaceFingerprint,
  extractEvidenceReferences,
  normalizeEvidenceCommand,
  runVerificationEvidence,
  validateEvidenceManifest,
  validateVerificationEvidenceRecords,
} from '../plugins/frontend-ai-workflow/scripts/verification-evidence.mjs';
import { checkProject } from '../plugins/frontend-ai-workflow/scripts/check-project.mjs';
import {
  buildEvidenceReferenceRewrites,
  finalizeChange,
  rewriteRequirementForArchive,
} from '../plugins/frontend-ai-workflow/scripts/finalize-change.mjs';
import {
  createDeterministicReportContext,
  renderDeterministicAssessmentMarkdown,
} from '../plugins/frontend-ai-workflow/scripts/ui-review-report.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureOutputRoot = path.join(repositoryRoot, 'outputs', 'verification-evidence-integrity', 'test-fixtures');

function write(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

function createFixture(context, { evidenceRequired = true } = {}) {
  fs.mkdirSync(fixtureOutputRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureOutputRoot, 'case-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'package.json', '{"name":"evidence-fixture","private":true,"scripts":{"test":"node --test tests/*.test.mjs"}}\n');
  write(root, 'src/settlement.mjs', 'export const total = (values) => values.reduce((sum, value) => sum + value, 0);\n');
  write(root, 'tests/settlement.test.mjs', "// [TC-01] 复杂订单结算\nexport const covered = true;\n");
  write(root, 'requirements/REQ-2026-001-evidence.md', '# fixture\n');
  write(root, 'openspec/changes/evidence-change/.openspec.yaml', [
    'schema: spec-driven',
    'test_plan: required',
    evidenceRequired ? 'verification_evidence: required' : '',
    '',
  ].filter((line, index, values) => line || index === values.length - 1).join('\n'));
  write(root, 'openspec/changes/evidence-change/test-plan.md', '# fixture plan\n');
  return {
    root,
    changePath: path.join(root, 'openspec', 'changes', 'evidence-change'),
    requirementPath: path.join(root, 'requirements', 'REQ-2026-001-evidence.md'),
  };
}

function localManifest(fixture, overrides = {}) {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    evidenceId: 'V-01',
    kind: 'local-command',
    status: 'passed',
    requirement: 'requirements/REQ-2026-001-evidence.md',
    change: 'evidence-change',
    command: {
      executable: process.execPath,
      args: ['--test', 'tests/settlement.test.mjs'],
      cwd: '.',
      source: 'node',
    },
    locator: '[TC-01] 复杂订单结算',
    locatorMatches: 1,
    workspaceFingerprint: computeWorkspaceFingerprint(fixture.root).digest,
    git: { available: false, commit: null, dirty: null },
    startedAt: '2026-08-18T01:00:00.000Z',
    completedAt: '2026-08-18T01:00:01.000Z',
    exitCode: 0,
    logs: [],
    artifacts: [],
    ...overrides,
  };
}

test('[TC-01] 受控执行与零测试证据保护', async (context) => {
  const fixture = createFixture(context);
  const evidencePath = path.join(fixture.changePath, 'evidence', 'V-01.json');
  const logRoot = path.join(fixture.root, 'outputs', 'verification-evidence', 'evidence-change', 'V-01');
  const command = [process.execPath, '-e', "console.log('[TC-01] 复杂订单结算')"];

  const preview = await runVerificationEvidence({
    target: fixture.root,
    change: 'evidence-change',
    requirement: 'requirements/REQ-2026-001-evidence.md',
    evidenceId: 'V-01',
    locator: '[TC-01] 复杂订单结算',
    command,
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.write, false);
  assert.equal(preview.readyToWrite, true);
  assert.equal(fs.existsSync(evidencePath), false);
  assert.equal(fs.existsSync(logRoot), false);

  const passed = await runVerificationEvidence({
    target: fixture.root,
    change: 'evidence-change',
    requirement: 'requirements/REQ-2026-001-evidence.md',
    evidenceId: 'V-01',
    locator: '[TC-01] 复杂订单结算',
    command,
    write: true,
  });
  assert.equal(passed.ok, true);
  assert.equal(passed.status, 'passed');
  assert.equal(passed.locatorMatches, 1);
  assert.equal(fs.existsSync(evidencePath), true);
  assert.equal(fs.existsSync(path.join(logRoot, 'stdout.log')), true);
  const persisted = fs.readFileSync(evidencePath, 'utf8');

  const zero = await runVerificationEvidence({
    target: fixture.root,
    change: 'evidence-change',
    requirement: 'requirements/REQ-2026-001-evidence.md',
    evidenceId: 'V-01',
    locator: '[TC-99] 不存在',
    command,
    write: true,
  });
  assert.equal(zero.ok, false);
  assert.equal(zero.code, 'zero_test_locator');
  assert.equal(zero.locatorMatches, 0);
  assert.equal(fs.readFileSync(evidencePath, 'utf8'), persisted);

  const failed = await runVerificationEvidence({
    target: fixture.root,
    change: 'evidence-change',
    requirement: 'requirements/REQ-2026-001-evidence.md',
    evidenceId: 'V-01',
    locator: '[TC-01] 复杂订单结算',
    command: [process.execPath, '-e', "console.error('[TC-01] 复杂订单结算'); process.exit(7)"],
    write: true,
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'command_failed');
  assert.equal(failed.exitCode, 7);
  assert.equal(fs.readFileSync(evidencePath, 'utf8'), persisted);
});

test('[TC-02] 证据安全与工作区新鲜度', (context) => {
  const fixture = createFixture(context);
  const initial = computeWorkspaceFingerprint(fixture.root);
  assert.match(initial.digest, /^[a-f0-9]{64}$/u);

  write(fixture.root, 'requirements/REQ-2026-001-evidence.md', '# 生命周期状态变化\n');
  write(fixture.root, 'outputs/verification-evidence/transient.log', '临时日志\n');
  write(fixture.root, 'openspec/changes/evidence-change/evidence/V-99.json', '{}\n');
  assert.equal(computeWorkspaceFingerprint(fixture.root).digest, initial.digest);

  write(fixture.root, 'src/settlement.mjs', 'export const total = () => 99;\n');
  const sourceChanged = computeWorkspaceFingerprint(fixture.root);
  assert.notEqual(sourceChanged.digest, initial.digest);
  write(fixture.root, 'src/settlement.mjs', 'export const total = (values) => values.reduce((sum, value) => sum + value, 0);\n');
  assert.equal(computeWorkspaceFingerprint(fixture.root).digest, initial.digest);
  write(fixture.root, 'tests/settlement.test.mjs', '// [TC-01] 已修改测试\n');
  assert.notEqual(computeWorkspaceFingerprint(fixture.root).digest, initial.digest);

  const references = extractEvidenceReferences('`proof/summary.md`、`proof/V-01.json`；https://ci.example/run/1；`proof/V-01.json`');
  assert.deepEqual(references.paths, ['proof/summary.md', 'proof/V-01.json']);
  assert.deepEqual(references.urls, ['https://ci.example/run/1']);

  const validPath = write(fixture.root, 'openspec/changes/evidence-change/evidence/V-01.json', `${JSON.stringify(localManifest(fixture), null, 2)}\n`);
  const unknownVersion = validateEvidenceManifest({
    root: fixture.root,
    changePath: fixture.changePath,
    evidencePath: validPath,
    expectedId: 'V-01',
    manifest: localManifest(fixture, { schemaVersion: 99 }),
  });
  assert.equal(unknownVersion.ok, false);
  assert.equal(unknownVersion.code, 'unsupported_evidence_schema');

  const wrongId = validateEvidenceManifest({
    root: fixture.root,
    changePath: fixture.changePath,
    evidencePath: validPath,
    expectedId: 'V-02',
    manifest: localManifest(fixture),
  });
  assert.equal(wrongId.ok, false);
  assert.equal(wrongId.code, 'evidence_id_mismatch');

  const otherRequirement = write(fixture.root, 'requirements/REQ-2026-099-other.md', '# other\n');
  const wrongRequirement = validateEvidenceManifest({
    root: fixture.root,
    changePath: fixture.changePath,
    evidencePath: validPath,
    expectedId: 'V-01',
    expectedRequirement: otherRequirement,
    manifest: localManifest(fixture),
  });
  assert.equal(wrongRequirement.ok, false);
  assert.equal(wrongRequirement.code, 'evidence_requirement_mismatch');

  const outside = validateEvidenceManifest({
    root: fixture.root,
    changePath: fixture.changePath,
    evidencePath: '../outside.json',
    expectedId: 'V-01',
    manifest: localManifest(fixture),
  });
  assert.equal(outside.ok, false);
  assert.equal(outside.code, 'unsafe_evidence_path');
});

test('[TC-03] 证据完成门禁与历史兼容', (context) => {
  const strictFixture = createFixture(context);
  const markdownPath = write(strictFixture.root, 'openspec/changes/evidence-change/verification.md', '# 通过说明\n');
  const strictMissing = validateVerificationEvidenceRecords({
    root: strictFixture.root,
    changePath: strictFixture.changePath,
    records: [{ id: 'V-01', type: '自动', result: '通过', evidence: '`openspec/changes/evidence-change/verification.md`' }],
  });
  assert.equal(strictMissing.ok, false);
  assert.equal(strictMissing.required, true);
  assert.equal(strictMissing.diagnostics.some((item) => item.code === 'machine_evidence_missing'), true);
  assert.equal(fs.existsSync(markdownPath), true);

  const manifestPath = write(
    strictFixture.root,
    'openspec/changes/evidence-change/evidence/V-01.json',
    `${JSON.stringify(localManifest(strictFixture), null, 2)}\n`,
  );
  const strictPassed = validateVerificationEvidenceRecords({
    root: strictFixture.root,
    changePath: strictFixture.changePath,
    records: [{
      id: 'V-01',
      type: '自动',
      result: '通过',
      evidence: '`openspec/changes/evidence-change/verification.md`、`openspec/changes/evidence-change/evidence/V-01.json`',
    }],
  });
  assert.equal(strictPassed.ok, true, JSON.stringify(strictPassed.diagnostics));
  assert.equal(strictPassed.verifiedFiles, 2);
  assert.equal(strictPassed.executed, false);
  assert.equal(fs.existsSync(manifestPath), true);

  const legacyFixture = createFixture(context, { evidenceRequired: false });
  write(legacyFixture.root, 'openspec/changes/evidence-change/verification.md', '# 历史通过说明\n');
  const legacy = validateVerificationEvidenceRecords({
    root: legacyFixture.root,
    changePath: legacyFixture.changePath,
    records: [{ id: 'V-01', type: '自动', result: '通过', evidence: '`openspec/changes/evidence-change/verification.md`' }],
  });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.required, false);
  assert.equal(legacy.diagnostics.some((item) => item.code === 'legacy_markdown_evidence'), true);

  const externalPath = write(strictFixture.root, 'openspec/changes/evidence-change/evidence/V-02.json', `${JSON.stringify({
    ...localManifest(strictFixture, {
      evidenceId: 'V-02',
      kind: 'external-ci',
      command: null,
      locator: null,
      locatorMatches: null,
      exitCode: null,
      workspaceFingerprint: null,
      external: { url: 'https://ci.example/run/2', commit: 'a'.repeat(40), jobs: [{ name: 'linux-x64', status: 'passed' }], remotelyVerified: false },
    }),
  }, null, 2)}\n`);
  const external = validateEvidenceManifest({
    root: strictFixture.root,
    changePath: strictFixture.changePath,
    evidencePath: externalPath,
    expectedId: 'V-02',
  });
  assert.equal(external.ok, true);
  assert.equal(external.trust, 'external-unverified');

  const historyFixture = createFixture(context, { evidenceRequired: false });
  fs.rmSync(historyFixture.changePath, { recursive: true, force: true });
  write(historyFixture.root, 'openspec/changes/archive/2026-08-18-evidence-change/verification.md', '# 已归档说明\n');
  write(historyFixture.root, 'openspec/changes/archive/2026-08-18-evidence-change/evidence/V-02.json', fs.readFileSync(externalPath, 'utf8'));
  fs.writeFileSync(historyFixture.requirementPath, [
    '# 历史需求',
    '',
    '## 验证记录',
    '',
    '| 验证ID | 验证类型 | 执行内容或环境 | 执行日期 | 结果 | 证据位置 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| V-01 | 自动 | 历史测试 | 2026-08-18 | 通过 | `openspec/changes/evidence-change/verification.md` |',
    '| V-02 | 自动 | 外部矩阵 | 2026-08-18 | 通过 | `openspec/changes/archive/2026-08-18-evidence-change/evidence/V-02.json` |',
    '',
  ].join('\n'), 'utf8');
  const audit = auditProjectVerificationEvidence(historyFixture.root);
  assert.equal(audit.executed, false);
  assert.equal(audit.counts.legacy_markdown_evidence, 1);
  assert.equal(audit.counts.stale_active_evidence_path, 1);
  assert.equal(audit.counts.external_evidence_unverified, 1);
  assert.equal(audit.diagnostics.some((item) => item.code === 'legacy_markdown_evidence'), true);
  const stale = audit.diagnostics.find((item) => item.code === 'stale_active_evidence_path');
  assert.deepEqual(stale.archivedCandidates, ['openspec/changes/archive/2026-08-18-evidence-change']);
  assert.equal(audit.diagnostics.some((item) => item.code === 'external_evidence_unverified'), true);

  const projectCheck = checkProject(historyFixture.root);
  assert.equal(projectCheck.verificationEvidenceAudit.executed, false);
  assert.match(projectCheck.warnings.join('\n'), /stale_active_evidence_path/u);
  assert.match(projectCheck.warnings.join('\n'), /external_evidence_unverified/u);
});

test('[TC-04] 归档引用迁移与恢复', (context) => {
  const content = [
    '- 状态：待验证',
    '- 证据：`openspec/changes/evidence-change/verification.md`、`openspec/changes/evidence-change/evidence/V-01.json`',
    '- 其他：`openspec/changes/other-change/verification.md`',
    '- 外部：https://example.com/openspec/changes/evidence-change/verification.md',
    '',
  ].join('\n');
  const archiveName = '2026-08-18-evidence-change';
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
  assert.match(frontendTestSkill, /verification-evidence\.mjs/u);
  assert.match(frontendTestSkill, /zero-locator run must not overwrite an existing passed manifest/u);
  assert.match(frontendChangeSkill, /must not rerun project tests, builds, browsers or external CI/u);
  assert.match(frontendChangeSkill, /archive_partial_failure/u);
  assert.match(structure, /scripts\/verification-evidence\.mjs/u);
});
