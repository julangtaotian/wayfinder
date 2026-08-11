import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCliArgs } from './cli-arguments.mjs';
import { assertSafeProjectRoot, resolveProjectRoot } from './collect-project-scope.mjs';
import { inspectBundledPlaywright } from './playwright-runtime.mjs';

export const UI_REVIEW_CONFIG_VERSION = 2;
export const UI_REVIEW_STATE_VERSION = 2;
export const DEFAULT_UI_REVIEW_CONFIG = '.frontend-ui-review/config.json';

const AUTO_FIX_MODES = new Set(['off', 'suggest', 'apply']);
const CAPTURE_METHODS = new Set(['browser', 'project-playwright']);
const DESIGN_TYPES = new Set(['image', 'spec']);
const RUN_STAGES = new Set(['review', 'repair', 'verify']);
const RUN_STATUSES = new Set(['collecting', 'needs-fix', 'passed', 'ready-to-verify', 'failed', 'inconclusive', 'blocked']);
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const SCENARIO_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const CAPTURE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const INTERACTION_ACTIONS = new Set([
  'click',
  'hover',
  'fill',
  'press',
  'select-option',
  'check',
  'uncheck',
  'wait-for',
  'assert',
  'capture',
]);
const LOCATOR_ACTIONS = new Set(['click', 'hover', 'fill', 'press', 'select-option', 'check', 'uncheck', 'wait-for']);
const WAIT_STATES = new Set(['visible', 'hidden', 'attached', 'detached']);
const ASSERTION_TYPES = new Set(['visible', 'hidden', 'text', 'value', 'url']);
const COMPARISON_MODES = new Set(['dom', 'image', 'hybrid']);
const COMPARISON_SCOPES = new Set(['structure', 'visual']);
const RECT_PROPERTIES = new Set([
  'rect.x',
  'rect.y',
  'rect.width',
  'rect.height',
  'rect.top',
  'rect.right',
  'rect.bottom',
  'rect.center-x',
  'rect.center-y',
]);
const CAPTURE_TEMPLATE_PATTERN = /\{([A-Za-z][A-Za-z0-9]*)\}/gu;
const CAPTURE_TEMPLATE_KEYS = new Set([
  'scenarioId',
  'runId',
  'runDirectory',
  'actualScreenshot',
  'reviewInput',
  'designPath',
  'url',
]);
const PLAYWRIGHT_ADAPTER_RUNNER = fileURLToPath(new URL('./playwright-adapter-runner.mjs', import.meta.url));

function fail(message) {
  throw new Error(message);
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}必须是对象`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label}不能为空`);
  return value.trim();
}

function optionalString(value, label) {
  if (value === undefined || value === null || value === '') return null;
  return requireString(value, label);
}

function normalizeStringArray(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`${label}必须是字符串数组`);
  return value.map((item, index) => {
    if (typeof item !== 'string') fail(`${label}必须是字符串数组，${label}[${index}] 不是字符串`);
    return requireString(item, `${label}[${index}]`);
  });
}

function assertAllowedKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) fail(`${label}包含不支持字段：${unknown.join('、')}`);
}

function normalizeTimeout(value, label) {
  if (value === undefined) return 5000;
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 30000) {
    fail(`${label}必须是 100 到 30000 的整数`);
  }
  return timeout;
}

function normalizeSelector(value, label) {
  const selector = requireString(value, label);
  if (selector.length > 512 || /[\u0000-\u001f\u007f]/u.test(selector)) fail(`${label}包含无效字符或过长`);
  return selector;
}

