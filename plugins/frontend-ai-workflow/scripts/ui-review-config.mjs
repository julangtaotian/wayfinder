import fs from 'node:fs';
import { resolveSafeProjectPath } from './project-path-safety.mjs';
import {
  UI_REVIEW_CONFIG_VERSION,
  DEFAULT_UI_REVIEW_CONFIG,
  AUTO_FIX_MODES,
  CAPTURE_METHODS,
  DESIGN_TYPES,
  SCENARIO_ID_PATTERN,
  CAPTURE_TEMPLATE_PATTERN,
  CAPTURE_TEMPLATE_KEYS,
  BUNDLED_UI_REVIEW_ADAPTER,
  fail,
  requireObject,
  requireString,
  optionalString,
  normalizeStringArray,
  normalizeInteraction,
  normalizeComparison,
  requireRepoRelativePath,
  sha256,
  stableJson,
} from './ui-review-contract.mjs';

// 配置层继续导出原公共函数，但路径判定统一由共享安全模块完成。
export { resolveSafeProjectPath };

export function normalizeViewport(value, label) {
  const viewport = requireObject(value, label);
  const width = Number(viewport.width);
  const height = Number(viewport.height);
  const deviceScaleFactor = viewport.deviceScaleFactor === undefined ? 1 : Number(viewport.deviceScaleFactor);
  if (!Number.isInteger(width) || width < 240 || width > 7680) fail(`${label}.width 必须是 240 到 7680 的整数`);
  if (!Number.isInteger(height) || height < 240 || height > 4320) fail(`${label}.height 必须是 240 到 4320 的整数`);
  if (!Number.isFinite(deviceScaleFactor) || deviceScaleFactor < 1 || deviceScaleFactor > 4) {
    fail(`${label}.deviceScaleFactor 必须是 1 到 4 的数字`);
  }
  return { width, height, deviceScaleFactor };
}

export function normalizeTarget(value, label, projectRoot) {
  const target = requireObject(value, label);
  const componentPath = optionalString(target.componentPath, `${label}.componentPath`);
  const sourcePath = optionalString(target.sourcePath, `${label}.sourcePath`);
  return {
    selector: requireString(target.selector, `${label}.selector`),
    nodeMeaning: optionalString(target.nodeMeaning, `${label}.nodeMeaning`),
    componentPath,
    sourcePath: sourcePath
      ? resolveSafeProjectPath(projectRoot, sourcePath, `${label}.sourcePath`, { mustExist: true, allowDirectory: false }).projectPath
      : null,
  };
}

export function validateCaptureTemplate(value, label) {
  for (const match of value.matchAll(CAPTURE_TEMPLATE_PATTERN)) {
    if (!CAPTURE_TEMPLATE_KEYS.has(match[1])) fail(`${label}包含不支持的占位符：{${match[1]}}`);
  }
  const unmatched = value.replace(CAPTURE_TEMPLATE_PATTERN, '');
  if (unmatched.includes('{') || unmatched.includes('}')) fail(`${label}包含无效占位符`);
  return value;
}

