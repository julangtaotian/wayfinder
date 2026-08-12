import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 共享合同集中维护校验、常量和稳定摘要，领域模块不得复制这些安全规则。
export const UI_REVIEW_CONFIG_VERSION = 2;
export const UI_REVIEW_STATE_VERSION = 2;
export const DEFAULT_UI_REVIEW_CONFIG = '.frontend-ui-review/config.json';

export const AUTO_FIX_MODES = new Set(['off', 'suggest', 'apply']);
export const CAPTURE_METHODS = new Set(['browser', 'project-playwright']);
export const DESIGN_TYPES = new Set(['image', 'spec']);
export const RUN_STAGES = new Set(['review', 'repair', 'verify']);
export const RUN_STATUSES = new Set(['collecting', 'needs-fix', 'passed', 'ready-to-verify', 'failed', 'inconclusive', 'blocked']);
export const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
export const SCENARIO_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u;
export const CAPTURE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u;
export const INTERACTION_ACTIONS = new Set([
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
export const LOCATOR_ACTIONS = new Set(['click', 'hover', 'fill', 'press', 'select-option', 'check', 'uncheck', 'wait-for']);
export const WAIT_STATES = new Set(['visible', 'hidden', 'attached', 'detached']);
export const ASSERTION_TYPES = new Set(['visible', 'hidden', 'text', 'value', 'url']);
export const COMPARISON_MODES = new Set(['dom', 'image', 'hybrid']);
export const COMPARISON_SCOPES = new Set(['structure', 'visual']);
export const RECT_PROPERTIES = new Set([
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
export const CAPTURE_TEMPLATE_PATTERN = /\{([A-Za-z][A-Za-z0-9]*)\}/gu;
export const CAPTURE_TEMPLATE_KEYS = new Set([
  'scenarioId',
  'runId',
  'runDirectory',
  'actualScreenshot',
  'reviewInput',
  'designPath',
  'url',
]);
export const PLAYWRIGHT_ADAPTER_RUNNER = fileURLToPath(new URL('./playwright-adapter-runner.mjs', import.meta.url));
export const BUNDLED_UI_REVIEW_ADAPTER = fileURLToPath(
  new URL('../assets/templates/ui-review/playwright-adapter.mjs', import.meta.url),
);

export function fail(message) {
  throw new Error(message);
}

export function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}必须是对象`);
  return value;
}

export function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label}不能为空`);
  return value.trim();
}

export function optionalString(value, label) {
  if (value === undefined || value === null || value === '') return null;
  return requireString(value, label);
}

export function normalizeStringArray(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`${label}必须是字符串数组`);
  return value.map((item, index) => {
    if (typeof item !== 'string') fail(`${label}必须是字符串数组，${label}[${index}] 不是字符串`);
    return requireString(item, `${label}[${index}]`);
  });
}

export function assertAllowedKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) fail(`${label}包含不支持字段：${unknown.join('、')}`);
}

export function normalizeTimeout(value, label) {
  if (value === undefined) return 5000;
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 30000) {
    fail(`${label}必须是 100 到 30000 的整数`);
  }
  return timeout;
}

export function normalizeSelector(value, label) {
  const selector = requireString(value, label);
  if (selector.length > 512 || /[\u0000-\u001f\u007f]/u.test(selector)) fail(`${label}包含无效字符或过长`);
  return selector;
}

export function normalizeInteractionValue(value, label) {
  const text = requireString(value, label);
  if (text.length > 4096 || /[\u0000\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
    fail(`${label}包含无效控制字符或过长`);
  }
  return text;
}

export function normalizeInteraction(value, index) {
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
    if (/password|passwd|secret|token/iu.test(normalized.selector)) {
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

export function normalizeComparisonRect(value, label) {
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

export function normalizeComparison(value, label, designType) {
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
    const isStyle = property.startsWith('style.');
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
    if (isStyle && !expected.trim()) fail(`${itemLabel}.expected 计算样式期望值不能为空`);
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
      exact: isRect ? false : isStyle ? true : assertion.exact === true,
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

export function requireRepoRelativePath(value, label) {
  const raw = requireString(value, label);
  if (raw.includes('\\') || path.posix.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    fail(`${label}必须是使用正斜杠的仓库相对路径`);
  }
  if (raw.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail(`${label}不能包含空路径段、. 或 ..`);
  }
  return raw;
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value));
}