function normalizeInteractionValue(value, label) {
  const text = requireString(value, label);
  if (text.length > 4096 || /[\u0000\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
    fail(`${label}包含无效控制字符或过长`);
  }
  return text;
}

function normalizeInteraction(value, index) {
  const label = `interactions[${index}]`;
  const interaction = requireObject(value, label);
  const action = requireString(interaction.action, `${label}.action`);
  if (!INTERACTION_ACTIONS.has(action)) fail(`${label}包含不支持的交互动作：${action}`);

  const common = new Set(['action', 'timeout']);
  const actionFields = {
    click: ['selector'],
    hover: ['selector'],
    fill: ['selector', 'value'],
    press: ['selector', 'key'],
    'select-option': ['selector', 'value'],
    check: ['selector'],
    uncheck: ['selector'],
    'wait-for': ['selector', 'state'],
    assert: ['assertion', 'selector', 'value', 'exact'],
    capture: ['name'],
  };
  assertAllowedKeys(interaction, new Set([...common, ...actionFields[action]]), label);
  const normalized = { action, timeout: normalizeTimeout(interaction.timeout, `${label}.timeout`) };

  if (LOCATOR_ACTIONS.has(action)) {
    normalized.selector = normalizeSelector(interaction.selector, `${label}.selector`);
  }
  if (action === 'fill') {
    if (/(?:password|passwd|secret|token)/iu.test(normalized.selector)) {
      fail(`${label}.selector 指向敏感凭据字段，结构化交互禁止记录凭据`);
    }
    normalized.value = normalizeInteractionValue(interaction.value, `${label}.value`);
  }
  if (action === 'press') {
    normalized.key = requireString(interaction.key, `${label}.key`);
    if (normalized.key.length > 64 || !/^[A-Za-z0-9+_-]+$/u.test(normalized.key)) fail(`${label}.key 不是受支持的按键组合`);
  }
  if (action === 'select-option') normalized.value = normalizeInteractionValue(interaction.value, `${label}.value`);
  if (action === 'wait-for') {
    normalized.state = interaction.state === undefined ? 'visible' : requireString(interaction.state, `${label}.state`);
    if (!WAIT_STATES.has(normalized.state)) fail(`${label}.state 只能是 visible、hidden、attached 或 detached`);
  }
  if (action === 'assert') {
    normalized.assertion = requireString(interaction.assertion, `${label}.assertion`);
    if (!ASSERTION_TYPES.has(normalized.assertion)) fail(`${label}.assertion 不受支持：${normalized.assertion}`);
    if (normalized.assertion === 'url') {
      if (interaction.selector !== undefined) fail(`${label}.url 断言不能声明 selector`);
    } else {
      normalized.selector = normalizeSelector(interaction.selector, `${label}.selector`);
    }
    if (['text', 'value', 'url'].includes(normalized.assertion)) {
      normalized.value = normalizeInteractionValue(interaction.value, `${label}.value`);
    } else if (interaction.value !== undefined) {
      fail(`${label}.${normalized.assertion} 断言不能声明 value`);
    }
    normalized.exact = interaction.exact === true;
  }
  if (action === 'capture') {
    normalized.name = requireString(interaction.name, `${label}.name`);
    if (!CAPTURE_NAME_PATTERN.test(normalized.name)) fail(`${label}.截图名称只能使用小写字母、数字和短横线，长度不超过 64`);
  }
  return normalized;
}

function normalizeComparisonRect(value, label) {
  const rect = requireObject(value, label);
  assertAllowedKeys(rect, new Set(['x', 'y', 'width', 'height']), label);
  const normalized = Object.fromEntries(['x', 'y', 'width', 'height'].map((key) => [key, Number(rect[key])]));
  if (!Number.isInteger(normalized.x) || normalized.x < 0 || !Number.isInteger(normalized.y) || normalized.y < 0) {
    fail(`${label}.x 和 ${label}.y 必须是非负整数`);
  }
  if (!Number.isInteger(normalized.width) || normalized.width < 1 || !Number.isInteger(normalized.height) || normalized.height < 1) {
    fail(`${label}.width 和 ${label}.height 必须是正整数`);
  }
  return normalized;
}

function normalizeComparison(value, label, designType) {
  const comparison = requireObject(value, label);
  assertAllowedKeys(comparison, new Set(['scope', 'mode', 'dom', 'image']), label);
  const scope = comparison.scope === undefined ? 'structure' : requireString(comparison.scope, `${label}.scope`);
  if (!COMPARISON_SCOPES.has(scope)) fail(`${label}.scope 只能是 structure 或 visual`);
  const mode = requireString(comparison.mode, `${label}.mode`);
  if (!COMPARISON_MODES.has(mode)) fail(`${label}.mode 只能是 dom、image 或 hybrid`);

  const dom = comparison.dom === undefined ? [] : comparison.dom;
  if (!Array.isArray(dom)) fail(`${label}.dom 必须是数组`);
  const normalizedDom = dom.map((item, index) => {
    const itemLabel = `${label}.dom[${index}]`;
    const assertion = requireObject(item, itemLabel);
    assertAllowedKeys(assertion, new Set(['selector', 'property', 'expected', 'exact', 'tolerance', 'relativeTo']), itemLabel);
    const property = requireString(assertion.property, `${itemLabel}.property`);
    const isRect = RECT_PROPERTIES.has(property);
    if (!isRect && !['visible', 'hidden', 'text', 'value', 'url'].includes(property) && !/^style\.[a-z-]{1,64}$/u.test(property)) {
      fail(`${itemLabel}.property 不受支持：${property}`);
    }
    const expected = assertion.expected;
    if (isRect) {
      if ((expected === undefined) === (assertion.relativeTo === undefined)) {
        fail(`${itemLabel}几何断言必须且只能声明 expected 或 relativeTo`);
      }
      if (expected !== undefined && (!Number.isFinite(Number(expected)))) {
        fail(`${itemLabel}.expected 必须是有限数值`);
      }
      if (assertion.exact !== undefined) fail(`${itemLabel}几何断言请使用 tolerance，不能声明 exact`);
    } else if (['visible', 'hidden'].includes(property)) {
      if (expected !== true && expected !== false) fail(`${itemLabel}.expected 必须是布尔值`);
    } else if (typeof expected !== 'string') {
      fail(`${itemLabel}.expected 必须是字符串`);
    }
    if (!isRect && (assertion.tolerance !== undefined || assertion.relativeTo !== undefined)) {
      fail(`${itemLabel}只有 rect.* 几何断言可以声明 tolerance 或 relativeTo`);
    }
    const tolerance = isRect && assertion.tolerance !== undefined ? Number(assertion.tolerance) : 0;
    if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 10000) {
      fail(`${itemLabel}.tolerance 必须是 0 到 10000 的有限数值`);
    }
    let relativeTo = null;
    if (isRect && assertion.relativeTo !== undefined) {
      const reference = requireObject(assertion.relativeTo, `${itemLabel}.relativeTo`);
      assertAllowedKeys(reference, new Set(['selector', 'property']), `${itemLabel}.relativeTo`);
      const referenceProperty = requireString(reference.property, `${itemLabel}.relativeTo.property`);
      if (!RECT_PROPERTIES.has(referenceProperty)) fail(`${itemLabel}.relativeTo.property 必须是 rect.* 几何属性`);
      relativeTo = {
        selector: normalizeSelector(reference.selector, `${itemLabel}.relativeTo.selector`),
        property: referenceProperty,
      };
    }
    const normalized = {
      selector: normalizeSelector(assertion.selector, `${itemLabel}.selector`),
      property,
      expected: isRect && expected !== undefined ? Number(expected) : expected,
      exact: isRect ? false : assertion.exact === true,
    };
    if (isRect) Object.assign(normalized, { tolerance, relativeTo });
    return normalized;
  });
  let normalizedImage = null;
  if (comparison.image !== undefined) {
    if (designType !== 'image') fail(`${label}.image 只能用于图片设计依据`);
    const image = requireObject(comparison.image, `${label}.image`);
    assertAllowedKeys(image, new Set(['regions', 'masks', 'thresholds']), `${label}.image`);
    if (!Array.isArray(image.regions) || image.regions.length === 0) fail(`${label}.image.regions 至少要包含一个区域`);
    const regions = image.regions.map((item, index) => {
      const itemLabel = `${label}.image.regions[${index}]`;
      const region = requireObject(item, itemLabel);
      assertAllowedKeys(region, new Set(['name', 'actual', 'expected']), itemLabel);
      const name = requireString(region.name, `${itemLabel}.name`);
      if (!CAPTURE_NAME_PATTERN.test(name)) fail(`${itemLabel}.name 只能使用小写字母、数字和短横线`);
      return {
        name,
        actual: normalizeComparisonRect(region.actual, `${itemLabel}.actual`),
        expected: normalizeComparisonRect(region.expected, `${itemLabel}.expected`),
      };
    });
    if (new Set(regions.map((region) => region.name)).size !== regions.length) fail(`${label}.image.regions 名称不能重复`);
    const masks = image.masks === undefined ? [] : image.masks;
    if (!Array.isArray(masks)) fail(`${label}.image.masks 必须是数组`);
    const normalizedMasks = masks.map((item, index) => {
      const itemLabel = `${label}.image.masks[${index}]`;
      const mask = requireObject(item, itemLabel);
      assertAllowedKeys(mask, new Set(['actual', 'expected']), itemLabel);
      return {
        actual: normalizeComparisonRect(mask.actual, `${itemLabel}.actual`),
        expected: normalizeComparisonRect(mask.expected, `${itemLabel}.expected`),
      };
    });
    const thresholds = image.thresholds === undefined ? {} : requireObject(image.thresholds, `${label}.image.thresholds`);
    assertAllowedKeys(thresholds, new Set(['colorThreshold', 'maxDiffPixels', 'maxDiffRatio']), `${label}.image.thresholds`);
    const colorThreshold = thresholds.colorThreshold === undefined ? 0.1 : Number(thresholds.colorThreshold);
    const maxDiffPixels = thresholds.maxDiffPixels === undefined ? 0 : Number(thresholds.maxDiffPixels);
    const maxDiffRatio = thresholds.maxDiffRatio === undefined ? 0 : Number(thresholds.maxDiffRatio);
    if (!Number.isFinite(colorThreshold) || colorThreshold < 0 || colorThreshold > 1) fail(`${label}.image.thresholds.colorThreshold 必须是 0 到 1`);
    if (!Number.isInteger(maxDiffPixels) || maxDiffPixels < 0) fail(`${label}.image.thresholds.maxDiffPixels 必须是非负整数`);
    if (!Number.isFinite(maxDiffRatio) || maxDiffRatio < 0 || maxDiffRatio > 1) fail(`${label}.image.thresholds.maxDiffRatio 必须是 0 到 1`);
    normalizedImage = { regions, masks: normalizedMasks, thresholds: { colorThreshold, maxDiffPixels, maxDiffRatio } };
  }
  if (['dom', 'hybrid'].includes(mode) && normalizedDom.length === 0) fail(`${label}.${mode} 模式必须声明 DOM 断言`);
  if (['image', 'hybrid'].includes(mode) && !normalizedImage) fail(`${label}.${mode} 模式必须声明图片比较`);
  if (mode === 'dom' && normalizedImage) fail(`${label}.dom 模式不能声明图片比较`);
  const visualEvidenceDeclared = Boolean(normalizedImage)
    || normalizedDom.some((assertion) => assertion.property.startsWith('style.') || RECT_PROPERTIES.has(assertion.property));
  return { scope, mode, dom: normalizedDom, image: normalizedImage, visualEvidenceDeclared };
}

