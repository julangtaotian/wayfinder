import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  auditProjectVerificationEvidence,
  computeVerificationSemanticBinding,
  computeWorkspaceFingerprint,
  extractEvidenceReferences,
  runVerificationEvidence,
  validateEvidenceManifest,
  validateVerificationEvidenceRecords,
} from '../plugins/frontend-ai-workflow/scripts/verification-evidence.mjs';
import { validateTestPlan } from '../plugins/frontend-ai-workflow/scripts/validate-test-plan.mjs';
import { checkProject } from '../plugins/frontend-ai-workflow/scripts/check-project.mjs';
import {
  createFixture,
  localManifest,
  write,
  writeManagedVerifyFixture,
} from './helpers/verification-evidence-fixtures.mjs';

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
  assert.equal(fs.existsSync(path.join(fixture.root, passed.logs.find((item) => item.stream === 'stdout').path)), true);
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

test('[TC-07] 受管 Verify 结果补写与语义版本兼容', async (context) => {
  const fixture = createFixture(context);
  const locator = writeManagedVerifyFixture(fixture);
  const evidencePath = path.join(fixture.changePath, 'evidence', 'V-01.json');
  const passed = await runVerificationEvidence({
    target: fixture.root,
    change: 'evidence-change',
    requirement: 'requirements/REQ-2026-001-evidence.md',
    evidenceId: 'V-01',
    locator,
    command: [process.execPath, '--test', 'tests/settlement.test.mjs'],
    write: true,
    execute: (_command, _args, _options, handlers) => {
      handlers.stdout(`${locator}\n`);
      return { status: 0, signal: null, error: null };
    },
  });
  assert.equal(passed.ok, true, JSON.stringify(passed));
  assert.equal(passed.manifest.semanticBinding.version, 2);

  writeManagedVerifyFixture(fixture, { completed: true });
  const complete = validateTestPlan(path.join(fixture.changePath, 'test-plan.md'), {
    requirement: fixture.requirementPath,
    change: fixture.changePath,
    stage: 'complete',
  });
  assert.equal(complete.ok, true, JSON.stringify(complete.errors));
  assert.equal(complete.evidenceValidation.diagnostics[0]?.code, 'evidence_valid');

  const v2Manifest = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  const semanticPlan = fs.readFileSync(path.join(fixture.changePath, 'test-plan.md'), 'utf8');
  fs.writeFileSync(
    path.join(fixture.changePath, 'test-plan.md'),
    semanticPlan.replace('结果补写后首次 complete 通过', '改变后的真实断言'),
    'utf8',
  );
  const staleV2 = validateEvidenceManifest({
    root: fixture.root,
    changePath: fixture.changePath,
    evidencePath,
    expectedId: 'V-01',
    expectedRequirement: fixture.requirementPath,
    manifest: v2Manifest,
  });
  assert.equal(staleV2.code, 'stale_semantic_evidence');
  assert.equal(staleV2.semanticFresh, false);

  const v1Fixture = createFixture(context);
  const v1Locator = writeManagedVerifyFixture(v1Fixture);
  const v1Path = path.join(v1Fixture.changePath, 'evidence', 'V-01.json');
  const v1Manifest = localManifest(v1Fixture, {
    semanticBinding: computeVerificationSemanticBinding({
      requirementPath: v1Fixture.requirementPath,
      changePath: v1Fixture.changePath,
      evidenceId: 'V-01',
      semanticBindingVersion: 1,
    }),
    locator: v1Locator,
  });
  const validV1 = validateEvidenceManifest({
    root: v1Fixture.root,
    changePath: v1Fixture.changePath,
    evidencePath: v1Path,
    expectedId: 'V-01',
    expectedRequirement: v1Fixture.requirementPath,
    manifest: v1Manifest,
  });
  assert.equal(validV1.ok, true, JSON.stringify(validV1));
  assert.equal(validV1.manifest.semanticBinding.version, 1);

  const v1Requirement = fs.readFileSync(v1Fixture.requirementPath, 'utf8');
  fs.writeFileSync(v1Fixture.requirementPath, v1Requirement.replace(
    'node --test tests/settlement.test.mjs | 待执行',
    'node --test tests/settlement.test.mjs；新增运行说明 | 待执行',
  ), 'utf8');
  const staleV1 = validateEvidenceManifest({
    root: v1Fixture.root,
    changePath: v1Fixture.changePath,
    evidencePath: v1Path,
    expectedId: 'V-01',
    expectedRequirement: v1Fixture.requirementPath,
    manifest: v1Manifest,
  });
  assert.equal(staleV1.code, 'stale_semantic_evidence');

  const unknownVersion = validateEvidenceManifest({
    root: v1Fixture.root,
    changePath: v1Fixture.changePath,
    evidencePath: v1Path,
    expectedId: 'V-01',
    expectedRequirement: v1Fixture.requirementPath,
    manifest: {
      ...v1Manifest,
      semanticBinding: { ...v1Manifest.semanticBinding, version: 99 },
    },
  });
  assert.equal(unknownVersion.code, 'unsupported_semantic_binding_version');
  assert.equal(unknownVersion.target, 'openspec/changes/evidence-change/evidence/V-01.json');

  const missingVersion = validateEvidenceManifest({
    root: v1Fixture.root,
    changePath: v1Fixture.changePath,
    evidencePath: v1Path,
    expectedId: 'V-01',
    expectedRequirement: v1Fixture.requirementPath,
    manifest: { ...v1Manifest, semanticBinding: null },
  });
  assert.equal(missingVersion.code, 'unsupported_semantic_binding_version');
  assert.equal(missingVersion.semanticFresh, false);
});

