import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { decideProjectVerification } from '../plugins/frontend-ai-workflow/scripts/delivery-verification.mjs';
import { summarizeUiReviewResult } from '../plugins/frontend-ai-workflow/scripts/ui-review-runner.mjs';

const pluginRoot = path.resolve('plugins/frontend-ai-workflow');

function readSkill(name) {
  return fs.readFileSync(path.join(pluginRoot, 'skills', name, 'SKILL.md'), 'utf8');
}

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
  assert.throws(
    () => decideProjectVerification({ entryStatus: 'unknown' }),
    (error) => error.code === 'verification_invalid_entry_status' && error.status === 'blocked',
  );
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
