import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  readTemporaryVerificationSummary,
  verificationSummaryTarget,
} from '../plugins/frontend-ai-workflow/scripts/check-change.mjs';
import {
  createDeterministicReportContext,
  renderDeterministicAssessmentMarkdown,
} from '../plugins/frontend-ai-workflow/scripts/ui-review-report.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('临时验证摘要固定在受管 runs，且只接受全部通过的 Outcome Gate', (context) => {
  const parent = path.join(repositoryRoot, '.frontend-ai-workflow', 'runs', 'completion-integrity-tests');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'case-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = verificationSummaryTarget(root, 'bounded-change');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({
    schemaVersion: 1,
    changeId: 'bounded-change',
    verificationLevel: 'Focused',
    outcomes: [{ acceptanceId: 'AC-01', status: 'passed', observation: '聚焦测试观察到更新值。' }],
  })}\n`);

  const accepted = readTemporaryVerificationSummary(root, 'bounded-change', ['AC-01']);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.projectPath, '.frontend-ai-workflow/runs/bounded-change/verification-summary.json');
  assert.equal(accepted.outcomeCount, 1);

  fs.writeFileSync(target, `${JSON.stringify({
    schemaVersion: 1,
    changeId: 'bounded-change',
    verificationLevel: 'Focused',
    outcomes: [{ acceptanceId: 'AC-01', status: 'failed', observation: '页面仍显示旧值。' }],
  })}\n`);
  assert.equal(readTemporaryVerificationSummary(root, 'bounded-change', ['AC-01']).code, 'outcome_gate_failed');
});

test('临时验证摘要必须与规格 Acceptance ID 集合完全一致', (context) => {
  const parent = path.join(repositoryRoot, '.frontend-ai-workflow', 'runs', 'completion-integrity-tests');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'coverage-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = verificationSummaryTarget(root, 'coverage-change');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({
    schemaVersion: 1,
    changeId: 'coverage-change',
    verificationLevel: 'Focused',
    outcomes: [
      { acceptanceId: 'AC-01', status: 'passed', observation: '第一个结果已观察。' },
      { acceptanceId: 'AC-03', status: 'passed', observation: '额外结果不属于当前规格。' },
    ],
  })}\n`);
  assert.equal(
    readTemporaryVerificationSummary(root, 'coverage-change', ['AC-01', 'AC-02']).code,
    'outcome_gate_mismatch',
  );
});

test('UI 报告运行身份保持确定且不替代 Outcome Gate', () => {
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
});
