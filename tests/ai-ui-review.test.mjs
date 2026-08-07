import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  generateUiReview,
  normalizeReviewInput,
  parsePngDimensions,
  renderReviewMarkdown,
} from '../outputs/lanhu-design-spec/validation-tools/generate-ai-ui-review.mjs';

const ffmpegPath = '/opt/homebrew/bin/ffmpeg';
const fontPath = '/System/Library/Fonts/PingFang.ttc';

function createPng(filePath, width = 320, height = 180) {
  const result = spawnSync(
    ffmpegPath,
    ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=white:s=${width}x${height}`, '-frames:v', '1', filePath],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function checkedNode(overrides = {}) {
  return {
    selector: '[data-scenario-id="SCN-BUTTON-01"] .el-button--primary',
    componentPath: 'ValidationApp > ScenarioDemo > PrimaryButton',
    nodeText: '主要',
    rect: { x: 100, y: 70, width: 64, height: 32 },
    ...overrides,
  };
}

function finding(overrides = {}) {
  return {
    id: 'UI-001',
    selector: '[data-scenario-id="SCN-BUTTON-01"] .el-button--primary',
    componentPath: 'ValidationApp > ScenarioDemo > PrimaryButton',
    nodeText: '主要',
    pagePosition: '按钮场景卡片第一行第二个按钮',
    rect: { x: 100, y: 70, width: 64, height: 32 },
    type: '颜色',
    label: '颜色',
    problem: '主按钮背景色与设计规范不一致',
    currentValue: '#409EFF',
    targetValue: '#FF6014',
    fix: '将主按钮背景色调整为 #FF6014',
    sourceTarget: {
      file: 'outputs/lanhu-design-spec/validation-element-plus/src/theme.css',
      anchor: '.scenario-demo .el-button--primary',
      styleSource: '本地主题规则覆盖组件库默认主色',
    },
    changeScope: '仅修改验收工程内按钮场景的主按钮主题规则',
    forbiddenChanges: '不要修改 node_modules、全局 .el-button 或其他组件场景',
    suggestedPatch: 'background-color: #FF6014;',
    verification: {
      workingDirectory: 'outputs/lanhu-design-spec/validation-element-plus',
      commands: ['npm run build'],
      page: '/#button/SCN-BUTTON-01',
      assertions: ['主按钮计算背景色为 rgb(255, 96, 20)'],
    },
    confidence: 'high',
    ...overrides,
  };
}

function reviewInput(overrides = {}) {
  return {
    project: {
      name: 'Element Plus 验收项目',
      runtime: 'Vue 3 + Element Plus 2.14.3',
      page: '/#button/SCN-BUTTON-01',
      designBasis: 'components/button.md',
      scope: ['按钮基础填充场景', 'Default 状态'],
    },
    viewport: { width: 320, height: 180, dpr: 1, scale: 100 },
    reviewedAt: '2026-08-05T12:00:00+08:00',
    checkedNodes: [checkedNode()],
    findings: [],
    ...overrides,
  };
}

test('PNG 尺寸解析与零问题 Markdown 保留有限结论', (context) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-ui-review-dimensions-'));
  context.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const screenshot = path.join(tempRoot, 'raw.png');
  createPng(screenshot);
  assert.deepEqual(parsePngDimensions(screenshot), { width: 320, height: 180 });
  const normalized = normalizeReviewInput(reviewInput(), { width: 320, height: 180 });
  const markdown = renderReviewMarkdown(normalized);
  assert.match(markdown, /问题：0|交付问题：`0`/u);
  assert.match(markdown, /未发现达到交付阈值的高置信度差异/u);
  assert.match(markdown, /不代表未检查的页面/u);
});

test('只交付高置信度问题，过滤 2px 内几何差异并合并同节点', () => {
  const normalized = normalizeReviewInput(reviewInput({
    findings: [
      finding(),
      finding({
        id: 'UI-002',
        type: '间距',
        label: '间距',
        problem: '内部间距偏差',
        currentValue: '15px',
        targetValue: '16px',
        fix: '调整为 16px',
        differencePx: 1,
      }),
      finding({
        id: 'UI-003',
        type: '字号',
        label: '字号',
        problem: '字号需复核',
        currentValue: '13px',
        targetValue: '14px',
        fix: '调整为 14px',
        confidence: 'medium',
      }),
      finding({
        id: 'UI-004',
        type: '字体',
        label: '字体',
        problem: '字重不一致',
        currentValue: '400',
        targetValue: '500',
        fix: '调整字重为 500',
      }),
    ],
  }), { width: 320, height: 180 });
  assert.equal(normalized.findings.length, 1);
  assert.equal(normalized.filteredCount, 2);
  assert.equal(normalized.mergedCount, 1);
  assert.equal(normalized.findings[0].id, 'UI-001');
  assert.match(normalized.findings[0].problem, /背景色.*字重/u);
});

test('源码修复指导完整输出，并拒绝危险路径、缺失断言和合并冲突', () => {
  const normalized = normalizeReviewInput(reviewInput({ findings: [finding()] }), { width: 320, height: 180 });
  const markdown = renderReviewMarkdown(normalized);
  assert.match(markdown, /#### 源码修复指导/u);
  assert.match(markdown, /源码目标文件：`outputs\/lanhu-design-spec\/validation-element-plus\/src\/theme\.css`/u);
  assert.match(markdown, /稳定代码锚点：`\.scenario-demo \.el-button--primary`/u);
  assert.match(markdown, /禁止修改范围：不要修改 node_modules/u);
  assert.match(markdown, /#### 修复后复验/u);
  assert.match(markdown, /工作目录：`outputs\/lanhu-design-spec\/validation-element-plus`/u);
  assert.match(markdown, /主按钮计算背景色为 rgb\(255, 96, 20\)/u);

  assert.throws(
    () => normalizeReviewInput(reviewInput({
      findings: [finding({ sourceTarget: { ...finding().sourceTarget, file: '/tmp/theme.css' } })],
    }), { width: 320, height: 180 }),
    /仓库相对路径/u,
  );
  assert.throws(
    () => normalizeReviewInput(reviewInput({
      findings: [finding({ sourceTarget: { ...finding().sourceTarget, file: '../theme.css' } })],
    }), { width: 320, height: 180 }),
    /不能包含空路径段、\. 或 \.\./u,
  );
  assert.throws(
    () => normalizeReviewInput(reviewInput({
      findings: [finding({ verification: { ...finding().verification, assertions: [] } })],
    }), { width: 320, height: 180 }),
    /assertions必须是非空字符串数组/u,
  );
  assert.throws(
    () => normalizeReviewInput(reviewInput({
      findings: [
        finding(),
        finding({
          id: 'UI-002',
          sourceTarget: { ...finding().sourceTarget, anchor: '.global-button' },
        }),
      ],
    }), { width: 320, height: 180 }),
    /同一节点的源码修复指导不一致/u,
  );
});

test('有问题和零问题都只生成两个文件且重复生成不增加文件', (context) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-ui-review-output-'));
  context.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const screenshot = path.join(tempRoot, 'raw.png');
  const allowedRoot = path.join(tempRoot, 'results');
  const outputDir = path.join(allowedRoot, 'element-plus');
  createPng(screenshot);

  const first = generateUiReview({
    screenshotPath: screenshot,
    input: reviewInput({ findings: [finding()] }),
    outputDir,
    allowedOutputRoot: allowedRoot,
    ffmpegPath,
    fontPath,
  });
  assert.equal(first.findingCount, 1);
  assert.deepEqual(fs.readdirSync(outputDir).sort(), ['ui-review.md', 'ui-review.png']);
  assert.match(fs.readFileSync(first.markdownPath, 'utf8'), /UI-001：颜色/u);

  const second = generateUiReview({
    screenshotPath: screenshot,
    input: reviewInput(),
    outputDir,
    allowedOutputRoot: allowedRoot,
    ffmpegPath,
    fontPath,
  });
  assert.equal(second.findingCount, 0);
  assert.deepEqual(fs.readdirSync(outputDir).sort(), ['ui-review.md', 'ui-review.png']);
  assert.match(fs.readFileSync(second.markdownPath, 'utf8'), /结果：通过/u);
});

test('问题上限、重复编号、节点缺失和坐标越界会被拒绝', () => {
  assert.throws(
    () => normalizeReviewInput(reviewInput({
      findings: Array.from({ length: 11 }, (_, index) => finding({ id: `UI-${String(index + 1).padStart(3, '0')}` })),
    }), { width: 320, height: 180 }),
    /不能超过 10 条/u,
  );
  assert.throws(
    () => normalizeReviewInput(reviewInput({ findings: [finding(), finding()] }), { width: 320, height: 180 }),
    /问题编号重复/u,
  );
  assert.throws(
    () => normalizeReviewInput(reviewInput({ findings: [finding({ selector: '#missing' })] }), { width: 320, height: 180 }),
    /未出现在实际检查节点/u,
  );
  assert.throws(
    () => normalizeReviewInput(reviewInput({ findings: [finding({ rect: { x: 300, y: 70, width: 64, height: 32 } })] }), { width: 320, height: 180 }),
    /超出截图对应的页面视口/u,
  );
});

test('未知输出文件会阻止生成且既有内容保持不变', (context) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-ui-review-safety-'));
  context.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const screenshot = path.join(tempRoot, 'raw.png');
  const allowedRoot = path.join(tempRoot, 'results');
  const outputDir = path.join(allowedRoot, 'element-plus');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'keep.txt'), '保留', 'utf8');
  createPng(screenshot);
  assert.throws(
    () => generateUiReview({
      screenshotPath: screenshot,
      input: reviewInput(),
      outputDir,
      allowedOutputRoot: allowedRoot,
      ffmpegPath,
      fontPath,
    }),
    /包含未知文件/u,
  );
  assert.equal(fs.readFileSync(path.join(outputDir, 'keep.txt'), 'utf8'), '保留');
  assert.deepEqual(fs.readdirSync(outputDir), ['keep.txt']);
});
