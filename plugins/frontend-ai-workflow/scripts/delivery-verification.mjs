const LEVELS = Object.freeze(['None', 'Focused', 'Targeted UI', 'Full UI']);
const LEVEL_RANK = new Map(LEVELS.map((level, index) => [level, index]));
const EFFECT_LEVELS = Object.freeze({
  'non-runtime-text': 'None',
  'runtime-logic': 'Focused',
  'visible-ui': 'Targeted UI',
  'broad-ui-journey': 'Full UI',
  'critical-ui-journey': 'Full UI',
});
const ACCEPTANCE_LEVELS = Object.freeze({
  'documentation-only': 'None',
  'local-behavior': 'Focused',
  'named-component': 'Targeted UI',
  'named-interaction': 'Targeted UI',
  'broad-ui-journey': 'Full UI',
  'critical-ui-journey': 'Full UI',
});
const FAILURE_CATEGORY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export class DeliveryVerificationError extends Error {
  constructor(code, message, target = null) {
    super(message);
    this.name = 'DeliveryVerificationError';
    this.code = code;
    this.status = 'blocked';
    this.target = target;
  }
}

function fail(code, message, target = null) {
  throw new DeliveryVerificationError(code, message, target);
}

function normalizedValues(values, table, label) {
  if (!Array.isArray(values)) fail('verification_invalid_input', `${label} 必须是数组`, label);
  const result = [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
  for (const value of result) {
    if (!Object.prototype.hasOwnProperty.call(table, value)) {
      fail('verification_invalid_input', `${label} 包含未知值：${value}`, value);
    }
  }
  return result;
}

function strongestLevel(levels) {
  return levels.reduce((selected, level) => (
    LEVEL_RANK.get(level) > LEVEL_RANK.get(selected) ? level : selected
  ), 'None');
}

// 验证深度只由可观察影响与用户验收目标决定，实施档位不会进入计算结果。
export function selectVerificationLevel({
  effects = [],
  acceptanceTargets = [],
  requestedLevel = null,
} = {}) {
  const normalizedEffects = normalizedValues(effects, EFFECT_LEVELS, 'effects');
  const normalizedAcceptance = normalizedValues(acceptanceTargets, ACCEPTANCE_LEVELS, 'acceptanceTargets');
  if (normalizedEffects.length === 0 && normalizedAcceptance.length === 0) {
    fail('verification_facts_missing', '至少需要一个实际影响或验收目标', 'effects');
  }
  if (requestedLevel !== null && !LEVEL_RANK.has(requestedLevel)) {
    fail('verification_invalid_level', `requestedLevel 无效：${requestedLevel}`, 'requestedLevel');
  }
  const facts = [
    ...normalizedEffects.map((value) => EFFECT_LEVELS[value]),
    ...normalizedAcceptance.map((value) => ACCEPTANCE_LEVELS[value]),
  ];
  const required = strongestLevel(facts);
  const level = requestedLevel && LEVEL_RANK.get(requestedLevel) > LEVEL_RANK.get(required)
    ? requestedLevel
    : required;
  return {
    ok: true,
    code: 'verification_level_selected',
    status: 'selected',
    level,
    requiredLevel: required,
    requestedLevel,
    effects: normalizedEffects,
    acceptanceTargets: normalizedAcceptance,
    browserRequired: ['Targeted UI', 'Full UI'].includes(level),
  };
}

function normalizeRepairState(state) {
  const failures = state?.failures && typeof state.failures === 'object' && !Array.isArray(state.failures)
    ? state.failures
    : {};
  const normalized = {};
  for (const [category, count] of Object.entries(failures)) {
    if (!FAILURE_CATEGORY.test(category) || !Number.isSafeInteger(count) || count < 1) {
      fail('verification_invalid_repair_state', '失败预算状态无效', category);
    }
    normalized[category] = count;
  }
  return { failures: normalized };
}

export function advanceRepairBudget(state = {}, { category, verificationLevel } = {}) {
  const normalizedCategory = String(category || '').trim();
  if (!FAILURE_CATEGORY.test(normalizedCategory)) {
    fail('verification_invalid_failure_category', '失败分类必须是 kebab-case', normalizedCategory || null);
  }
  if (!LEVEL_RANK.has(verificationLevel)) {
    fail('verification_invalid_level', `verificationLevel 无效：${verificationLevel}`, 'verificationLevel');
  }
  const current = normalizeRepairState(state);
  const occurrence = (current.failures[normalizedCategory] || 0) + 1;
  const nextState = { failures: { ...current.failures, [normalizedCategory]: occurrence } };
  const exhausted = occurrence >= 3;
  return {
    ok: !exhausted,
    code: exhausted ? 'verification_repair_exhausted' : 'verification_repair_allowed',
    status: exhausted ? 'stopped' : 'repair',
    category: normalizedCategory,
    occurrence,
    repairRound: exhausted ? 2 : occurrence,
    verificationLevel,
    state: nextState,
  };
}

export function decideProjectVerification({ entryStatus, knownFailure = false } = {}) {
  if (!['detected', 'missing'].includes(entryStatus)) {
    fail('verification_invalid_entry_status', `entryStatus 无效：${entryStatus}`, 'entryStatus');
  }
  if (entryStatus === 'missing') {
    return {
      ok: false,
      code: 'verification_local_entry_missing',
      status: 'blocked',
      runAllowed: false,
      installAllowed: false,
      retryAllowed: false,
    };
  }
  if (knownFailure) {
    return {
      ok: false,
      code: 'verification_known_failure',
      status: 'blocked',
      runAllowed: false,
      installAllowed: false,
      retryAllowed: false,
    };
  }
  return {
    ok: true,
    code: 'verification_project_entry_ready',
    status: 'ready',
    runAllowed: true,
    installAllowed: false,
    retryAllowed: true,
  };
}
