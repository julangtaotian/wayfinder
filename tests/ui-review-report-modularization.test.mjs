import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  createDeterministicReportContext,
  generateUiReview,
  normalizeReviewInput,
  parsePngDimensions,
  renderDeterministicAssessmentMarkdown,
  renderReviewMarkdown,
  runUiReviewReportCli,
} from '../plugins/frontend-ai-workflow/scripts/ui-review-report.mjs';

const repositoryRoot = path.resolve('.');
const scriptsRoot = path.join(repositoryRoot, 'plugins', 'frontend-ai-workflow', 'scripts');
const fixtureOutputRoot = path.join(repositoryRoot, 'outputs', 'ui-review-report-modularization');
const reportModuleNames = [
  'ui-review-report.mjs',
  'ui-review-report-contract.mjs',
  'ui-review-report-input.mjs',
  'ui-review-report-decision.mjs',
  'ui-review-report-markdown.mjs',
  'ui-review-report-artifacts.mjs',
];

function createFixture(context) {
  fs.mkdirSync(fixtureOutputRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureOutputRoot, 'case-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeMinimalPng(filePath, width = 800, height = 600) {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  fs.writeFileSync(filePath, buffer);
}

function createFinding(id, overrides = {}) {
  return {
    id,
    confidence: 'high',
    selector: '#save',
    componentPath: 'src/components/SaveButton.vue',
    nodeText: '保存',
    nodeMeaning: '',
    pagePosition: '右上角',
    rect: { x: 20, y: 24, width: 120, height: 40 },
    type: '颜色',
    label: '按钮颜色',
    problem: '主按钮颜色偏浅',
    currentValue: '#89b',
    targetValue: '#1677ff',
    fix: '调整主色变量',
    sourceTarget: {
      file: 'src/components/SaveButton.vue',
      anchor: 'save-button',
      styleSource: 'scoped style',
    },
    changeScope: '仅主按钮颜色',
    forbiddenChanges: '不调整按钮尺寸',
    suggestedPatch: '更新 --primary-color',
    verification: {
      workingDirectory: 'fixtures/ui-review',
      commands: ['npm run test'],
      page: 'http://127.0.0.1:4173',
      assertions: ['按钮颜色符合设计值'],
    },
    ...overrides,
  };
}

function createReviewInput(findings = []) {
  return {
    project: {
      name: '报告拆分 fixture',
      runtime: 'Vue 3',
      page: '/settings',
      designBasis: '设计稿 v1',
      scope: ['保存按钮'],
    },
    viewport: { width: 800, height: 600, dpr: 1, scale: 100 },
    reviewedAt: '2026-09-01T00:00:00.000Z',
    checkedNodes: [{
      selector: '#save',
      componentPath: 'src/components/SaveButton.vue',
      nodeText: '保存',
      nodeMeaning: '',
      rect: { x: 20, y: 24, width: 120, height: 40 },
    }],
    findings,
  };
}

function createReportContext(evidencePaths = ['outputs/ui-review/report.png']) {
  return {
    schemaVersion: 2,
    runId: 'run-001',
    scenarioFingerprint: 'fingerprint-001',
    capture: 'project-playwright',
    baselineRunId: null,
    statePath: 'outputs/ui-review/state.json',
    evidencePaths,
    status: 'passed',
    observationCount: 1,
    findingCount: 0,
  };
}

function messageOf(action) {
  try {
    action();
  } catch (error) {
    return error.message;
  }
  assert.fail('应抛出错误');
}

function writeFfmpegFixture(root, name, capturePath, shouldFail) {
  const fixturePath = path.join(root, name);
  const program = shouldFail
    ? [
      "process.stderr.write('受控 FFmpeg 失败');",
      'process.exit(9);',
    ]
    : [
      `fs.writeFileSync(${JSON.stringify(capturePath)}, JSON.stringify(args), 'utf8');`,
      "const input = args[args.indexOf('-i') + 1];",
      'const output = args.at(-1);',
      'fs.copyFileSync(input, output);',
    ];
  fs.writeFileSync(fixturePath, [
    "import fs from 'node:fs';",
    'const args = process.argv.slice(2);',
    "if (args.includes('-version')) process.exit(0);",
    ...program,
  ].join('\n'), 'utf8');
  return fixturePath;
}

function internalReportImports(source) {
  const imports = new Set();
  const pattern = /from\s+['"](\.\/ui-review-report-[^'"]+)['"]/gu;
  for (const match of source.matchAll(pattern)) imports.add(match[1].slice(2));
  return [...imports].sort();
}

function assertAcyclic(graph) {
  const visiting = new Set();
  const visited = new Set();
  const visit = (name) => {
    if (visiting.has(name)) assert.fail(`报告模块出现循环依赖：${name}`);
    if (visited.has(name)) return;
    visiting.add(name);
    for (const dependency of graph[name]) visit(dependency);
    visiting.delete(name);
    visited.add(name);
  };
  Object.keys(graph).forEach(visit);
}

test('[TC-01] 兼容门面的输入与报告渲染', async (context) => {
  const root = createFixture(context);
  const screenshotPath = path.join(root, 'source.png');
  writeMinimalPng(screenshotPath);
  assert.deepEqual(parsePngDimensions(screenshotPath), { width: 800, height: 600 });

  const review = normalizeReviewInput(createReviewInput([
    createFinding('UI-001'),
    createFinding('UI-002', {
      rect: { x: 24, y: 28, width: 118, height: 38 },
      label: '按钮主色',
      problem: '按钮主色与设计不一致',
      currentValue: '#789',
    }),
  ]), { width: 800, height: 600 });
  assert.equal(review.findings.length, 1);
  assert.equal(review.inputFindingCount, 2);
  assert.equal(review.filteredCount, 0);
  assert.equal(review.mergedCount, 1);
  assert.match(renderReviewMarkdown(review), /需修改：发现 1 个高置信度节点问题。/u);

  const emptyReview = normalizeReviewInput(createReviewInput(), { width: 800, height: 600 });
  assert.match(renderReviewMarkdown(emptyReview), /通过：本次声明范围内未发现高置信度视觉差异。/u);
  const deterministic = renderDeterministicAssessmentMarkdown({
    context: createReportContext(),
    scenario: { id: 'settings', url: 'http://127.0.0.1:4173/settings', comparison: { scope: 'visual', mode: 'image' } },
    assessment: { outcome: 'passed', observations: [], findings: [] },
  });
  assert.match(deterministic, /UI 确定性验收结果/u);
  assert.equal(typeof generateUiReview, 'function');
  await assert.rejects(runUiReviewReportCli([]), /--screenshot不能为空/u);

  const facade = fs.readFileSync(path.join(scriptsRoot, 'ui-review-report.mjs'), 'utf8');
  assert.ok(facade.split('\n').length <= 180, '兼容门面必须不超过 180 行');
  assert.doesNotMatch(facade, /import\(/u, '兼容门面不得把同步 API 改为动态导入');
});

test('[TC-02] 受控产物、失败清理与路径边界', (context) => {
  const root = createFixture(context);
  const screenshotPath = path.join(root, 'source.png');
  const fontPath = path.join(root, 'font.ttf');
  const argumentCapturePath = path.join(root, 'ffmpeg-args.json');
  const outputDir = path.join(root, 'report');
  writeMinimalPng(screenshotPath);
  fs.writeFileSync(fontPath, 'fixture font', 'utf8');
  const successFfmpeg = writeFfmpegFixture(root, 'ffmpeg-success.mjs', argumentCapturePath, false);
  const success = generateUiReview({
    screenshotPath,
    input: createReviewInput(),
    outputDir,
    allowedOutputRoot: root,
    ffmpegPath: process.execPath,
    ffmpegArgs: [successFfmpeg],
    fontPath,
  });
  assert.equal(success.findingCount, 0);
  assert.equal(fs.existsSync(success.pngPath), true);
  assert.equal(fs.existsSync(success.markdownPath), true);
  assert.deepEqual(fs.readFileSync(success.pngPath), fs.readFileSync(screenshotPath));
  const firstMarkdown = fs.readFileSync(success.markdownPath, 'utf8');
  const capturedArgs = JSON.parse(fs.readFileSync(argumentCapturePath, 'utf8'));
  assert.equal(capturedArgs[capturedArgs.indexOf('-i') + 1], screenshotPath);
  assert.equal(path.basename(capturedArgs.at(-1)), 'ui-review.png');

  const repeated = generateUiReview({
    screenshotPath,
    input: createReviewInput(),
    outputDir,
    allowedOutputRoot: root,
    ffmpegPath: process.execPath,
    ffmpegArgs: [successFfmpeg],
    fontPath,
  });
  assert.equal(repeated.outputDir, success.outputDir);
  const failingFfmpeg = writeFfmpegFixture(root, 'ffmpeg-failure.mjs', argumentCapturePath, true);
  assert.throws(() => generateUiReview({
    screenshotPath,
    input: createReviewInput(),
    outputDir,
    allowedOutputRoot: root,
    ffmpegPath: process.execPath,
    ffmpegArgs: [failingFfmpeg],
    fontPath,
  }), /标注截图生成失败：受控 FFmpeg 失败/u);
  assert.equal(fs.readFileSync(success.markdownPath, 'utf8'), firstMarkdown);
  assert.deepEqual(
    fs.readdirSync(root).filter((name) => name.startsWith('.report-staging-')),
    [],
    '失败时只清理本次创建的暂存目录',
  );

  assert.deepEqual(
    ['D:/workspace/report.json', 'D:\\workspace\\report.json'].map((item) => (
      messageOf(() => createDeterministicReportContext(createReportContext([item])))
    )),
    [
      'reportContext.evidencePaths[0]必须是使用正斜杠的仓库相对路径。',
      'reportContext.evidencePaths[0]必须是使用正斜杠的仓库相对路径。',
    ],
  );
  assert.deepEqual(createDeterministicReportContext(createReportContext()).evidencePaths, ['outputs/ui-review/report.png']);

  const contract = fs.readFileSync(path.join(scriptsRoot, 'ui-review-report-contract.mjs'), 'utf8');
  const artifacts = fs.readFileSync(path.join(scriptsRoot, 'ui-review-report-artifacts.mjs'), 'utf8');
  assert.match(contract, /path\.posix\.isAbsolute\(raw\)\s*\|\|\s*path\.win32\.isAbsolute\(raw\)/u);
  assert.match(artifacts, /spawnSync\(\s*executable\.command,\s*\[\.\.\.executable\.args/su);
  assert.doesNotMatch(artifacts, /\bshell\s*:/u);
});

test('[TC-03] 相邻调用方与共享验证链', () => {
  const modules = Object.fromEntries(reportModuleNames.map((name) => [
    name,
    fs.readFileSync(path.join(scriptsRoot, name), 'utf8'),
  ]));
  for (const [name, source] of Object.entries(modules)) {
    const limit = name === 'ui-review-report.mjs' ? 180 : 500;
    assert.ok(source.split('\n').length <= limit, `${name} 超出 ${limit} 行预算`);
  }
  const graph = Object.fromEntries(reportModuleNames.map((name) => [name, internalReportImports(modules[name])]));
  assert.deepEqual(graph, {
    'ui-review-report.mjs': [
      'ui-review-report-artifacts.mjs',
      'ui-review-report-contract.mjs',
      'ui-review-report-input.mjs',
      'ui-review-report-markdown.mjs',
    ],
    'ui-review-report-contract.mjs': [],
    'ui-review-report-input.mjs': ['ui-review-report-contract.mjs', 'ui-review-report-decision.mjs'],
    'ui-review-report-decision.mjs': ['ui-review-report-contract.mjs'],
    'ui-review-report-markdown.mjs': ['ui-review-report-contract.mjs'],
    'ui-review-report-artifacts.mjs': [
      'ui-review-report-contract.mjs',
      'ui-review-report-input.mjs',
      'ui-review-report-markdown.mjs',
    ],
  });
  assertAcyclic(graph);

  for (const caller of ['ui-review-runner.mjs', 'playwright-adapter-runner.mjs']) {
    const source = fs.readFileSync(path.join(scriptsRoot, caller), 'utf8');
    assert.match(source, /from ['"]\.\/ui-review-report\.mjs['"]/u);
  }
  const reference = fs.readFileSync(path.join(scriptsRoot, '..', 'references', 'ui-review-workflow.md'), 'utf8');
  for (const phrase of [
    '数据解析',
    '业务判断',
    '输出报告',
    '不为拆分而拆分',
    '失败关闭',
    '路径安全',
    '暂存发布与清理',
    '兼容门面的公开导出和 CLI 语义',
  ]) {
    assert.match(reference, new RegExp(phrase, 'u'));
  }
});
