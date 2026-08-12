import { inspectBundledPlaywright } from './playwright-runtime.mjs';
import {
  UI_REVIEW_STATE_VERSION,
  RUN_ID_PATTERN,
  CAPTURE_TEMPLATE_PATTERN,
  PLAYWRIGHT_ADAPTER_RUNNER,
  fail,
  requireString,
  requireRepoRelativePath,
} from './ui-review-contract.mjs';

// 采集计划层只根据已规范化配置生成确定性计划和初始验收状态。
export function requireRunId(value, label = 'runId') {
  const runId = requireString(value, label);
  if (!RUN_ID_PATTERN.test(runId) || runId === '.' || runId === '..') {
    fail(`${label}只能使用字母、数字、点、下划线和短横线，长度不超过 96`);
  }
  return runId;
}

export function requireIsoDate(value, label) {
  const raw = requireString(value, label);
  if (Number.isNaN(Date.parse(raw))) fail(`${label}必须是有效的 ISO 时间`);
  return raw;
}

export function scenarioById(config, scenarioId) {
  const scenario = config.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) fail(`配置中不存在场景：${scenarioId}`);
  return scenario;
}

export function buildArtifactPaths(config, runId, scenarioId) {
  const runDirectory = `${config.artifactsRoot}/${runId}/${scenarioId}`;
  return {
    runDirectory,
    state: `${runDirectory}/state.json`,
    actualScreenshot: `${runDirectory}/actual.png`,
    interactionScreenshots: `${runDirectory}/interactions`,
    annotatedScreenshot: `${runDirectory}/report/ui-review.png`,
    diffScreenshot: `${runDirectory}/report/diff.png`,
    report: `${runDirectory}/report/ui-review.md`,
    reviewInput: `${runDirectory}/review-input.json`,
  };
}

export function expandCaptureTemplate(value, replacements, label) {
  const expanded = value.replace(CAPTURE_TEMPLATE_PATTERN, (_match, key) => replacements[key]);
  if (expanded.includes('{') || expanded.includes('}')) fail(`${label}包含未解析占位符`);
  return expanded;
}

export function createCapturePlan(config, scenarioId, { runId } = {}) {
  const scenario = scenarioById(config, scenarioId);
  const normalizedRunId = requireRunId(runId);
  const artifacts = buildArtifactPaths(config, normalizedRunId, scenario.id);
  const replacements = {
    scenarioId: scenario.id,
    runId: normalizedRunId,
    runDirectory: artifacts.runDirectory,
    actualScreenshot: artifacts.actualScreenshot,
    reviewInput: artifacts.reviewInput,
    designPath: scenario.design.path,
    url: scenario.url,
  };
  let projectPlaywright;
  if (scenario.projectPlaywright?.adapter) {
    const trustedAdapter = config.schemaVersion === 1 || scenario.projectPlaywright.integrity?.trusted === true;
    const runtime = trustedAdapter ? inspectBundledPlaywright() : null;
    projectPlaywright = {
      source: trustedAdapter ? 'bundled-adapter' : 'project-adapter',
      portable: trustedAdapter && runtime.available,
      unavailableReason: trustedAdapter
        ? runtime.reason
        : '版本 2 项目适配器内容与插件受信内置适配器不一致',
      workingDirectory: '.',
      adapter: scenario.projectPlaywright.adapter,
      command: trustedAdapter && runtime.available
        ? [
            process.execPath,
            PLAYWRIGHT_ADAPTER_RUNNER,
            '--target',
            '.',
            '--config',
            config.configPath,
            '--scenario',
            scenario.id,
            '--run-id',
            normalizedRunId,
          ]
        : null,
      resultPath: expandCaptureTemplate(
        scenario.projectPlaywright.resultPath,
        replacements,
        'projectPlaywright.resultPath',
      ),
      runtime: runtime ? {
        source: runtime.source,
        version: runtime.version,
        platform: runtime.platform ?? null,
        arch: runtime.arch ?? null,
        currentPlatform: runtime.currentPlatform ?? process.platform,
        currentArch: runtime.currentArch ?? process.arch,
        compatible: runtime.compatible,
        browser: runtime.browser ?? null,
        browserRevision: runtime.browserRevision ?? null,
        integrityOk: runtime.integrity?.ok ?? false,
        reason: runtime.reason,
      } : null,
      integrity: scenario.projectPlaywright.integrity ?? null,
    };
  } else if (scenario.projectPlaywright?.command) {
    projectPlaywright = {
      source: 'project-command',
      portable: true,
      unavailableReason: null,
      workingDirectory: '.',
      adapter: null,
      command: scenario.projectPlaywright.command.map((argument, index) => (
        expandCaptureTemplate(argument, replacements, `projectPlaywright.command[${index}]`)
      )),
      resultPath: expandCaptureTemplate(
        scenario.projectPlaywright.resultPath,
        replacements,
        'projectPlaywright.resultPath',
      ),
      runtime: null,
    };
  } else {
    projectPlaywright = {
      source: null,
      portable: false,
      unavailableReason: '场景没有声明 Playwright 适配器或兼容项目命令',
      workingDirectory: '.',
      adapter: null,
      command: null,
      resultPath: null,
      runtime: null,
    };
  }
  if (projectPlaywright.resultPath) {
    projectPlaywright.resultPath = requireRepoRelativePath(
      projectPlaywright.resultPath,
      'projectPlaywright.resultPath',
    );
  }
  return {
    schemaVersion: config.schemaVersion,
    scenarioId: scenario.id,
    scenarioFingerprint: scenario.fingerprint,
    primary: scenario.capturePlan.primary,
    fallback: scenario.capturePlan.fallback,
    order: [...scenario.capturePlan.order],
    projectPlaywright,
    browser: {
      declared: scenario.capturePlan.order.includes('browser'),
      role: scenario.capture === 'browser' ? 'primary' : scenario.captureFallback === 'browser' ? 'fallback' : null,
    },
    scenario: {
      url: scenario.url,
      viewport: scenario.viewport,
      design: scenario.design,
      targets: scenario.targets,
      interactions: scenario.interactions,
      interactionMode: scenario.interactionMode,
      comparison: scenario.comparison,
    },
    artifacts,
  };
}

export function createReviewRun(config, scenarioId, { runId, capture, now = new Date().toISOString() } = {}) {
  const scenario = scenarioById(config, scenarioId);
  const normalizedRunId = requireRunId(runId);
  const selectedCapture = capture === undefined ? scenario.capture : requireString(capture, 'capture');
  if (!scenario.capturePlan.order.includes(selectedCapture)) {
    fail(`采集器 ${selectedCapture} 未在场景采集计划中声明`);
  }
  return {
    schemaVersion: UI_REVIEW_STATE_VERSION,
    runId: normalizedRunId,
    stage: 'review',
    status: 'collecting',
    scenarioId: scenario.id,
    scenarioFingerprint: scenario.fingerprint,
    capture: selectedCapture,
    autoFix: config.autoFix,
    parentRunId: null,
    createdAt: requireIsoDate(now, 'now'),
    updatedAt: now,
    observations: [],
    findings: [],
    repairCandidates: [],
    appliedFindingIds: [],
    fallbackDeclared: scenario.capturePlan.order.includes('browser') && selectedCapture !== 'browser',
    fallbackRequired: false,
    inconclusiveReasons: [],
    artifacts: buildArtifactPaths(config, normalizedRunId, scenario.id),
  };
}
