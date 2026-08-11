import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { runPlaywrightAdapter } from '../plugins/frontend-ai-workflow/scripts/playwright-adapter-runner.mjs';
import {
  BUNDLED_PLAYWRIGHT_VERSION,
  inspectBundledPlaywright,
  loadBundledPlaywright,
  smokeTestBundledPlaywright,
  verifyPlaywrightIntegrity,
} from '../plugins/frontend-ai-workflow/scripts/playwright-runtime.mjs';
import { executeStructuredInteractions } from '../plugins/frontend-ai-workflow/scripts/ui-review-interactions.mjs';
import { compareUiEvidence, inspectComparisonRuntime } from '../plugins/frontend-ai-workflow/scripts/ui-review-comparator.mjs';
import { renderDeterministicAssessmentMarkdown } from '../plugins/frontend-ai-workflow/scripts/ui-review-report.mjs';
import { runUiReview } from '../plugins/frontend-ai-workflow/scripts/ui-review-runner.mjs';
import pngjs from '../plugins/frontend-ai-workflow/runtime/playwright/node_modules/pngjs/lib/png.js';
import {
  completeRepairRun,
  completeReviewRun,
  completeVerifyRun,
  createCapturePlan,
  createReviewRun,
  createVerifyRun,
  evaluateRepairGate,
  loadUiReviewConfig,
  normalizeUiReviewConfig,
  resolveSafeProjectPath,
  writeRunState,
} from '../plugins/frontend-ai-workflow/scripts/ui-review-workflow.mjs';

const workflowScript = path.resolve('plugins/frontend-ai-workflow/scripts/ui-review-workflow.mjs');
const { PNG } = pngjs;

function writeSolidPng(filePath, width, height, [red, green, blue, alpha = 255]) {
  const image = new PNG({ width, height });
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = red;
    image.data[offset + 1] = green;
    image.data[offset + 2] = blue;
    image.data[offset + 3] = alpha;
  }
  fs.writeFileSync(filePath, PNG.sync.write(image));
}

function configInput(overrides = {}) {
  return {
    schemaVersion: 1,
    artifactsRoot: '.frontend-ui-review/runs',
    scenarios: [
      {
        id: 'home-desktop',
        url: 'http://127.0.0.1:5173/',
        capture: 'browser',
        viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
        design: { type: 'image', path: 'design/home.png' },
        targets: [{ selector: 'main', nodeMeaning: '页面主要内容', sourcePath: 'src/main.css' }],
        interactions: ['等待页面稳定'],
      },
    ],
    ...overrides,
  };
}

function configV2Input(overrides = {}) {
  return configInput({
    schemaVersion: 2,
    scenarios: [
      {
        ...configInput().scenarios[0],
        interactions: [
          { action: 'click', selector: '[data-open-dialog]', timeout: 5000 },
          { action: 'fill', selector: '[name="displayName"]', value: '测试用户' },
          { action: 'select-option', selector: '[name="role"]', value: 'editor' },
          { action: 'assert', assertion: 'text', selector: '[role="dialog"] h2', value: '编辑资料' },
          { action: 'capture', name: 'dialog-filled' },
        ],
        comparison: {
          scope: 'visual',
          mode: 'hybrid',
          dom: [
            { selector: '[role="dialog"]', property: 'visible', expected: true },
            { selector: '[name="displayName"]', property: 'value', expected: '测试用户' },
          ],
          image: {
            regions: [
              {
                name: 'dialog',
                actual: { x: 240, y: 120, width: 800, height: 600 },
                expected: { x: 240, y: 120, width: 800, height: 600 },
              },
            ],
            masks: [],
            thresholds: { colorThreshold: 0.1, maxDiffPixels: 20, maxDiffRatio: 0.001 },
          },
        },
      },
    ],
    ...overrides,
  });
}

function createProject(context, overrides = {}) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-ui-review-'));
  context.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(projectRoot, 'design'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, '.frontend-ui-review'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'design', 'home.png'), 'design-v1');
  fs.writeFileSync(path.join(projectRoot, 'src', 'main.css'), 'main { color: blue; }\n');
  fs.writeFileSync(path.join(projectRoot, 'package.json'), `${JSON.stringify({ name: 'ui-adapter-fixture', private: true }, null, 2)}\n`);
  fs.writeFileSync(
    path.join(projectRoot, '.frontend-ui-review', 'config.json'),
    `${JSON.stringify(configInput(overrides), null, 2)}\n`,
  );
  return projectRoot;
}

function finding(overrides = {}) {
  return {
    id: 'UI-001',
    confidence: 'high',
    selector: 'main',
    type: '颜色',
    targetValue: '#ff6014',
    sourceTarget: {
      file: 'src/main.css',
      anchor: 'main {',
      styleSource: '页面主样式',
    },
    changeScope: '只修改 main 的 color 声明',
    forbiddenChanges: '不要修改其他选择器和业务逻辑',
    verification: {
      workingDirectory: 'src',
      commands: ['npm test'],
      page: '/',
      assertions: ['main 计算颜色为目标值'],
    },
    ...overrides,
  };
}

test('配置默认建议模式，并根据设计内容生成稳定场景指纹', (context) => {
  const projectRoot = createProject(context);
  const first = loadUiReviewConfig(projectRoot);
  const second = loadUiReviewConfig(projectRoot);
  assert.equal(first.autoFix, 'suggest');
  assert.equal(first.scenarios[0].fingerprint, second.scenarios[0].fingerprint);

  fs.writeFileSync(path.join(projectRoot, 'design', 'home.png'), 'design-v2');
  const changed = loadUiReviewConfig(projectRoot);
  assert.notEqual(first.scenarios[0].fingerprint, changed.scenarios[0].fingerprint);
});

test('版本 2 配置规范化结构化交互、比较规则并生成稳定指纹', (context) => {
  const projectRoot = createProject(context);
  const first = normalizeUiReviewConfig(configV2Input(), projectRoot);
  const reordered = configV2Input();
  reordered.scenarios[0].interactions[0] = {
    timeout: 5000,
    selector: '[data-open-dialog]',
    action: 'click',
  };
  const second = normalizeUiReviewConfig(reordered, projectRoot);
  assert.equal(first.schemaVersion, 2);
  assert.equal(first.scenarios[0].interactionMode, 'structured');
  assert.equal(first.scenarios[0].fingerprint, second.scenarios[0].fingerprint);
  assert.equal(first.scenarios[0].comparison.mode, 'hybrid');
  assert.equal(first.scenarios[0].comparison.scope, 'visual');
  assert.equal(first.scenarios[0].comparison.visualEvidenceDeclared, true);

  const changed = configV2Input();
  changed.scenarios[0].interactions[1].value = '另一个用户';
  assert.notEqual(
    first.scenarios[0].fingerprint,
    normalizeUiReviewConfig(changed, projectRoot).scenarios[0].fingerprint,
  );
});

