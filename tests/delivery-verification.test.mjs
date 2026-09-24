import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  advanceRepairBudget,
  decideProjectVerification,
  selectVerificationLevel,
} from '../plugins/frontend-ai-workflow/scripts/delivery-verification.mjs';
import { summarizeUiReviewResult } from '../plugins/frontend-ai-workflow/scripts/ui-review-runner.mjs';

const pluginRoot = path.resolve('plugins/frontend-ai-workflow');

function readSkill(name) {
  return fs.readFileSync(path.join(pluginRoot, 'skills', name, 'SKILL.md'), 'utf8');
}

test('[P5-01] 四种验证等级由实际影响和验收目标确定', () => {
  assert.equal(selectVerificationLevel({ effects: ['non-runtime-text'] }).level, 'None');
  assert.equal(selectVerificationLevel({ effects: ['runtime-logic'] }).level, 'Focused');
  assert.equal(selectVerificationLevel({ effects: ['visible-ui'], acceptanceTargets: ['named-interaction'] }).level, 'Targeted UI');
  assert.equal(selectVerificationLevel({ effects: ['runtime-logic'], acceptanceTargets: ['critical-ui-journey'] }).level, 'Full UI');
});

test('[P5-02] 实施深度不会改变相同事实的验证等级', () => {
  const facts = { effects: ['visible-ui'], acceptanceTargets: ['named-component'] };
  const direct = selectVerificationLevel({ ...facts, implementationDepth: 'Direct' });
  const light = selectVerificationLevel({ ...facts, implementationDepth: 'Light' });
  const complex = selectVerificationLevel({ ...facts, implementationDepth: 'Complex' });
  assert.equal(direct.level, 'Targeted UI');
  assert.equal(light.level, direct.level);
  assert.equal(complex.level, direct.level);
  assert.equal('implementationDepth' in direct, false);
});

test('[P5-01][P5-02] 显式验证请求只能提高等级，不能降低必要验证', () => {
  const raised = selectVerificationLevel({ effects: ['runtime-logic'], requestedLevel: 'Full UI' });
  assert.equal(raised.level, 'Full UI');
  const protectedLevel = selectVerificationLevel({ effects: ['visible-ui'], requestedLevel: 'None' });
  assert.equal(protectedLevel.level, 'Targeted UI');
});

test('[P5-07] 同类失败只有两轮修复预算，第三次返回稳定停止结果', () => {
  const first = advanceRepairBudget({}, { category: 'assertion-mismatch', verificationLevel: 'Focused' });
  const second = advanceRepairBudget(first.state, { category: 'assertion-mismatch', verificationLevel: 'Focused' });
  const third = advanceRepairBudget(second.state, { category: 'assertion-mismatch', verificationLevel: 'Focused' });
  assert.equal(first.status, 'repair');
  assert.equal(first.repairRound, 1);
  assert.equal(second.status, 'repair');
  assert.equal(second.repairRound, 2);
  assert.equal(third.ok, false);
  assert.equal(third.code, 'verification_repair_exhausted');
  assert.equal(third.status, 'stopped');
  assert.equal(third.occurrence, 3);
  assert.equal(third.verificationLevel, 'Focused');
});

test('[P5-07] 不同失败分类独立计数且不会自动升级验证等级', () => {
  const first = advanceRepairBudget({}, { category: 'assertion-mismatch', verificationLevel: 'Targeted UI' });
  const other = advanceRepairBudget(first.state, { category: 'environment-unavailable', verificationLevel: 'Targeted UI' });
  assert.equal(other.occurrence, 1);
  assert.equal(other.verificationLevel, 'Targeted UI');
  assert.deepEqual(other.state.failures, { 'assertion-mismatch': 1, 'environment-unavailable': 1 });
});