function requireRepoRelativePath(value, label) {
  const raw = requireString(value, label);
  if (raw.includes('\\') || path.posix.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    fail(`${label}必须是使用正斜杠的仓库相对路径`);
  }
  if (raw.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail(`${label}不能包含空路径段、. 或 ..`);
  }
  return raw;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function toProjectPath(value) {
  return value.split(path.sep).join('/');
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

// 未存在的产物路径也要检查最近的真实父目录，避免通过符号链接越出项目。
export function resolveSafeProjectPath(projectRoot, value, label, { mustExist = false, allowDirectory = true } = {}) {
  const canonicalRoot = fs.realpathSync(projectRoot);
  const raw = requireString(value, label);
  if (raw.includes('\\') || path.posix.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    fail(`${label}必须是使用正斜杠的项目相对路径`);
  }
  const segments = raw.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    fail(`${label}不能包含空路径段、. 或 ..`);
  }

  const absolutePath = path.resolve(canonicalRoot, ...segments);
  if (!isInside(canonicalRoot, absolutePath)) fail(`${label}不能指向项目根目录或项目外部`);

  let existingAncestor = absolutePath;
  while (!fs.existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) break;
    existingAncestor = parent;
  }
  const realAncestor = fs.realpathSync(existingAncestor);
  if (realAncestor !== canonicalRoot && !isInside(canonicalRoot, realAncestor)) fail(`${label}通过符号链接越出了项目`);

  if (mustExist && !fs.existsSync(absolutePath)) fail(`${label}不存在：${raw}`);
  if (fs.existsSync(absolutePath)) {
    const realPath = fs.realpathSync(absolutePath);
    if (!isInside(canonicalRoot, realPath)) fail(`${label}通过符号链接越出了项目`);
    if (!allowDirectory && !fs.statSync(realPath).isFile()) fail(`${label}必须是文件：${raw}`);
  }

  return { absolutePath, projectPath: segments.join('/') };
}

