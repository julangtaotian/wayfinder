// 共享 fixture 只提供测试数据和既有依赖，领域用例不得重复实现这些构造器。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { runPlaywrightAdapter } from '../../plugins/frontend-ai-workflow/scripts/playwright-adapter-runner.mjs';
import {
  BUNDLED_PLAYWRIGHT_VERSION,
  inspectBundledPlaywright,
  loadBundledPlaywright,
  smokeTestBundledPlaywright,
  verifyPlaywrightIntegrity,
} from '../../plugins/frontend-ai-workflow/scripts/playwright-runtime.mjs';
import { executeStructuredInteractions } from '../../plugins/frontend-ai-workflow/scripts/ui-review-interactions.mjs';
import { compareUiEvidence, inspectComparisonRuntime } from '../../plugins/frontend-ai-workflow/scripts/ui-review-comparator.mjs';
import { renderDeterministicAssessmentMarkdown } from '../../plugins/frontend-ai-workflow/scripts/ui-review-report.mjs';
import { runUiReview } from '../../plugins/frontend-ai-workflow/scripts/ui-review-runner.mjs';
import pngjs from '../../plugins/frontend-ai-workflow/runtime/playwright/node_modules/pngjs/lib/png.js';
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
} from '../../plugins/frontend-ai-workflow/scripts/ui-review-workflow.mjs';

export const workflowScript = path.resolve('plugins/frontend-ai-workflow/scripts/ui-review-workflow.mjs');
export const { PNG } = pngjs;

export function writeSolidPng(filePath, width, height, [red, green, blue, alpha = 255]) {
  const image = new PNG({ width, height });
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = red;
    image.data[offset + 1] = green;
    image.data[offset + 2] = blue;
    image.data[offset + 3] = alpha;
  }
  fs.writeFileSync(filePath, PNG.sync.write(image));
}

export function configInput(overrides = {}) {
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

export function configV2Input(overrides = {}) {
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

export function createProject(context, overrides = {}) {
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

export function finding(overrides = {}) {
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

export {
  assert,
  fs,
  http,
  os,
  path,
  spawnSync,
  runPlaywrightAdapter,
  BUNDLED_PLAYWRIGHT_VERSION,
  inspectBundledPlaywright,
  loadBundledPlaywright,
  smokeTestBundledPlaywright,
  verifyPlaywrightIntegrity,
  executeStructuredInteractions,
  compareUiEvidence,
  inspectComparisonRuntime,
  renderDeterministicAssessmentMarkdown,
  runUiReview,
  pngjs,
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
};
