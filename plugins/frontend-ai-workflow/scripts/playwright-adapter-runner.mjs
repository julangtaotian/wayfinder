import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCliArgs } from './cli-arguments.mjs';
import { assertSafeProjectRoot, resolveProjectRoot } from './collect-project-scope.mjs';
import { inspectBundledPlaywright, loadBundledPlaywright } from './playwright-runtime.mjs';
import { executeStructuredInteractions } from './ui-review-interactions.mjs';
import { compareUiEvidence } from './ui-review-comparator.mjs';
import { parsePngDimensions } from './ui-review-report.mjs';
import {
  DEFAULT_UI_REVIEW_CONFIG,
  createCapturePlan,
  loadUiReviewConfig,
  readRunState,
  resolveSafeProjectPath,
} from './ui-review-workflow.mjs';

function fail(message) {
  throw new Error(message);
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label}不能为空`);
  return value.trim();
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`无法解析${label}：${error.message}`);
  }
}

function projectName(projectRoot) {
  const manifestPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(manifestPath)) return path.basename(projectRoot);
  try {
    const value = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).name;
    return typeof value === 'string' && value.trim() ? value.trim() : path.basename(projectRoot);
  } catch {
    return path.basename(projectRoot);
  }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

function validateCaptureState(state, plan, runId) {
  if (
    state.runId !== runId
    || state.scenarioId !== plan.scenarioId
    || state.scenarioFingerprint !== plan.scenarioFingerprint
    || state.capture !== 'project-playwright'
    || state.status !== 'collecting'
  ) {
    fail('当前运行状态与 Playwright 采集计划不一致，请先用同一运行 ID 写入 start-review 或 start-verify 状态');
  }
}

function validateCheckedNodes(result, expectedSelectors) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) fail('Playwright 适配器结果必须是 JSON 对象');
  if (!Array.isArray(result.checkedNodes) || result.checkedNodes.length === 0) {
    fail('Playwright 适配器结果至少要包含一个真实 checkedNodes 节点');
  }
  const actualSelectors = new Set();
  for (const [index, node] of result.checkedNodes.entries()) {
    const selector = requireString(node?.selector, `checkedNodes[${index}].selector`);
    if (!expectedSelectors.has(selector)) fail(`checkedNodes[${index}].selector 不在场景目标节点中：${selector}`);
    if (actualSelectors.has(selector)) fail(`Playwright 适配器结果包含重复节点：${selector}`);
    actualSelectors.add(selector);
  }
  for (const selector of expectedSelectors) {
    if (!actualSelectors.has(selector)) fail(`Playwright 适配器没有采集目标节点：${selector}`);
  }
  if (result.findings !== undefined && !Array.isArray(result.findings)) fail('Playwright 适配器结果 findings 必须是数组');
}

function cliOptions(argv) {
  return parseCliArgs(argv, {
    defaults: { target: process.cwd(), configPath: DEFAULT_UI_REVIEW_CONFIG },
    valueOptions: {
      '--target': 'target',
      '--config': 'configPath',
      '--scenario': 'scenarioId',
      '--run-id': 'runId',
    },
  });
}

export async function runPlaywrightAdapter({
  target = process.cwd(),
  configPath = DEFAULT_UI_REVIEW_CONFIG,
  scenarioId,
  runId,
} = {}) {
  const normalizedScenarioId = requireString(scenarioId, '--scenario');
  const normalizedRunId = requireString(runId, '--run-id');
  const projectRoot = resolveProjectRoot(target);
  assertSafeProjectRoot(projectRoot);
  const config = loadUiReviewConfig(projectRoot, configPath);
  const plan = createCapturePlan(config, normalizedScenarioId, { runId: normalizedRunId });
  if (plan.projectPlaywright.source !== 'bundled-adapter') fail('当前场景没有声明插件内置 Playwright 适配器');
  if (!plan.projectPlaywright.portable) {
    fail(`插件内置 Playwright 当前不可用：${plan.projectPlaywright.unavailableReason || '未知原因'}`);
  }

  const state = readRunState(projectRoot, plan.artifacts.state);
  validateCaptureState(state, plan, normalizedRunId);
  const adapter = resolveSafeProjectPath(
    projectRoot,
    plan.projectPlaywright.adapter,
    'Playwright 适配器',
    { mustExist: true, allowDirectory: false },
  );
  const actualScreenshot = resolveSafeProjectPath(projectRoot, plan.artifacts.actualScreenshot, '实际截图');
  const interactionScreenshots = resolveSafeProjectPath(projectRoot, plan.artifacts.interactionScreenshots, '交互截图目录');
  const resultPath = resolveSafeProjectPath(projectRoot, plan.projectPlaywright.resultPath, '结构化采集结果');
  const diffScreenshot = resolveSafeProjectPath(projectRoot, plan.artifacts.diffScreenshot, '像素差异图');
  const designPath = resolveSafeProjectPath(
    projectRoot,
    plan.scenario.design.path,
    '设计依据',
    { mustExist: true, allowDirectory: false },
  );
  fs.mkdirSync(path.dirname(actualScreenshot.absolutePath), { recursive: true });
  fs.mkdirSync(path.dirname(resultPath.absolutePath), { recursive: true });

  const adapterModule = await import(pathToFileURL(adapter.absolutePath).href);
  if (typeof adapterModule.default !== 'function') fail('Playwright 适配器必须默认导出异步函数');
  const playwright = await loadBundledPlaywright();
  const runtime = inspectBundledPlaywright();
  const adapterResult = await adapterModule.default({
    playwright,
    runtime: deepFreeze({
      platformKey: runtime.platformKey,
      browserExecutable: runtime.browserExecutable,
      ffmpegExecutable: runtime.ffmpegExecutable,
    }),
    executeInteractions: async ({ page, interactions = plan.scenario.interactions } = {}) => executeStructuredInteractions({
      page,
      interactions,
      captureRoot: interactionScreenshots.absolutePath,
    }),
    project: deepFreeze({ root: projectRoot, name: projectName(projectRoot) }),
    runId: normalizedRunId,
    scenario: deepFreeze(structuredClone(plan.scenario)),
    artifacts: deepFreeze({
      actualScreenshot: actualScreenshot.absolutePath,
      interactionScreenshots: interactionScreenshots.absolutePath,
      result: resultPath.absolutePath,
      design: designPath.absolutePath,
    }),
  });
  if (adapterResult !== undefined) {
    if (!adapterResult || typeof adapterResult !== 'object' || Array.isArray(adapterResult)) {
      fail('Playwright 适配器返回值必须是结构化结果对象或 undefined');
    }
    writeJsonAtomic(resultPath.absolutePath, adapterResult);
  }

  const dimensions = parsePngDimensions(actualScreenshot.absolutePath);
  const expectedWidth = Math.round(plan.scenario.viewport.width * plan.scenario.viewport.deviceScaleFactor);
  const expectedHeight = Math.round(plan.scenario.viewport.height * plan.scenario.viewport.deviceScaleFactor);
  if (dimensions.width !== expectedWidth || dimensions.height !== expectedHeight) {
    fail(`实际截图像素必须是 ${expectedWidth}x${expectedHeight}，当前为 ${dimensions.width}x${dimensions.height}`);
  }
  const result = readJson(resultPath.absolutePath, 'Playwright 适配器结果');
  validateCheckedNodes(result, new Set(plan.scenario.targets.map((target) => target.selector)));
  if (plan.scenario.interactionMode === 'structured') {
    if (result.interactions?.completed !== true || result.interactions.steps?.length !== plan.scenario.interactions.length) {
      fail('Playwright 适配器没有返回完整的结构化交互执行记录');
    }
  }
  if (plan.scenario.comparison) {
    const assessment = compareUiEvidence({
      scenario: plan.scenario,
      actualScreenshot: actualScreenshot.absolutePath,
      expectedScreenshot: designPath.absolutePath,
      domObservations: result.domObservations,
      diffPath: diffScreenshot.absolutePath,
    });
    Object.assign(result, assessment, { comparison: plan.scenario.comparison });
    writeJsonAtomic(resultPath.absolutePath, result);
  } else if (!Array.isArray(result.findings) && result.analysisPending !== true) {
    // 没有视觉结论时显式保持待分析，防止空数组缺失被误当成通过。
    result.analysisPending = true;
    writeJsonAtomic(resultPath.absolutePath, result);
  }

  return {
    ok: true,
    runId: normalizedRunId,
    scenarioId: normalizedScenarioId,
    runtime: plan.projectPlaywright.runtime,
    artifacts: {
      actualScreenshot: plan.artifacts.actualScreenshot,
      result: plan.projectPlaywright.resultPath,
      interactionScreenshots: plan.artifacts.interactionScreenshots,
    },
    analysisPending: result.analysisPending === true,
    outcome: result.outcome || null,
  };
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const output = await runPlaywrightAdapter(cliOptions(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Playwright 适配器执行失败：${error.message}\n`);
    process.exitCode = 1;
  }
}
