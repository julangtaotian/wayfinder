import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  RealDeveloperEffectivenessError,
  analyzeRealDeveloperStudy,
} from '../plugins/frontend-ai-workflow/scripts/real-developer-effectiveness-statistics.mjs';
import {
  buildRealDeveloperEffectivenessRecord,
  projectRealDeveloperEffectivenessEvidence,
} from '../plugins/frontend-ai-workflow/scripts/real-developer-effectiveness-evidence.mjs';
import {
  SupportEvidenceError,
  buildSupportEvidenceMatrix,
  projectSupportEvidenceMatrix,
} from '../plugins/frontend-ai-workflow/scripts/support-evidence-matrix.mjs';
import { TEST_GROUPS } from '../scripts/test-groups.mjs';

const REVISION = 'a'.repeat(40);
const SOURCE_PATH = '.frontend-ai-workflow/runs/developer-effectiveness-studies/study-001.json';

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createRoot(context, name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `real-effectiveness-${name}-`));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), '{}\n', 'utf8');
  return root;
}

function run(day, durationMs, overrides = {}) {
  const started = Date.UTC(2026, 8, day, 0, 0, 0);
  const firstDelivery = started + Math.floor(durationMs / 2);
  return {
    startedAt: new Date(started).toISOString(),
    firstDeliveredAt: new Date(firstDelivery).toISOString(),
    endedAt: new Date(started + durationMs).toISOString(),
    clarificationCount: 0,
    reworkCount: 0,
    blockerCount: 0,
    firstAcceptancePassed: true,
    finalAcceptancePassed: true,
    tokenUsage: {
      turnCount: 2,
      inputTokens: 1_000,
      cachedInputTokens: 500,
      outputTokens: 200,
      reasoningOutputTokens: 100,
      totalTokens: 1_200,
    },
    ...overrides,
  };
}

function makeStudy() {
  const projects = ['P1', 'P2', 'P3'].map((id) => ({ id }));
  const pairs = Array.from({ length: 6 }, (_, index) => {
    const projectId = `P${Math.floor(index / 2) + 1}`;
    return {
      id: `PAIR-${index + 1}`,
      projectId,
      participantId: `U${index + 1}`,
      taskDigest: digest(`task-${index + 1}`),
      projectCommit: digest(projectId).slice(0, 40),
      requirementDigest: digest(`requirement-${index + 1}`),
      acceptanceDigest: digest(`acceptance-${index + 1}`),
      order: index % 2 === 0 ? 'plugin-first' : 'baseline-first',
      conditions: {
        model: 'gpt-6-astra',
        reasoning: 'high',
        timeoutMinutes: 60,
        workspaceIsolated: true,
        crossReadPrevented: true,
        acceptanceIndependent: true,
      },
      plugin: run(index + 1, 80_000, {
        tokenUsage: {
          turnCount: 2, inputTokens: 800, cachedInputTokens: 400,
          outputTokens: 160, reasoningOutputTokens: 80, totalTokens: 960,
        },
      }),
      baseline: run(index + 10, 100_000),
    };
  });
  return {
    schemaVersion: 1,
    kind: 'real-developer-effectiveness-study',
    studyId: 'study-001',
    revision: REVISION,
    projects,
    pairs,
  };
}