test('视觉范围规范化几何断言并保持旧配置为结构范围', (context) => {
  const projectRoot = createProject(context);
  const input = configV2Input();
  input.scenarios[0].comparison = {
    scope: 'visual',
    mode: 'dom',
    dom: [
      { selector: '.row', property: 'rect.height', expected: 57, tolerance: 0.5 },
      {
        selector: '.remove',
        property: 'rect.center-y',
        relativeTo: { selector: '.field-input', property: 'rect.center-y' },
        tolerance: 1,
      },
    ],
  };
  const normalized = normalizeUiReviewConfig(input, projectRoot).scenarios[0].comparison;
  assert.equal(normalized.scope, 'visual');
  assert.equal(normalized.visualEvidenceDeclared, true);
  assert.equal(normalized.dom[0].expected, 57);
  assert.equal(normalized.dom[1].relativeTo.selector, '.field-input');

  const legacy = configV2Input();
  delete legacy.scenarios[0].comparison.scope;
  assert.equal(normalizeUiReviewConfig(legacy, projectRoot).scenarios[0].comparison.scope, 'structure');

  const invalid = structuredClone(input);
  invalid.scenarios[0].comparison.dom[0] = {
    selector: '.row',
    property: 'rect.height',
    expected: 57,
    relativeTo: { selector: '.other', property: 'rect.height' },
  };
  assert.throws(() => normalizeUiReviewConfig(invalid, projectRoot), /必须且只能声明 expected 或 relativeTo/u);

  const repeatedProperty = structuredClone(input);
  repeatedProperty.scenarios[0].comparison.dom.push({ selector: '.row', property: 'rect.height', expected: 58 });
  assert.equal(normalizeUiReviewConfig(repeatedProperty, projectRoot).scenarios[0].comparison.dom.length, 3);

  const styleInput = configV2Input();
  styleInput.scenarios[0].comparison = {
    scope: 'visual',
    mode: 'dom',
    dom: [{ selector: '.row', property: 'style.height', expected: '57px' }],
  };
  assert.equal(normalizeUiReviewConfig(styleInput, projectRoot).scenarios[0].comparison.dom[0].exact, true);
  const emptyStyle = structuredClone(styleInput);
  emptyStyle.scenarios[0].comparison.dom[0].expected = '';
  assert.throws(() => normalizeUiReviewConfig(emptyStyle, projectRoot), /计算样式期望值不能为空/u);
});

test('版本 2 配置拒绝未知交互字段、危险凭据目标、非法超时和不安全截图名称', (context) => {
  const projectRoot = createProject(context);
  const invalidCases = [
    [{ action: 'click', selector: 'button', script: 'alert(1)' }, /不支持字段/u],
    [{ action: 'fill', selector: 'input[type="password"]', value: 'secret' }, /敏感凭据/u],
    [{ action: 'click', selector: 'button', timeout: 50 }, /100 到 30000/u],
    [{ action: 'capture', name: '../outside' }, /截图名称/u],
    [{ action: 'evaluate', value: 'document.body' }, /不支持的交互动作/u],
  ];
  for (const [interaction, expected] of invalidCases) {
    const input = configV2Input();
    input.scenarios[0].interactions = [interaction];
    assert.throws(() => normalizeUiReviewConfig(input, projectRoot), expected);
  }
});

test('版本 1 字符串交互保持说明语义和原指纹来源', (context) => {
  const projectRoot = createProject(context);
  const legacy = normalizeUiReviewConfig(configInput(), projectRoot);
  assert.equal(legacy.schemaVersion, 1);
  assert.equal(legacy.scenarios[0].interactionMode, 'instructions');
  assert.deepEqual(legacy.scenarios[0].interactions, ['等待页面稳定']);
  const invalid = configInput();
  invalid.scenarios[0].interactions = [{ action: 'click', selector: 'main' }];
  assert.throws(() => normalizeUiReviewConfig(invalid, projectRoot), /字符串数组/u);
});

test('配置拒绝危险路径、重复场景、无效视口和空目标节点', (context) => {
  const projectRoot = createProject(context);
  assert.throws(
    () => normalizeUiReviewConfig(configInput({ artifactsRoot: '../runs' }), projectRoot),
    /不能包含空路径段、\. 或 \.\./u,
  );
  assert.throws(
    () => normalizeUiReviewConfig(configInput({ scenarios: [configInput().scenarios[0], configInput().scenarios[0]] }), projectRoot),
    /场景 ID 重复/u,
  );
  assert.throws(
    () => normalizeUiReviewConfig(configInput({ scenarios: [{ ...configInput().scenarios[0], viewport: { width: 100, height: 900 } }] }), projectRoot),
    /width/u,
  );
  assert.throws(
    () => normalizeUiReviewConfig(configInput({ scenarios: [{ ...configInput().scenarios[0], targets: [] }] }), projectRoot),
    /至少要包含一个目标节点/u,
  );

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-ui-review-outside-'));
  context.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(projectRoot, 'escaped'));
  assert.throws(() => resolveSafeProjectPath(projectRoot, 'escaped/run', '测试路径'), /符号链接越出/u);
});

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

