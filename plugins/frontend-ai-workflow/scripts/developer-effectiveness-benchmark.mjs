import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BENCHMARK_SCHEMA_VERSION, COMPLEXITY_MATRIX, EXPECTED_RUN_COUNT,
  MIN_DISK_RESERVE_BYTES, DeveloperEffectivenessBenchmarkError,
  applyUnifiedPatch, cleanupBoundedWorkspace, collectSourceBaseline,
  freezeSyntheticCases, prepareCommittedWorkspace, publicSourceBaseline,
  scopedBenchmarkProjects, sha256Json, validateBenchmarkConfig, validateSyntheticCase,
  verifyFrozenCases, writeImmutableJson, writeImmutableText, writeJsonAtomic, writeTextAtomic,
} from './developer-effectiveness-benchmark-foundation.mjs';
import {
  AUTHOR_RESPONSE_SCHEMA, EXECUTION_RESPONSE_SCHEMA, advanceRunState, buildBenchmarkReviewMarkdown,
  buildBenchmarkSummary, buildFailedRunEvidence, buildWorkbookImportCsv, createRunState,
  isFatalBenchmarkFailure, publicBenchmarkFailure,
} from './developer-effectiveness-benchmark-metrics.mjs';
import {
  DEFAULT_AUTHOR_ATTEMPTS, parseBenchmarkCliArgs, preparePluginBaselines,
} from './developer-effectiveness-benchmark-process.mjs';
import {
  authorPrompt, executeCaseRun, isoNow, nextAttemptDirectory, runAcceptance, runCodexTurn,
} from './developer-effectiveness-benchmark-execution.mjs';

export { executeCaseRun } from './developer-effectiveness-benchmark-execution.mjs';

const SMOKE_CASE_IDS = new Set(['SYN-P1-S01', 'SYN-P1-L01', 'SYN-P2-M01', 'SYN-P2-L01', 'SYN-P3-S01', 'SYN-P3-M01']);
function checkDiskBudget(repositoryRoot) {
  if (typeof fs.statfsSync !== 'function') return { status: 'limited', code: 'disk_budget_unavailable', availableBytes: null };
  const stats = fs.statfsSync(repositoryRoot);
  const availableBytes = Number(stats.bavail) * Number(stats.bsize);
  if (availableBytes < MIN_DISK_RESERVE_BYTES) {
    throw new DeveloperEffectivenessBenchmarkError('disk_reserve_insufficient', '可用磁盘空间低于基准安全预留', 'disk');
  }
  return { status: 'passed', code: 'disk_budget_sufficient', availableBytes };
}

function publicConfig(config, baselines) {
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    synthetic: true,
    runId: config.runId,
    model: config.model,
    reasoning: config.reasoning,
    timeoutMinutes: config.timeoutMinutes,
    expectedCaseCount: scopedBenchmarkProjects(config).reduce((count, project) => count + COMPLEXITY_MATRIX[project.id].length, 0),
    expectedRunCount: config.smokeCase ? 1 : EXPECTED_RUN_COUNT,
    scope: config.smokeCase ? 'plugin-smoke' : 'full-paired',
    smokeCase: config.smokeCase,
    projects: baselines.map(publicSourceBaseline),
    output: config.runPath,
    write: config.write,
    executeAgents: config.executeAgents,
  };
}

export function createBenchmarkPreview(options) {
  const config = validateBenchmarkConfig(options);
  config.codex = options.codex || 'codex';
  config.keepWorkspaces = Boolean(options.keepWorkspaces);
  config.smokeCase = options.smokeCase || null;
  if (config.smokeCase && !SMOKE_CASE_IDS.has(config.smokeCase)) {
    throw new DeveloperEffectivenessBenchmarkError('invalid_smoke_case', 'smoke 用例不属于第一轮固定矩阵', 'smokeCase');
  }
  config.authorAttempts = options.authorAttempts ?? DEFAULT_AUTHOR_ATTEMPTS;
  if (!Number.isInteger(config.authorAttempts) || config.authorAttempts < 1 || config.authorAttempts > 3) {
    throw new DeveloperEffectivenessBenchmarkError('invalid_author_attempts', '作者重试次数必须是 1 到 3 的整数', 'authorAttempts');
  }
  const baselines = config.projects.map(collectSourceBaseline);
  const disk = checkDiskBudget(config.repositoryRoot);
  const preview = {
    ok: true,
    status: 'ready',
    code: 'benchmark_preview_ready',
    ...publicConfig(config, baselines),
    disk,
    limitations: [
      '本轮结果是合成基准，不能替代真实开发者数据。',
      '业务项目已有未提交内容只记录摘要，不进入隔离副本。',
      '真实代理只有同时显式启用写入与代理执行才会启动。',
    ],
  };
  return { config, baselines, preview };
}

