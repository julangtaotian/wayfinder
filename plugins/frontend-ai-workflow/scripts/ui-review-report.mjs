import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const specRoot = path.resolve(toolRoot, '..');
const defaultOutputRoot = path.join(specRoot, 'ai-ui-review');
const deliverableNames = new Set(['ui-review.png', 'ui-review.md']);
const geometryTypes = new Set(['尺寸', '间距', '边距', '位置']);

function fail(message) {
  throw new Error(message);
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label}不能为空。`);
  return value.trim();
}

function requireFiniteNumber(value, label, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum) fail(`${label}必须是不小于 ${minimum} 的有限数字。`);
  return value;
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) fail(`${label}必须是非空字符串数组。`);
  return value.map((item, index) => requireString(item, `${label}[${index}]`));
}

function requireRepoRelativePath(value, label) {
  const raw = requireString(value, label);
  if (raw.includes('\\') || path.posix.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    fail(`${label}必须是使用正斜杠的仓库相对路径。`);
  }
  const segments = raw.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    fail(`${label}不能包含空路径段、. 或 ..。`);
  }
  return segments.join('/');
}

function escapeInlineCode(value) {
  const text = String(value).replaceAll('\r', ' ').replaceAll('\n', ' ');
  return text.includes('`') ? `\`\`${text}\`\`` : `\`${text}\``;
}

function escapeMarkdown(value) {
  return String(value).replaceAll('\r', ' ').replaceAll('\n', ' ').replaceAll('|', '\\|');
}

function unionRect(left, right) {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const farX = Math.max(left.x + left.width, right.x + right.width);
  const farY = Math.max(left.y + left.height, right.y + right.height);
  return { x, y, width: farX - x, height: farY - y };
}

function mergeText(current, next) {
  const values = [...new Set([current, next].filter(Boolean))];
  return values.join('；');
}

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

function repairContextSignature(finding) {
  return JSON.stringify({
    sourceTarget: finding.sourceTarget,
    changeScope: finding.changeScope,
    forbiddenChanges: finding.forbiddenChanges,
    suggestedPatch: finding.suggestedPatch,
    verification: finding.verification,
  });
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

  const deliverableCandidates = findings.filter((finding) => {
    if (finding.confidence !== 'high') return false;
    return !(
      geometryTypes.has(finding.type)
      && finding.differencePx !== null
      && finding.differencePx < 2
      && !finding.exact
    );
  });
  const mergedBySelector = new Map();
  for (const finding of deliverableCandidates) {
    const current = mergedBySelector.get(finding.selector);
    if (!current) {
      mergedBySelector.set(finding.selector, { ...finding, sourceIds: [finding.id] });
      continue;
    }
    if (repairContextSignature(current) !== repairContextSignature(finding)) {
      fail(`同一节点的源码修复指导不一致：${finding.selector}`);
    }
    current.sourceIds.push(finding.id);
    current.rect = unionRect(current.rect, finding.rect);
    for (const key of ['type', 'label', 'problem', 'currentValue', 'targetValue', 'fix']) {
      current[key] = mergeText(current[key], finding[key]);
    }
  }
  const normalizedFindings = [...mergedBySelector.values()].map((finding, index) => ({
    ...finding,
    id: `UI-${String(index + 1).padStart(3, '0')}`,
    label: finding.label.slice(0, 12),
  }));

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
    findings: normalizedFindings,
    inputFindingCount: findings.length,
    filteredCount: findings.length - deliverableCandidates.length,
    mergedCount: deliverableCandidates.length - normalizedFindings.length,
  };
}

