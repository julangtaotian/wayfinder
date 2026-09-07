import {
  BENCHMARK_SCHEMA_VERSION,
  EXPECTED_CASE_COUNT,
  DeveloperEffectivenessBenchmarkError,
} from './developer-effectiveness-benchmark-foundation.mjs';

const EXECUTION_MODES = new Set(['plugin', 'baseline']);
const TERMINAL_STATUSES = new Set(['passed', 'failed', 'blocked', 'timeout', 'launch-failed', 'interrupted']);
const RUN_STAGE_ORDER = Object.freeze([
  'previewed', 'authored', 'frozen', 'prepared', 'executing', 'evaluated', 'summarized', 'cleaned',
]);

function fail(code, message, target = null) {
  throw new DeveloperEffectivenessBenchmarkError(code, message, target);
}

function assertPlainObject(value, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, message);
}

function timestamp(value) {
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

export function classifyFalseBlocker({ blocked, blockerCategory, availabilityChecks = [] }) {
  if (!blocked) return 'none';
  const deterministicCategory = ['missing-file', 'missing-command', 'resource-unavailable'].includes(blockerCategory);
  const disproved = availabilityChecks.some((item) => item?.deterministic === true && item?.available === true);
  return deterministicCategory && disproved ? 'confirmed' : 'review-required';
}

export function buildRunMetrics(run) {
  assertPlainObject(run, 'invalid_run_result', '运行结果必须是对象');
  if (!EXECUTION_MODES.has(run.mode)) fail('invalid_execution_mode', `未知执行组：${run.mode}`, run.mode);
  if (!TERMINAL_STATUSES.has(run.status)) fail('invalid_run_status', `未知运行状态：${run.status}`, run.status);
  const startedMs = timestamp(run.startedAt);
  const firstDeliveredMs = timestamp(run.firstDeliveredAt);
  const endedMs = timestamp(run.endedAt);
  const blockedBeforeDelivery = run.status === 'blocked'
    && firstDeliveredMs === null
    && run.firstDeliveryNullReason === 'blocked-before-delivery'
    && Number(run.blockerCount) > 0;
  const reasons = [];
  if (!run.freezeDigest) reasons.push('missing-freeze-digest');
  if (run.routeValid !== true) reasons.push('invalid-route-evidence');
  if (startedMs === null) reasons.push('missing-start-time');
  if (endedMs === null) reasons.push('missing-end-time');
  if (startedMs !== null && endedMs !== null && endedMs < startedMs) reasons.push('negative-total-duration');
  if (!blockedBeforeDelivery && firstDeliveredMs === null) reasons.push('missing-first-delivery-time');
  if (firstDeliveredMs !== null && startedMs !== null && firstDeliveredMs < startedMs) reasons.push('negative-first-delivery-duration');
  if (!nonNegativeInteger(run.clarificationCount)) reasons.push('invalid-clarification-count');
  if (!nonNegativeInteger(run.reworkCount)) reasons.push('invalid-rework-count');
  if (!nonNegativeInteger(run.blockerCount)) reasons.push('invalid-blocker-count');
  if (typeof run.firstAcceptancePassed !== 'boolean') reasons.push('missing-first-acceptance-result');
  if (typeof run.finalAcceptancePassed !== 'boolean') reasons.push('missing-final-acceptance-result');
  if (!Array.isArray(run.evidence) || run.evidence.length === 0) reasons.push('missing-evidence');
  if (['timeout', 'launch-failed', 'interrupted'].includes(run.status)) reasons.push(`infrastructure-${run.status}`);
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    synthetic: true,
    caseId: run.caseId,
    projectId: run.projectId,
    projectName: run.projectName,
    complexity: run.complexity,
    taskType: run.taskType,
    mode: run.mode,
    route: run.route,
    status: run.status,
    startedAt: run.startedAt || null,
    firstDeliveredAt: run.firstDeliveredAt || null,
    firstDeliveryNullReason: blockedBeforeDelivery ? 'blocked-before-delivery' : null,
    endedAt: run.endedAt || null,
    firstDeliveryMs: startedMs !== null && firstDeliveredMs !== null ? firstDeliveredMs - startedMs : null,
    totalCycleMs: startedMs !== null && endedMs !== null ? endedMs - startedMs : null,
    clarificationCount: nonNegativeInteger(run.clarificationCount) ? run.clarificationCount : null,
    reworkCount: nonNegativeInteger(run.reworkCount) ? run.reworkCount : null,
    blockerCount: nonNegativeInteger(run.blockerCount) ? run.blockerCount : null,
    falseBlockerStatus: run.falseBlockerStatus || 'none',
    firstAcceptancePassed: typeof run.firstAcceptancePassed === 'boolean' ? run.firstAcceptancePassed : null,
    finalAcceptancePassed: typeof run.finalAcceptancePassed === 'boolean' ? run.finalAcceptancePassed : null,
    diffstat: run.diffstat || null,
    effective: reasons.length === 0,
    dataQualityReasons: reasons,
    evidence: Array.isArray(run.evidence) ? run.evidence : [],
  };
}