function writeSchemas(config) {
  const schemaRoot = path.join(config.runRoot, 'schemas');
  const author = path.join(schemaRoot, 'author-response.schema.json');
  const execution = path.join(schemaRoot, 'execution-response.schema.json');
  writeImmutableJson(config.repositoryRoot, author, AUTHOR_RESPONSE_SCHEMA);
  writeImmutableJson(config.repositoryRoot, execution, EXECUTION_RESPONSE_SCHEMA);
  return { author, execution };
}

function readJson(target) {
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function persistFrozenCases(config, manifest) {
  for (const candidate of manifest.cases) {
    const caseRoot = path.join(config.runRoot, 'cases', candidate.id);
    writeTextAtomic(config.repositoryRoot, path.join(caseRoot, 'public-requirement.md'), `${candidate.publicRequirement.trim()}\n`, { mustNotExist: true });
    writeTextAtomic(config.repositoryRoot, path.join(caseRoot, 'seed.patch'), `${candidate.seedPatch.trimEnd()}\n`, { mustNotExist: true });
    writeTextAtomic(config.repositoryRoot, path.join(caseRoot, 'evaluator.patch'), `${candidate.evaluatorPatch.trimEnd()}\n`, { mustNotExist: true });
    writeTextAtomic(config.repositoryRoot, path.join(caseRoot, 'reference.patch'), `${candidate.referencePatch.trimEnd()}\n`, { mustNotExist: true });
    writeJsonAtomic(config.repositoryRoot, path.join(caseRoot, 'clarifications.json'), candidate.clarifications, { mustNotExist: true });
    writeJsonAtomic(config.repositoryRoot, path.join(caseRoot, 'acceptance.json'), candidate.acceptance, { mustNotExist: true });
    writeJsonAtomic(config.repositoryRoot, path.join(caseRoot, 'case.json'), {
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      synthetic: true,
      id: candidate.id,
      projectId: candidate.projectId,
      title: candidate.title,
      complexity: candidate.complexity,
      taskType: candidate.taskType,
      allowedPaths: candidate.allowedPaths,
      availabilityChecks: candidate.availabilityChecks,
      maxReworks: candidate.maxReworks,
      maxClarifications: candidate.maxClarifications,
      assetDigests: candidate.assetDigests,
      patchPaths: candidate.patchPaths,
    }, { mustNotExist: true });
  }
  writeImmutableJson(config.repositoryRoot, path.join(config.runRoot, 'cases', 'frozen-manifest.json'), manifest);
}

async function authorSyntheticCases({ config, baselines, schemas, operations }) {
  const candidates = [];
  for (const project of scopedBenchmarkProjects(config)) {
    const baseline = baselines.find((item) => item.projectId === project.id);
    let response = null;
    let lastError = null;
    for (let attempt = 1; attempt <= config.authorAttempts && !response; attempt += 1) {
      const name = `${project.id.toLowerCase()}-author-${attempt}`;
      const prepared = prepareCommittedWorkspace({ project, baseline, runRoot: config.runRoot, category: 'author', name, recoverExisting: true });
      const temporaryOutputPath = path.join(config.runRoot, 'tmp', `${name}-final.json`);
      const authorAttemptRoot = nextAttemptDirectory(path.join(config.runRoot, 'authors', project.id, 'attempts'));
      const eventOutputPath = path.join(authorAttemptRoot, 'events.ndjson');
      try {
        const turn = await runCodexTurn({
          config,
          workspace: prepared.workspace,
          prompt: authorPrompt(project.id, COMPLEXITY_MATRIX[project.id]),
          schemaPath: schemas.author,
          temporaryOutputPath,
          eventOutputPath,
          sandbox: 'read-only',
          sessionId: null,
          baselines,
          operations,
        });
        if (turn.processResult.launchError || turn.processResult.timedOut || turn.processResult.interrupted || turn.processResult.exitCode !== 0) {
          lastError = new DeveloperEffectivenessBenchmarkError('case_author_process_failed', `项目 ${project.id} 的需求作者进程失败`, project.id);
        } else if (turn.finalResponse?.status !== 'ready' || !Array.isArray(turn.finalResponse.cases)) {
          lastError = new DeveloperEffectivenessBenchmarkError('case_author_blocked', `项目 ${project.id} 的需求作者没有返回可冻结用例`, project.id);
        } else if (turn.finalResponse.cases.length !== COMPLEXITY_MATRIX[project.id].length) {
          lastError = new DeveloperEffectivenessBenchmarkError('case_author_count_mismatch', `项目 ${project.id} 的需求作者返回数量不正确`, project.id);
        } else {
          try {
            response = turn.finalResponse.cases.map(validateSyntheticCase);
          } catch (error) {
            lastError = error;
          }
        }
      } catch (error) {
        lastError = error;
      } finally {
        if (fs.existsSync(temporaryOutputPath)) fs.unlinkSync(temporaryOutputPath);
        const cleanup = cleanupBoundedWorkspace({ runRoot: config.runRoot, workspace: prepared.workspace });
        if (cleanup.status !== 'passed' && !lastError) {
          lastError = new DeveloperEffectivenessBenchmarkError(cleanup.code, '需求作者工作区清理失败', cleanup.target);
        }
      }
    }
    if (!response) throw lastError || new DeveloperEffectivenessBenchmarkError('case_author_failed', `项目 ${project.id} 无法生成用例`, project.id);
    candidates.push(...response);
  }
  return freezeSyntheticCases(candidates, undefined, scopedBenchmarkProjects(config).map((project) => project.id));
}

async function preflightOneCase({ config, project, baseline, candidate, baselines, operations }) {
  const checks = [];
  for (const variant of ['seed', 'reference']) {
    const name = `${candidate.id.toLowerCase()}-${variant}-preflight`;
    const prepared = prepareCommittedWorkspace({ project, baseline, runRoot: config.runRoot, category: 'evaluations', name, recoverExisting: true });
    try {
      applyUnifiedPatch(prepared.workspace, candidate.seedPatch, `${candidate.id}.seed`, { env: prepared.environment });
      if (variant === 'reference') {
        applyUnifiedPatch(prepared.workspace, candidate.referencePatch, `${candidate.id}.reference`, { env: prepared.environment });
      }
      applyUnifiedPatch(prepared.workspace, candidate.evaluatorPatch, `${candidate.id}.evaluator`, { env: prepared.environment });
      const result = await runAcceptance({ config, candidate, workspace: prepared.workspace, baselines, operations });
      checks.push({ variant, ...result });
      if (variant === 'seed' && result.passed) {
        throw new DeveloperEffectivenessBenchmarkError('case_seed_unexpected_pass', `用例 ${candidate.id} 的 seed 状态意外通过验收`, candidate.id);
      }
      if (variant === 'reference' && !result.passed) {
        throw new DeveloperEffectivenessBenchmarkError('case_reference_failed', `用例 ${candidate.id} 的参考实现没有通过验收`, candidate.id);
      }
    } finally {
      const cleanup = cleanupBoundedWorkspace({ runRoot: config.runRoot, workspace: prepared.workspace });
      if (cleanup.status !== 'passed') {
        throw new DeveloperEffectivenessBenchmarkError(cleanup.code, `用例 ${candidate.id} 的预检工作区清理失败`, cleanup.target);
      }
    }
  }
  return { caseId: candidate.id, status: 'passed', code: 'case_preflight_passed', checks };
}

async function preflightCases({ config, baselines, manifest, operations }) {
  const results = [];
  for (const candidate of manifest.cases) {
    const project = config.projects.find((item) => item.id === candidate.projectId);
    const baseline = baselines.find((item) => item.projectId === candidate.projectId);
    const result = operations.preflightCase
      ? await operations.preflightCase({ config, project, baseline, candidate })
      : await preflightOneCase({ config, project, baseline, candidate, baselines, operations });
    if (result.status !== 'passed') {
      throw new DeveloperEffectivenessBenchmarkError(result.code || 'case_preflight_failed', `用例 ${candidate.id} 预检失败`, candidate.id);
    }
    results.push(result);
  }
  return { schemaVersion: BENCHMARK_SCHEMA_VERSION, synthetic: true, manifestDigest: manifest.manifestDigest, results };
}

function loadOrCreateState(config, inputDigest) {
  const statePath = path.join(config.runRoot, 'state.json');
  if (!fs.existsSync(statePath)) {
    const state = createRunState({ runId: config.runId, inputDigest });
    writeJsonAtomic(config.repositoryRoot, statePath, state, { mustNotExist: true });
    return { state, statePath };
  }
  const state = readJson(statePath);
  if (state.inputDigest !== inputDigest) {
    throw new DeveloperEffectivenessBenchmarkError('resume_input_mismatch', '恢复输入摘要与既有运行不一致', config.runId);
  }
  return { state, statePath };
}

function updateState(config, statePath, state, targetStage, inputDigest) {
  let next = state;
  const current = ['previewed', 'authored', 'frozen', 'prepared', 'executing', 'evaluated', 'summarized', 'cleaned'].indexOf(next.stage);
  const target = ['previewed', 'authored', 'frozen', 'prepared', 'executing', 'evaluated', 'summarized', 'cleaned'].indexOf(targetStage);
  for (let index = current + 1; index <= target; index += 1) {
    next = advanceRunState(next, ['previewed', 'authored', 'frozen', 'prepared', 'executing', 'evaluated', 'summarized', 'cleaned'][index], { inputDigest });
  }
  writeJsonAtomic(config.repositoryRoot, statePath, next);
  return next;
}

function cleanupPreparedProjects(config, preparedProjects) {
  const results = [];
  for (const prepared of preparedProjects.values()) {
    if (config.keepWorkspaces) {
      results.push({ projectId: prepared.project.id, status: 'limited', code: 'workspace_retained_by_request' });
      continue;
    }
    results.push({ projectId: prepared.project.id, ...cleanupBoundedWorkspace({ runRoot: config.runRoot, workspace: prepared.workspace }) });
  }
  return results;
}

export async function runDeveloperEffectivenessBenchmark(options, operations = {}) {
  const { config, baselines, preview } = createBenchmarkPreview(options);
  if (!config.write) return preview;
  const input = publicConfig(config, baselines);
  const inputDigest = sha256Json(input);
  writeImmutableJson(config.repositoryRoot, path.join(config.runRoot, 'input.json'), input);
  const loaded = loadOrCreateState(config, inputDigest);
  let state = loaded.state;
  if (!config.executeAgents) {
    return { ...preview, write: true, code: 'benchmark_manifest_written', inputDigest };
  }
  const schemas = writeSchemas(config);
  let manifest;
  const manifestPath = path.join(config.runRoot, 'cases', 'frozen-manifest.json');
  if (fs.existsSync(manifestPath)) manifest = verifyFrozenCases(readJson(manifestPath));
  else {
    manifest = operations.authorCases
      ? freezeSyntheticCases(await operations.authorCases({ config, baselines }), undefined, scopedBenchmarkProjects(config).map((project) => project.id))
      : await authorSyntheticCases({ config, baselines, schemas, operations });
    persistFrozenCases(config, manifest);
  }
  state = updateState(config, loaded.statePath, state, 'frozen', inputDigest);
  const preflightPath = path.join(config.runRoot, 'cases', 'preflight.json');
  if (!fs.existsSync(preflightPath)) {
    const preflight = await preflightCases({ config, baselines, manifest, operations });
    writeImmutableJson(config.repositoryRoot, preflightPath, preflight);
  } else {
    const preflight = readJson(preflightPath);
    if (preflight.manifestDigest !== manifest.manifestDigest) {
      throw new DeveloperEffectivenessBenchmarkError('preflight_manifest_mismatch', '预检证据与冻结清单不一致', 'preflight');
    }
  }
  const scopedConfig = { ...config, projects: scopedBenchmarkProjects(config) };
  const preparedProjects = await Promise.resolve(operations.preparePluginBaselines
    ? operations.preparePluginBaselines({ config: scopedConfig, baselines })
    : preparePluginBaselines({ config: scopedConfig, baselines, operations }));
  const preparationAttemptRoot = nextAttemptDirectory(path.join(config.runRoot, 'prepared', 'attempts'));
  for (const prepared of preparedProjects.values()) {
    writeImmutableJson(config.repositoryRoot, path.join(preparationAttemptRoot, `${prepared.project.id}.json`), {
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      synthetic: true,
      projectId: prepared.project.id,
      source: publicSourceBaseline(prepared.baseline),
      preparation: prepared.preparation || { status: 'limited', code: 'injected_preparation_without_timing' },
    });
  }
  state = updateState(config, loaded.statePath, state, 'prepared', inputDigest);
  state = updateState(config, loaded.statePath, state, 'executing', inputDigest);
  const metrics = [];
  const runOrder = [];
  try {
    const selectedCases = config.smokeCase ? manifest.cases.filter((item) => item.id === config.smokeCase) : manifest.cases;
    if (config.smokeCase && selectedCases.length !== 1) {
      throw new DeveloperEffectivenessBenchmarkError('smoke_case_not_found', '冻结清单中不存在指定 smoke 用例', config.smokeCase);
    }
    for (const [caseIndex, candidate] of selectedCases.entries()) {
      const sourceProject = config.projects.find((item) => item.id === candidate.projectId);
      const sourceBaseline = baselines.find((item) => item.projectId === candidate.projectId);
      const order = config.smokeCase ? ['plugin'] : (caseIndex % 2 === 0 ? ['plugin', 'baseline'] : ['baseline', 'plugin']);
      for (const mode of order) {
        runOrder.push({ caseId: candidate.id, mode, index: runOrder.length + 1 });
        const resultPath = path.join(config.runRoot, 'runs', candidate.id, mode, 'result.json');
        const metricsPath = path.join(config.runRoot, 'runs', candidate.id, mode, 'metrics.json');
        if (fs.existsSync(resultPath) && fs.existsSync(metricsPath)) {
          metrics.push(readJson(metricsPath));
          continue;
        }
        const pluginPrepared = preparedProjects.get(candidate.projectId);
        const runSource = mode === 'plugin'
          ? { project: pluginPrepared.project, baseline: pluginPrepared.baseline }
          : { project: sourceProject, baseline: sourceBaseline };
        let executed;
        try {
          executed = operations.executeCaseRun
            ? await operations.executeCaseRun({ config, sourceProject, sourceBaseline, runSource, candidate, mode, schemas, baselines })
            : await executeCaseRun({ config, sourceProject, sourceBaseline, runSource, candidate, mode, schemas, baselines, operations });
        } catch (error) {
          if (isFatalBenchmarkFailure(error)) throw error;
          const failurePath = path.join(nextAttemptDirectory(path.join(config.runRoot, 'runs', candidate.id, mode, 'failures')), 'failure.json');
          const evidencePath = path.relative(config.repositoryRoot, failurePath).replaceAll('\\', '/');
          executed = buildFailedRunEvidence({
            candidate, mode, projectName: sourceProject.name, error, evidencePath, timestamp: isoNow(operations),
          });
          writeImmutableJson(config.repositoryRoot, failurePath, executed.failure);
        }
        writeImmutableJson(config.repositoryRoot, resultPath, executed.runResult);
        writeImmutableJson(config.repositoryRoot, metricsPath, executed.metrics);
        metrics.push(executed.metrics);
      }
    }
  } finally {
    const cleanup = cleanupPreparedProjects(config, preparedProjects);
    writeImmutableJson(config.repositoryRoot, path.join(preparationAttemptRoot, 'cleanup.json'), cleanup);
  }
  state = updateState(config, loaded.statePath, state, 'evaluated', inputDigest);
  const summary = buildBenchmarkSummary(metrics);
  const summaryPath = path.join(config.runRoot, 'summary.json');
  writeImmutableJson(config.repositoryRoot, summaryPath, { ...summary, runId: config.runId, runOrder, inputDigest });
  writeImmutableJson(config.repositoryRoot, path.join(config.runRoot, 'pair-metrics.json'), {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    synthetic: true,
    conclusionStatus: summary.conclusionStatus,
    expectedPairCount: summary.expectedPairCount,
    validPairCount: summary.validPairCount,
    pairs: summary.pairs,
  });
  writeImmutableText(config.repositoryRoot, path.join(config.runRoot, 'workbook-import.csv'), buildWorkbookImportCsv(summary));
  writeImmutableText(config.repositoryRoot, path.join(config.runRoot, 'review.md'), buildBenchmarkReviewMarkdown(summary));
  state = updateState(config, loaded.statePath, state, 'summarized', inputDigest);
  for (const [index, project] of config.projects.entries()) {
    const after = collectSourceBaseline(project);
    if (sha256Json(publicSourceBaseline(after)) !== sha256Json(publicSourceBaseline(baselines[index]))) {
      throw new DeveloperEffectivenessBenchmarkError('source_baseline_drifted', `项目 ${project.id} 在整轮运行期间发生变化`, project.id, 'defect');
    }
  }
  state = updateState(config, loaded.statePath, state, 'cleaned', inputDigest);
  return {
    ok: true,
    status: 'completed',
    code: 'synthetic_benchmark_completed',
    runId: config.runId,
    synthetic: true,
    conclusionStatus: summary.conclusionStatus,
    validPairCount: summary.validPairCount,
    expectedPairCount: summary.expectedPairCount,
    summary: path.relative(config.repositoryRoot, summaryPath).replaceAll('\\', '/'),
    limitations: summary.limitations,
  };
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const result = await runDeveloperEffectivenessBenchmark(parseBenchmarkCliArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify(publicBenchmarkFailure(error), null, 2));
    process.exitCode = 1;
  }
}
