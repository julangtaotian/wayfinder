import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pixelmatch from '../runtime/playwright/node_modules/pixelmatch/index.js';

const require = createRequire(import.meta.url);
const { PNG } = require('../runtime/playwright/node_modules/pngjs');
const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const comparisonRuntimeRoot = path.resolve(scriptRoot, '..', 'runtime', 'playwright', 'node_modules');
const EXPECTED_DEPENDENCIES = { pixelmatch: '7.1.0', pngjs: '7.0.0' };

function fail(message) {
  throw new Error(message);
}

function readManifest(name) {
  const manifestPath = path.join(comparisonRuntimeRoot, name, 'package.json');
  if (!fs.existsSync(manifestPath)) fail(`插件内置图片比较依赖缺失：${name}`);
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

export function inspectComparisonRuntime() {
  try {
    for (const [name, expectedVersion] of Object.entries(EXPECTED_DEPENDENCIES)) {
      const manifest = readManifest(name);
      if (manifest.version !== expectedVersion) fail(`图片比较依赖 ${name} 版本不一致：期望 ${expectedVersion}，实际 ${manifest.version}`);
      const licensePath = path.join(comparisonRuntimeRoot, name, 'LICENSE');
      if (!fs.existsSync(licensePath)) fail(`图片比较依赖 ${name} 缺少许可文件`);
    }
    return { ok: true, dependencies: { ...EXPECTED_DEPENDENCIES } };
  } catch (error) {
    return { ok: false, reason: error.message, dependencies: { ...EXPECTED_DEPENDENCIES } };
  }
}

function readPng(filePath, label) {
  if (!fs.existsSync(filePath)) fail(`${label}不存在：${filePath}`);
  try {
    return PNG.sync.read(fs.readFileSync(filePath));
  } catch (error) {
    fail(`${label}不是可解码的 PNG：${error.message}`);
  }
}

function rectInside(rect, image) {
  return rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= image.width && rect.y + rect.height <= image.height;
}

function pointInRect(x, y, rect) {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
}

function domKey(value) {
  return `${value.selector}\u0000${value.property}`;
}

function isRectProperty(property) {
  return typeof property === 'string' && property.startsWith('rect.');
}

function compareDom(assertions, actualObservations) {
  const actualByKey = new Map((actualObservations || []).map((observation) => [domKey(observation), observation]));
  const observations = [];
  const findings = [];
  let inconclusive = false;
  for (const [index, assertion] of assertions.entries()) {
    const actual = actualByKey.get(domKey(assertion));
    if (!actual || actual.error) {
      inconclusive = true;
      observations.push({
        id: `DOM-${String(index + 1).padStart(3, '0')}`,
        kind: 'dom',
        status: 'inconclusive',
        confidence: 'medium',
        selector: assertion.selector,
        detail: actual?.error || '缺少 DOM 观察结果',
        evidence: { property: assertion.property, expected: assertion.expected },
      });
      continue;
    }
    const geometry = isRectProperty(assertion.property);
    const expected = geometry && assertion.relativeTo ? actual.referenceActual : assertion.expected;
    if (geometry && (!Number.isFinite(actual.actual) || !Number.isFinite(expected))) {
      inconclusive = true;
      observations.push({
        id: `DOM-${String(index + 1).padStart(3, '0')}`,
        kind: 'geometry',
        status: 'inconclusive',
        confidence: 'medium',
        selector: assertion.selector,
        detail: assertion.relativeTo ? '缺少当前节点或参考节点的有效几何结果' : '缺少有效几何结果',
        evidence: { property: assertion.property, expected: assertion.expected, relativeTo: assertion.relativeTo },
      });
      continue;
    }
    const tolerance = geometry ? assertion.tolerance || 0 : null;
    const difference = geometry ? Math.abs(actual.actual - expected) : null;
    const matched = geometry
      ? difference <= tolerance
      : typeof assertion.expected === 'string' && assertion.exact !== true
        ? String(actual.actual).includes(assertion.expected)
        : actual.actual === assertion.expected;
    observations.push({
      id: `DOM-${String(index + 1).padStart(3, '0')}`,
      kind: geometry ? 'geometry' : 'dom',
      status: matched ? 'matched' : 'different',
      confidence: 'high',
      selector: assertion.selector,
      detail: geometry
        ? `${assertion.property}：实际 ${String(actual.actual)}，目标 ${String(expected)}，差值 ${difference.toFixed(3)}，容差 ${tolerance}`
        : `${assertion.property}：实际 ${String(actual.actual)}，期望 ${String(assertion.expected)}`,
      evidence: geometry
        ? { property: assertion.property, actual: actual.actual, expected, tolerance, difference, relativeTo: assertion.relativeTo }
        : { property: assertion.property, actual: actual.actual, expected: assertion.expected, exact: assertion.exact },
    });
    if (!matched) {
      findings.push({
        id: `UI-${String(findings.length + 1).padStart(3, '0')}`,
        confidence: 'high',
        selector: assertion.selector,
        type: geometry ? '几何断言差异' : 'DOM 断言差异',
        targetValue: geometry
          ? assertion.relativeTo
            ? `${assertion.property}≈${assertion.relativeTo.selector}.${assertion.relativeTo.property}±${String(tolerance)}`
            : `${assertion.property}=${String(expected)}±${String(tolerance)}`
          : `${assertion.property}=${String(assertion.expected)}`,
        repairable: false,
        evidence: geometry
          ? { property: assertion.property, actual: actual.actual, expected, tolerance, difference, relativeTo: assertion.relativeTo }
          : { property: assertion.property, actual: actual.actual, expected: assertion.expected },
      });
    }
  }
  return { observations, findings, inconclusive };
}

function compareImage(imageConfig, actualPath, expectedPath, diffPath) {
  const actual = readPng(actualPath, '实际截图');
  const expected = readPng(expectedPath, '设计截图');
  const diff = new PNG({ width: actual.width, height: actual.height });
  diff.data.fill(0);
  const observations = [];
  const findings = [];
  let inconclusive = false;
  let totalDiffPixels = 0;
  let totalComparedPixels = 0;

  for (const [index, region] of imageConfig.regions.entries()) {
    if (!rectInside(region.actual, actual) || !rectInside(region.expected, expected)) {
      inconclusive = true;
      observations.push({
        id: `IMG-${String(index + 1).padStart(3, '0')}`,
        kind: 'image',
        status: 'inconclusive',
        confidence: 'medium',
        selector: null,
        detail: `区域 ${region.name} 越出实际截图或设计截图`,
        evidence: { region },
      });
      continue;
    }
    if (region.actual.width !== region.expected.width || region.actual.height !== region.expected.height) {
      inconclusive = true;
      observations.push({
        id: `IMG-${String(index + 1).padStart(3, '0')}`,
        kind: 'image',
        status: 'inconclusive',
        confidence: 'medium',
        selector: null,
        detail: `区域 ${region.name} 的实际与设计尺寸无法对齐`,
        evidence: { actual: region.actual, expected: region.expected },
      });
      continue;
    }

    const width = region.actual.width;
    const height = region.actual.height;
    const actualRegion = Buffer.alloc(width * height * 4);
    const expectedRegion = Buffer.alloc(width * height * 4);
    const diffRegion = Buffer.alloc(width * height * 4);
    let comparedPixels = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const actualX = region.actual.x + x;
        const actualY = region.actual.y + y;
        const expectedX = region.expected.x + x;
        const expectedY = region.expected.y + y;
        const localOffset = (y * width + x) * 4;
        const actualOffset = (actualY * actual.width + actualX) * 4;
        const expectedOffset = (expectedY * expected.width + expectedX) * 4;
        actual.data.copy(actualRegion, localOffset, actualOffset, actualOffset + 4);
        expected.data.copy(expectedRegion, localOffset, expectedOffset, expectedOffset + 4);
        const masked = imageConfig.masks.some((mask) => (
          pointInRect(actualX, actualY, mask.actual) || pointInRect(expectedX, expectedY, mask.expected)
        ));
        if (masked) expectedRegion.copy(actualRegion, localOffset, localOffset, localOffset + 4);
        else comparedPixels += 1;
      }
    }
    const diffPixels = pixelmatch(actualRegion, expectedRegion, diffRegion, width, height, {
      threshold: imageConfig.thresholds.colorThreshold,
      includeAA: false,
    });
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const localOffset = (y * width + x) * 4;
        const actualOffset = ((region.actual.y + y) * actual.width + region.actual.x + x) * 4;
        diffRegion.copy(diff.data, actualOffset, localOffset, localOffset + 4);
      }
    }
    const diffRatio = comparedPixels === 0 ? 0 : diffPixels / comparedPixels;
    const matched = diffPixels <= imageConfig.thresholds.maxDiffPixels
      && diffRatio <= imageConfig.thresholds.maxDiffRatio;
    totalDiffPixels += diffPixels;
    totalComparedPixels += comparedPixels;
    observations.push({
      id: `IMG-${String(index + 1).padStart(3, '0')}`,
      kind: 'image',
      status: matched ? 'matched' : 'different',
      confidence: 'high',
      selector: null,
      detail: `区域 ${region.name} 差异 ${diffPixels} 像素（${diffRatio.toFixed(6)}）`,
      evidence: { region: region.name, diffPixels, comparedPixels, diffRatio },
    });
    if (!matched) {
      findings.push({
        id: `UI-${String(findings.length + 1).padStart(3, '0')}`,
        confidence: 'high',
        selector: `[image-region="${region.name}"]`,
        type: '像素差异',
        targetValue: `区域 ${region.name} 满足像素阈值`,
        repairable: false,
        evidence: { region: region.name, diffPixels, comparedPixels, diffRatio },
      });
    }
  }
  fs.mkdirSync(path.dirname(diffPath), { recursive: true });
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  return {
    observations,
    findings,
    inconclusive,
    metrics: {
      diffPixels: totalDiffPixels,
      comparedPixels: totalComparedPixels,
      diffRatio: totalComparedPixels === 0 ? 0 : totalDiffPixels / totalComparedPixels,
    },
  };
}

