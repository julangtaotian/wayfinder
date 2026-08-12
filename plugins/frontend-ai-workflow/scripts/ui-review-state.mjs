import {
  UI_REVIEW_STATE_VERSION,
  CAPTURE_METHODS,
  RUN_STAGES,
  RUN_STATUSES,
  fail,
  requireObject,
  requireString,
  optionalString,
  normalizeStringArray,
  requireRepoRelativePath,
  sha256,
  stableValue,
  stableJson,
} from './ui-review-contract.mjs';
import {
  requireRunId,
  requireIsoDate,
  scenarioById,
  buildArtifactPaths,
} from './ui-review-plan.mjs';

// 状态层集中维护 review、repair、verify 的迁移与问题身份规则。
export function normalizeVerification(value, label) {
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

export function repairableFindingFingerprint(finding) {
  return sha256(stableJson({
    selector: finding.selector,
    type: finding.type,
    targetValue: finding.targetValue,
    sourceFile: finding.sourceTarget.file,
    anchor: finding.sourceTarget.anchor,
  }));
}

export function nonRepairableFindingFingerprint(finding) {
  return sha256(stableJson({
    selector: finding.selector,
    type: finding.type,
    targetValue: finding.targetValue,
  }));
}

// 历史基线可能保存过包含观测值的旧指纹，复验时按问题身份重新计算。
export function verificationFindingFingerprint(finding) {
  if (finding.repairable === false) return nonRepairableFindingFingerprint(finding);
  if (finding.sourceTarget) return repairableFindingFingerprint(finding);
  return finding.fingerprint;
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
  return { ...normalized, repairable: true, fingerprint: repairableFindingFingerprint(normalized) };
}

export function normalizeObservation(value, index, fallbackStatus = 'observed') {
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

export function normalizeNonRepairableFinding(value, index) {
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
    fingerprint: nonRepairableFindingFingerprint(normalized),
  };
}

export function normalizeAssessment(result) {
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

export function assertState(value, expectedStage, expectedStatus) {
  const state = requireObject(value, '运行状态');
  if (![1, UI_REVIEW_STATE_VERSION].includes(state.schemaVersion)) fail(`运行状态版本不受支持：${String(state.schemaVersion)}`);
  requireRunId(state.runId, '运行状态 runId');
  if (!RUN_STAGES.has(state.stage) || !RUN_STATUSES.has(state.status)) fail('运行状态包含未知阶段或状态');
  if (!CAPTURE_METHODS.has(state.capture)) fail('运行状态包含未知采集器');
  if (expectedStage && state.stage !== expectedStage) fail(`当前阶段必须是 ${expectedStage}，实际为 ${state.stage}`);
  if (expectedStatus && state.status !== expectedStatus) fail(`当前状态必须是 ${expectedStatus}，实际为 ${state.status}`);
  return state;
}

export function assertMutableState(value, expectedStage, expectedStatus) {
  const state = assertState(value, expectedStage, expectedStatus);
  if (state.schemaVersion === 1) fail('运行状态版本 1 仅供历史只读，不能原地改写');
  return state;
}

export function normalizeArtifactEvidence(artifacts) {
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

export function validateRepairContext(findings) {
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
  const baselineMap = new Map((baseline.findings || []).map((finding) => [verificationFindingFingerprint(finding), finding]));
  const currentMap = new Map(findings.map((finding) => [verificationFindingFingerprint(finding), finding]));
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