function average(values) {
  const numbers = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function summarizeGroup(items) {
  const valid = items.filter((item) => item.effective);
  const blockerTotal = valid.reduce((sum, item) => sum + (item.blockerCount || 0), 0);
  const confirmedFalseBlockers = valid.filter((item) => item.falseBlockerStatus === 'confirmed').length;
  return {
    runCount: items.length,
    validRunCount: valid.length,
    finalAcceptanceRate: ratio(valid.filter((item) => item.finalAcceptancePassed).length, valid.length),
    firstAcceptanceRate: ratio(valid.filter((item) => item.firstAcceptancePassed).length, valid.length),
    averageFirstDeliveryMs: average(valid.map((item) => item.firstDeliveryMs)),
    averageTotalCycleMs: average(valid.map((item) => item.totalCycleMs)),
    averageClarifications: average(valid.map((item) => item.clarificationCount)),
    averageReworks: average(valid.map((item) => item.reworkCount)),
    confirmedFalseBlockerRate: ratio(confirmedFalseBlockers, blockerTotal),
  };
}

export function buildBenchmarkSummary(runResults, { expectedPairs = EXPECTED_CASE_COUNT } = {}) {
  const metrics = runResults.map((item) => item.synthetic === true && 'effective' in item ? item : buildRunMetrics(item));
  const byCase = new Map();
  for (const item of metrics) {
    if (!byCase.has(item.caseId)) byCase.set(item.caseId, []);
    byCase.get(item.caseId).push(item);
  }
  const pairs = [...byCase.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([caseId, items]) => {
    const plugin = items.find((item) => item.mode === 'plugin') || null;
    const baseline = items.find((item) => item.mode === 'baseline') || null;
    const effective = Boolean(plugin?.effective && baseline?.effective);
    return {
      caseId,
      effective,
      code: effective ? 'pair_complete' : 'pair_incomplete',
      plugin,
      baseline,
      delta: effective ? {
        firstDeliveryMs: plugin.firstDeliveryMs === null || baseline.firstDeliveryMs === null
          ? null : plugin.firstDeliveryMs - baseline.firstDeliveryMs,
        totalCycleMs: plugin.totalCycleMs - baseline.totalCycleMs,
        clarifications: plugin.clarificationCount - baseline.clarificationCount,
        reworks: plugin.reworkCount - baseline.reworkCount,
      } : null,
    };
  });
  const validPairCount = pairs.filter((item) => item.effective).length;
  const group = (key) => Object.fromEntries([...new Set(metrics.map((item) => item[key]))]
    .filter((value) => value !== undefined && value !== null)
    .sort()
    .map((value) => [value, summarizeGroup(metrics.filter((item) => item[key] === value))]));
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    synthetic: true,
    conclusionStatus: validPairCount === expectedPairs ? 'descriptive-comparison' : 'insufficient-pairs',
    expectedPairCount: expectedPairs,
    validPairCount,
    runCount: metrics.length,
    validRunCount: metrics.filter((item) => item.effective).length,
    groups: { mode: group('mode'), project: group('projectId'), complexity: group('complexity') },
    pairs,
    runs: metrics,
    limitations: [
      '本报告仅描述合成模拟任务，不能替代真实开发者或团队交付数据。',
      '需求作者与执行代理可能来自同类模型，结果存在任务风格偏置。',
      '误阻断只有确定性反证时自动确认，其余候选需要人工复核。',
    ],
  };
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildWorkbookImportCsv(summary) {
  const headers = [
    'task_id', 'project_id', 'project_name', 'sample_role', 'workflow_route', 'complexity', 'task_type',
    'started_at', 'first_delivered_at', 'ended_at', 'clarification_count', 'rework_count', 'blocker_count',
    'false_blocker_status', 'first_acceptance_passed', 'final_acceptance_passed', 'status', 'effective',
    'first_delivery_hours', 'total_cycle_hours', 'synthetic', 'data_quality',
  ];
  const rows = summary.runs.map((item) => [
    `${item.caseId}-${item.mode}`, item.projectId, item.projectName,
    item.mode === 'plugin' ? 'synthetic-plugin' : 'synthetic-baseline', item.route, item.complexity, item.taskType,
    item.startedAt, item.firstDeliveredAt, item.endedAt, item.clarificationCount, item.reworkCount, item.blockerCount,
    item.falseBlockerStatus, item.firstAcceptancePassed, item.finalAcceptancePassed, item.status, item.effective,
    item.firstDeliveryMs === null ? null : item.firstDeliveryMs / 3_600_000,
    item.totalCycleMs === null ? null : item.totalCycleMs / 3_600_000,
    true, item.dataQualityReasons.join('|'),
  ]);
  return `${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

export function buildBenchmarkReviewMarkdown(summary) {
  const pending = summary.runs.filter((item) => item.falseBlockerStatus === 'review-required');
  return [
    '# 合成开发者交付效果基准复核',
    '',
    '> 本报告只描述合成模拟任务，不能替代真实开发者或团队交付数据。',
    '',
    `- 结论状态：${summary.conclusionStatus}`,
    `- 运行数：${summary.runCount}`,
    `- 有效运行：${summary.validRunCount}`,
    `- 有效配对：${summary.validPairCount}/${summary.expectedPairCount}`,
    `- 待人工复核误阻断候选：${pending.length}`,
    '',
    '## 待复核项',
    '',
    ...(pending.length ? pending.map((item) => `- ${item.caseId}/${item.mode}`) : ['- 无']),
    '',
    '## 固有限制',
    '',
    ...summary.limitations.map((item) => `- ${item}`),
    '',
  ].join('\n');
}

export function createRunState({ runId, inputDigest, createdAt = new Date().toISOString() }) {
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    synthetic: true,
    runId,
    inputDigest,
    stage: 'previewed',
    completedStages: ['previewed'],
    createdAt,
    updatedAt: createdAt,
  };
}

export function advanceRunState(state, nextStage, { inputDigest, updatedAt = new Date().toISOString() } = {}) {
  assertPlainObject(state, 'invalid_run_state', '运行状态必须是对象');
  if (state.inputDigest !== inputDigest) fail('resume_input_mismatch', '恢复输入摘要与原运行不一致', state.runId);
  const currentIndex = RUN_STAGE_ORDER.indexOf(state.stage);
  const nextIndex = RUN_STAGE_ORDER.indexOf(nextStage);
  if (currentIndex < 0 || nextIndex < 0 || nextIndex !== currentIndex + 1) {
    fail('invalid_stage_transition', `不允许从 ${state.stage} 进入 ${nextStage}`, state.runId);
  }
  return {
    ...state,
    stage: nextStage,
    completedStages: [...state.completedStages, nextStage],
    updatedAt,
  };
}

export function publicBenchmarkFailure(error) {
  if (error instanceof DeveloperEffectivenessBenchmarkError) {
    return { ok: false, status: error.status, code: error.code, target: error.target, error: error.message };
  }
  return { ok: false, status: 'defect', code: 'benchmark_internal_error', target: null, error: error.message };
}

export function isFatalBenchmarkFailure(error) {
  const code = String(error?.code || '');
  return code === 'resume_input_mismatch'
    || code === 'source_baseline_drifted'
    || code === 'frozen_manifest_drifted'
    || /(?:^agent_process|^codex_|^sensitive|^unsafe|cleanup|^disk_reserve)/u.test(code);
}

export function buildFailedRunEvidence({ candidate, mode, projectName, error, evidencePath, timestamp }) {
  const failure = publicBenchmarkFailure(error);
  const runResult = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    synthetic: true,
    caseId: candidate.id,
    projectId: candidate.projectId,
    projectName,
    complexity: candidate.complexity,
    taskType: candidate.taskType,
    mode,
    route: mode === 'baseline' ? 'baseline' : 'unknown',
    routeValid: false,
    status: 'failed',
    freezeDigest: candidate.assetDigests,
    startedAt: timestamp,
    firstDeliveredAt: null,
    firstDeliveryNullReason: null,
    endedAt: timestamp,
    clarificationCount: 0,
    reworkCount: 0,
    blockerCount: 0,
    falseBlockerStatus: 'none',
    firstAcceptancePassed: false,
    finalAcceptancePassed: false,
    diffstat: null,
    turns: [],
    evidence: [evidencePath],
    failureCode: failure.code,
  };
  return { failure, runResult, metrics: buildRunMetrics(runResult) };
}

export const AUTHOR_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['status', 'cases'],
  properties: {
    status: { type: 'string', enum: ['ready', 'blocked'] },
    cases: {
      type: 'array', minItems: 0, maxItems: 2,
      items: {
        type: 'object', additionalProperties: false,
        required: [
          'id', 'projectId', 'title', 'complexity', 'taskType', 'publicRequirement', 'allowedPaths',
          'seedPatch', 'evaluatorPatch', 'referencePatch', 'clarifications', 'acceptance', 'availabilityChecks',
          'maxReworks', 'maxClarifications', 'requiresExternalSystem', 'usesNetwork',
        ],
        properties: {
          id: { type: 'string' }, projectId: { type: 'string' }, title: { type: 'string' },
          complexity: { type: 'string', enum: ['small', 'medium', 'large'] },
          taskType: { type: 'string', enum: ['bug', 'feature', 'refactor'] },
          publicRequirement: { type: 'string' },
          allowedPaths: { type: 'array', items: { type: 'string' } },
          seedPatch: { type: 'string' }, evaluatorPatch: { type: 'string' }, referencePatch: { type: 'string' },
          clarifications: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false, required: ['pattern', 'answer'],
              properties: { pattern: { type: 'string' }, answer: { type: 'string' } },
            },
          },
          acceptance: {
            type: 'object', additionalProperties: false, required: ['command', 'args', 'timeoutMs'],
            properties: {
              command: { type: 'string', enum: ['node'] }, args: { type: 'array', items: { type: 'string' } },
              timeoutMs: { type: 'integer' },
            },
          },
          availabilityChecks: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false, required: ['kind', 'target'],
              properties: { kind: { type: 'string', enum: ['file'] }, target: { type: 'string' } },
            },
          },
          maxReworks: { type: 'integer' }, maxClarifications: { type: 'integer' },
          requiresExternalSystem: { type: 'boolean' }, usesNetwork: { type: 'boolean' },
        },
      },
    },
  },
});

export const EXECUTION_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['status', 'summary', 'route', 'question', 'blockerCode', 'blockerCategory'],
  properties: {
    status: { type: 'string', enum: ['planned', 'delivered', 'needs_clarification', 'blocked'] },
    summary: { type: 'string' },
    route: { type: 'string', enum: ['fast', 'full', 'baseline', 'unknown'] },
    question: { type: 'string' }, blockerCode: { type: 'string' }, blockerCategory: { type: 'string' },
  },
});