export function normalizeProjectPlaywright(value, label, projectRoot, captureOrder, schemaVersion) {
  if (value === undefined || value === null) return null;
  if (!captureOrder.includes('project-playwright')) fail(`${label}只能用于包含 project-playwright 的采集计划`);
  const contract = requireObject(value, label);
  const adapter = optionalString(contract.adapter, `${label}.adapter`);
  const command = contract.command === undefined
    ? null
    : normalizeStringArray(contract.command, `${label}.command`);
  if (adapter && command) fail(`${label}.adapter 与 ${label}.command 不能同时声明`);
  if (!adapter && !command) fail(`${label}必须声明 adapter 或 command`);
  if (command?.length === 0) fail(`${label}.command 至少要包含一个命令参数`);
  const resultPath = requireRepoRelativePath(contract.resultPath, `${label}.resultPath`);
  resolveSafeProjectPath(projectRoot, resultPath, `${label}.resultPath`);
  if (adapter) {
    const safeAdapter = resolveSafeProjectPath(
      projectRoot,
      adapter,
      `${label}.adapter`,
      { mustExist: true, allowDirectory: false },
    );
    if (!/\.(?:mjs|js)$/u.test(safeAdapter.projectPath)) fail(`${label}.adapter 必须是 .mjs 或 .js 模块`);
    const normalized = {
      adapter: safeAdapter.projectPath,
      resultPath: validateCaptureTemplate(resultPath, `${label}.resultPath`),
    };
    if (schemaVersion === 2) {
      const adapterSha256 = sha256(fs.readFileSync(safeAdapter.absolutePath));
      const trustedSha256 = sha256(fs.readFileSync(BUNDLED_UI_REVIEW_ADAPTER));
      normalized.integrity = {
        sha256: adapterSha256,
        trustedSha256,
        trusted: adapterSha256 === trustedSha256,
      };
    }
    return normalized;
  }
  return {
    command: command.map((argument, argumentIndex) => validateCaptureTemplate(argument, `${label}.command[${argumentIndex}]`)),
    resultPath: validateCaptureTemplate(resultPath, `${label}.resultPath`),
  };
}

export function normalizeScenario(value, index, projectRoot, schemaVersion) {
  const label = `scenarios[${index}]`;
  const scenario = requireObject(value, label);
  const id = requireString(scenario.id, `${label}.id`);
  if (!SCENARIO_ID_PATTERN.test(id)) fail(`${label}.id 只能使用小写字母、数字和短横线，长度不超过 64`);

  const rawUrl = requireString(scenario.url, `${label}.url`);
  let pageUrl;
  try {
    pageUrl = new URL(rawUrl);
  } catch {
    fail(`${label}.url 必须是有效的 HTTP(S) 地址`);
  }
  if (!['http:', 'https:'].includes(pageUrl.protocol) || pageUrl.username || pageUrl.password) {
    fail(`${label}.url 必须是不包含认证信息的 HTTP(S) 地址`);
  }

  const capture = scenario.capture === undefined ? 'browser' : requireString(scenario.capture, `${label}.capture`);
  if (!CAPTURE_METHODS.has(capture)) fail(`${label}.capture 只能是 browser 或 project-playwright`);
  const captureFallback = optionalString(scenario.captureFallback, `${label}.captureFallback`);
  if (captureFallback && !CAPTURE_METHODS.has(captureFallback)) {
    fail(`${label}.captureFallback 只能是 browser 或 project-playwright`);
  }
  if (captureFallback === capture) fail(`${label}.captureFallback 不能与主采集器相同`);
  const captureOrder = captureFallback ? [capture, captureFallback] : [capture];
  const projectPlaywright = normalizeProjectPlaywright(
    scenario.projectPlaywright,
    `${label}.projectPlaywright`,
    projectRoot,
    captureOrder,
    schemaVersion,
  );

  const design = requireObject(scenario.design, `${label}.design`);
  const designType = requireString(design.type, `${label}.design.type`);
  if (!DESIGN_TYPES.has(designType)) fail(`${label}.design.type 只能是 image 或 spec`);
  const designPath = resolveSafeProjectPath(
    projectRoot,
    design.path,
    `${label}.design.path`,
    { mustExist: true, allowDirectory: false },
  );

  if (!Array.isArray(scenario.targets) || scenario.targets.length === 0) fail(`${label}.targets 至少要包含一个目标节点`);
  const targets = scenario.targets.map((target, targetIndex) => normalizeTarget(target, `${label}.targets[${targetIndex}]`, projectRoot));
  const selectors = new Set();
  for (const target of targets) {
    if (selectors.has(target.selector)) fail(`${label}.targets 存在重复选择器：${target.selector}`);
    selectors.add(target.selector);
  }

  const interactions = schemaVersion === 1
    ? normalizeStringArray(scenario.interactions, `${label}.interactions`)
    : (() => {
        if (!Array.isArray(scenario.interactions)) fail(`${label}.interactions 必须是结构化交互数组`);
        return scenario.interactions.map((interaction, interactionIndex) => normalizeInteraction(interaction, interactionIndex));
      })();
  const normalized = {
    id,
    url: pageUrl.toString(),
    capture,
    viewport: normalizeViewport(scenario.viewport, `${label}.viewport`),
    design: {
      type: designType,
      path: designPath.projectPath,
      sha256: sha256(fs.readFileSync(designPath.absolutePath)),
    },
    targets,
    interactions,
  };
  const interactionMode = schemaVersion === 1 ? 'instructions' : 'structured';
  const comparison = schemaVersion === 1
    ? null
    : normalizeComparison(scenario.comparison, `${label}.comparison`, designType);
  // 版本 1 继续使用原指纹来源；版本 2 才纳入结构化交互模式和确定性比较合同。
  const legacyFingerprintSource = captureFallback || projectPlaywright
    ? { ...normalized, captureFallback, projectPlaywright }
    : normalized;
  const fingerprintSource = schemaVersion === 1
    ? legacyFingerprintSource
    : { ...legacyFingerprintSource, interactionMode, comparison };
  return {
    ...normalized,
    interactionMode,
    comparison,
    captureFallback,
    projectPlaywright,
    capturePlan: {
      primary: capture,
      fallback: captureFallback,
      order: captureOrder,
      portable: capture === 'project-playwright' && Boolean(projectPlaywright) && (
        Boolean(projectPlaywright.command)
        || schemaVersion === 1
        || projectPlaywright.integrity?.trusted === true
      ),
    },
    fingerprint: sha256(stableJson(fingerprintSource)),
  };
}