test('确定性比较覆盖 DOM、图片区域、掩码、损坏图片和无法对齐三态', (context) => {
  const projectRoot = createProject(context);
  const actualPath = path.join(projectRoot, 'actual.png');
  const expectedPath = path.join(projectRoot, 'expected.png');
  const diffPath = path.join(projectRoot, '.frontend-ui-review', 'diff.png');
  writeSolidPng(actualPath, 20, 20, [255, 0, 0]);
  writeSolidPng(expectedPath, 20, 20, [255, 0, 0]);
  assert.equal(inspectComparisonRuntime().ok, true);

  const domScenario = {
    comparison: {
      mode: 'dom',
      dom: [{ selector: 'main', property: 'text', expected: '完成', exact: true }],
      image: null,
    },
  };
  const domPassed = compareUiEvidence({
    scenario: domScenario,
    actualScreenshot: actualPath,
    expectedScreenshot: expectedPath,
    domObservations: [{ selector: 'main', property: 'text', actual: '完成' }],
    diffPath,
  });
  assert.equal(domPassed.outcome, 'passed');
  const domFailed = compareUiEvidence({
    scenario: domScenario,
    actualScreenshot: actualPath,
    expectedScreenshot: expectedPath,
    domObservations: [{ selector: 'main', property: 'text', actual: '未完成' }],
    diffPath,
  });
  assert.equal(domFailed.outcome, 'needs-fix');
  assert.equal(domFailed.findings[0].repairable, false);
  assert.equal(compareUiEvidence({
    scenario: domScenario,
    actualScreenshot: actualPath,
    expectedScreenshot: expectedPath,
    domObservations: [],
    diffPath,
  }).outcome, 'inconclusive');

  const imageScenario = {
    comparison: {
      mode: 'image',
      dom: [],
      image: {
        regions: [{
          name: 'main',
          actual: { x: 0, y: 0, width: 20, height: 20 },
          expected: { x: 0, y: 0, width: 20, height: 20 },
        }],
        masks: [],
        thresholds: { colorThreshold: 0.1, maxDiffPixels: 0, maxDiffRatio: 0 },
      },
    },
  };
  assert.equal(compareUiEvidence({ scenario: imageScenario, actualScreenshot: actualPath, expectedScreenshot: expectedPath, diffPath }).outcome, 'passed');
  writeSolidPng(actualPath, 20, 20, [0, 0, 255]);
  const imageFailed = compareUiEvidence({ scenario: imageScenario, actualScreenshot: actualPath, expectedScreenshot: expectedPath, diffPath });
  assert.equal(imageFailed.outcome, 'needs-fix');
  assert.equal(imageFailed.metrics.diffPixels, 400);
  assert.equal(fs.existsSync(diffPath), true);

  const maskedScenario = structuredClone(imageScenario);
  maskedScenario.comparison.image.masks = [{
    actual: { x: 0, y: 0, width: 20, height: 20 },
    expected: { x: 0, y: 0, width: 20, height: 20 },
  }];
  const fullyMasked = compareUiEvidence({ scenario: maskedScenario, actualScreenshot: actualPath, expectedScreenshot: expectedPath, diffPath });
  assert.equal(fullyMasked.outcome, 'inconclusive');
  assert.equal(fullyMasked.observations[0].status, 'inconclusive');
  assert.equal(fullyMasked.metrics.comparedPixels, 0);

  const misalignedScenario = structuredClone(imageScenario);
  misalignedScenario.comparison.image.regions[0].expected.width = 19;
  assert.equal(compareUiEvidence({ scenario: misalignedScenario, actualScreenshot: actualPath, expectedScreenshot: expectedPath, diffPath }).outcome, 'inconclusive');
  fs.writeFileSync(expectedPath, 'broken-png');
  assert.throws(
    () => compareUiEvidence({ scenario: imageScenario, actualScreenshot: actualPath, expectedScreenshot: expectedPath, diffPath }),
    /不是可解码的 PNG/u,
  );
});

test('视觉范围在证据不足时不通过，并确定判断固定与相对几何差异', (context) => {
  const projectRoot = createProject(context);
  const actualPath = path.join(projectRoot, 'actual.png');
  const expectedPath = path.join(projectRoot, 'expected.png');
  const diffPath = path.join(projectRoot, '.frontend-ui-review', 'geometry-diff.png');
  writeSolidPng(actualPath, 20, 20, [255, 255, 255]);
  writeSolidPng(expectedPath, 20, 20, [255, 255, 255]);

  const insufficient = compareUiEvidence({
    scenario: {
      comparison: {
        scope: 'visual',
        mode: 'dom',
        dom: [{ selector: '.dialog', property: 'visible', expected: true }],
        image: null,
      },
    },
    actualScreenshot: actualPath,
    expectedScreenshot: expectedPath,
    domObservations: [{ selector: '.dialog', property: 'visible', actual: true }],
    diffPath,
  });
  assert.equal(insufficient.outcome, 'inconclusive');
  assert.equal(insufficient.observations[0].id, 'VIS-001');

  const styleSubstring = compareUiEvidence({
    scenario: {
      comparison: {
        scope: 'visual',
        mode: 'dom',
        dom: [{ selector: '.row', property: 'style.height', expected: '57px', exact: false }],
        image: null,
        visualEvidenceDeclared: true,
      },
    },
    actualScreenshot: actualPath,
    expectedScreenshot: expectedPath,
    domObservations: [{ selector: '.row', property: 'style.height', actual: '157px' }],
    diffPath,
  });
  assert.equal(styleSubstring.outcome, 'needs-fix');

  const geometryScenario = {
    comparison: {
      scope: 'visual',
      mode: 'dom',
      dom: [
        { selector: '.row', property: 'rect.height', expected: 57, tolerance: 0.5, relativeTo: null },
        {
          selector: '.remove',
          property: 'rect.center-y',
          expected: undefined,
          tolerance: 1,
          relativeTo: { selector: '.field-input', property: 'rect.center-y' },
        },
      ],
      image: null,
      visualEvidenceDeclared: true,
    },
  };
  const passed = compareUiEvidence({
    scenario: geometryScenario,
    actualScreenshot: actualPath,
    expectedScreenshot: expectedPath,
    domObservations: [
      { selector: '.row', property: 'rect.height', actual: 57.2 },
      { selector: '.remove', property: 'rect.center-y', actual: 42, referenceActual: 42.8 },
    ],
    diffPath,
  });
  assert.equal(passed.outcome, 'passed');
  const failed = compareUiEvidence({
    scenario: geometryScenario,
    actualScreenshot: actualPath,
    expectedScreenshot: expectedPath,
    domObservations: [
      { selector: '.row', property: 'rect.height', actual: 79 },
      { selector: '.remove', property: 'rect.center-y', actual: 35, referenceActual: 42 },
    ],
    diffPath,
  });
  assert.equal(failed.outcome, 'needs-fix');
  assert.equal(failed.findings.length, 2);
  assert.equal(failed.findings[0].type, '几何断言差异');
  assert.match(failed.findings[1].targetValue, /\.field-input\.rect\.center-y/u);
  assert.equal(compareUiEvidence({
    scenario: geometryScenario,
    actualScreenshot: actualPath,
    expectedScreenshot: expectedPath,
    domObservations: [{ selector: '.row', property: 'rect.height', actual: 57 }],
    diffPath,
  }).outcome, 'inconclusive');
});

