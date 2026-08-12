import test from 'node:test';
import {
  assert,
  fs,
  http,
  path,
  compareUiEvidence,
  inspectComparisonRuntime,
  renderDeterministicAssessmentMarkdown,
  PNG,
  writeSolidPng,
  createProject,
} from './fixtures.mjs';

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