export function normalizeUiReviewConfig(input, projectRoot, configPath = DEFAULT_UI_REVIEW_CONFIG) {
  const config = requireObject(input, 'UI 验收配置');
  if (![1, UI_REVIEW_CONFIG_VERSION].includes(config.schemaVersion)) {
    fail(`UI 验收配置版本不受支持：${String(config.schemaVersion)}`);
  }
  const autoFix = config.autoFix === undefined ? 'suggest' : requireString(config.autoFix, 'autoFix');
  if (!AUTO_FIX_MODES.has(autoFix)) fail('autoFix 只能是 off、suggest 或 apply');
  const artifactsRoot = resolveSafeProjectPath(
    projectRoot,
    config.artifactsRoot || '.frontend-ui-review/runs',
    'artifactsRoot',
  ).projectPath;
  if (!Array.isArray(config.scenarios) || config.scenarios.length === 0) fail('scenarios 至少要包含一个验收场景');
  const scenarios = config.scenarios.map((scenario, index) => normalizeScenario(
    scenario,
    index,
    projectRoot,
    config.schemaVersion,
  ));
  const scenarioIds = new Set();
  for (const scenario of scenarios) {
    if (scenarioIds.has(scenario.id)) fail(`场景 ID 重复：${scenario.id}`);
    scenarioIds.add(scenario.id);
  }
  return {
    schemaVersion: config.schemaVersion,
    configPath,
    artifactsRoot,
    autoFix,
    scenarios,
  };
}

export function loadUiReviewConfig(projectRoot, configPath = DEFAULT_UI_REVIEW_CONFIG) {
  const safeConfig = resolveSafeProjectPath(projectRoot, configPath, '配置路径', { mustExist: true, allowDirectory: false });
  let input;
  try {
    input = JSON.parse(fs.readFileSync(safeConfig.absolutePath, 'utf8'));
  } catch (error) {
    fail(`无法解析 UI 验收配置：${error.message}`);
  }
  return normalizeUiReviewConfig(input, projectRoot, safeConfig.projectPath);
}