export function renderReviewMarkdown(review) {
  const conclusion = review.findings.length === 0
    ? '通过：本次声明范围内未发现高置信度视觉差异。'
    : `需修改：发现 ${review.findings.length} 个高置信度节点问题。`;
  const lines = [
    '# AI UI 验收结果',
    '',
    `- 项目：${escapeInlineCode(review.project.name)}`,
    `- 运行时：${escapeInlineCode(review.project.runtime)}`,
    `- 页面：${escapeInlineCode(review.project.page)}`,
    `- 视口：${escapeInlineCode(`${review.viewport.width} × ${review.viewport.height}`)}，DPR ${escapeInlineCode(review.viewport.dpr)}，缩放 ${escapeInlineCode(`${review.viewport.scale}%`)}`,
    `- 设计依据：${escapeInlineCode(review.project.designBasis)}`,
    `- 验收时间：${escapeInlineCode(review.reviewedAt)}`,
    `- 结果：${conclusion}`,
    `- 交付问题：${escapeInlineCode(review.findings.length)}；已过滤：${escapeInlineCode(review.filteredCount)}；已合并：${escapeInlineCode(review.mergedCount)}`,
    '',
    '## 本次覆盖范围',
    '',
    ...review.project.scope.map((item) => `- ${escapeMarkdown(item)}`),
    '',
    '## 已检查节点',
    '',
    ...review.checkedNodes.map((node) => {
      const meaning = node.nodeText || node.nodeMeaning;
      return `- ${escapeInlineCode(node.selector)}｜${escapeMarkdown(node.componentPath)}｜${escapeMarkdown(meaning)}｜${escapeInlineCode(`${node.rect.x}, ${node.rect.y}, ${node.rect.width} × ${node.rect.height}`)}`;
    }),
    '',
  ];

  if (review.findings.length === 0) {
    lines.push(
      '## 验收结论',
      '',
      'AI 已检查上述页面、视口和节点，未发现达到交付阈值的高置信度差异。该结论不代表未检查的页面、交互状态或其他视口也已通过。',
      '',
    );
  } else {
    lines.push('## 问题清单', '');
    for (const finding of review.findings) {
      const nodeMeaning = finding.nodeText || finding.nodeMeaning;
      lines.push(
        `### ${finding.id}：${escapeMarkdown(finding.label)}`,
        '',
        `- 节点：${escapeInlineCode(finding.selector)}`,
        `- 组件路径：${escapeInlineCode(finding.componentPath)}`,
        `- 节点文本或语义：${escapeInlineCode(nodeMeaning)}`,
        `- 页面位置：${escapeMarkdown(finding.pagePosition)}`,
        `- 截图坐标：${escapeInlineCode(`${finding.rect.x}, ${finding.rect.y}, ${finding.rect.width} × ${finding.rect.height}`)}`,
        `- 问题类型：${escapeMarkdown(finding.type)}`,
        `- 问题：${escapeMarkdown(finding.problem)}`,
        `- 当前值：${escapeInlineCode(finding.currentValue)}`,
        `- 目标值：${escapeInlineCode(finding.targetValue)}`,
        `- 修改要求：${escapeMarkdown(finding.fix)}`,
        '- 置信度：高',
        '',
        '#### 源码修复指导',
        '',
        `- 源码目标文件：${escapeInlineCode(finding.sourceTarget.file)}`,
        `- 稳定代码锚点：${escapeInlineCode(finding.sourceTarget.anchor)}`,
        `- 当前样式来源：${escapeMarkdown(finding.sourceTarget.styleSource)}`,
        `- 允许修改作用域：${escapeMarkdown(finding.changeScope)}`,
        `- 禁止修改范围：${escapeMarkdown(finding.forbiddenChanges)}`,
        `- 建议修改：${escapeInlineCode(finding.suggestedPatch)}`,
        '',
        '#### 修复后复验',
        '',
        `- 工作目录：${escapeInlineCode(finding.verification.workingDirectory)}`,
        `- 页面：${escapeInlineCode(finding.verification.page)}`,
        '- 命令：',
        ...finding.verification.commands.map((command) => `  - ${escapeInlineCode(command)}`),
        '- 通过断言：',
        ...finding.verification.assertions.map((assertion) => `  - ${escapeMarkdown(assertion)}`),
        '',
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

export function renderDeterministicAssessmentMarkdown({ scenario, assessment, runtime = '插件内置 Playwright' }) {
  if (!scenario || typeof scenario !== 'object') fail('确定性验收报告缺少场景信息。');
  if (!assessment || typeof assessment !== 'object') fail('确定性验收报告缺少比较结果。');
  const scope = scenario.comparison?.scope || assessment.scope || 'structure';
  const conclusion = {
    passed: scope === 'visual'
      ? '通过：已声明的样式、几何或图片证据均满足阈值。'
      : '通过：已声明的结构与交互断言满足；该结论不代表视觉还原通过。',
    'needs-fix': '需修改：已发现超过阈值的确定性差异。',
    inconclusive: '不确定：证据缺失、损坏或无法对齐，不能判定为通过。',
  }[assessment.outcome] || '阻塞：比较结果状态不受支持。';
  const lines = [
    '# UI 确定性验收结果',
    '',
    `- 场景：${escapeInlineCode(scenario.id || 'unknown')}`,
    `- 页面：${escapeInlineCode(scenario.url)}`,
    `- 运行时：${escapeInlineCode(runtime)}`,
    `- 验收范围：${escapeInlineCode(scope)}`,
    `- 比较模式：${escapeInlineCode(scenario.comparison?.mode || '未声明')}`,
    `- 结果：${conclusion}`,
    `- 观察数：${escapeInlineCode((assessment.observations || []).length)}`,
    `- 问题数：${escapeInlineCode((assessment.findings || []).length)}`,
    '',
    '## 确定性观察',
    '',
  ];
  if ((assessment.observations || []).length === 0) lines.push('- 无可用观察。', '');
  else {
    for (const observation of assessment.observations) {
      lines.push(`- ${escapeInlineCode(observation.id)}｜${escapeMarkdown(observation.kind)}｜${escapeMarkdown(observation.status)}｜${escapeMarkdown(observation.detail || '')}`);
    }
    lines.push('');
  }
  lines.push('## 问题与修复边界', '');
  if ((assessment.findings || []).length === 0) lines.push('- 未发现超过阈值的问题。', '');
  else {
    for (const finding of assessment.findings) {
      lines.push(
        `- ${escapeInlineCode(finding.id)}｜${escapeInlineCode(finding.selector)}｜${escapeMarkdown(finding.type)}｜${escapeMarkdown(finding.repairable === false ? '仅报告，缺少完整源码上下文，不能自动修复' : '可进入受控修复门禁')}`,
      );
    }
    lines.push('');
  }
  if (assessment.outcome === 'inconclusive') {
    lines.push(
      '## 视觉兜底',
      '',
      assessment.fallbackRequired
        ? '- 配置已声明视觉兜底，可交给当前 AI 工具的视觉能力继续分析；不得把兜底待处理写成通过。'
        : '- 配置未声明视觉兜底，本次保持不确定并阻止通过。',
      '',
    );
  }
  return `${lines.join('\n')}\n`;
}

function resolveExecutable(preferred, candidates) {
  for (const candidate of [preferred, ...candidates].filter(Boolean)) {
    const result = spawnSync(candidate, ['-version'], { encoding: 'utf8' });
    if (result.status === 0) return candidate;
  }
  fail('找不到可用的 FFmpeg，无法生成标注截图。');
}

function resolveFont(preferred) {
  const candidates = [
    preferred,
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/STHeiti Medium.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  ].filter(Boolean);
  const font = candidates.find((candidate) => fs.existsSync(candidate));
  if (!font) fail('找不到可用的中文字体，无法生成标注截图。');
  return font;
}

function escapeFilterPath(filePath) {
  return filePath.replaceAll('\\', '\\\\').replaceAll(':', '\\:').replaceAll("'", "\\'");
}

function buildDrawFilters(review, stageRoot, fontPath) {
  const dpr = review.viewport.dpr;
  const filters = [];
  const texts = [];
  const addText = (text, name, options) => {
    const textPath = path.join(stageRoot, `.${name}.txt`);
    fs.writeFileSync(textPath, text, 'utf8');
    texts.push(textPath);
    filters.push(
      `drawtext=fontfile='${escapeFilterPath(fontPath)}':textfile='${escapeFilterPath(textPath)}':expansion=none:fontcolor=${options.color}:fontsize=${options.size}:x=${options.x}:y=${options.y}`,
    );
  };

  const passed = review.findings.length === 0;
  const bannerWidth = passed ? 260 : 330;
  const bannerX = Math.round(review.viewport.width * dpr) - bannerWidth - 20;
  filters.push(`drawbox=x=${bannerX}:y=20:w=${bannerWidth}:h=48:color=${passed ? '0x13A56B' : '0xD92D20'}@0.94:t=fill`);
  addText(
    passed ? 'AI 验收通过' : `AI 验收发现 ${review.findings.length} 个问题`,
    'banner',
    { color: 'white', size: 22, x: bannerX + 16, y: 31 },
  );

  review.findings.forEach((finding, index) => {
    const rect = {
      x: Math.round(finding.rect.x * dpr),
      y: Math.round(finding.rect.y * dpr),
      width: Math.round(finding.rect.width * dpr),
      height: Math.round(finding.rect.height * dpr),
    };
    const labelY = rect.y >= 58 ? rect.y - 34 : rect.y + 6;
    const labelWidth = Math.min(260, Math.max(112, 78 + [...finding.label].length * 18));
    filters.push(`drawbox=x=${rect.x}:y=${rect.y}:w=${rect.width}:h=${rect.height}:color=0xFF3B30@0.98:t=4`);
    filters.push(`drawbox=x=${rect.x}:y=${labelY}:w=${labelWidth}:h=30:color=0xFF3B30@0.96:t=fill`);
    addText(`${finding.id} ${finding.label}`, `finding-${index}`, {
      color: 'white',
      size: 17,
      x: rect.x + 8,
      y: labelY + 5,
    });
  });
  return { filter: filters.join(','), texts };
}

function assertSafeOutputDirectory(outputDir, allowedRoot) {
  const resolvedRoot = path.resolve(allowedRoot);
  const resolvedOutput = path.resolve(outputDir);
  const relative = path.relative(resolvedRoot, resolvedOutput);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('输出目录必须是 AI UI 验收根目录下的独立项目目录。');
  }
  if (fs.existsSync(resolvedOutput) && fs.lstatSync(resolvedOutput).isSymbolicLink()) {
    fail('输出目录不能是符号链接。');
  }
  if (fs.existsSync(resolvedOutput)) {
    const unexpected = fs.readdirSync(resolvedOutput).filter((name) => !deliverableNames.has(name));
    if (unexpected.length > 0) fail(`输出目录包含未知文件，已停止以避免覆盖：${unexpected.join('、')}`);
  }
  return resolvedOutput;
}

function swapOutputDirectory(stageRoot, outputDir) {
  const backup = `${outputDir}.backup-${process.pid}-${Date.now()}`;
  let movedExisting = false;
  try {
    if (fs.existsSync(outputDir)) {
      fs.renameSync(outputDir, backup);
      movedExisting = true;
    }
    fs.renameSync(stageRoot, outputDir);
    if (movedExisting) fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });
    if (movedExisting && fs.existsSync(backup)) fs.renameSync(backup, outputDir);
    throw error;
  }
}

export function generateUiReview({
  screenshotPath,
  input,
  outputDir,
  allowedOutputRoot = defaultOutputRoot,
  ffmpegPath,
  fontPath,
}) {
  const dimensions = parsePngDimensions(screenshotPath);
  const review = normalizeReviewInput(input, dimensions);
  const safeOutputDir = assertSafeOutputDirectory(outputDir, allowedOutputRoot);
  const outputParent = path.dirname(safeOutputDir);
  fs.mkdirSync(outputParent, { recursive: true });
  const stageRoot = fs.mkdtempSync(path.join(outputParent, `.${path.basename(safeOutputDir)}-staging-`));
  try {
    const binary = resolveExecutable(ffmpegPath, ['/opt/homebrew/bin/ffmpeg', 'ffmpeg']);
    const font = resolveFont(fontPath);
    const pngPath = path.join(stageRoot, 'ui-review.png');
    const markdownPath = path.join(stageRoot, 'ui-review.md');
    const drawing = buildDrawFilters(review, stageRoot, font);
    const result = spawnSync(
      binary,
      ['-hide_banner', '-loglevel', 'error', '-y', '-i', screenshotPath, '-vf', drawing.filter, '-frames:v', '1', pngPath],
      { encoding: 'utf8' },
    );
    for (const textPath of drawing.texts) fs.rmSync(textPath, { force: true });
    if (result.status !== 0 || !fs.existsSync(pngPath)) {
      fail(`标注截图生成失败：${(result.stderr || result.stdout || '未知错误').trim()}`);
    }
    fs.writeFileSync(markdownPath, renderReviewMarkdown(review), 'utf8');
    swapOutputDirectory(stageRoot, safeOutputDir);
    return {
      outputDir: safeOutputDir,
      pngPath: path.join(safeOutputDir, 'ui-review.png'),
      markdownPath: path.join(safeOutputDir, 'ui-review.md'),
      findingCount: review.findings.length,
      filteredCount: review.filteredCount,
      mergedCount: review.mergedCount,
    };
  } catch (error) {
    if (fs.existsSync(stageRoot)) fs.rmSync(stageRoot, { recursive: true, force: true });
    throw error;
  }
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) fail('参数必须使用 --name value 形式。');
    options[key.slice(2)] = value;
  }
  return {
    screenshotPath: requireString(options.screenshot, '--screenshot'),
    dataPath: requireString(options.data, '--data'),
    outputDir: requireString(options.output, '--output'),
  };
}

async function readJsonInput(dataPath) {
  const text = dataPath === '-'
    ? await new Promise((resolve, reject) => {
        let content = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => { content += chunk; });
        process.stdin.on('end', () => resolve(content));
        process.stdin.on('error', reject);
      })
    : fs.readFileSync(dataPath, 'utf8');
  try {
    return JSON.parse(text);
  } catch {
    fail('验收输入不是有效 JSON。');
  }
}

export async function runUiReviewReportCli(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  const input = await readJsonInput(args.dataPath);
  const result = generateUiReview({
    screenshotPath: args.screenshotPath,
    input,
    outputDir: args.outputDir,
    // CLI 的输出目录本身是本次运行的独立 report 子目录，父目录作为唯一允许根。
    allowedOutputRoot: path.dirname(path.resolve(args.outputDir)),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runUiReviewReportCli().catch((error) => {
    process.stderr.write(`AI UI 验收生成失败：${error.message}\n`);
    process.exitCode = 1;
  });
}