function writeStudy(root, study = makeStudy()) {
  const target = path.join(root, SOURCE_PATH);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(study, null, 2)}\n`, 'utf8');
  return target;
}

function descriptor(root) {
  const content = fs.readFileSync(path.join(root, SOURCE_PATH));
  return { path: SOURCE_PATH, bytes: content.byteLength, sha256: digest(content) };
}

test('[TC-01] 合格研究证明总周期改善', (context) => {
  const root = createRoot(context, 'demonstrated');
  writeStudy(root);
  const analysis = analyzeRealDeveloperStudy(makeStudy());
  assert.equal(analysis.status, 'demonstrated-improvement');
  assert.equal(analysis.benefitPercent, 20);
  assert.equal(analysis.primaryMetric.pValue, 0.015625);
  assert.equal(analysis.primaryMetric.improvedPairCount, 6);
  assert.equal(analysis.sample.projectCount, 3);
  assert.equal(analysis.sample.participantCount, 6);
  assert.equal(analysis.sample.pairCount, 6);
  assert.deepEqual(analysis.sample.orderCounts, { 'plugin-first': 3, 'baseline-first': 3 });
  assert.equal(analysis.qualityGuardrails.status, 'passed');
  assert.equal(analysis.operationalMetrics.firstDelivery.medianDeltaMs, -10_000);
  assert.equal(analysis.operationalMetrics.medianClarificationDelta, 0);
  assert.equal(analysis.operationalMetrics.medianReworkDelta, 0);
  assert.equal(analysis.operationalMetrics.medianBlockerDelta, 0);
  assert.equal(analysis.tokenUsage.validPairCount, 6);
  assert.equal(analysis.tokenUsage.medianDelta.totalTokens, -240);

  const preview = projectRealDeveloperEffectivenessEvidence({ root, study: SOURCE_PATH, revision: REVISION });
  assert.equal(preview.status, 'planned');
  assert.equal(preview.conclusion, 'demonstrated-improvement');
  assert.equal(fs.existsSync(path.join(root, preview.output)), false);
  const recorded = projectRealDeveloperEffectivenessEvidence({ root, study: SOURCE_PATH, revision: REVISION, write: true }, {
    readSnapshot: () => ({ revision: REVISION, status: '' }),
  });
  const evidence = JSON.parse(fs.readFileSync(path.join(root, recorded.receipt), 'utf8'));
  assert.equal(evidence.kind, 'real-developer-effectiveness-evidence');
  assert.deepEqual(evidence.generator, { id: 'frontend-ai-workflow/real-developer-effectiveness-evidence', version: 1 });
  assert.equal(evidence.benefitPercent, 20);
  assert.equal(JSON.stringify(evidence).includes('participantId'), false);
});

test('[TC-02] 不足或弱效果保持保守结论', () => {
  const insufficient = makeStudy();
  insufficient.projects = insufficient.projects.slice(0, 2);
  insufficient.pairs = insufficient.pairs.slice(0, 4);
  const first = analyzeRealDeveloperStudy(insufficient);
  assert.equal(first.status, 'inconclusive');
  assert.equal(first.benefitPercent, null);
  assert.equal(first.reasons.includes('minimum-projects-not-met'), true);

  const oneParticipant = makeStudy();
  oneParticipant.pairs.forEach((pair) => { pair.participantId = 'U1'; });
  const participantResult = analyzeRealDeveloperStudy(oneParticipant);
  assert.equal(participantResult.status, 'inconclusive');
  assert.equal(participantResult.reasons.includes('minimum-participants-not-met'), true);

  const invalidProjectCoverage = makeStudy();
  invalidProjectCoverage.pairs[0].plugin.firstAcceptancePassed = false;
  invalidProjectCoverage.pairs[0].plugin.finalAcceptancePassed = false;
  invalidProjectCoverage.pairs.push({
    ...structuredClone(invalidProjectCoverage.pairs[2]),
    id: 'PAIR-7',
    participantId: 'U7',
    taskDigest: digest('task-7'),
  });
  const coverageResult = analyzeRealDeveloperStudy(invalidProjectCoverage);
  assert.equal(coverageResult.status, 'regressed');
  assert.equal(coverageResult.primaryMetric.status, 'inconclusive');
  assert.equal(coverageResult.primaryMetric.projects[0].comparablePairCount, 1);

  const weak = makeStudy();
  weak.pairs[5].plugin = run(20, 120_000);
  const second = analyzeRealDeveloperStudy(weak);
  assert.equal(second.status, 'no-demonstrated-improvement');
  assert.equal(second.primaryMetric.pValue, 0.109375);
  assert.equal(second.benefitPercent, null);
  const record = buildRealDeveloperEffectivenessRecord(weak, { path: SOURCE_PATH, bytes: 1, sha256: 'b'.repeat(64) });
  const projected = buildSupportEvidenceMatrix({ revision: REVISION, developerEffectivenessEvidence: record });
  assert.equal(projected.developerEffectiveness.status, 'no-demonstrated-improvement');
  assert.equal(projected.developerEffectiveness.benefitPercent, null);
});

test('[TC-03] 时间优势不能覆盖质量或项目回退', () => {
  const acceptance = makeStudy();
  acceptance.pairs[0].plugin.firstAcceptancePassed = false;
  assert.equal(analyzeRealDeveloperStudy(acceptance).status, 'regressed');
  assert.equal(analyzeRealDeveloperStudy(acceptance).reasons.includes('first-acceptance-regressed'), true);

  const finalAcceptance = makeStudy();
  finalAcceptance.pairs[0].plugin.firstAcceptancePassed = false;
  finalAcceptance.pairs[0].plugin.finalAcceptancePassed = false;
  const finalAcceptanceResult = analyzeRealDeveloperStudy(finalAcceptance);
  assert.equal(finalAcceptanceResult.status, 'regressed');
  assert.equal(finalAcceptanceResult.primaryMetric.status, 'inconclusive');
  assert.equal(finalAcceptanceResult.reasons.includes('final-acceptance-regressed'), true);

  const rework = makeStudy();
  rework.pairs.forEach((pair) => { pair.plugin.reworkCount = 1; });
  assert.equal(analyzeRealDeveloperStudy(rework).reasons.includes('median-rework-regressed'), true);

  const projectRegression = makeStudy();
  projectRegression.pairs.slice(-2).forEach((pair, index) => { pair.plugin = run(21 + index, 120_000); });
  const result = analyzeRealDeveloperStudy(projectRegression);
  assert.equal(result.status, 'regressed');
  assert.equal(result.benefitPercent, null);
  assert.equal(result.reasons.includes('project-cycle-regressed'), true);
});

test('[TC-04] 闭合 schema 与敏感输入失败关闭', () => {
  const cases = [
    ['study_unknown_field', (study) => { study.unknown = true; }],
    ['study_pairing_not_independent', (study) => { study.pairs[0].conditions.crossReadPrevented = false; }],
    ['invalid_or_duplicate_study_pair', (study) => { study.pairs[1].id = study.pairs[0].id; }],
    ['duplicate_study_task', (study) => { study.pairs[1].taskDigest = study.pairs[0].taskDigest; }],
    ['study_absolute_path_forbidden', (study) => { study.pairs[0].conditions.model = 'C:\\secret\\model'; }],
    ['study_identity_forbidden', (study) => { study.pairs[0].participantId = 'person@example.com'; }],
    ['invalid_study_token_usage', (study) => { study.pairs[0].plugin.tokenUsage.totalTokens = 999; }],
  ];
  for (const [code, mutate] of cases) {
    const study = makeStudy();
    mutate(study);
    assert.throws(() => analyzeRealDeveloperStudy(study), (error) => error instanceof RealDeveloperEffectivenessError && error.code === code);
  }
  const missingTokens = makeStudy();
  missingTokens.pairs.forEach((pair) => { pair.plugin.tokenUsage = null; });
  const result = analyzeRealDeveloperStudy(missingTokens);
  assert.equal(result.status, 'demonstrated-improvement');
  assert.equal(result.tokenUsage.status, 'unmeasured');
  assert.equal(result.tokenUsage.medianDelta, null);
});

test('[TC-05] 受管写入不可覆盖且来源可复算', (context) => {
  const root = createRoot(context, 'persistence');
  const source = writeStudy(root);
  const options = { root, study: SOURCE_PATH, revision: REVISION, write: true };
  const operations = { readSnapshot: () => ({ revision: REVISION, status: '' }) };
  const recorded = projectRealDeveloperEffectivenessEvidence(options, operations);
  const original = fs.readFileSync(path.join(root, recorded.receipt), 'utf8');
  assert.throws(
    () => projectRealDeveloperEffectivenessEvidence(options, operations),
    (error) => error.code === 'effectiveness_evidence_exists',
  );
  assert.equal(fs.readFileSync(path.join(root, recorded.receipt), 'utf8'), original);
  assert.equal(projectSupportEvidenceMatrix({
    root,
    revision: REVISION,
    developerEffectivenessEvidencePath: recorded.receipt,
  }).developerEffectiveness.benefitPercent, 20);
  fs.appendFileSync(source, ' \n', 'utf8');
  assert.throws(() => projectSupportEvidenceMatrix({
    root,
    revision: REVISION,
    developerEffectivenessEvidencePath: recorded.receipt,
  }), (error) => error instanceof SupportEvidenceError && error.code === 'support_evidence_source_mismatch');
  assert.throws(
    () => projectRealDeveloperEffectivenessEvidence({ root, study: '/tmp/study.json', revision: REVISION }),
    (error) => error.code === 'effectiveness_study_outside_runtime',
  );
  assert.throws(
    () => projectRealDeveloperEffectivenessEvidence({ root, study: 'C:\\study.json', revision: REVISION }),
    (error) => error.code === 'effectiveness_study_outside_runtime',
  );
});

test('[TC-06] 支持矩阵只投影标准同提交结论', () => {
  const baseline = buildSupportEvidenceMatrix();
  assert.equal(baseline.developerEffectiveness.status, 'unmeasured');
  assert.equal(baseline.developerEffectiveness.benefitPercent, null);
  assert.equal(baseline.evidenceSummary.developerEffectiveness, null);

  const record = buildRealDeveloperEffectivenessRecord(makeStudy(), { path: SOURCE_PATH, bytes: 1, sha256: 'b'.repeat(64) });
  const projected = buildSupportEvidenceMatrix({ revision: REVISION, developerEffectivenessEvidence: record });
  assert.equal(projected.developerEffectiveness.status, 'demonstrated-improvement');
  assert.equal(projected.developerEffectiveness.benefitPercent, 20);
  assert.equal(projected.developerEffectiveness.trust, 'generated');
  assert.equal(projected.evidenceSummary.developerEffectiveness.studyId, 'study-001');
  assert.deepEqual(projected.counts, baseline.counts);

  const fake = structuredClone(record);
  fake.generator.id = 'manual-file';
  assert.throws(() => buildSupportEvidenceMatrix({ revision: REVISION, developerEffectivenessEvidence: fake }), (error) => error.code === 'invalid_developer_effectiveness_evidence');
  assert.throws(() => buildSupportEvidenceMatrix({ revision: 'b'.repeat(40), developerEffectivenessEvidence: record }), (error) => error.code === 'invalid_developer_effectiveness_evidence');
  const invalidBenefit = structuredClone(record);
  invalidBenefit.status = 'inconclusive';
  assert.throws(() => buildSupportEvidenceMatrix({ revision: REVISION, developerEffectivenessEvidence: invalidBenefit }), (error) => error.code === 'invalid_developer_effectiveness_benefit');
});

test('[TC-07] 普通仓库验证不执行真实研究', (context) => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  assert.equal(packageJson.scripts['effectiveness:real-evidence'], 'node plugins/frontend-ai-workflow/scripts/real-developer-effectiveness-evidence.mjs');
  for (const script of ['test', 'validate', 'verify']) {
    assert.equal(packageJson.scripts[script].includes('real-developer-effectiveness-evidence.mjs'), false);
  }
  assert.equal(TEST_GROUPS.workflow.includes('tests/real-developer-effectiveness-evidence.test.mjs'), true);
  const root = createRoot(context, 'preview-boundary');
  writeStudy(root);
  let externalCalls = 0;
  const preview = projectRealDeveloperEffectivenessEvidence({ root, study: SOURCE_PATH, revision: REVISION }, {
    readSnapshot: () => { externalCalls += 1; },
    runProcess: () => { externalCalls += 1; },
    request: () => { externalCalls += 1; },
  });
  assert.equal(preview.status, 'planned');
  assert.equal(externalCalls, 0);
});
