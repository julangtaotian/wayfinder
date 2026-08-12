import test from 'node:test';
import {
  assert,
  fs,
  path,
  spawnSync,
  inspectBundledPlaywright,
  completeRepairRun,
  completeReviewRun,
  completeVerifyRun,
  createReviewRun,
  createVerifyRun,
  evaluateRepairGate,
  loadUiReviewConfig,
  normalizeUiReviewConfig,
  writeRunState,
  workflowScript,
  configInput,
  configV2Input,
  createProject,
  finding,
} from './fixtures.mjs';

test('验收、授权和修复状态只在完整门禁后迁移', (context) => {
  const projectRoot = createProject(context);
  const config = loadUiReviewConfig(projectRoot);
  const review = createReviewRun(config, 'home-desktop', { runId: 'build-101', now: '2026-08-06T10:00:00+08:00' });
  const completed = completeReviewRun(review, { findings: [finding()] });
  assert.equal(completed.status, 'needs-fix');
  assert.equal(evaluateRepairGate(completed, config).decision, 'suggest');
  assert.equal(evaluateRepairGate(completed, config, { explicitApproval: true }).decision, 'apply');
  assert.equal(evaluateRepairGate(completed, { ...config, autoFix: 'off' }, { explicitApproval: true }).decision, 'blocked');

  const repaired = completeRepairRun(completed, ['UI-001']);
  assert.equal(repaired.stage, 'repair');
  assert.equal(repaired.status, 'ready-to-verify');
  assert.throws(() => completeRepairRun(completed, ['UI-999']), /未知问题/u);
  assert.throws(
    () => completeReviewRun(review, { findings: [finding({ verification: { ...finding().verification, assertions: [] } })] }),
    /至少要包含一条断言/u,
  );
});

test('零问题只形成有限范围通过，中置信度和待分析结果保持不确定', (context) => {
  const projectRoot = createProject(context);
  const config = loadUiReviewConfig(projectRoot);
  const review = createReviewRun(config, 'home-desktop', { runId: 'build-102' });
  const completed = completeReviewRun(review, {
    findings: [
      finding({ confidence: 'medium' }),
      finding({ id: 'UI-002', type: '间距', differencePx: 1 }),
    ],
  });
  assert.equal(completed.status, 'inconclusive');
  assert.deepEqual(completed.findings, []);
  assert.equal(completed.observations.length, 2);
  const pending = completeReviewRun(review, { analysisPending: true, findings: [] });
  assert.equal(pending.status, 'inconclusive');
  assert.equal(pending.fallbackRequired, false);
});

test('版本 2 状态分离观察、问题与可修复候选，版本 1 历史状态只读', (context) => {
  const projectRoot = createProject(context);
  const config = loadUiReviewConfig(projectRoot);
  const review = createReviewRun(config, 'home-desktop', { runId: 'state-v2' });
  assert.equal(review.schemaVersion, 2);
  assert.deepEqual(review.observations, []);
  assert.deepEqual(review.repairCandidates, []);

  const imageOnly = completeReviewRun(review, {
    findings: [
      {
        id: 'UI-001',
        confidence: 'high',
        selector: 'main',
        type: '像素差异',
        targetValue: '设计图区域',
        repairable: false,
        evidence: { region: 'main', diffPixels: 128, diffRatio: 0.02 },
      },
    ],
  });
  assert.equal(imageOnly.status, 'needs-fix');
  assert.equal(imageOnly.findings.length, 1);
  assert.equal(imageOnly.repairCandidates.length, 0);
  assert.throws(() => evaluateRepairGate(imageOnly, config), /没有可修复/u);

  const legacy = { ...review, schemaVersion: 1, runId: 'legacy-state' };
  assert.throws(() => writeRunState(projectRoot, legacy), /版本 1.*只读/u);
  assert.throws(() => completeReviewRun(legacy, { findings: [] }), /版本 1.*只读/u);

  const fallbackProject = createProject(context, {
    scenarios: [{
      ...configInput().scenarios[0],
      capture: 'project-playwright',
      captureFallback: 'browser',
    }],
  });
  const fallbackConfig = loadUiReviewConfig(fallbackProject);
  const fallbackReview = createReviewRun(fallbackConfig, 'home-desktop', { runId: 'needs-visual-fallback' });
  const inconclusive = completeReviewRun(fallbackReview, { analysisPending: true, findings: [] });
  assert.equal(inconclusive.status, 'inconclusive');
  assert.equal(inconclusive.fallbackRequired, true);

  const baseline = completeReviewRun(
    createReviewRun(config, 'home-desktop', { runId: 'verify-baseline' }),
    { findings: [finding()] },
  );
  const verify = createVerifyRun(config, baseline, { runId: 'verify-inconclusive' });
  const uncertainVerify = completeVerifyRun(verify, baseline, { analysisPending: true, findings: [] });
  assert.equal(uncertainVerify.status, 'inconclusive');
  assert.equal(uncertainVerify.verification.resolved.length, 0);
});