test('确定性报告区分结构通过与视觉通过措辞', () => {
  const structureReport = renderDeterministicAssessmentMarkdown({
    scenario: { id: 'structure', url: 'http://127.0.0.1/', comparison: { scope: 'structure', mode: 'dom' } },
    assessment: { outcome: 'passed', observations: [], findings: [] },
  });
  assert.match(structureReport, /验收范围：`structure`/u);
  assert.match(structureReport, /不代表视觉还原通过/u);

  const visualReport = renderDeterministicAssessmentMarkdown({
    scenario: { id: 'visual', url: 'http://127.0.0.1/', comparison: { scope: 'visual', mode: 'dom' } },
    assessment: { outcome: 'passed', observations: [], findings: [] },
  });
  assert.match(visualReport, /验收范围：`visual`/u);
  assert.match(visualReport, /样式、几何或图片证据均满足阈值/u);
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

test('内置 Playwright 固定版本、完整性、平台和 Chromium 启动均有效', async () => {
  const runtime = inspectBundledPlaywright();
  assert.equal(runtime.valid, true, runtime.reason);
  assert.equal(runtime.version, BUNDLED_PLAYWRIGHT_VERSION);
  assert.equal(runtime.source, 'bundled');
  assert.equal(runtime.browser, 'chromium-headless-shell');
  assert.equal(runtime.integrity.ok, true);
  assert.equal(verifyPlaywrightIntegrity().ok, true);

  const linux = inspectBundledPlaywright({
    platform: 'linux',
    arch: 'x64',
    useCache: false,
  });
  assert.equal(linux.available, true, linux.reason);
  assert.equal(linux.platformKey, 'linux-x64');

  const smoke = await smokeTestBundledPlaywright();
  assert.equal(smoke.ok, true);
  assert.equal(smoke.skipped, false);
  assert.equal(smoke.screenshotBytes > 100, true);
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

test('采集计划优先项目 Playwright，并显式提供 Browser 视觉兜底', (context) => {
  const projectRoot = createProject(context, {
    scenarios: [
      {
        ...configInput().scenarios[0],
        capture: 'project-playwright',
        captureFallback: 'browser',
        projectPlaywright: {
          command: [
            'npm',
            'run',
            'ui:review',
            '--',
            '--scenario',
            '{scenarioId}',
            '--actual',
            '{actualScreenshot}',
            '--result',
            '{reviewInput}',
          ],
          resultPath: '{reviewInput}',
        },
      },
    ],
  });
  const config = loadUiReviewConfig(projectRoot);
  const plan = createCapturePlan(config, 'home-desktop', { runId: 'portable-1' });

  assert.equal(plan.primary, 'project-playwright');
  assert.equal(plan.fallback, 'browser');
  assert.deepEqual(plan.order, ['project-playwright', 'browser']);
  assert.equal(plan.projectPlaywright.portable, true);
  assert.equal(plan.projectPlaywright.source, 'project-command');
  assert.equal(plan.projectPlaywright.runtime, null);
  assert.equal(plan.projectPlaywright.command.includes('home-desktop'), true);
  assert.equal(plan.projectPlaywright.command.includes(plan.artifacts.actualScreenshot), true);
  assert.equal(plan.projectPlaywright.resultPath, plan.artifacts.reviewInput);
  assert.deepEqual(plan.browser, { declared: true, role: 'fallback' });

  const fallbackRun = createReviewRun(config, 'home-desktop', {
    runId: 'portable-fallback',
    capture: 'browser',
  });
  assert.equal(fallbackRun.capture, 'browser');
  assert.throws(
    () => createReviewRun(config, 'home-desktop', { runId: 'portable-invalid', capture: 'other' }),
    /未在场景采集计划中声明/u,
  );
});

test('内置 Playwright 适配器生成零安装采集计划并注入真实浏览器 API', async (context) => {
  const projectRoot = createProject(context, {
    scenarios: [{
      ...configInput().scenarios[0],
      interactions: [],
      capture: 'project-playwright',
      captureFallback: 'browser',
      projectPlaywright: {
        adapter: '.frontend-ui-review/playwright-adapter.mjs',
        resultPath: '{reviewInput}',
      },
    }],
  });
  fs.writeFileSync(
    path.join(projectRoot, '.frontend-ui-review', 'playwright-adapter.mjs'),
    `export default async function ({ playwright, project, scenario, artifacts }) {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: scenario.viewport.width, height: scenario.viewport.height }, deviceScaleFactor: scenario.viewport.deviceScaleFactor });
    const page = await context.newPage();
    await page.setContent('<main>fixture</main>');
    const rect = await page.locator('main').boundingBox();
    await page.screenshot({ path: artifacts.actualScreenshot });
    return {
      analysisPending: false,
      project: { name: project.name, runtime: 'bundled', page: scenario.url, designBasis: scenario.design.path, scope: ['main'] },
      viewport: { width: scenario.viewport.width, height: scenario.viewport.height, dpr: scenario.viewport.deviceScaleFactor, scale: 1 },
      checkedNodes: [{ selector: 'main', componentPath: 'src/main.css', nodeText: 'fixture', nodeMeaning: '页面主要内容', rect }],
      findings: []
    };
  } finally {
    await browser.close();
  }
}
`,
  );
  const config = loadUiReviewConfig(projectRoot);
  const plan = createCapturePlan(config, 'home-desktop', { runId: 'bundled-adapter' });
  assert.equal(plan.projectPlaywright.source, 'bundled-adapter');
  const runtime = inspectBundledPlaywright();
  assert.equal(plan.projectPlaywright.portable, runtime.available, plan.projectPlaywright.unavailableReason);
  assert.equal(plan.projectPlaywright.runtime.version, BUNDLED_PLAYWRIGHT_VERSION);
  assert.equal(plan.projectPlaywright.runtime.integrityOk, true);
  if (!runtime.available) {
    assert.equal(plan.projectPlaywright.command, null);
    assert.match(plan.projectPlaywright.unavailableReason, /当前环境/u);
    return;
  }
  assert.equal(plan.projectPlaywright.command[0], process.execPath);
  assert.match(plan.projectPlaywright.command[1], /playwright-adapter-runner\.mjs$/u);
  assert.equal(plan.projectPlaywright.command.includes('npm'), false);

  writeRunState(projectRoot, createReviewRun(config, 'home-desktop', { runId: 'bundled-adapter' }));
  const result = await runPlaywrightAdapter({ target: projectRoot, scenarioId: 'home-desktop', runId: 'bundled-adapter' });
  assert.equal(result.ok, true);
  assert.equal(result.analysisPending, false);
  assert.equal(fs.existsSync(path.join(projectRoot, plan.artifacts.actualScreenshot)), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(projectRoot, plan.artifacts.reviewInput), 'utf8')).findings.length, 0);
  const targetManifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  assert.equal(targetManifest.dependencies, undefined);
  assert.equal(targetManifest.devDependencies, undefined);
});

test('版本 2 统一入口只执行摘要匹配的受信适配器', async (context) => {
  const projectRoot = createProject(context, {
    schemaVersion: 2,
    scenarios: [{
      ...configInput().scenarios[0],
      capture: 'project-playwright',
      captureFallback: 'browser',
      projectPlaywright: {
        adapter: '.frontend-ui-review/playwright-adapter.mjs',
        resultPath: '{reviewInput}',
      },
      interactions: [],
      comparison: {
        scope: 'structure',
        mode: 'dom',
        dom: [{ selector: 'main', property: 'text', expected: '完成', exact: true }],
      },
    }],
  });
  const adapterPath = path.join(projectRoot, '.frontend-ui-review', 'playwright-adapter.mjs');
  fs.copyFileSync(
    path.resolve('plugins/frontend-ai-workflow/assets/templates/ui-review/playwright-adapter.mjs'),
    adapterPath,
  );
  const trusted = loadUiReviewConfig(projectRoot);
  const trustedPlan = createCapturePlan(trusted, 'home-desktop', { runId: 'trusted-adapter' });
  assert.equal(trustedPlan.projectPlaywright.source, 'bundled-adapter');
  assert.equal(trustedPlan.projectPlaywright.portable, inspectBundledPlaywright().available);

  fs.writeFileSync(adapterPath, `throw new Error('自定义适配器不应执行');\nexport default async function () {}\n`);
  const changed = loadUiReviewConfig(projectRoot);
  const changedPlan = createCapturePlan(changed, 'home-desktop', { runId: 'changed-adapter' });
  assert.notEqual(changed.scenarios[0].fingerprint, trusted.scenarios[0].fingerprint);
  assert.equal(changedPlan.projectPlaywright.source, 'project-adapter');
  assert.equal(changedPlan.projectPlaywright.portable, false);
  const blockedPreview = await runUiReview({
    target: projectRoot,
    mode: 'review',
    scenarioId: 'home-desktop',
    runId: 'changed-adapter-preview',
  });
  assert.equal(blockedPreview.readyToWrite, false);
  assert.equal(blockedPreview.status, 'blocked');
  assert.equal(blockedPreview.exitCode, 3);
  assert.match(blockedPreview.error.message, /项目自有本地页面环境/u);
  assert.doesNotMatch(blockedPreview.error.message, /自定义适配器不应执行/u);
  assert.equal(fs.existsSync(path.join(projectRoot, '.frontend-ui-review', 'runs', 'changed-adapter-preview')), false);
  const blocked = await runUiReview({
    target: projectRoot,
    mode: 'review',
    scenarioId: 'home-desktop',
    runId: 'changed-adapter',
    write: true,
  });
  assert.equal(blocked.status, 'blocked');
  assert.match(blocked.error.message, /受信内置适配器/u);
  assert.doesNotMatch(blocked.error.message, /自定义适配器不应执行/u);
  assert.equal(fs.existsSync(path.join(projectRoot, '.frontend-ui-review', 'runs', 'changed-adapter')), false);
});

test('默认适配器在真实 Chromium 中完成弹窗、下拉、悬停和表单综合交互', async (context) => {
  const runtime = inspectBundledPlaywright();
  assert.equal(runtime.available, true, runtime.reason);
  const html = `<!doctype html>
<html><head><style>
body{font:16px sans-serif}.tooltip{display:none}.help:hover+.tooltip{display:block}
dialog[open]{display:block}dialog:not([open]){display:none}
</style></head><body><main>
<button class="help">帮助</button><span class="tooltip">填写后保存</span>
<button data-open-dialog>编辑资料</button><p data-status>尚未保存</p>
<dialog><h2>编辑资料</h2><input name="displayName"><select name="role"><option value="viewer">访客</option><option value="editor">编辑者</option></select><label><input name="notice" type="checkbox">通知我</label><p id="summary"></p><button data-save>保存</button></dialog>
</main><script>
const dialog=document.querySelector('dialog');const name=document.querySelector('[name=displayName]');const role=document.querySelector('[name=role]');
document.querySelector('[data-open-dialog]').onclick=()=>dialog.showModal();
const render=()=>document.querySelector('#summary').textContent=name.value+' / '+role.value;
name.oninput=render;role.onchange=render;dialog.onkeydown=(event)=>{if(event.key==='Escape'){event.preventDefault();dialog.close();}};
document.querySelector('[data-save]').onclick=()=>{document.querySelector('[data-status]').textContent='已保存 '+name.value;dialog.close();};
</script></body></html>`;
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const projectRoot = createProject(context, {
    schemaVersion: 2,
    scenarios: [{
      ...configInput().scenarios[0],
      url: `http://127.0.0.1:${port}/`,
      capture: 'project-playwright',
      captureFallback: 'browser',
      projectPlaywright: {
        adapter: '.frontend-ui-review/playwright-adapter.mjs',
        resultPath: '{reviewInput}',
      },
      interactions: [
        { action: 'hover', selector: '.help' },
        { action: 'assert', assertion: 'visible', selector: '.tooltip' },
        { action: 'click', selector: '[data-open-dialog]' },
        { action: 'wait-for', selector: 'dialog', state: 'visible' },
        { action: 'fill', selector: '[name="displayName"]', value: '测试用户' },
        { action: 'select-option', selector: '[name="role"]', value: 'editor' },
        { action: 'check', selector: '[name="notice"]' },
        { action: 'uncheck', selector: '[name="notice"]' },
        { action: 'check', selector: '[name="notice"]' },
        { action: 'assert', assertion: 'text', selector: '#summary', value: '测试用户 / editor', exact: true },
        { action: 'capture', name: 'dialog-filled' },
        { action: 'press', selector: 'dialog', key: 'Escape' },
        { action: 'assert', assertion: 'hidden', selector: 'dialog' },
        { action: 'click', selector: '[data-open-dialog]' },
        { action: 'click', selector: '[data-save]' },
        { action: 'assert', assertion: 'text', selector: '[data-status]', value: '已保存 测试用户', exact: true },
      ],
      comparison: {
        mode: 'dom',
        dom: [{ selector: '[data-status]', property: 'text', expected: '已保存 测试用户', exact: true }],
      },
    }],
  });
  fs.copyFileSync(
    path.resolve('plugins/frontend-ai-workflow/assets/templates/ui-review/playwright-adapter.mjs'),
    path.join(projectRoot, '.frontend-ui-review', 'playwright-adapter.mjs'),
  );
  const config = loadUiReviewConfig(projectRoot);
  writeRunState(projectRoot, createReviewRun(config, 'home-desktop', { runId: 'complex-ui' }));
  const result = await runPlaywrightAdapter({ target: projectRoot, scenarioId: 'home-desktop', runId: 'complex-ui' });
  const reviewInput = JSON.parse(fs.readFileSync(path.join(projectRoot, result.artifacts.result), 'utf8'));
  assert.equal(reviewInput.interactions.completed, true);
  assert.equal(reviewInput.interactions.steps.length, 16);
  assert.equal(reviewInput.checkedNodes[0].nodeText.includes('已保存 测试用户'), true);
  assert.equal(fs.existsSync(path.join(projectRoot, result.artifacts.interactionScreenshots, '11-dialog-filled.png')), true);

  const playwright = await loadBundledPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<button>确定</button>');
    const failedRoot = path.join(projectRoot, '.frontend-ui-review', 'failed-interactions');
    await assert.rejects(
      () => executeStructuredInteractions({
        page,
        captureRoot: failedRoot,
        interactions: [
          { action: 'capture', name: 'before-failure', timeout: 5000 },
          { action: 'assert', assertion: 'text', selector: 'button', value: '不存在', exact: true, timeout: 5000 },
        ],
      }),
      /断言失败/u,
    );
    assert.equal(fs.existsSync(failedRoot), false);
  } finally {
    await browser.close();
  }
});

test('结构化交互等待弹窗过渡结束后再保存截图', async (context) => {
  const runtime = inspectBundledPlaywright();
  assert.equal(runtime.available, true, runtime.reason);
  const projectRoot = createProject(context);
  const playwright = await loadBundledPlaywright();
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: runtime.browserExecutable,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 200, height: 160 } });
    await page.setContent(`<!doctype html><style>
      body{margin:0;background:#fff}.panel{position:fixed;inset:0;width:100px;height:100px;background:#f00;opacity:0;transition:opacity 220ms linear}.panel.open{opacity:1}
    </style><button data-open style="position:fixed;left:120px">打开</button><div class="panel"></div><script>
      document.querySelector('[data-open]').onclick=()=>document.querySelector('.panel').classList.add('open');
    </script>`);
    const captureRoot = path.join(projectRoot, '.frontend-ui-review', 'stable-transition');
    const result = await executeStructuredInteractions({
      page,
      captureRoot,
      interactions: [
        { action: 'click', selector: '[data-open]', timeout: 5000 },
        { action: 'capture', name: 'stable-dialog', timeout: 5000 },
      ],
    });
    assert.equal(result.steps.every((step) => step.stabilized === true), true);
    const screenshot = PNG.sync.read(fs.readFileSync(path.join(captureRoot, '02-stable-dialog.png')));
    const offset = (20 * screenshot.width + 20) * 4;
    assert.equal(screenshot.data[offset] > 245, true);
    assert.equal(screenshot.data[offset + 1] < 10, true);
    assert.equal(screenshot.data[offset + 2] < 10, true);

    await page.setContent('<button class="remove" onclick="this.remove()">移除</button>');
    const removed = await executeStructuredInteractions({
      page,
      captureRoot: path.join(projectRoot, '.frontend-ui-review', 'removed-node'),
      interactions: [
        { action: 'click', selector: '.remove', timeout: 5000 },
        { action: 'wait-for', selector: '.remove', state: 'hidden', timeout: 5000 },
      ],
    });
    assert.equal(removed.steps[1].actual, 'absent');

    await page.setContent(`<main></main><script>
      setTimeout(() => {
        const node = document.createElement('button');
        node.className = 'late-node';
        node.textContent = '稍后出现';
        document.querySelector('main').append(node);
      }, 80);
    </script>`);
    const appeared = await executeStructuredInteractions({
      page,
      captureRoot: path.join(projectRoot, '.frontend-ui-review', 'async-node'),
      interactions: [
        { action: 'wait-for', selector: '.late-node', state: 'visible', timeout: 5000 },
      ],
    });
    assert.equal(appeared.steps[0].actual, 'visible');
  } finally {
    await browser.close();
  }
});

