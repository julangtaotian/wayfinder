import fs from 'node:fs';
import {
  fail,
  requireFiniteNumber,
  requireRepoRelativePath,
  requireString,
  requireStringArray,
} from './ui-review-report-contract.mjs';
import { deriveReviewFindings } from './ui-review-report-decision.mjs';

// 输入模块负责 PNG 元数据与审核数据的基础校验，不承担报告结论文本输出。
export function parsePngDimensions(filePath) {
  if (!fs.existsSync(filePath)) fail(`找不到页面截图：${filePath}`);
  const buffer = fs.readFileSync(filePath);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature) || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    fail('页面截图必须是有效的 PNG 文件。');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width <= 0 || height <= 0) fail('PNG 截图尺寸无效。');
  return { width, height };
}

function validateRect(rect, label, viewport) {
  if (!rect || typeof rect !== 'object' || Array.isArray(rect)) fail(`${label}缺少节点坐标。`);
  const normalized = {
    x: requireFiniteNumber(rect.x, `${label}.x`),
    y: requireFiniteNumber(rect.y, `${label}.y`),
    width: requireFiniteNumber(rect.width, `${label}.width`, 1),
    height: requireFiniteNumber(rect.height, `${label}.height`, 1),
  };
  if (normalized.x + normalized.width > viewport.width || normalized.y + normalized.height > viewport.height) {
    fail(`${label}超出截图对应的页面视口。`);
  }
  return normalized;
}

function validateCheckedNode(node, index, viewport) {
  const label = `checkedNodes[${index}]`;
  if (!node || typeof node !== 'object' || Array.isArray(node)) fail(`${label}必须是对象。`);
  const nodeText = typeof node.nodeText === 'string' ? node.nodeText.trim() : '';
  const nodeMeaning = typeof node.nodeMeaning === 'string' ? node.nodeMeaning.trim() : '';
  if (!nodeText && !nodeMeaning) fail(`${label}必须提供 nodeText 或 nodeMeaning。`);
  return {
    selector: requireString(node.selector, `${label}.selector`),
    componentPath: requireString(node.componentPath, `${label}.componentPath`),
    nodeText,
    nodeMeaning,
    rect: validateRect(node.rect, `${label}.rect`, viewport),
  };
}

function validateSourceTarget(sourceTarget, label) {
  if (!sourceTarget || typeof sourceTarget !== 'object' || Array.isArray(sourceTarget)) {
    fail(`${label}必须是对象。`);
  }
  return {
    file: requireRepoRelativePath(sourceTarget.file, `${label}.file`),
    anchor: requireString(sourceTarget.anchor, `${label}.anchor`),
    styleSource: requireString(sourceTarget.styleSource, `${label}.styleSource`),
  };
}

function validateVerification(verification, label) {
  if (!verification || typeof verification !== 'object' || Array.isArray(verification)) {
    fail(`${label}必须是对象。`);
  }
  return {
    workingDirectory: requireRepoRelativePath(verification.workingDirectory, `${label}.workingDirectory`),
    commands: requireStringArray(verification.commands, `${label}.commands`),
    page: requireString(verification.page, `${label}.page`),
    assertions: requireStringArray(verification.assertions, `${label}.assertions`),
  };
}