test('[TC-02] 证据安全与工作区新鲜度', (context) => {
  const fixture = createFixture(context);
  const initial = computeWorkspaceFingerprint(fixture.root);
  assert.match(initial.digest, /^[a-f0-9]{64}$/u);

  write(fixture.root, 'requirements/REQ-2026-001-evidence.md', '# 生命周期状态变化\n');
  write(fixture.root, 'outputs/verification-evidence/transient.log', '临时日志\n');
  write(fixture.root, 'openspec/changes/evidence-change/evidence/V-99.json', '{}\n');
  write(fixture.root, '.frontend-ai-workflow/cache/validator/index.json', '{}\n');
  write(fixture.root, '.frontend-ai-workflow/runs/test/stdout.txt', '临时输出\n');
  write(fixture.root, '.frontend-ui-review/runs/legacy/state.json', '{}\n');
  assert.equal(computeWorkspaceFingerprint(fixture.root).digest, initial.digest);

  // UI Review 配置是持久输入，只有 runs 运行产物不应让证据失效。
  write(fixture.root, '.frontend-ui-review/config.json', '{}\n');
  assert.notEqual(computeWorkspaceFingerprint(fixture.root).digest, initial.digest);
  fs.rmSync(path.join(fixture.root, '.frontend-ui-review', 'config.json'));
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

  write(legacyFixture.root, 'plugins/example/plugin.json', '{"name":"example"}\n');
  const legacyOrdinaryJson = validateVerificationEvidenceRecords({
    root: legacyFixture.root,
    changePath: legacyFixture.changePath,
    records: [{ id: 'V-02', type: '自动', result: '通过', evidence: '`plugins/example/plugin.json`' }],
  });
  assert.equal(legacyOrdinaryJson.ok, true, JSON.stringify(legacyOrdinaryJson.diagnostics));
  assert.equal(legacyOrdinaryJson.diagnostics.some((item) => item.target === 'plugins/example/plugin.json'), false);
  assert.equal(legacyOrdinaryJson.diagnostics.some((item) => item.code === 'legacy_markdown_evidence'), true);

  // 反斜杠样本确保 Windows 记录与 POSIX 路径使用同一分类语义。
  const legacyWindowsOrdinaryJson = validateVerificationEvidenceRecords({
    root: legacyFixture.root,
    changePath: legacyFixture.changePath,
    records: [{ id: 'V-02', type: '自动', result: '通过', evidence: '`plugins\\example\\plugin.json`' }],
  });
  assert.equal(legacyWindowsOrdinaryJson.ok, true, JSON.stringify(legacyWindowsOrdinaryJson.diagnostics));
  assert.equal(legacyWindowsOrdinaryJson.diagnostics.some((item) => item.code !== 'legacy_markdown_evidence'), false);

  write(legacyFixture.root, 'openspec/changes/evidence-change/evidence/V-03.json', '{ invalid json\n');
  const legacyInvalidCandidate = validateVerificationEvidenceRecords({
    root: legacyFixture.root,
    changePath: legacyFixture.changePath,
    records: [{
      id: 'V-03',
      type: '自动',
      result: '通过',
      evidence: '`openspec/changes/evidence-change/evidence/V-03.json`',
    }],
  });
  const legacyInvalidDiagnostic = legacyInvalidCandidate.diagnostics.find((item) => item.code === 'invalid_evidence_json');
  assert.equal(legacyInvalidCandidate.ok, true, JSON.stringify(legacyInvalidCandidate.diagnostics));
  assert.equal(legacyInvalidDiagnostic?.status, 'warning');
  assert.equal(legacyInvalidDiagnostic?.target, 'openspec/changes/evidence-change/evidence/V-03.json');

  write(strictFixture.root, 'plugins/example/plugin.json', '{"name":"example"}\n');
  const strictOrdinaryJson = validateVerificationEvidenceRecords({
    root: strictFixture.root,
    changePath: strictFixture.changePath,
    records: [{ id: 'V-03', type: '自动', result: '通过', evidence: '`plugins/example/plugin.json`' }],
  });
  assert.equal(strictOrdinaryJson.ok, false);
  assert.equal(strictOrdinaryJson.diagnostics.some((item) => item.code === 'machine_evidence_missing' && item.evidenceId === 'V-03'), true);
  assert.equal(strictOrdinaryJson.diagnostics.some((item) => item.target === 'plugins/example/plugin.json'), false);

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
  assert.equal(external.status, 'recorded');
  assert.equal(external.trust, 'external-recorded');

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