test('统一入口完成预览、验收、同上下文复验并映射稳定退出码', async (context) => {
  let fixed = false;
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><main>${fixed ? '已修复' : '待修复'}</main>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const scenario = {
    ...configInput().scenarios[0],
    url: `http://127.0.0.1:${port}/`,
    capture: 'project-playwright',
    captureFallback: 'browser',
    projectPlaywright: {
      adapter: '.frontend-ui-review/playwright-adapter.mjs',
      resultPath: '{reviewInput}',
    },
    interactions: [],
    comparison: {
      mode: 'dom',
      dom: [{ selector: 'main', property: 'text', expected: '已修复', exact: true }],
    },
  };
  const projectRoot = createProject(context, { schemaVersion: 2, scenarios: [scenario] });
  fs.copyFileSync(
    path.resolve('plugins/frontend-ai-workflow/assets/templates/ui-review/playwright-adapter.mjs'),
    path.join(projectRoot, '.frontend-ui-review', 'playwright-adapter.mjs'),
  );

  const preview = await runUiReview({ target: projectRoot, mode: 'review', scenarioId: 'home-desktop', runId: 'runner-review' });
  assert.equal(preview.write, false);
  assert.equal(preview.readyToWrite, true);
  assert.equal(preview.exitCode, 0);
  assert.equal(preview.safety.startsProjectCommand, false);
  assert.equal(fs.existsSync(path.join(projectRoot, '.frontend-ui-review', 'runs', 'runner-review')), false);

  const review = await runUiReview({ target: projectRoot, mode: 'review', scenarioId: 'home-desktop', runId: 'runner-review', write: true });
  assert.equal(review.status, 'needs-fix');
  assert.equal(review.exitCode, 1);
  assert.equal(review.repairCandidates.length, 0);
  assert.equal(fs.existsSync(path.join(projectRoot, review.artifacts.report)), true);
  assert.equal(fs.existsSync(path.join(projectRoot, review.artifacts.annotatedScreenshot)), true);

  fs.writeFileSync(path.join(projectRoot, 'design', 'home.png'), 'design-v2');
  const mismatchedPreview = await runUiReview({
    target: projectRoot,
    mode: 'verify',
    scenarioId: 'home-desktop',
    runId: 'runner-mismatched-preview',
    baselinePath: review.artifacts.state,
  });
  assert.equal(mismatchedPreview.status, 'blocked');
  assert.equal(mismatchedPreview.exitCode, 3);
  assert.match(mismatchedPreview.error.message, /重新开始独立验收/u);
  assert.equal(fs.existsSync(path.join(projectRoot, '.frontend-ui-review', 'runs', 'runner-mismatched-preview')), false);
  fs.writeFileSync(path.join(projectRoot, 'design', 'home.png'), 'design-v1');

  fixed = true;
  const verifyPreview = await runUiReview({
    target: projectRoot,
    mode: 'verify',
    scenarioId: 'home-desktop',
    runId: 'runner-verify',
    baselinePath: review.artifacts.state,
  });
  assert.equal(verifyPreview.baseline.runId, 'runner-review');
  const verify = await runUiReview({
    target: projectRoot,
    mode: 'verify',
    scenarioId: 'home-desktop',
    runId: 'runner-verify',
    baselinePath: review.artifacts.state,
    write: true,
  });
  assert.equal(verify.status, 'passed');
  assert.equal(verify.exitCode, 0);
  assert.equal(verify.verification.resolved.length, 1);
});