function validateFinding(finding, index, viewport, checkedSelectors) {
  const label = `findings[${index}]`;
  if (!finding || typeof finding !== 'object' || Array.isArray(finding)) fail(`${label}必须是对象。`);
  const id = requireString(finding.id, `${label}.id`);
  if (!/^UI-\d{3}$/u.test(id)) fail(`${label}.id 必须使用 UI-001 形式。`);
  const confidence = requireString(finding.confidence, `${label}.confidence`);
  if (!['high', 'medium', 'low'].includes(confidence)) fail(`${label}.confidence 只能是 high、medium 或 low。`);
  const selector = requireString(finding.selector, `${label}.selector`);
  if (!checkedSelectors.has(selector)) fail(`${label}.selector 未出现在实际检查节点中。`);
  const nodeText = typeof finding.nodeText === 'string' ? finding.nodeText.trim() : '';
  const nodeMeaning = typeof finding.nodeMeaning === 'string' ? finding.nodeMeaning.trim() : '';
  if (!nodeText && !nodeMeaning) fail(`${label}必须提供 nodeText 或 nodeMeaning。`);
  const differencePx = finding.differencePx === undefined
    ? null
    : requireFiniteNumber(finding.differencePx, `${label}.differencePx`);
  return {
    id,
    confidence,
    selector,
    componentPath: requireString(finding.componentPath, `${label}.componentPath`),
    nodeText,
    nodeMeaning,
    pagePosition: requireString(finding.pagePosition, `${label}.pagePosition`),
    rect: validateRect(finding.rect, `${label}.rect`, viewport),
    type: requireString(finding.type, `${label}.type`),
    label: requireString(finding.label, `${label}.label`).slice(0, 12),
    problem: requireString(finding.problem, `${label}.problem`),
    currentValue: requireString(finding.currentValue, `${label}.currentValue`),
    targetValue: requireString(finding.targetValue, `${label}.targetValue`),
    fix: requireString(finding.fix, `${label}.fix`),
    sourceTarget: validateSourceTarget(finding.sourceTarget, `${label}.sourceTarget`),
    changeScope: requireString(finding.changeScope, `${label}.changeScope`),
    forbiddenChanges: requireString(finding.forbiddenChanges, `${label}.forbiddenChanges`),
    suggestedPatch: requireString(finding.suggestedPatch, `${label}.suggestedPatch`),
    verification: validateVerification(finding.verification, `${label}.verification`),
    differencePx,
    exact: finding.exact === true,
  };
}

export function normalizeReviewInput(input, imageDimensions) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('验收输入必须是 JSON 对象。');
  const project = input.project;
  if (!project || typeof project !== 'object' || Array.isArray(project)) fail('缺少 project 项目信息。');
  const scope = Array.isArray(project.scope)
    ? project.scope.map((item, index) => requireString(item, `project.scope[${index}]`))
    : fail('project.scope 必须是非空数组。');
  if (scope.length === 0) fail('project.scope 至少要声明一项实际覆盖范围。');
  const viewport = input.viewport;
  if (!viewport || typeof viewport !== 'object' || Array.isArray(viewport)) fail('缺少 viewport 视口信息。');
  const normalizedViewport = {
    width: requireFiniteNumber(viewport.width, 'viewport.width', 1),
    height: requireFiniteNumber(viewport.height, 'viewport.height', 1),
    dpr: requireFiniteNumber(viewport.dpr, 'viewport.dpr', 0.1),
    scale: requireFiniteNumber(viewport.scale, 'viewport.scale', 1),
  };
  if (
    Math.round(normalizedViewport.width * normalizedViewport.dpr) !== imageDimensions.width
    || Math.round(normalizedViewport.height * normalizedViewport.dpr) !== imageDimensions.height
  ) {
    fail('页面视口与 PNG 实际像素尺寸不一致。');
  }

  if (!Array.isArray(input.checkedNodes) || input.checkedNodes.length === 0) {
    fail('checkedNodes 至少要包含一个真实检查节点。');
  }
  const checkedNodes = input.checkedNodes.map((node, index) => validateCheckedNode(node, index, normalizedViewport));
  const checkedSelectors = new Set();
  for (const node of checkedNodes) {
    if (checkedSelectors.has(node.selector)) fail(`实际检查节点选择器重复：${node.selector}`);
    checkedSelectors.add(node.selector);
  }

  if (!Array.isArray(input.findings)) fail('findings 必须是数组。');
  if (input.findings.length > 10) fail('单次验收问题不能超过 10 条。');
  const findings = input.findings.map((finding, index) => (
    validateFinding(finding, index, normalizedViewport, checkedSelectors)
  ));
  const findingIds = new Set();
  for (const finding of findings) {
    if (findingIds.has(finding.id)) fail(`问题编号重复：${finding.id}`);
    findingIds.add(finding.id);
  }
  const decision = deriveReviewFindings(findings);

  return {
    project: {
      name: requireString(project.name, 'project.name'),
      runtime: requireString(project.runtime, 'project.runtime'),
      page: requireString(project.page, 'project.page'),
      designBasis: requireString(project.designBasis, 'project.designBasis'),
      scope,
    },
    viewport: normalizedViewport,
    reviewedAt: requireString(input.reviewedAt, 'reviewedAt'),
    checkedNodes,
    findings: decision.findings,
    inputFindingCount: findings.length,
    filteredCount: decision.filteredCount,
    mergedCount: decision.mergedCount,
  };
}