export function compareUiEvidence({ scenario, actualScreenshot, expectedScreenshot, domObservations = [], diffPath }) {
  const runtime = inspectComparisonRuntime();
  if (!runtime.ok) fail(runtime.reason);
  const comparison = scenario?.comparison;
  if (!comparison) return { outcome: 'inconclusive', analysisPending: true, observations: [], findings: [], reason: '场景未声明确定性比较规则' };
  const scope = comparison.scope || 'structure';
  const visualEvidenceDeclared = comparison.visualEvidenceDeclared === true
    || Boolean(comparison.image)
    || (comparison.dom || []).some((assertion) => assertion.property?.startsWith('style.') || isRectProperty(assertion.property));
  const visualEvidenceMissing = scope === 'visual' && !visualEvidenceDeclared;
  const dom = ['dom', 'hybrid'].includes(comparison.mode)
    ? compareDom(comparison.dom, domObservations)
    : { observations: [], findings: [], inconclusive: false };
  const image = ['image', 'hybrid'].includes(comparison.mode)
    ? compareImage(comparison.image, actualScreenshot, expectedScreenshot, diffPath)
    : { observations: [], findings: [], inconclusive: false, metrics: null };
  const observations = [...dom.observations, ...image.observations];
  if (visualEvidenceMissing) {
    observations.unshift({
      id: 'VIS-001',
      kind: 'scope',
      status: 'inconclusive',
      confidence: 'high',
      selector: null,
      detail: '视觉范围只声明了文本、显隐、值或 URL，缺少样式、几何或图片区域证据',
      evidence: { scope, visualEvidenceDeclared: false },
    });
  }
  const findings = [...dom.findings, ...image.findings].map((finding, index) => ({
    ...finding,
    id: `UI-${String(index + 1).padStart(3, '0')}`,
  }));
  const inconclusive = visualEvidenceMissing || dom.inconclusive || image.inconclusive;
  return {
    outcome: inconclusive ? 'inconclusive' : findings.length > 0 ? 'needs-fix' : 'passed',
    analysisPending: false,
    scope,
    observations,
    findings,
    metrics: image.metrics,
    diffPath: ['image', 'hybrid'].includes(comparison.mode) ? diffPath : null,
  };
}
