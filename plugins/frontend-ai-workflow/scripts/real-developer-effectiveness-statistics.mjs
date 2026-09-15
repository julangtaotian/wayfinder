import path from 'node:path';

const REVISION_PATTERN = /^[a-f0-9]{40}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const STUDY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,79}$/iu;
const PROJECT_ID_PATTERN = /^P[1-9][0-9]*$/u;
const PARTICIPANT_ID_PATTERN = /^U[1-9][0-9]*$/u;
const PAIR_ID_PATTERN = /^PAIR-[A-Z0-9][A-Z0-9-]{0,31}$/u;
const SAFE_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/u;
const REASONING_LEVELS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const ORDERS = new Set(['plugin-first', 'baseline-first']);
const MAX_PROJECTS = 100;
const MAX_PAIRS = 200;

export const REAL_DEVELOPER_STUDY_KIND = 'real-developer-effectiveness-study';
export const REAL_DEVELOPER_EVIDENCE_KIND = 'real-developer-effectiveness-evidence';
export const REAL_DEVELOPER_EVIDENCE_GENERATOR = 'frontend-ai-workflow/real-developer-effectiveness-evidence';
export const REAL_DEVELOPER_EFFECT_STATUSES = Object.freeze([
  'inconclusive', 'no-demonstrated-improvement', 'regressed', 'demonstrated-improvement',
]);

export class RealDeveloperEffectivenessError extends Error {
  constructor(code, message, target = null) {
    super(message);
    this.name = 'RealDeveloperEffectivenessError';
    this.code = code;
    this.status = 'failed';
    this.target = target;
  }
}

function fail(code, message, target = null) {
  throw new RealDeveloperEffectivenessError(code, message, target);
}

function assertPlainObject(value, target) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('invalid_study_object', '真实效果研究字段必须是普通对象', target);
  }
}

function assertExactKeys(value, required, target) {
  assertPlainObject(value, target);
  const allowed = new Set(required);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) fail('study_unknown_field', '真实效果研究包含未声明字段', `${target}.${unknown}`);
  const missing = required.find((key) => !Object.hasOwn(value, key));
  if (missing) fail('study_field_missing', '真实效果研究缺少必填字段', `${target}.${missing}`);
}

function assertSafeInteger(value, target, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('invalid_study_integer', '真实效果研究数值必须是范围内安全整数', target);
  }
  return value;
}

function assertDigest(value, target, pattern = SHA256_PATTERN) {
  const normalized = String(value || '').toLowerCase();
  if (!pattern.test(normalized)) fail('invalid_study_digest', '真实效果研究摘要或提交格式无效', target);
  return normalized;
}