test('能力链路状态矩阵覆盖初始、操作、重复、空态与错误态', (context) => {
  const projectRoot = createProject(context);
  const first = normalizeUiReviewConfig(configV2Input(), projectRoot);
  const repeated = normalizeUiReviewConfig(configV2Input(), projectRoot);
  assert.equal(first.scenarios[0].fingerprint, repeated.scenarios[0].fingerprint);
  assert.equal(first.scenarios[0].interactions.length > 0, true);

  const passed = completeReviewRun(
    createReviewRun(first, 'home-desktop', { runId: 'matrix-passed' }),
    { observations: [], findings: [] },
  );
  assert.equal(passed.status, 'passed');
  const uncertain = completeReviewRun(
    createReviewRun(first, 'home-desktop', { runId: 'matrix-inconclusive' }),
    { outcome: 'inconclusive', observations: [], findings: [] },
  );
  assert.equal(uncertain.status, 'inconclusive');

  const invalid = configV2Input();
  invalid.scenarios[0].interactions = [{ action: 'evaluate', value: 'document.body' }];
  assert.throws(() => normalizeUiReviewConfig(invalid, projectRoot), /不支持的交互动作/u);
  const unsupported = inspectBundledPlaywright({ platform: 'win32', arch: 'x64', useCache: false });
  assert.equal(unsupported.available, false);
  assert.match(unsupported.reason, /未携带/u);
});

test('运行状态原子写入且拒绝覆盖和未知文件', (context) => {
  const projectRoot = createProject(context);
  const config = loadUiReviewConfig(projectRoot);
  const review = createReviewRun(config, 'home-desktop', { runId: 'build-103' });
  const statePath = writeRunState(projectRoot, review);
  assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).runId, 'build-103');
  assert.throws(() => writeRunState(projectRoot, review), /拒绝覆盖/u);

  fs.writeFileSync(path.join(path.dirname(statePath), 'unknown.txt'), 'user file');
  assert.throws(() => writeRunState(projectRoot, review, { allowExistingState: true }), /未知内容/u);
  assert.equal(fs.readFileSync(path.join(path.dirname(statePath), 'unknown.txt'), 'utf8'), 'user file');
});

