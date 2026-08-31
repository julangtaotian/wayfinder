export const CHECK_PROJECT_OUTPUT_SCHEMA_VERSION = '1.0.0';
export const CHECK_PROJECT_OBSERVATION_SAMPLE_LIMIT = 5;
export const CHECK_PROJECT_DIAGNOSTIC_PAGE_SIZE = 20;
export const CHECK_PROJECT_DIAGNOSTIC_MAX_PAGE_SIZE = 100;
export const CHECK_PROJECT_PLUGIN_SUMMARY_LIMIT = 20;

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function countByCode(items) {
  const counts = new Map();
  for (const item of items) {
    const code = typeof item?.code === 'string' && item.code ? item.code : 'unknown';
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => compareText(left, right)));
}

function compactVerificationEvidenceAudit(audit = {}) {
  const { diagnostics: _diagnostics, ...summary } = audit;
  return {
    ...summary,
    availableCodes: Object.keys(audit.counts || {}).sort(compareText),
    diagnosticsIncluded: false,
  };
}

function compactDeepAnalysis(deepAnalysis = {}) {
  const observations = Array.isArray(deepAnalysis.observations) ? deepAnalysis.observations : [];
  const sampled = observations.slice(0, CHECK_PROJECT_OBSERVATION_SAMPLE_LIMIT);
  return {
    ...deepAnalysis,
    observations: sampled,
    totalObservations: observations.length,
    observationCounts: countByCode(observations),
    omittedObservations: Math.max(0, observations.length - sampled.length),
  };
}

function comparePlugin(left, right) {
  return compareText(`${left.name || ''}\u0000${left.path || ''}`, `${right.name || ''}\u0000${right.path || ''}`);
}

function compactPluginRepository(pluginRepository = null) {
  if (!pluginRepository) return pluginRepository;
  const plugins = Array.isArray(pluginRepository.plugins) ? [...pluginRepository.plugins].sort(comparePlugin) : [];
  const diagnostics = Array.isArray(pluginRepository.diagnostics)
    ? [...pluginRepository.diagnostics].sort((left, right) => compareText(
      `${left.code || ''}\u0000${left.target || ''}`,
      `${right.code || ''}\u0000${right.target || ''}`,
    ))
    : [];
  const displayedPlugins = plugins.slice(0, CHECK_PROJECT_PLUGIN_SUMMARY_LIMIT);
  const displayedDiagnostics = diagnostics.slice(0, CHECK_PROJECT_PLUGIN_SUMMARY_LIMIT);
  return {
    ...pluginRepository,
    plugins: displayedPlugins,
    totalPlugins: plugins.length,
    displayedPlugins: displayedPlugins.length,
    omittedPlugins: Math.max(0, plugins.length - displayedPlugins.length),
    pluginStatusCounts: countByCode(plugins.map((item) => ({ code: item.status || 'unknown' }))),
    diagnostics: displayedDiagnostics,
    totalDiagnostics: diagnostics.length,
    displayedDiagnostics: displayedDiagnostics.length,
    omittedDiagnostics: Math.max(0, diagnostics.length - displayedDiagnostics.length),
    diagnosticCounts: countByCode(diagnostics),
  };
}

// 精简模式只收起可以按需恢复的长数组，完整依赖事实和当前健康状态保持不变。
export function summarizeProjectCheck(result) {
  return {
    ...result,
    schemaVersion: CHECK_PROJECT_OUTPUT_SCHEMA_VERSION,
    mode: 'summary',
    ...(result.pluginRepository ? { pluginRepository: compactPluginRepository(result.pluginRepository) } : {}),
    verificationEvidenceAudit: compactVerificationEvidenceAudit(result.verificationEvidenceAudit),
    deepAnalysis: compactDeepAnalysis(result.deepAnalysis),
  };
}

export function queryProjectCheckDiagnostics(result, code, {
  offset = 0,
  limit = CHECK_PROJECT_DIAGNOSTIC_PAGE_SIZE,
} = {}) {
  const audit = result.verificationEvidenceAudit || {};
  const allDiagnostics = Array.isArray(audit.diagnostics) ? audit.diagnostics : [];
  const matched = allDiagnostics.filter((item) => item.code === code);
  const diagnostics = matched.slice(offset, offset + limit);
  const nextOffset = offset + diagnostics.length;
  const availableCodes = [...new Set([
    ...Object.keys(audit.counts || {}),
    ...allDiagnostics.map((item) => item.code).filter(Boolean),
  ])].sort(compareText);

  return {
    schemaVersion: CHECK_PROJECT_OUTPUT_SCHEMA_VERSION,
    mode: 'diagnostics',
    ok: result.ok,
    root: result.root,
    checked: audit.checked ?? false,
    executed: audit.executed ?? false,
    requirements: audit.requirements ?? 0,
    records: audit.records ?? 0,
    code,
    count: diagnostics.length,
    totalCount: matched.length,
    offset,
    limit,
    nextOffset: nextOffset < matched.length ? nextOffset : null,
    remainingCount: Math.max(0, matched.length - nextOffset),
    availableCodes,
    diagnostics,
  };
}

export function formatProjectCheckOutput(result, {
  summary = false,
  diagnosticCode = null,
  diagnosticOffset = 0,
  diagnosticLimit = CHECK_PROJECT_DIAGNOSTIC_PAGE_SIZE,
} = {}) {
  if (diagnosticCode) {
    return queryProjectCheckDiagnostics(result, diagnosticCode, {
      offset: diagnosticOffset,
      limit: diagnosticLimit,
    });
  }
  if (summary) return summarizeProjectCheck(result);
  return result;
}
