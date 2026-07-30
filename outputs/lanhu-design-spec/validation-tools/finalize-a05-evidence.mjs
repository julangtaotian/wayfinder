// AI-code-start lines:278 tool:Codex
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const specRoot = path.resolve(toolRoot, '..');
const evidenceRoot = path.join(specRoot, 'validation-evidence', 'a05-visual-matrix');
const manifestPath = path.join(evidenceRoot, 'manifest.json');
const matrixPath = path.join(specRoot, 'validation-evidence', 'a05-visual-matrix.md');
const ocrPath = path.join(evidenceRoot, 'reference-ocr.json');
const manualReviewPath = path.join(evidenceRoot, 'manual-review.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const ocrBoards = JSON.parse(fs.readFileSync(ocrPath, 'utf8'));
const manualReview = fs.existsSync(manualReviewPath)
  ? JSON.parse(fs.readFileSync(manualReviewPath, 'utf8'))
  : { approvals: {} };
const sourceCache = new Map();

manifest.capture = {
  ...manifest.capture,
  browser: 'Google Chrome',
  viewport: { width: 1920, height: 958 },
  pageZoom: 1,
  deviceScaleFactor: 2,
  referenceScale: '@1x',
  geometryTolerancePx: 2,
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function exists(relativePath) {
  return Boolean(relativePath) && fs.existsSync(path.join(evidenceRoot, relativePath));
}

function scenarioEvidenceFingerprint(scenario) {
  // 人工结论绑定当前参考图、双库实图和必要状态图，证据变化后自动失效。
  const paths = [
    scenario.reference.file,
    scenario.implementations.elementPlus.screenshot,
    scenario.implementations.elementUi.screenshot,
    ...scenario.implementations.elementPlus.stateEvidence
      .filter((item) => scenario.expected.requiredStates.includes(item.state))
      .map((item) => item.screenshot),
    ...scenario.implementations.elementUi.stateEvidence
      .filter((item) => scenario.expected.requiredStates.includes(item.state))
      .map((item) => item.screenshot),
  ].filter(Boolean).sort();
  const hash = crypto.createHash('sha256');
  for (const relativePath of paths) {
    hash.update(relativePath);
    if (exists(relativePath)) hash.update(fs.readFileSync(path.join(evidenceRoot, relativePath)));
  }
  return hash.digest('hex');
}

function sourceContent(source) {
  if (!sourceCache.has(source)) {
    sourceCache.set(source, fs.readFileSync(path.join(specRoot, source), 'utf8'));
  }
  return sourceCache.get(source);
}

function explicitValues(content, pattern) {
  return unique([...content.matchAll(pattern)].map((match) => match[0]));
}

function normalize(value) {
  return value.replaceAll('`', '').replace(/[\s，。；、：:（）()【】[\]「」“”"'·–—+\-]|年/gu, '').toLowerCase();
}

function expectedTextTokens(scenario) {
  const description = scenario.expected.texts[1] || '';
  // 只把反引号包裹的设计显式值纳入自动文案门禁，描述性自然语言交给视觉复核。
  return unique([...description.matchAll(/`([^`]+)`/gu)]
    .map((match) => match[1].trim())
    .filter((token) => !/^(?:\d+(?:\.\d+)?(?:px|%)|\d+(?:\.\d+)?px\s*[×x]\s*\d+(?:\.\d+)?px)$/u.test(token)
      && !/^#[0-9A-Fa-f]{6}$/u.test(token)
      && !/^\d+(?:\.\d+)?$/u.test(token)
      && !/^(?:rowspan|colspan)$/iu.test(token)));
}

function referenceTexts(scenario) {
  const boardName = path.basename(scenario.reference.sourceFile).replace(/\.webp$/u, '.png');
  const board = ocrBoards.find((item) => item.file === boardName);
  if (!board) return [];
  const { x, y, width, height } = scenario.reference.crop;
  return unique(
    board.boxes
      .filter((box) => {
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        return centerX >= x && centerX <= x + width && centerY >= y && centerY <= y + height;
      })
      .map((box) => box.text),
  );
}

function missingTexts(scenario, implementation) {
  const actual = normalize((implementation.measurements?.texts || []).join(' '));
  return expectedTextTokens(scenario).filter((token) => !actual.includes(normalize(token)));
}

function evaluateImplementation(scenario, implementation, label, manualApproval, evidenceFingerprint) {
  const requiredStates = scenario.expected.requiredStates;
  const stateNames = new Set(implementation.stateEvidence.map((item) => item.state));
  const missingStates = requiredStates.filter((state) => !stateNames.has(state));
  const missingStateFiles = implementation.stateEvidence
    .filter((item) => requiredStates.includes(item.state) && !exists(item.screenshot))
    .map((item) => item.state);
  const missing = missingTexts(scenario, implementation);
  const region = implementation.measurements?.geometry?.region;
  const screenshotPresent = exists(implementation.screenshot);
  const referenceConfirmed = scenario.reference.crop.status === 'confirmed' && exists(scenario.reference.file);
  const reasons = [];
  if (!screenshotPresent) reasons.push('缺少组件实际截图');
  if (!region) reasons.push('缺少组件区域测量数据');
  if (!referenceConfirmed) reasons.push('蓝湖参考裁图未确认或文件缺失');
  if (missing.length) reasons.push(`缺少或未等价还原蓝湖可见内容：${missing.slice(0, 4).join('、')}`);
  if (missingStates.length) reasons.push(`缺少必要状态证据：${missingStates.join('、')}`);
  if (missingStateFiles.length) reasons.push(`必要状态截图文件缺失：${missingStateFiles.join('、')}`);
  const automaticResult = reasons.length ? 'fail' : 'pass';
  implementation.evidenceChecks = {
    label,
    screenshotPresent,
    measurementsPresent: Boolean(region),
    referenceConfirmed,
    requiredStates,
    capturedStates: [...stateNames],
    missingStates,
    missingStateFiles,
    expectedTextTokens: expectedTextTokens(scenario),
    missingTextTokens: missing,
    automaticResult,
    manualApproval,
    evidenceFingerprint,
  };
  implementation.stateEvidence = implementation.stateEvidence.map((item) => ({
    ...item,
    result: exists(item.screenshot) && item.measurements ? 'pass' : 'fail',
    reasons: exists(item.screenshot) && item.measurements
      ? ['交互动作、状态测量与截图文件均已记录']
      : ['状态测量或截图文件缺失'],
  }));
  implementation.result = automaticResult === 'fail' ? 'fail' : manualApproval ? 'pass' : 'pending-review';
  implementation.reasons = reasons.length ? reasons : manualApproval
    ? ['自动门禁和人工三方视觉复核均已通过']
    : ['自动证据门禁通过，等待蓝湖、Element Plus、Element UI 三方视觉复核'];
}

for (const scenario of manifest.scenarios) {
  const source = sourceContent(scenario.source);
  const sourceGeometry = explicitValues(source, /\d+(?:\.\d+)?px(?:\s*[×x]\s*\d+(?:\.\d+)?px)?/gu);
  const sourceColors = explicitValues(source, /#[0-9A-Fa-f]{6}/gu).map((value) => value.toUpperCase());
  scenario.expected.geometry = unique([...scenario.expected.geometry, ...sourceGeometry]);
  scenario.expected.colors = unique([...scenario.expected.colors.map((value) => value.toUpperCase()), ...sourceColors]);
  scenario.expected.provenance = {
    sceneRow: scenario.source,
    componentCommonGeometry: sourceGeometry,
    componentCommonColors: sourceColors,
    scopeNote: '场景行值优先；未在场景行重复书写的尺寸和颜色继承同一组件规范的公共显式值。',
  };
  scenario.reference.texts = referenceTexts(scenario);
  const evidenceFingerprint = scenarioEvidenceFingerprint(scenario);
  const manualApproval = manualReview.approvals?.[scenario.id] === evidenceFingerprint;
  evaluateImplementation(scenario, scenario.implementations.elementPlus, 'Element Plus', manualApproval, evidenceFingerprint);
  evaluateImplementation(scenario, scenario.implementations.elementUi, 'Element UI', manualApproval, evidenceFingerprint);
  const implementationResults = [
    scenario.implementations.elementPlus.result,
    scenario.implementations.elementUi.result,
  ];
  scenario.result = implementationResults.includes('fail')
    ? 'fail'
    : implementationResults.every((result) => result === 'pass') ? 'pass' : 'pending-review';
  scenario.reasons = unique([
    ...scenario.implementations.elementPlus.reasons.map((reason) => `Element Plus：${reason}`),
    ...scenario.implementations.elementUi.reasons.map((reason) => `Element UI：${reason}`),
  ]);
  scenario.review = {
    status: scenario.result === 'pass' ? 'approved' : scenario.result,
    evidenceFingerprint,
    basis: scenario.result === 'fail'
      ? '至少一套实现存在可定位的自动门禁缺口。'
      : scenario.result === 'pass'
        ? '两套实现的自动门禁与三方视觉复核均已通过。'
        : '两套实现的自动证据门禁已通过，仍需三方视觉复核确认尺寸、颜色、图标和细节。',
  };
}

const stateScreenshots = manifest.scenarios.reduce(
  (total, scenario) =>
    total +
    scenario.implementations.elementPlus.stateEvidence.length +
    scenario.implementations.elementUi.stateEvidence.length,
  0,
);
const requiredStateTargets = manifest.scenarios.reduce(
  (total, scenario) => total + scenario.expected.requiredStates.length * 2,
  0,
);
const requiredStateScreenshots = manifest.scenarios.reduce(
  (total, scenario) => total + ['elementPlus', 'elementUi'].reduce(
    (libraryTotal, key) => libraryTotal + scenario.implementations[key].stateEvidence
      .filter((item) => scenario.expected.requiredStates.includes(item.state) && exists(item.screenshot))
      .length,
    0,
  ),
  0,
);
manifest.summary = {
  total: manifest.scenarios.length,
  passed: manifest.scenarios.filter((item) => item.result === 'pass').length,
  pendingReview: manifest.scenarios.filter((item) => item.result === 'pending-review').length,
  failed: manifest.scenarios.filter((item) => item.result === 'fail').length,
  automaticPassed: manifest.scenarios.filter((item) =>
    item.implementations.elementPlus.evidenceChecks.automaticResult === 'pass'
    && item.implementations.elementUi.evidenceChecks.automaticResult === 'pass').length,
  referenceConfirmed: manifest.scenarios.filter((item) => item.reference.crop.status === 'confirmed').length,
  actualScreenshots: manifest.scenarios.reduce(
    (total, item) =>
      total +
      Number(exists(item.implementations.elementPlus.screenshot)) +
      Number(exists(item.implementations.elementUi.screenshot)),
    0,
  ),
  stateScreenshots,
  requiredStateScreenshots,
  requiredStateTargets,
  comparisonGroups: manifest.scenarios.filter((item) => exists(item.comparison?.file)).length,
};
manifest.manualReview = {
  file: 'manual-review.json',
  reviewedAt: manualReview.reviewedAt || null,
  reviewer: manualReview.reviewer || null,
  approvedScenarios: manifest.scenarios.filter((item) => item.result === 'pass').length,
  rule: '人工通过只对当前三方证据指纹有效；任一参考图、实现图或必要状态图变化后自动退回待复核。',
};
manifest.verdict = {
  a05: manifest.summary.failed ? 'fail' : manifest.summary.pendingReview ? 'pending-review' : 'pass',
  reason: manifest.summary.failed
    ? `${manifest.summary.failed} 条场景仍有可定位的自动门禁缺口；其余场景区分为已通过和待视觉复核。`
    : manifest.summary.pendingReview
      ? '自动证据门禁已全部通过，仍需完成蓝湖、Element Plus、Element UI 三方视觉复核。'
      : `${manifest.summary.total} 条场景的自动门禁与三方视觉复核均已通过。`,
  nextGate: manifest.summary.failed
    ? '先修复自动门禁失败项，再对 pending-review 场景逐条完成人工三方视觉确认。'
    : '对 pending-review 场景逐条完成人工三方视觉确认；两套实现都确认后才允许完成 A-05。',
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const rows = manifest.scenarios.map((scenario) => {
  const plus = scenario.implementations.elementPlus;
  const ui = scenario.implementations.elementUi;
  const states = `${plus.stateEvidence.length} / ${ui.stateEvidence.length}`;
  const labels = { pass: '通过', fail: '未通过', 'pending-review': '待视觉复核' };
  const reason = scenario.reasons[0]?.replaceAll('|', '\\|') || '已通过';
  return `| \`${scenario.id}\` | ${scenario.title.replaceAll('|', '\\|')} | [参考](a05-visual-matrix/${scenario.reference.file}) | [${labels[plus.result]}](a05-visual-matrix/${plus.screenshot}) | [${labels[ui.result]}](a05-visual-matrix/${ui.screenshot}) | ${states} | [对照](a05-visual-matrix/${scenario.comparison.file}) | ${labels[scenario.result]} | ${reason} |`;
});
const matrix = [
  '# A-05 双组件库逐场景视觉验收矩阵',
  '',
  '固定环境：Google Chrome、`1920 × 958` CSS 视口、100% 页面缩放、设备像素比 2、蓝湖 Web `@1x`；几何门禁使用 CSS 逻辑像素。',
  '',
  '判定规则：证据齐全不等于视觉通过。同一场景只有蓝湖参考、Element Plus、Element UI 三方证据完整，且两套实现都满足 `±2px`、显式 HEX、文案、图标、初始状态与必要操作后状态时才通过。',
  '',
  `证据统计：参考裁图 ${manifest.summary.referenceConfirmed}/${manifest.summary.total}；实际裁图 ${manifest.summary.actualScreenshots}/${manifest.summary.total * 2}；必要状态裁图 ${manifest.summary.requiredStateScreenshots}/${manifest.summary.requiredStateTargets}（全部状态裁图 ${manifest.summary.stateScreenshots}）；三方对照 ${manifest.summary.comparisonGroups}/${manifest.summary.total}。`,
  '',
  '| 场景 | 标题 | 蓝湖参考 | Element Plus | Element UI | 状态证据（Plus / UI） | 三方对照 | 结论 | 首要缺口 |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows,
  '',
  `当前统计：${manifest.summary.passed} 条通过，${manifest.summary.pendingReview} 条待视觉复核，${manifest.summary.failed} 条自动门禁未通过；双库自动证据门禁同时通过 ${manifest.summary.automaticPassed} / ${manifest.summary.total}。A-05 当前状态：${manifest.verdict.a05}。`,
  '',
].join('\n');
fs.writeFileSync(matrixPath, matrix);
console.log(`A-05 汇总：通过 ${manifest.summary.passed}，待视觉复核 ${manifest.summary.pendingReview}，自动门禁失败 ${manifest.summary.failed}。`);