function normalizeViewport(value, label) {
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

function normalizeTarget(value, label, projectRoot) {
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

function validateCaptureTemplate(value, label) {
  for (const match of value.matchAll(CAPTURE_TEMPLATE_PATTERN)) {
    if (!CAPTURE_TEMPLATE_KEYS.has(match[1])) fail(`${label}包含不支持的占位符：{${match[1]}}`);
  }
  const unmatched = value.replace(CAPTURE_TEMPLATE_PATTERN, '');
  if (unmatched.includes('{') || unmatched.includes('}')) fail(`${label}包含无效占位符`);
  return value;
}

function normalizeProjectPlaywright(value, label, projectRoot, captureOrder) {
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
    return {
      adapter: safeAdapter.projectPath,
      resultPath: validateCaptureTemplate(resultPath, `${label}.resultPath`),
    };
  }
  return {
    command: command.map((argument, argumentIndex) => validateCaptureTemplate(argument, `${label}.command[${argumentIndex}]`)),
    resultPath: validateCaptureTemplate(resultPath, `${label}.resultPath`),
  };
}

function normalizeScenario(value, index, projectRoot, schemaVersion) {
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
      portable: capture === 'project-playwright' && Boolean(projectPlaywright),
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

function requireRunId(value, label = 'runId') {
  const runId = requireString(value, label);
  if (!RUN_ID_PATTERN.test(runId) || runId === '.' || runId === '..') {
    fail(`${label}只能使用字母、数字、点、下划线和短横线，长度不超过 96`);
  }
  return runId;
}

function requireIsoDate(value, label) {
  const raw = requireString(value, label);
  if (Number.isNaN(Date.parse(raw))) fail(`${label}必须是有效的 ISO 时间`);
  return raw;
}

function scenarioById(config, scenarioId) {
  const scenario = config.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) fail(`配置中不存在场景：${scenarioId}`);
  return scenario;
}

function buildArtifactPaths(config, runId, scenarioId) {
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

function expandCaptureTemplate(value, replacements, label) {
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
    const runtime = inspectBundledPlaywright();
    projectPlaywright = {
      source: 'bundled-adapter',
      portable: runtime.available,
      unavailableReason: runtime.reason,
      workingDirectory: '.',
      adapter: scenario.projectPlaywright.adapter,
      command: runtime.available
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
      runtime: {
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
      },
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

function normalizeVerification(value, label) {
  const verification = requireObject(value, label);
  const workingDirectory = requireString(verification.workingDirectory, `${label}.workingDirectory`);
  const commands = normalizeStringArray(verification.commands, `${label}.commands`);
  const assertions = normalizeStringArray(verification.assertions, `${label}.assertions`);
  if (commands.length === 0) fail(`${label}.commands 至少要包含一个命令`);
  if (assertions.length === 0) fail(`${label}.assertions 至少要包含一条断言`);
  return {
    workingDirectory: requireRepoRelativePath(workingDirectory, `${label}.workingDirectory`),
    commands,
    page: requireString(verification.page, `${label}.page`),
    assertions,
  };
}

export function normalizeUiFinding(value, index = 0) {
  const label = `findings[${index}]`;
  const finding = requireObject(value, label);
  const sourceTarget = requireObject(finding.sourceTarget, `${label}.sourceTarget`);
  const normalized = {
    id: requireString(finding.id, `${label}.id`),
    confidence: requireString(finding.confidence, `${label}.confidence`),
    selector: requireString(finding.selector, `${label}.selector`),
    type: requireString(finding.type, `${label}.type`),
    targetValue: requireString(finding.targetValue, `${label}.targetValue`),
    sourceTarget: {
      file: requireRepoRelativePath(sourceTarget.file, `${label}.sourceTarget.file`),
      anchor: requireString(sourceTarget.anchor, `${label}.sourceTarget.anchor`),
      styleSource: optionalString(sourceTarget.styleSource, `${label}.sourceTarget.styleSource`),
    },
    changeScope: requireString(finding.changeScope, `${label}.changeScope`),
    forbiddenChanges: requireString(finding.forbiddenChanges, `${label}.forbiddenChanges`),
    verification: normalizeVerification(finding.verification, `${label}.verification`),
  };
  if (normalized.confidence !== 'high') fail(`${label}.confidence 必须是 high 才能进入交付状态`);
  const fingerprintSource = {
    selector: normalized.selector,
    type: normalized.type,
    targetValue: normalized.targetValue,
    sourceFile: normalized.sourceTarget.file,
    anchor: normalized.sourceTarget.anchor,
  };
  return { ...normalized, repairable: true, fingerprint: sha256(stableJson(fingerprintSource)) };
}

function normalizeObservation(value, index, fallbackStatus = 'observed') {
  const observation = requireObject(value, `observations[${index}]`);
  const confidence = optionalString(observation.confidence, `observations[${index}].confidence`) || 'high';
  if (!['high', 'medium', 'low'].includes(confidence)) fail(`observations[${index}].confidence 不受支持`);
  return {
    id: optionalString(observation.id, `observations[${index}].id`) || `OBS-${String(index + 1).padStart(3, '0')}`,
    kind: optionalString(observation.kind, `observations[${index}].kind`) || optionalString(observation.type, `observations[${index}].type`) || 'visual',
    status: optionalString(observation.status, `observations[${index}].status`) || fallbackStatus,
    confidence,
    selector: optionalString(observation.selector, `observations[${index}].selector`),
    detail: optionalString(observation.detail, `observations[${index}].detail`) || optionalString(observation.problem, `observations[${index}].problem`),
    evidence: observation.evidence && typeof observation.evidence === 'object' && !Array.isArray(observation.evidence)
      ? stableValue(observation.evidence)
      : null,
  };
}

function normalizeNonRepairableFinding(value, index) {
  const label = `findings[${index}]`;
  const finding = requireObject(value, label);
  const normalized = {
    id: requireString(finding.id, `${label}.id`),
    confidence: requireString(finding.confidence, `${label}.confidence`),
    selector: requireString(finding.selector, `${label}.selector`),
    type: requireString(finding.type, `${label}.type`),
    targetValue: requireString(finding.targetValue, `${label}.targetValue`),
    repairable: false,
    evidence: finding.evidence && typeof finding.evidence === 'object' && !Array.isArray(finding.evidence)
      ? stableValue(finding.evidence)
      : null,
  };
  if (normalized.confidence !== 'high') fail(`${label}.confidence 必须是 high 才能进入问题状态`);
  return {
    ...normalized,
    fingerprint: sha256(stableJson({
      selector: normalized.selector,
      type: normalized.type,
      targetValue: normalized.targetValue,
      evidence: normalized.evidence,
    })),
  };
}

function normalizeAssessment(result) {
  const source = requireObject(result, '验收结果');
  if (!Array.isArray(source.findings)) fail('验收结果 findings 必须是数组');
  const geometryTypes = new Set(['尺寸', '间距', '边距', '位置']);
  const observations = Array.isArray(source.observations)
    ? source.observations.map((observation, index) => normalizeObservation(observation, index))
    : [];
  const deliverable = [];
  let hasUncertainDifference = source.analysisPending === true;
  for (const finding of source.findings) {
    const belowGeometryThreshold = (
      geometryTypes.has(finding?.type)
      && Number.isFinite(finding?.differencePx)
      && finding.differencePx < 2
      && finding.exact !== true
    );
    if (finding?.confidence !== 'high' || belowGeometryThreshold) {
      observations.push(normalizeObservation(
        finding,
        observations.length,
        belowGeometryThreshold ? 'below-threshold' : 'uncertain',
      ));
      if (finding?.confidence === 'medium') hasUncertainDifference = true;
      continue;
    }
    deliverable.push(finding);
  }
  const findings = deliverable.map((finding, index) => (
    finding.repairable === false
      ? normalizeNonRepairableFinding(finding, index)
      : normalizeUiFinding(finding, index)
  ));
  const fingerprints = new Set();
  for (const finding of findings) {
    if (fingerprints.has(finding.fingerprint)) fail(`验收结果包含重复问题：${finding.id}`);
    fingerprints.add(finding.fingerprint);
  }
  const explicitOutcome = source.outcome ?? source.status;
  if (explicitOutcome !== undefined && !['passed', 'needs-fix', 'inconclusive'].includes(explicitOutcome)) {
    fail(`验收结果 outcome 不受支持：${String(explicitOutcome)}`);
  }
  let status = explicitOutcome || (findings.length > 0 ? 'needs-fix' : hasUncertainDifference ? 'inconclusive' : 'passed');
  if (source.analysisPending === true || hasUncertainDifference) status = 'inconclusive';
  if (status === 'passed' && findings.length > 0) fail('验收结果包含问题，不能声明 passed');
  if (status === 'needs-fix' && findings.length === 0) status = 'inconclusive';
  const inconclusiveReasons = [];
  if (source.analysisPending === true) inconclusiveReasons.push('视觉分析尚未完成');
  if (hasUncertainDifference && source.analysisPending !== true) inconclusiveReasons.push('存在中置信度或证据不足的差异');
  if (status === 'inconclusive' && inconclusiveReasons.length === 0) inconclusiveReasons.push('确定性证据不足');
  return {
    status,
    findings,
    repairCandidates: findings.filter((finding) => finding.repairable === true),
    observations,
    inconclusiveReasons,
  };
}

function assertState(value, expectedStage, expectedStatus) {
  const state = requireObject(value, '运行状态');
  if (![1, UI_REVIEW_STATE_VERSION].includes(state.schemaVersion)) fail(`运行状态版本不受支持：${String(state.schemaVersion)}`);
  requireRunId(state.runId, '运行状态 runId');
  if (!RUN_STAGES.has(state.stage) || !RUN_STATUSES.has(state.status)) fail('运行状态包含未知阶段或状态');
  if (!CAPTURE_METHODS.has(state.capture)) fail('运行状态包含未知采集器');
  if (expectedStage && state.stage !== expectedStage) fail(`当前阶段必须是 ${expectedStage}，实际为 ${state.stage}`);
  if (expectedStatus && state.status !== expectedStatus) fail(`当前状态必须是 ${expectedStatus}，实际为 ${state.status}`);
  return state;
}

function assertMutableState(value, expectedStage, expectedStatus) {
  const state = assertState(value, expectedStage, expectedStatus);
  if (state.schemaVersion === 1) fail('运行状态版本 1 仅供历史只读，不能原地改写');
  return state;
}

function normalizeArtifactEvidence(artifacts) {
  const value = requireObject(artifacts, '验收产物');
  return {
    ...value,
    actualScreenshot: requireString(value.actualScreenshot, '验收产物 actualScreenshot'),
    annotatedScreenshot: requireString(value.annotatedScreenshot, '验收产物 annotatedScreenshot'),
    report: requireString(value.report, '验收产物 report'),
  };
}

export function completeReviewRun(state, result, { artifacts = state.artifacts, now = new Date().toISOString() } = {}) {
  const current = assertMutableState(state, 'review', 'collecting');
  const assessment = normalizeAssessment(result);
  return {
    ...current,
    status: assessment.status,
    updatedAt: requireIsoDate(now, 'now'),
    observations: assessment.observations,
    findings: assessment.findings,
    repairCandidates: assessment.repairCandidates,
    fallbackRequired: assessment.status === 'inconclusive' && current.fallbackDeclared === true,
    inconclusiveReasons: assessment.inconclusiveReasons,
    artifacts: normalizeArtifactEvidence(artifacts),
  };
}

function validateRepairContext(findings) {
  if (!Array.isArray(findings) || findings.length === 0) fail('没有可修复的高置信度问题');
  findings.forEach((finding, index) => normalizeUiFinding(finding, index));
}

export function evaluateRepairGate(state, config, { explicitApproval = false } = {}) {
  const current = assertMutableState(state, 'review', 'needs-fix');
  const scenario = scenarioById(config, current.scenarioId);
  if (scenario.fingerprint !== current.scenarioFingerprint) fail('当前配置与验收基线的场景指纹不一致');
  validateRepairContext(current.repairCandidates || []);
  if (config.autoFix === 'off') {
    return { decision: 'blocked', reason: '项目配置已关闭自动修复，不能修改源码。' };
  }
  if (config.autoFix === 'suggest' && !explicitApproval) {
    return { decision: 'suggest', reason: '默认建议模式只输出修复建议；实际修改需要当前任务显式授权。' };
  }
  return {
    decision: 'apply',
    reason: config.autoFix === 'apply' ? '项目配置允许进入受控修复。' : '当前任务已显式授权进入受控修复。',
  };
}

export function completeRepairRun(state, appliedFindingIds, { now = new Date().toISOString() } = {}) {
  const current = assertMutableState(state, 'review', 'needs-fix');
  if (!Array.isArray(appliedFindingIds) || appliedFindingIds.length === 0) fail('appliedFindingIds 至少要包含一个已应用问题');
  const knownIds = new Set((current.repairCandidates || []).map((finding) => finding.id));
  const normalizedIds = [...new Set(appliedFindingIds.map((id, index) => requireString(id, `appliedFindingIds[${index}]`)))];
  for (const id of normalizedIds) {
    if (!knownIds.has(id)) fail(`不能记录未知问题为已修复：${id}`);
  }
  return {
    ...current,
    stage: 'repair',
    status: 'ready-to-verify',
    updatedAt: requireIsoDate(now, 'now'),
    appliedFindingIds: normalizedIds,
  };
}

export function createVerifyRun(config, baselineState, { runId, now = new Date().toISOString() } = {}) {
  const baseline = assertState(baselineState);
  if (!['needs-fix', 'ready-to-verify'].includes(baseline.status)) fail('只有发现问题或完成修复的基线可以进入复验');
  const scenario = scenarioById(config, baseline.scenarioId);
  if (
    scenario.fingerprint !== baseline.scenarioFingerprint
    || !scenario.capturePlan.order.includes(baseline.capture)
  ) {
    fail('当前页面、视口、设计依据、目标节点、交互或采集方式已变化，请重新开始独立验收');
  }
  const normalizedRunId = requireRunId(runId);
  return {
    schemaVersion: UI_REVIEW_STATE_VERSION,
    runId: normalizedRunId,
    stage: 'verify',
    status: 'collecting',
    scenarioId: scenario.id,
    scenarioFingerprint: scenario.fingerprint,
    capture: baseline.capture,
    autoFix: config.autoFix,
    parentRunId: baseline.runId,
    createdAt: requireIsoDate(now, 'now'),
    updatedAt: now,
    observations: [],
    findings: [],
    repairCandidates: [],
    appliedFindingIds: [...(baseline.appliedFindingIds || [])],
    fallbackDeclared: baseline.fallbackDeclared === true,
    fallbackRequired: false,
    inconclusiveReasons: [],
    artifacts: buildArtifactPaths(config, normalizedRunId, scenario.id),
  };
}

export function completeVerifyRun(state, baselineState, result, { artifacts = state.artifacts, now = new Date().toISOString() } = {}) {
  const current = assertMutableState(state, 'verify', 'collecting');
  const baseline = assertState(baselineState);
  if (
    current.parentRunId !== baseline.runId
    || current.scenarioFingerprint !== baseline.scenarioFingerprint
    || current.capture !== baseline.capture
  ) {
    fail('复验运行与基线运行不匹配');
  }
  const assessment = normalizeAssessment(result);
  const findings = assessment.findings;
  const baselineMap = new Map((baseline.findings || []).map((finding) => [finding.fingerprint, finding]));
  const currentMap = new Map(findings.map((finding) => [finding.fingerprint, finding]));
  const resolved = assessment.status === 'inconclusive'
    ? []
    : [...baselineMap.keys()].filter((fingerprint) => !currentMap.has(fingerprint));
  const remaining = assessment.status === 'inconclusive'
    ? [...baselineMap.keys()]
    : [...baselineMap.keys()].filter((fingerprint) => currentMap.has(fingerprint));
  const added = assessment.status === 'inconclusive'
    ? []
    : [...currentMap.keys()].filter((fingerprint) => !baselineMap.has(fingerprint));
  return {
    ...current,
    status: assessment.status === 'inconclusive'
      ? 'inconclusive'
      : remaining.length === 0 && added.length === 0 ? 'passed' : 'failed',
    updatedAt: requireIsoDate(now, 'now'),
    observations: assessment.observations,
    findings,
    repairCandidates: assessment.repairCandidates,
    fallbackRequired: assessment.status === 'inconclusive' && current.fallbackDeclared === true,
    inconclusiveReasons: assessment.inconclusiveReasons,
    artifacts: normalizeArtifactEvidence(artifacts),
    verification: { resolved, remaining, new: added },
  };
}

function readJsonFile(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`无法读取${label}：${error.message}`);
  }
}

export function readRunState(projectRoot, statePath) {
  const safe = resolveSafeProjectPath(projectRoot, statePath, '状态路径', { mustExist: true, allowDirectory: false });
  return assertState(readJsonFile(safe.absolutePath, '运行状态'));
}

export function writeRunState(projectRoot, state, { allowExistingState = false } = {}) {
  const current = assertMutableState(state);
  const artifacts = requireObject(current.artifacts, '运行状态 artifacts');
  const statePath = resolveSafeProjectPath(projectRoot, artifacts.state, '状态产物路径');
  const runDirectory = resolveSafeProjectPath(projectRoot, artifacts.runDirectory, '运行目录');
  if (path.dirname(statePath.absolutePath) !== runDirectory.absolutePath) fail('state.json 必须直接位于运行目录中');

  if (fs.existsSync(runDirectory.absolutePath)) {
    const entries = fs.readdirSync(runDirectory.absolutePath);
    const allowed = new Set(['state.json', 'actual.png', 'interactions', 'review-input.json', 'report']);
    const unknown = entries.filter((entry) => !allowed.has(entry));
    if (unknown.length > 0) fail(`运行目录包含未知内容，拒绝写入：${unknown.join('、')}`);
    if (fs.existsSync(statePath.absolutePath) && !allowExistingState) fail(`运行状态已存在，拒绝覆盖：${artifacts.state}`);
    if (fs.existsSync(statePath.absolutePath)) {
      const previous = readJsonFile(statePath.absolutePath, '既有运行状态');
      if (previous.runId !== current.runId || previous.scenarioId !== current.scenarioId) fail('既有运行状态不属于同一次运行');
    }
  } else {
    fs.mkdirSync(runDirectory.absolutePath, { recursive: true });
  }

  const temporaryPath = `${statePath.absolutePath}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(current, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporaryPath, statePath.absolutePath);
  return statePath.absolutePath;
}

function cliOptions(argv) {
  return parseCliArgs(argv, {
    defaults: { target: process.cwd(), configPath: DEFAULT_UI_REVIEW_CONFIG, write: false, explicitApproval: false },
    valueOptions: {
      '--target': 'target',
      '--config': 'configPath',
      '--scenario': 'scenarioId',
      '--run-id': 'runId',
      '--capture': 'capture',
      '--state': 'statePath',
      '--baseline': 'baselinePath',
      '--result': 'resultPath',
      '--finding-ids': 'findingIds',
    },
    booleanOptions: { '--write': 'write', '--explicit-approval': 'explicitApproval' },
  });
}

function cliContext(options) {
  const projectRoot = resolveProjectRoot(options.target);
  assertSafeProjectRoot(projectRoot);
  return { projectRoot, config: loadUiReviewConfig(projectRoot, options.configPath) };
}

function resultFromPath(projectRoot, resultPath) {
  const safe = resolveSafeProjectPath(projectRoot, resultPath, '验收结果路径', { mustExist: true, allowDirectory: false });
  return readJsonFile(safe.absolutePath, '验收结果');
}

function assertCompletedArtifacts(projectRoot, state) {
  for (const [key, label] of [
    ['actualScreenshot', '实际截图'],
    ['annotatedScreenshot', '标注截图'],
    ['report', 'Markdown 报告'],
  ]) {
    resolveSafeProjectPath(projectRoot, state.artifacts?.[key], label, { mustExist: true, allowDirectory: false });
  }
}

function persistOrPreview(projectRoot, state, write, allowExistingState = false) {
  if (write) writeRunState(projectRoot, state, { allowExistingState });
  return { write, state };
}

export async function runUiReviewWorkflowCli(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (!command) fail('缺少命令：inspect、capture-plan、start-review、complete-review、repair-gate、complete-repair、start-verify 或 complete-verify');
  const options = cliOptions(rest);
  const { projectRoot, config } = cliContext(options);
  let output;

  if (command === 'inspect') {
    output = { write: false, config };
  } else if (command === 'capture-plan') {
    output = {
      write: false,
      plan: createCapturePlan(config, options.scenarioId, { runId: options.runId }),
    };
  } else if (command === 'start-review') {
    output = persistOrPreview(
      projectRoot,
      createReviewRun(config, options.scenarioId, {
        runId: options.runId,
        capture: options.capture,
      }),
      options.write,
    );
  } else if (command === 'complete-review') {
    const state = readRunState(projectRoot, options.statePath);
    assertCompletedArtifacts(projectRoot, state);
    const next = completeReviewRun(state, resultFromPath(projectRoot, options.resultPath));
    output = persistOrPreview(projectRoot, next, options.write, true);
  } else if (command === 'repair-gate') {
    const state = readRunState(projectRoot, options.statePath);
    output = { write: false, ...evaluateRepairGate(state, config, { explicitApproval: options.explicitApproval }) };
  } else if (command === 'complete-repair') {
    const state = readRunState(projectRoot, options.statePath);
    const ids = requireString(options.findingIds, '--finding-ids').split(',').map((id) => id.trim()).filter(Boolean);
    output = persistOrPreview(projectRoot, completeRepairRun(state, ids), options.write, true);
  } else if (command === 'start-verify') {
    const baseline = readRunState(projectRoot, options.baselinePath);
    output = persistOrPreview(projectRoot, createVerifyRun(config, baseline, { runId: options.runId }), options.write);
  } else if (command === 'complete-verify') {
    const state = readRunState(projectRoot, options.statePath);
    const baseline = readRunState(projectRoot, options.baselinePath);
    assertCompletedArtifacts(projectRoot, state);
    const next = completeVerifyRun(state, baseline, resultFromPath(projectRoot, options.resultPath));
    output = persistOrPreview(projectRoot, next, options.write, true);
  } else {
    fail(`不支持的 UI 验收命令：${command}`);
  }

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return output;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  runUiReviewWorkflowCli().catch((error) => {
    process.stderr.write(`UI 验收流程失败：${error.message}\n`);
    process.exitCode = 1;
  });
}