test('统一入口对不确定、非内置适配器和产物冲突失败关闭', async (context) => {
  const projectRoot = createProject(context, {
    schemaVersion: 2,
    scenarios: [{
      ...configInput().scenarios[0],
      capture: 'project-playwright',
      captureFallback: 'browser',
      projectPlaywright: {
        command: ['node', 'never-run.mjs'],
        resultPath: '{reviewInput}',
      },
      interactions: [],
      comparison: {
        mode: 'dom',
        dom: [{ selector: 'main', property: 'text', expected: '完成', exact: true }],
      },
    }],
  });
  const blocked = await runUiReview({ target: projectRoot, mode: 'review', scenarioId: 'home-desktop', runId: 'blocked-command', write: true });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.exitCode, 3);
  assert.match(blocked.error.message, /不会启动项目自定义命令/u);
  assert.equal(fs.existsSync(path.join(projectRoot, 'never-run.mjs')), false);
  assert.equal(fs.existsSync(path.join(projectRoot, '.frontend-ui-review', 'runs', 'blocked-command')), false);

  const blockedPreview = await runUiReview({ target: projectRoot, mode: 'review', scenarioId: 'home-desktop', runId: 'blocked-command-preview' });
  assert.equal(blockedPreview.readyToWrite, false);
  assert.equal(blockedPreview.status, 'blocked');
  assert.equal(blockedPreview.exitCode, 3);
  assert.equal(fs.existsSync(path.join(projectRoot, '.frontend-ui-review', 'runs', 'blocked-command-preview')), false);

  const invalid = await runUiReview({ target: projectRoot, mode: 'unknown', scenarioId: 'home-desktop', runId: 'bad-mode', write: true });
  assert.equal(invalid.exitCode, 3);

  const uncertainServer = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><main>证据不完整</main>');
  });
  await new Promise((resolve) => uncertainServer.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => uncertainServer.close(resolve)));
  const { port: uncertainPort } = uncertainServer.address();
  const uncertainProject = createProject(context, {
    schemaVersion: 2,
    scenarios: [{
      ...configInput().scenarios[0],
      url: `http://127.0.0.1:${uncertainPort}/`,
      capture: 'project-playwright',
      captureFallback: 'browser',
      projectPlaywright: {
        adapter: '.frontend-ui-review/playwright-adapter.mjs',
        resultPath: '{reviewInput}',
      },
      interactions: [],
      comparison: {
        mode: 'dom',
        dom: [{ selector: '[data-missing]', property: 'text', expected: '完成', exact: true }],
      },
    }],
  });
  fs.copyFileSync(
    path.resolve('plugins/frontend-ai-workflow/assets/templates/ui-review/playwright-adapter.mjs'),
    path.join(uncertainProject, '.frontend-ui-review', 'playwright-adapter.mjs'),
  );
  const uncertain = await runUiReview({ target: uncertainProject, mode: 'review', scenarioId: 'home-desktop', runId: 'runner-inconclusive', write: true });
  assert.equal(uncertain.status, 'inconclusive');
  assert.equal(uncertain.exitCode, 2);
  assert.equal(uncertain.fallbackRequired, true);
  const conflict = await runUiReview({ target: uncertainProject, mode: 'review', scenarioId: 'home-desktop', runId: 'runner-inconclusive', write: true });
  assert.equal(conflict.status, 'blocked');
  assert.equal(conflict.exitCode, 3);
  assert.match(conflict.error.message, /拒绝覆盖/u);
});

