import { fail } from './ui-review-report-contract.mjs';

// 只处理已通过输入校验的问题筛选与合并，保持报告结论的确定性。
const geometryTypes = new Set(['尺寸', '间距', '边距', '位置']);

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

function repairContextSignature(finding) {
  return JSON.stringify({
    sourceTarget: finding.sourceTarget,
    changeScope: finding.changeScope,
    forbiddenChanges: finding.forbiddenChanges,
    suggestedPatch: finding.suggestedPatch,
    verification: finding.verification,
  });
}

export function deriveReviewFindings(findings) {
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
    findings: normalizedFindings,
    filteredCount: findings.length - deliverableCandidates.length,
    mergedCount: deliverableCandidates.length - normalizedFindings.length,
  };
}