test('[P5-08] 缺失本地测试入口或已知失败都不安装依赖、不重复执行', () => {
  const missing = decideProjectVerification({ entryStatus: 'missing' });
  assert.equal(missing.code, 'verification_local_entry_missing');
  assert.equal(missing.runAllowed, false);
  assert.equal(missing.installAllowed, false);
  assert.equal(missing.retryAllowed, false);

  const known = decideProjectVerification({ entryStatus: 'detected', knownFailure: true });
  assert.equal(known.code, 'verification_known_failure');
  assert.equal(known.runAllowed, false);
  assert.equal(known.installAllowed, false);
  assert.equal(known.retryAllowed, false);
});

test('[P5-03] frontend-test 只承担显式只读分析或明确授权的测试实现', () => {
  const skill = readSkill('frontend-test');
  assert.match(skill, /read-only coverage analysis/iu);
  assert.match(skill, /explicit(?:ly)? authori[sz]ed test implementation/iu);
  assert.match(skill, /do not install dependencies/iu);
  assert.doesNotMatch(skill, /managed-test-workflow\.md|active change|test-plan|requirement/iu);
});

test('[P5-04][P5-05] UI Review 只读验收，UI Verify 复用同一基线且不扩范围', () => {
  const review = readSkill('frontend-ui-review');
  const verify = readSkill('frontend-ui-verify');
  assert.match(review, /read-only|只读/iu);
  assert.match(review, /不修改业务源码|does not modify business source/iu);
  assert.match(verify, /同一基线|same baseline/iu);
  assert.match(verify, /不得扩大|must not expand/iu);
  assert.match(verify, /不修改源码|does not modify source/iu);
});

test('[P5-06] UI 默认结果只暴露必要摘要，trace 仅在失败后可按需采集', () => {
  const passed = summarizeUiReviewResult({
    status: 'passed',
    observations: [{ id: 'OBS-001' }],
    findings: [],
    repairCandidates: [],
    artifacts: {
      state: '.frontend-ui-review/runs/a/s/state.json',
      report: '.frontend-ui-review/runs/a/s/report.md',
      actualScreenshot: '.frontend-ui-review/runs/a/s/actual.png',
      annotatedScreenshot: '.frontend-ui-review/runs/a/s/annotated.png',
    },
  }, { consoleErrors: [] });
  assert.deepEqual(passed.counts, { observations: 1, findings: 0, repairCandidates: 0 });
  assert.equal(passed.console.errorCount, 0);
  assert.deepEqual(passed.trace, { created: false, eligible: false, reason: 'not-needed' });
  assert.equal(JSON.stringify(passed).includes('OBS-001'), false);

  const failed = summarizeUiReviewResult({
    status: 'needs-fix', observations: [], findings: [{ id: 'UI-001' }], repairCandidates: [], artifacts: {},
  }, { consoleErrors: ['页面错误'] });
  assert.deepEqual(failed.trace, { created: false, eligible: true, reason: 'failure-diagnostic-on-request' });
  assert.equal(failed.console.errorCount, 1);
});

test('[P5-06] UI 运行物只允许进入被忽略的运行目录', () => {
  const ignoreTemplate = fs.readFileSync(path.join(pluginRoot, 'assets/templates/.gitignore'), 'utf8');
  const adapter = fs.readFileSync(path.join(pluginRoot, 'assets/templates/ui-review/playwright-adapter.mjs'), 'utf8');
  assert.match(ignoreTemplate, /^\/\.frontend-ui-review\/runs\/$/mu);
  assert.match(adapter, /consoleErrors\.length < 20/u);
  assert.match(adapter, /slice\(0, 500\)/u);
  assert.doesNotMatch(adapter, /tracing\.start|trace\.zip/u);
  for (const skillName of ['frontend-ui-review', 'frontend-ui-verify']) {
    const skill = readSkill(skillName);
    assert.match(skill, /trace.*(失败|failure).*(按需|on request)/iu);
    assert.match(skill, /screenshot|截图/iu);
    assert.match(skill, /console/iu);
  }
});