test('复验按稳定问题指纹区分关闭、未解决与新增问题', (context) => {
  const projectRoot = createProject(context);
  const config = loadUiReviewConfig(projectRoot);
  const review = createReviewRun(config, 'home-desktop', { runId: 'build-104' });
  const baseline = completeRepairRun(completeReviewRun(review, { findings: [finding()] }), ['UI-001']);

  const passedRun = createVerifyRun(config, baseline, { runId: 'build-105' });
  const passed = completeVerifyRun(passedRun, baseline, { findings: [] });
  assert.equal(passed.status, 'passed');
  assert.equal(passed.verification.resolved.length, 1);

  const failedRun = createVerifyRun(config, baseline, { runId: 'build-106' });
  const failed = completeVerifyRun(failedRun, baseline, {
    findings: [
      finding(),
      finding({ id: 'UI-002', selector: 'main .title', type: '字号', targetValue: '16px', sourceTarget: { ...finding().sourceTarget, anchor: '.title {' } }),
    ],
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.verification.remaining.length, 1);
  assert.equal(failed.verification.new.length, 1);
});

test('复验对同一不可修复问题的实际差异变化保持 remaining', (context) => {
  const projectRoot = createProject(context);
  const config = loadUiReviewConfig(projectRoot);
  const geometryFinding = (actual) => ({
    id: 'UI-001',
    confidence: 'high',
    selector: '.row',
    type: '几何断言差异',
    targetValue: 'rect.height=57±0.5',
    repairable: false,
    evidence: {
      property: 'rect.height',
      actual,
      expected: 57,
      tolerance: 0.5,
      difference: actual - 57,
    },
  });
  const baseline = completeReviewRun(
    createReviewRun(config, 'home-desktop', { runId: 'stable-non-repairable-baseline' }),
    { outcome: 'needs-fix', observations: [], findings: [geometryFinding(79)] },
  );
  const verify = completeVerifyRun(
    createVerifyRun(config, baseline, { runId: 'stable-non-repairable-verify' }),
    baseline,
    { outcome: 'needs-fix', observations: [], findings: [geometryFinding(78)] },
  );
  assert.equal(verify.status, 'failed');
  assert.equal(verify.verification.resolved.length, 0);
  assert.equal(verify.verification.remaining.length, 1);
  assert.equal(verify.verification.new.length, 0);
});

test('复验拒绝配置上下文变化，CLI 默认预览且显式写入', (context) => {
  const projectRoot = createProject(context);
  const config = loadUiReviewConfig(projectRoot);
  const baseline = completeReviewRun(
    createReviewRun(config, 'home-desktop', { runId: 'build-107' }),
    { findings: [finding()] },
  );
  const changedConfig = {
    ...config,
    scenarios: [{ ...config.scenarios[0], fingerprint: '0'.repeat(64) }],
  };
  assert.throws(() => createVerifyRun(changedConfig, baseline, { runId: 'build-108' }), /重新开始独立验收/u);

  const preview = spawnSync(
    process.execPath,
    [workflowScript, 'start-review', '--target', projectRoot, '--scenario', 'home-desktop', '--run-id', 'cli-1'],
    { encoding: 'utf8' },
  );
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).write, false);
  assert.equal(fs.existsSync(path.join(projectRoot, '.frontend-ui-review', 'runs', 'cli-1')), false);

  const written = spawnSync(
    process.execPath,
    [workflowScript, 'start-review', '--target', projectRoot, '--scenario', 'home-desktop', '--run-id', 'cli-1', '--write'],
    { encoding: 'utf8' },
  );
  assert.equal(written.status, 0, written.stderr);
  assert.equal(JSON.parse(written.stdout).write, true);
  assert.equal(fs.existsSync(path.join(projectRoot, '.frontend-ui-review', 'runs', 'cli-1', 'home-desktop', 'state.json')), true);
});

test('复验继承首次实际采集器，并拒绝采集器切换', (context) => {
  const projectRoot = createProject(context, {
    scenarios: [{
      ...configInput().scenarios[0],
      capture: 'project-playwright',
      captureFallback: 'browser',
    }],
  });
  const config = loadUiReviewConfig(projectRoot);
  const review = createReviewRun(config, 'home-desktop', {
    runId: 'fallback-review',
    capture: 'browser',
  });
  const baseline = completeRepairRun(completeReviewRun(review, { findings: [finding()] }), ['UI-001']);
  const verify = createVerifyRun(config, baseline, { runId: 'fallback-verify' });
  assert.equal(verify.capture, 'browser');
  assert.throws(
    () => completeVerifyRun({ ...verify, capture: 'project-playwright' }, baseline, { findings: [] }),
    /复验运行与基线运行不匹配/u,
  );

  const changedConfig = {
    ...config,
    scenarios: [{
      ...config.scenarios[0],
      capturePlan: {
        ...config.scenarios[0].capturePlan,
        fallback: null,
        order: ['project-playwright'],
      },
    }],
  };
  assert.throws(
    () => createVerifyRun(changedConfig, baseline, { runId: 'fallback-removed' }),
    /重新开始独立验收/u,
  );
});
