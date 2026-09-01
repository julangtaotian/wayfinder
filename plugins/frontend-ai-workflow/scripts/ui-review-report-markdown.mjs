import {
  escapeInlineCode,
  escapeMarkdown,
  fail,
  requireFiniteNumber,
  requireRepoRelativePath,
  requireString,
  requireStringArray,
} from './ui-review-report-contract.mjs';

// 文本模块只把已规范化的数据投影为稳定 Markdown，不参与文件发布。
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

export function createDeterministicReportContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('确定性验收报告缺少运行上下文。');
  const schemaVersion = requireFiniteNumber(value.schemaVersion, 'reportContext.schemaVersion', 1);
  if (!Number.isInteger(schemaVersion)) fail('reportContext.schemaVersion 必须是整数。');
  const baselineRunId = value.baselineRunId === null || value.baselineRunId === undefined
    ? null
    : requireString(value.baselineRunId, 'reportContext.baselineRunId');
  const evidencePaths = requireStringArray(value.evidencePaths, 'reportContext.evidencePaths')
    .map((item, index) => requireRepoRelativePath(item, `reportContext.evidencePaths[${index}]`));
  return {
    schemaVersion,
    runId: requireString(value.runId, 'reportContext.runId'),
    scenarioFingerprint: requireString(value.scenarioFingerprint, 'reportContext.scenarioFingerprint'),
    capture: requireString(value.capture, 'reportContext.capture'),
    baselineRunId,
    statePath: requireRepoRelativePath(value.statePath, 'reportContext.statePath'),
    evidencePaths,
    status: requireString(value.status, 'reportContext.status'),
    observationCount: requireFiniteNumber(value.observationCount, 'reportContext.observationCount'),
    findingCount: requireFiniteNumber(value.findingCount, 'reportContext.findingCount'),
  };
}

export function renderDeterministicAssessmentMarkdown({ context, scenario, assessment, runtime = '插件内置 Playwright' }) {
  const reportContext = createDeterministicReportContext(context);
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
    `- 状态 Schema：${escapeInlineCode(reportContext.schemaVersion)}`,
    `- 运行 ID：${escapeInlineCode(reportContext.runId)}`,
    `- 场景指纹：${escapeInlineCode(reportContext.scenarioFingerprint)}`,
    `- 采集器：${escapeInlineCode(reportContext.capture)}`,
    `- 基线运行 ID：${escapeInlineCode(reportContext.baselineRunId || '无')}`,
    `- 状态文件：${escapeInlineCode(reportContext.statePath)}`,
    `- 场景：${escapeInlineCode(scenario.id || 'unknown')}`,
    `- 页面：${escapeInlineCode(scenario.url)}`,
    `- 运行时：${escapeInlineCode(runtime)}`,
    `- 验收范围：${escapeInlineCode(scope)}`,
    `- 比较模式：${escapeInlineCode(scenario.comparison?.mode || '未声明')}`,
    `- 结果：${conclusion}`,
    `- 观察数：${escapeInlineCode((assessment.observations || []).length)}`,
    `- 问题数：${escapeInlineCode((assessment.findings || []).length)}`,
    '',
    '## 运行证据',
    '',
    `- 状态摘要：${escapeInlineCode(`${reportContext.status}；观察 ${reportContext.observationCount}；问题 ${reportContext.findingCount}`)}`,
    ...reportContext.evidencePaths.map((item) => `- ${escapeInlineCode(item)}`),
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
