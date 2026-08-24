import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCliArgs } from './cli-arguments.mjs';
import { assertSafeProjectRoot, resolveProjectRoot } from './collect-project-scope.mjs';
import {
  atomicWriteProjectFile,
  ensureSafeProjectDirectory,
  openProjectFileExclusive,
  removeProjectFile,
} from './project-path-safety.mjs';
import { inspectBundledPlaywright, loadBundledPlaywright } from './playwright-runtime.mjs';
import { executeStructuredInteractions, waitForVisualStability } from './ui-review-interactions.mjs';
import { compareUiEvidence } from './ui-review-comparator.mjs';
import { parsePngDimensions } from './ui-review-report.mjs';
import {
  BUNDLED_UI_REVIEW_ADAPTER,
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

function writeJsonAtomic(projectRoot, filePath, value) {
  atomicWriteProjectFile(projectRoot, filePath, `${JSON.stringify(value, null, 2)}\n`, {
    label: '结构化采集结果',
  });
}

function reserveCaptureFile(projectRoot, targetPath, label) {
  const extension = path.extname(targetPath);
  const fileName = path.basename(targetPath, extension);
  // Playwright 会根据路径扩展名推断截图格式，安全暂存名必须保留原扩展名。
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `${fileName}.capture-${process.pid}-${crypto.randomBytes(5).toString('hex')}${extension}`,
  );
  const opened = openProjectFileExclusive(projectRoot, temporaryPath, `${label}临时文件`);
  fs.closeSync(opened.descriptor);
  return opened.absolutePath;
}

function cleanupCaptureFiles(projectRoot, files, originalError = null) {
  let cleanupError = null;
  for (const [filePath, label] of files) {
    if (!fs.existsSync(filePath)) continue;
    try {
      removeProjectFile(projectRoot, filePath, { label });
    } catch (error) {
      cleanupError ||= error;
    }
  }
  if (cleanupError && originalError) originalError.cleanupError = cleanupError;
  else if (cleanupError) throw cleanupError;
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
  ensureSafeProjectDirectory(projectRoot, path.dirname(actualScreenshot.absolutePath), '实际截图目录');
  ensureSafeProjectDirectory(projectRoot, path.dirname(resultPath.absolutePath), '结构化采集结果目录');

  // 版本 2 只把项目文件当作模板摘要凭据，实际代码始终从插件受信目录加载。
  const executableAdapter = config.schemaVersion === 2 ? BUNDLED_UI_REVIEW_ADAPTER : adapter.absolutePath;
  const adapterModule = await import(pathToFileURL(executableAdapter).href);
  if (typeof adapterModule.default !== 'function') fail('Playwright 适配器必须默认导出异步函数');
  const playwright = await loadBundledPlaywright();
  const runtime = inspectBundledPlaywright();
  const captureFiles = [
    [reserveCaptureFile(projectRoot, actualScreenshot.absolutePath, '实际截图'), '实际截图临时文件'],
    [reserveCaptureFile(projectRoot, resultPath.absolutePath, '结构化采集结果'), '结构化采集结果临时文件'],
  ];
  const [temporaryScreenshot, temporaryResult] = captureFiles.map(([filePath]) => filePath);
  let adapterResult;
  try {
    adapterResult = await adapterModule.default({
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
        projectRoot,
      }),
      stabilizePage: async ({ page, timeout = 5000 } = {}) => waitForVisualStability(page, { timeout }),
      project: deepFreeze({ root: projectRoot, name: projectName(projectRoot) }),
      runId: normalizedRunId,
      scenario: deepFreeze(structuredClone(plan.scenario)),
      artifacts: deepFreeze({
        actualScreenshot: temporaryScreenshot,
        interactionScreenshots: interactionScreenshots.absolutePath,
        result: temporaryResult,
        design: designPath.absolutePath,
      }),
    });
    resolveSafeProjectPath(projectRoot, temporaryScreenshot, '实际截图临时文件', {
      mustExist: true,
      allowDirectory: false,
      allowAbsolute: true,
    });
    atomicWriteProjectFile(projectRoot, actualScreenshot.absolutePath, fs.readFileSync(temporaryScreenshot), {
      label: '实际截图',
      encoding: undefined,
    });
    if (adapterResult === undefined) {
      atomicWriteProjectFile(projectRoot, resultPath.absolutePath, fs.readFileSync(temporaryResult), {
        label: '结构化采集结果',
        encoding: undefined,
      });
    }
    cleanupCaptureFiles(projectRoot, captureFiles);
  } catch (error) {
    cleanupCaptureFiles(projectRoot, captureFiles, error);
    throw error;
  }
  if (adapterResult !== undefined) {
    if (!adapterResult || typeof adapterResult !== 'object' || Array.isArray(adapterResult)) {
      fail('Playwright 适配器返回值必须是结构化结果对象或 undefined');
    }
    writeJsonAtomic(projectRoot, resultPath.absolutePath, adapterResult);
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
      projectRoot,
      scenario: plan.scenario,
      actualScreenshot: actualScreenshot.absolutePath,
      expectedScreenshot: designPath.absolutePath,
      domObservations: result.domObservations,
      diffPath: diffScreenshot.absolutePath,
    });
    Object.assign(result, assessment, { comparison: plan.scenario.comparison });
    writeJsonAtomic(projectRoot, resultPath.absolutePath, result);
  } else if (!Array.isArray(result.findings) && result.analysisPending !== true) {
    // 没有视觉结论时显式保持待分析，防止空数组缺失被误当成通过。
    result.analysisPending = true;
    writeJsonAtomic(projectRoot, resultPath.absolutePath, result);
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