function assertNoSensitiveStrings(value, target = 'study') {
  // 研究文件只允许最小结构化事实，递归检查避免把身份、源码或凭据藏进嵌套字段。
  if (typeof value === 'string') {
    if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) {
      fail('study_absolute_path_forbidden', '真实效果研究不得包含绝对路径', target);
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) {
      fail('study_identity_forbidden', '真实效果研究不得包含电子邮箱等个人身份', target);
    }
    if (/(?:api[_-]?key|access[_-]?token|authorization|bearer\s|password|private[_-]?key|cookie)/iu.test(value)) {
      fail('study_secret_forbidden', '真实效果研究不得包含凭据或敏感字段', target);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveStrings(item, `${target}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      if (/(?:name|email|path|source|content|prompt|requirement|log|token|secret|password)/iu.test(key)
        && !['requirementDigest', 'tokenUsage', 'inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningOutputTokens', 'totalTokens'].includes(key)) {
        fail('study_sensitive_field_forbidden', '真实效果研究包含不允许的敏感字段名', `${target}.${key}`);
      }
      assertNoSensitiveStrings(item, `${target}.${key}`);
    });
  }
}

function parseIso(value, target) {
  if (typeof value !== 'string') fail('invalid_study_timestamp', '研究时间必须是 ISO 时间字符串', target);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    fail('invalid_study_timestamp', '研究时间必须是标准 UTC ISO 时间', target);
  }
  return timestamp;
}

function normalizeTokenUsage(value, target) {
  if (value === null) return null;
  const fields = [
    'turnCount', 'inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningOutputTokens', 'totalTokens',
  ];
  assertExactKeys(value, fields, target);
  const normalized = Object.fromEntries(fields.map((field) => [field, assertSafeInteger(value[field], `${target}.${field}`, {
    minimum: field === 'turnCount' ? 1 : 0,
  })]));
  if (normalized.totalTokens !== normalized.inputTokens + normalized.outputTokens
    || normalized.cachedInputTokens > normalized.inputTokens
    || normalized.reasoningOutputTokens > normalized.outputTokens) {
    fail('invalid_study_token_usage', 'Token 汇总不满足可复算关系', target);
  }
  return normalized;
}

function normalizeRun(value, target) {
  const fields = [
    'startedAt', 'firstDeliveredAt', 'endedAt', 'clarificationCount', 'reworkCount', 'blockerCount',
    'firstAcceptancePassed', 'finalAcceptancePassed', 'tokenUsage',
  ];
  assertExactKeys(value, fields, target);
  const startedAt = parseIso(value.startedAt, `${target}.startedAt`);
  const endedAt = parseIso(value.endedAt, `${target}.endedAt`);
  const firstDeliveredAt = value.firstDeliveredAt === null ? null : parseIso(value.firstDeliveredAt, `${target}.firstDeliveredAt`);
  if (endedAt <= startedAt || (firstDeliveredAt !== null && (firstDeliveredAt < startedAt || firstDeliveredAt > endedAt))) {
    fail('invalid_study_timeline', '研究时间顺序无效', target);
  }
  if (typeof value.firstAcceptancePassed !== 'boolean' || typeof value.finalAcceptancePassed !== 'boolean') {
    fail('invalid_study_acceptance', '验收状态必须是布尔值', target);
  }
  if ((value.firstAcceptancePassed || value.finalAcceptancePassed) && firstDeliveredAt === null) {
    fail('invalid_study_delivery', '已通过验收的运行必须记录首次交付时间', target);
  }
  if (value.firstAcceptancePassed && !value.finalAcceptancePassed) {
    fail('invalid_study_acceptance', '首次验收通过时最终验收不得失败', target);
  }
  return {
    totalCycleMs: endedAt - startedAt,
    firstDeliveryMs: firstDeliveredAt === null ? null : firstDeliveredAt - startedAt,
    clarificationCount: assertSafeInteger(value.clarificationCount, `${target}.clarificationCount`, { maximum: 100 }),
    reworkCount: assertSafeInteger(value.reworkCount, `${target}.reworkCount`, { maximum: 100 }),
    blockerCount: assertSafeInteger(value.blockerCount, `${target}.blockerCount`, { maximum: 100 }),
    firstAcceptancePassed: value.firstAcceptancePassed,
    finalAcceptancePassed: value.finalAcceptancePassed,
    tokenUsage: normalizeTokenUsage(value.tokenUsage, `${target}.tokenUsage`),
  };
}

function normalizeConditions(value, target) {
  const fields = ['model', 'reasoning', 'timeoutMinutes', 'workspaceIsolated', 'crossReadPrevented', 'acceptanceIndependent'];
  assertExactKeys(value, fields, target);
  if (!SAFE_MODEL_PATTERN.test(String(value.model || ''))) fail('invalid_study_model', '研究模型标识无效', `${target}.model`);
  if (!REASONING_LEVELS.has(value.reasoning)) fail('invalid_study_reasoning', '研究推理强度无效', `${target}.reasoning`);
  assertSafeInteger(value.timeoutMinutes, `${target}.timeoutMinutes`, { minimum: 1, maximum: 480 });
  for (const field of ['workspaceIsolated', 'crossReadPrevented', 'acceptanceIndependent']) {
    if (value[field] !== true) fail('study_pairing_not_independent', '真实配对必须证明工作区隔离、禁止互读和独立验收', `${target}.${field}`);
  }
  return { ...value };
}

function normalizePair(value, index, projectIds, seenPairIds) {
  const target = `pairs[${index}]`;
  const fields = [
    'id', 'projectId', 'participantId', 'taskDigest', 'projectCommit', 'requirementDigest', 'acceptanceDigest',
    'order', 'conditions', 'plugin', 'baseline',
  ];
  assertExactKeys(value, fields, target);
  if (!PAIR_ID_PATTERN.test(String(value.id || '')) || seenPairIds.has(value.id)) {
    fail('invalid_or_duplicate_study_pair', '研究配对标识无效或重复', `${target}.id`);
  }
  seenPairIds.add(value.id);
  if (!projectIds.has(value.projectId)) fail('study_pair_project_unknown', '研究配对引用未知项目', `${target}.projectId`);
  if (!PARTICIPANT_ID_PATTERN.test(String(value.participantId || ''))) {
    fail('invalid_study_participant_alias', '参与者必须使用 U* 匿名别名', `${target}.participantId`);
  }
  if (!ORDERS.has(value.order)) fail('invalid_study_order', '研究顺序必须是 plugin-first 或 baseline-first', `${target}.order`);
  return {
    id: value.id,
    projectId: value.projectId,
    participantId: value.participantId,
    taskDigest: assertDigest(value.taskDigest, `${target}.taskDigest`),
    projectCommit: assertDigest(value.projectCommit, `${target}.projectCommit`, REVISION_PATTERN),
    requirementDigest: assertDigest(value.requirementDigest, `${target}.requirementDigest`),
    acceptanceDigest: assertDigest(value.acceptanceDigest, `${target}.acceptanceDigest`),
    order: value.order,
    conditions: normalizeConditions(value.conditions, `${target}.conditions`),
    plugin: normalizeRun(value.plugin, `${target}.plugin`),
    baseline: normalizeRun(value.baseline, `${target}.baseline`),
  };
}

export function normalizeRealDeveloperStudy(value) {
  assertNoSensitiveStrings(value);
  assertExactKeys(value, ['schemaVersion', 'kind', 'studyId', 'revision', 'projects', 'pairs'], 'study');
  if (value.schemaVersion !== 1 || value.kind !== REAL_DEVELOPER_STUDY_KIND) {
    fail('invalid_study_schema', '真实效果研究必须使用 schemaVersion 1 和标准 kind', 'study');
  }
  if (!STUDY_ID_PATTERN.test(String(value.studyId || ''))) fail('invalid_study_id', '研究标识必须是安全别名', 'study.studyId');
  const revision = assertDigest(value.revision, 'study.revision', REVISION_PATTERN);
  if (!Array.isArray(value.projects) || value.projects.length < 1 || value.projects.length > MAX_PROJECTS) {
    fail('invalid_study_projects', '研究项目数量必须在 1 到 100 之间', 'study.projects');
  }
  const projectIds = new Set();
  const projects = value.projects.map((project, index) => {
    assertExactKeys(project, ['id'], `projects[${index}]`);
    if (!PROJECT_ID_PATTERN.test(String(project.id || '')) || projectIds.has(project.id)) {
      fail('invalid_or_duplicate_study_project', '研究项目必须使用唯一 P* 别名', `projects[${index}].id`);
    }
    projectIds.add(project.id);
    return { id: project.id };
  });
  if (!Array.isArray(value.pairs) || value.pairs.length < 1 || value.pairs.length > MAX_PAIRS) {
    fail('invalid_study_pairs', '研究配对数量必须在 1 到 200 之间', 'study.pairs');
  }
  const seenPairIds = new Set();
  const pairs = value.pairs.map((pair, index) => normalizePair(pair, index, projectIds, seenPairIds));
  const seenProjectTasks = new Set();
  pairs.forEach((pair, index) => {
    const key = `${pair.projectId}:${pair.taskDigest}`;
    if (seenProjectTasks.has(key)) fail('duplicate_study_task', '同一项目的冻结任务不得重复计入研究', `pairs[${index}].taskDigest`);
    seenProjectTasks.add(key);
  });
  const referenced = new Set(pairs.map((pair) => pair.projectId));
  if (projects.some((project) => !referenced.has(project.id))) {
    fail('study_project_unreferenced', '研究项目必须至少包含一个配对', 'study.projects');
  }
  return { schemaVersion: 1, kind: REAL_DEVELOPER_STUDY_KIND, studyId: value.studyId, revision, projects, pairs };
}

function round(value, digits = 6) {
  return value === null ? null : Number(value.toFixed(digits));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function binomialCoefficient(n, k) {
  const selected = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= selected; index += 1) result = (result * (n - selected + index)) / index;
  return result;
}

export function exactOneSidedSignPValue(improved, nonTie) {
  if (!Number.isSafeInteger(improved) || !Number.isSafeInteger(nonTie) || improved < 0 || nonTie < 1 || improved > nonTie) {
    fail('invalid_sign_test_input', '精确符号检验输入无效', 'primaryMetric');
  }
  // 在“插件没有更优”的零假设下，累计至少出现当前改善次数的二项分布右尾概率。
  let numerator = 0;
  for (let count = improved; count <= nonTie; count += 1) numerator += binomialCoefficient(nonTie, count);
  return round(numerator / (2 ** nonTie), 12);
}

function acceptanceRate(pairs, field, mode) {
  return round((pairs.filter((pair) => pair[mode][field]).length / pairs.length) * 100);
}

function tokenDelta(plugin, baseline) {
  if (!plugin || !baseline) return null;
  return Object.fromEntries([
    'turnCount', 'inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningOutputTokens', 'totalTokens',
  ].map((field) => [field, plugin[field] - baseline[field]]));
}

function statusCode(status) {
  return {
    inconclusive: 'real_developer_study_inconclusive',
    'no-demonstrated-improvement': 'real_developer_improvement_not_demonstrated',
    regressed: 'real_developer_quality_regressed',
    'demonstrated-improvement': 'real_developer_improvement_demonstrated',
  }[status];
}

export function analyzeRealDeveloperStudy(input) {
  const study = normalizeRealDeveloperStudy(input);
  const comparable = study.pairs.filter((pair) => pair.plugin.finalAcceptancePassed && pair.baseline.finalAcceptancePassed);
  const pairSummaries = study.pairs.map((pair) => {
    const comparableCycle = pair.plugin.finalAcceptancePassed && pair.baseline.finalAcceptancePassed;
    const comparableFirstDelivery = pair.plugin.firstDeliveryMs !== null && pair.baseline.firstDeliveryMs !== null;
    const improvementPercent = comparableCycle
      ? round(((pair.baseline.totalCycleMs - pair.plugin.totalCycleMs) / pair.baseline.totalCycleMs) * 100)
      : null;
    return {
      id: pair.id,
      projectId: pair.projectId,
      order: pair.order,
      totalCycleMs: {
        plugin: pair.plugin.totalCycleMs,
        baseline: pair.baseline.totalCycleMs,
        delta: comparableCycle ? pair.plugin.totalCycleMs - pair.baseline.totalCycleMs : null,
        improvementPercent,
      },
      firstDeliveryMs: {
        plugin: pair.plugin.firstDeliveryMs,
        baseline: pair.baseline.firstDeliveryMs,
        delta: comparableFirstDelivery ? pair.plugin.firstDeliveryMs - pair.baseline.firstDeliveryMs : null,
      },
      clarificationDelta: pair.plugin.clarificationCount - pair.baseline.clarificationCount,
      reworkDelta: pair.plugin.reworkCount - pair.baseline.reworkCount,
      blockerDelta: pair.plugin.blockerCount - pair.baseline.blockerCount,
      acceptance: {
        plugin: { first: pair.plugin.firstAcceptancePassed, final: pair.plugin.finalAcceptancePassed },
        baseline: { first: pair.baseline.firstAcceptancePassed, final: pair.baseline.finalAcceptancePassed },
      },
      tokenDelta: tokenDelta(pair.plugin.tokenUsage, pair.baseline.tokenUsage),
    };
  });
  const comparableSummaries = pairSummaries.filter((pair) => pair.totalCycleMs.improvementPercent !== null);
  const improvements = comparableSummaries.filter((pair) => pair.totalCycleMs.delta < 0).length;
  const regressions = comparableSummaries.filter((pair) => pair.totalCycleMs.delta > 0).length;
  const ties = comparableSummaries.length - improvements - regressions;
  const nonTie = improvements + regressions;
  const pValue = nonTie ? exactOneSidedSignPValue(improvements, nonTie) : null;
  const medianImprovementPercent = round(median(comparableSummaries.map((pair) => pair.totalCycleMs.improvementPercent)));
  const projectResults = study.projects.map((project) => {
    const allPairs = pairSummaries.filter((pair) => pair.projectId === project.id);
    const comparablePairs = allPairs.filter((pair) => pair.totalCycleMs.improvementPercent !== null);
    return {
      id: project.id,
      pairCount: allPairs.length,
      comparablePairCount: comparablePairs.length,
      medianImprovementPercent: round(median(comparablePairs.map((pair) => pair.totalCycleMs.improvementPercent))),
    };
  });
  const orderCounts = Object.fromEntries([...ORDERS].map((order) => [order, study.pairs.filter((pair) => pair.order === order).length]));
  const participantCount = new Set(study.pairs.map((pair) => pair.participantId)).size;
  const measurementReasons = [];
  if (study.projects.length < 3) measurementReasons.push('minimum-projects-not-met');
  if (participantCount < 3) measurementReasons.push('minimum-participants-not-met');
  if (study.pairs.length < 6) measurementReasons.push('minimum-pairs-not-met');
  if (projectResults.some((project) => project.comparablePairCount < 2)) measurementReasons.push('minimum-comparable-pairs-per-project-not-met');
  if (comparable.length < 6) measurementReasons.push('minimum-comparable-pairs-not-met');
  if (nonTie < 6) measurementReasons.push('minimum-non-tie-pairs-not-met');
  if (Object.values(orderCounts).some((count) => count < 1)) measurementReasons.push('counterbalanced-order-missing');

  const qualityReasons = [];
  const qualityGuardrails = {
    plugin: {
      firstAcceptanceRate: acceptanceRate(study.pairs, 'firstAcceptancePassed', 'plugin'),
      finalAcceptanceRate: acceptanceRate(study.pairs, 'finalAcceptancePassed', 'plugin'),
    },
    baseline: {
      firstAcceptanceRate: acceptanceRate(study.pairs, 'firstAcceptancePassed', 'baseline'),
      finalAcceptanceRate: acceptanceRate(study.pairs, 'finalAcceptancePassed', 'baseline'),
    },
    medianReworkDelta: round(median(pairSummaries.map((pair) => pair.reworkDelta))),
    status: 'passed',
    reasons: qualityReasons,
  };
  if (qualityGuardrails.plugin.finalAcceptanceRate < qualityGuardrails.baseline.finalAcceptanceRate) qualityReasons.push('final-acceptance-regressed');
  if (qualityGuardrails.plugin.firstAcceptanceRate < qualityGuardrails.baseline.firstAcceptanceRate) qualityReasons.push('first-acceptance-regressed');
  if (qualityGuardrails.medianReworkDelta > 0) qualityReasons.push('median-rework-regressed');
  if (projectResults.some((project) => project.medianImprovementPercent !== null && project.medianImprovementPercent < 0)) {
    qualityReasons.push('project-cycle-regressed');
  }
  if (qualityReasons.length) qualityGuardrails.status = 'failed';

  const primaryPassed = medianImprovementPercent !== null && medianImprovementPercent >= 10 && pValue !== null && pValue < 0.05;
  // 质量回退优先于证据不足，避免把已观测到的验收或返工下降弱化为中性结论。
  let status;
  if (qualityReasons.length) status = 'regressed';
  else if (measurementReasons.length) status = 'inconclusive';
  else if (primaryPassed) status = 'demonstrated-improvement';
  else status = 'no-demonstrated-improvement';
  const tokenPairs = pairSummaries.filter((pair) => pair.tokenDelta !== null);
  const firstDeliveryPairs = pairSummaries.filter((pair) => pair.firstDeliveryMs.delta !== null);
  const tokenFields = ['turnCount', 'inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningOutputTokens', 'totalTokens'];
  const tokenMedians = Object.fromEntries(tokenFields.map((field) => [field, round(median(tokenPairs.map((pair) => pair.tokenDelta[field])))]));
  const reasons = status === 'inconclusive'
    ? measurementReasons
    : status === 'regressed'
      ? qualityReasons
      : status === 'no-demonstrated-improvement'
        ? ['primary-improvement-threshold-not-met']
        : [];
  return {
    studyId: study.studyId,
    revision: study.revision,
    status,
    code: statusCode(status),
    benefitPercent: status === 'demonstrated-improvement' ? medianImprovementPercent : null,
    reasons,
    sample: {
      projectCount: study.projects.length,
      participantCount,
      pairCount: study.pairs.length,
      comparablePairCount: comparable.length,
      nonTiePairCount: nonTie,
      orderCounts,
    },
    primaryMetric: {
      name: 'total-cycle-ms',
      status: measurementReasons.length ? 'inconclusive' : primaryPassed ? 'passed' : 'not-passed',
      minimumMedianImprovementPercent: 10,
      medianImprovementPercent,
      pValue,
      significanceThreshold: 0.05,
      improvedPairCount: improvements,
      regressedPairCount: regressions,
      tiedPairCount: ties,
      projects: projectResults,
    },
    qualityGuardrails,
    operationalMetrics: {
      firstDelivery: {
        validPairCount: firstDeliveryPairs.length,
        medianDeltaMs: round(median(firstDeliveryPairs.map((pair) => pair.firstDeliveryMs.delta))),
      },
      medianClarificationDelta: round(median(pairSummaries.map((pair) => pair.clarificationDelta))),
      medianReworkDelta: qualityGuardrails.medianReworkDelta,
      medianBlockerDelta: round(median(pairSummaries.map((pair) => pair.blockerDelta))),
    },
    tokenUsage: {
      status: tokenPairs.length ? 'available' : 'unmeasured',
      validPairCount: tokenPairs.length,
      medianDelta: tokenPairs.length ? tokenMedians : null,
    },
    pairs: pairSummaries,
  };
}