test('老配置保持单采集器行为，未声明命令的 Playwright 计划标记为不可移植', (context) => {
  const browserProject = createProject(context);
  const browserConfig = loadUiReviewConfig(browserProject);
  const browserPlan = createCapturePlan(browserConfig, 'home-desktop', { runId: 'legacy-browser' });
  assert.deepEqual(browserPlan.order, ['browser']);
  assert.equal(browserPlan.fallback, null);
  assert.equal(createReviewRun(browserConfig, 'home-desktop', { runId: 'legacy-run' }).capture, 'browser');

  const playwrightProject = createProject(context, {
    scenarios: [{ ...configInput().scenarios[0], capture: 'project-playwright' }],
  });
  const playwrightConfig = loadUiReviewConfig(playwrightProject);
  const playwrightPlan = createCapturePlan(playwrightConfig, 'home-desktop', { runId: 'legacy-playwright' });
  assert.deepEqual(playwrightPlan.order, ['project-playwright']);
  assert.equal(playwrightPlan.projectPlaywright.portable, false);
  assert.equal(playwrightPlan.browser.declared, false);
});

test('采集计划拒绝重复兜底、非法命令、越界结果和未知占位符', (context) => {
  const projectRoot = createProject(context);
  const baseScenario = configInput().scenarios[0];
  assert.throws(
    () => normalizeUiReviewConfig(configInput({
      scenarios: [{ ...baseScenario, captureFallback: 'browser' }],
    }), projectRoot),
    /不能与主采集器相同/u,
  );
  assert.throws(
    () => normalizeUiReviewConfig(configInput({
      scenarios: [{
        ...baseScenario,
        capture: 'project-playwright',
        projectPlaywright: { command: [], resultPath: 'result.json' },
      }],
    }), projectRoot),
    /至少要包含一个命令参数/u,
  );
  assert.throws(
    () => normalizeUiReviewConfig(configInput({
      scenarios: [{
        ...baseScenario,
        capture: 'project-playwright',
        projectPlaywright: { command: ['npm', 'test'], resultPath: '../result.json' },
      }],
    }), projectRoot),
    /不能包含空路径段、\. 或 \.\./u,
  );
  assert.throws(
    () => normalizeUiReviewConfig(configInput({
      scenarios: [{
        ...baseScenario,
        capture: 'project-playwright',
        projectPlaywright: { command: ['npm', '{unknown}'], resultPath: 'result.json' },
      }],
    }), projectRoot),
    /不支持的占位符/u,
  );
  fs.writeFileSync(path.join(projectRoot, '.frontend-ui-review', 'adapter.mjs'), 'export default async function () {}\n');
  assert.throws(
    () => normalizeUiReviewConfig(configInput({
      scenarios: [{
        ...baseScenario,
        capture: 'project-playwright',
        projectPlaywright: {
          adapter: '.frontend-ui-review/adapter.mjs',
          command: ['npm', 'test'],
          resultPath: 'result.json',
        },
      }],
    }), projectRoot),
    /不能同时声明/u,
  );
  assert.throws(
    () => normalizeUiReviewConfig(configInput({
      scenarios: [{
        ...baseScenario,
        capture: 'project-playwright',
        projectPlaywright: {
          adapter: '.frontend-ui-review/missing.mjs',
          resultPath: 'result.json',
        },
      }],
    }), projectRoot),
    /不存在/u,
  );
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

test('capture-plan CLI 输出跨工具可消费计划，start-review 显式记录兜底采集器', (context) => {
  const projectRoot = createProject(context, {
    scenarios: [{
      ...configInput().scenarios[0],
      capture: 'project-playwright',
      captureFallback: 'browser',
      projectPlaywright: {
        command: ['npm', 'run', 'ui:review', '--', '--output', '{runDirectory}'],
        resultPath: '{reviewInput}',
      },
    }],
  });
  const planResult = spawnSync(
    process.execPath,
    [workflowScript, 'capture-plan', '--target', projectRoot, '--scenario', 'home-desktop', '--run-id', 'cli-plan'],
    { encoding: 'utf8' },
  );
  assert.equal(planResult.status, 0, planResult.stderr);
  const planOutput = JSON.parse(planResult.stdout);
  assert.equal(planOutput.write, false);
  assert.equal(planOutput.plan.projectPlaywright.portable, true);
  assert.equal(planOutput.plan.projectPlaywright.command.at(-1), planOutput.plan.artifacts.runDirectory);

  const fallbackResult = spawnSync(
    process.execPath,
    [
      workflowScript,
      'start-review',
      '--target',
      projectRoot,
      '--scenario',
      'home-desktop',
      '--run-id',
      'cli-fallback',
      '--capture',
      'browser',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(fallbackResult.status, 0, fallbackResult.stderr);
  assert.equal(JSON.parse(fallbackResult.stdout).state.capture, 'browser');
});

test('三个 Skill 的职责、显式修复门禁和共享合同随插件发布', () => {
  const pluginRoot = path.resolve('plugins/frontend-ai-workflow');
  const reviewSkill = fs.readFileSync(path.join(pluginRoot, 'skills/frontend-ui-review/SKILL.md'), 'utf8');
  const fixSkill = fs.readFileSync(path.join(pluginRoot, 'skills/frontend-ui-fix/SKILL.md'), 'utf8');
  const verifySkill = fs.readFileSync(path.join(pluginRoot, 'skills/frontend-ui-verify/SKILL.md'), 'utf8');
  const fixMetadata = fs.readFileSync(path.join(pluginRoot, 'skills/frontend-ui-fix/agents/openai.yaml'), 'utf8');
  const sharedReference = fs.readFileSync(path.join(pluginRoot, 'references/ui-review-workflow.md'), 'utf8');

  assert.match(reviewSkill, /不修改业务源码/u);
  assert.match(reviewSkill, /ui-review-runner\.mjs review/u);
  assert.match(reviewSkill, /结构化/u);
  assert.match(reviewSkill, /新的运行 ID.*--capture browser/u);
  assert.match(fixSkill, /repair-gate/u);
  assert.match(fixSkill, /main.*master/u);
  assert.match(fixSkill, /Playwright.*Browser.*不得扩大/u);
  assert.match(fixMetadata, /allow_implicit_invocation: false/u);
  assert.match(verifySkill, /相同.*页面.*视口/u);
  assert.match(verifySkill, /不得切换/u);
  assert.match(sharedReference, /业务项目不安装 Playwright/u);
  assert.match(sharedReference, /Playwright 1\.62\.1/u);
  assert.match(sharedReference, /darwin-arm64/u);
  assert.match(sharedReference, /linux-x64/u);
  assert.match(reviewSkill, /bundled-adapter/u);
  assert.match(reviewSkill, /readyToWrite: true/u);
  assert.match(reviewSkill, /project-adapter/u);
  assert.match(reviewSkill, /项目自有本地页面环境/u);
  assert.match(reviewSkill, /受控故障/u);
  assert.match(reviewSkill, /inconclusive/u);
  assert.match(verifySkill, /适配器摘要/u);
  assert.match(verifySkill, /受控故障/u);
  assert.match(fixSkill, /验收环境事实/u);
  assert.match(fixSkill, /不得.*业务源码.*验收环境/u);
  assert.match(sharedReference, /0=passed.*3=blocked/u);
  assert.match(sharedReference, /readyToWrite: false/u);
  assert.match(sharedReference, /版本 2 自定义适配器不能自动降级/u);
  assert.match(sharedReference, /受控故障/u);
  assert.match(sharedReference, /不隐含提交、推送、PR/u);
  assert.match(sharedReference, /captureFallback/u);
  assert.match(sharedReference, /跨 AI 工具/u);
});
