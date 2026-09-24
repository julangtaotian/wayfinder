export const CHECK_PROJECT_OUTPUT_SCHEMA_VERSION = '1.0.0';
export const CHECK_PROJECT_OBSERVATION_SAMPLE_LIMIT = 5;
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
    kind: pluginRepository.kind,
    status: pluginRepository.status,
    marketplace: pluginRepository.marketplace,
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
    commands: pluginRepository.commands,
  };
}

function summarizePluginProjectCheck(result) {
  return {
    schemaVersion: CHECK_PROJECT_OUTPUT_SCHEMA_VERSION,
    mode: 'summary',
    ok: result.ok,
    root: result.root,
    repositoryKind: result.repositoryKind,
    pluginRepository: compactPluginRepository(result.pluginRepository),
    lifecycle: result.lifecycle,
    retiredWorkflowState: result.retiredWorkflowState,
    planningEngine: result.planningEngine,
    activeChanges: result.activeChanges,
    errors: result.errors,
    warnings: result.warnings,
  };
}

// 普通项目收起可恢复长数组；插件仓库使用专用投影，避免携带不适用的空画像。
export function summarizeProjectCheck(result) {
  if (result.repositoryKind === 'plugin-repository' && result.pluginRepository) {
    return summarizePluginProjectCheck(result);
  }
  return {
    ...result,
    schemaVersion: CHECK_PROJECT_OUTPUT_SCHEMA_VERSION,
    mode: 'summary',
    deepAnalysis: compactDeepAnalysis(result.deepAnalysis),
  };
}

export function formatProjectCheckOutput(result, {
  summary = false,
} = {}) {
  if (summary) return summarizeProjectCheck(result);
  return result;
}
