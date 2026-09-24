import fs from 'node:fs';
import path from 'node:path';

import {
  BENCHMARK_SCHEMA_VERSION,
  DeveloperEffectivenessBenchmarkError,
  resolveBenchmarkRunRoot,
  scopedBenchmarkProjects,
  verifyFrozenCases,
  writeImmutableJson,
  writeJsonAtomic,
  writeTextAtomic,
} from './developer-effectiveness-benchmark-foundation.mjs';

function readJson(target) {
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

export function inspectReusableCases(config) {
  if (!config.reuseCasesFrom) return null;
  if (config.reuseCasesFrom === config.runId) {
    throw new DeveloperEffectivenessBenchmarkError('reused_cases_self_reference', '冻结用例来源不能指向当前 run', config.runId);
  }
  const source = resolveBenchmarkRunRoot(config.repositoryRoot, config.reuseCasesFrom);
  const manifestPath = path.join(source.runRoot, 'cases', 'frozen-manifest.json');
  const preflightPath = path.join(source.runRoot, 'cases', 'preflight.json');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(preflightPath)) {
    throw new DeveloperEffectivenessBenchmarkError('reused_cases_missing', '冻结用例来源缺少清单或预检摘要', config.reuseCasesFrom);
  }
  let manifest;
  let preflight;
  try {
    manifest = verifyFrozenCases(readJson(manifestPath));
    preflight = readJson(preflightPath);
  } catch (error) {
    if (error instanceof DeveloperEffectivenessBenchmarkError) throw error;
    throw new DeveloperEffectivenessBenchmarkError('reused_cases_invalid_json', '冻结用例来源不是有效 JSON', config.reuseCasesFrom);
  }
  const expectedProjects = scopedBenchmarkProjects(config).map((project) => project.id).sort();
  const actualProjects = [...(manifest.projectIds || ['P1', 'P2', 'P3'])].sort();
  if (JSON.stringify(actualProjects) !== JSON.stringify(expectedProjects)) {
    throw new DeveloperEffectivenessBenchmarkError('reused_cases_scope_mismatch', '冻结用例来源的项目范围与当前运行不一致', config.reuseCasesFrom);
  }
  if (preflight.manifestDigest !== manifest.manifestDigest) {
    throw new DeveloperEffectivenessBenchmarkError('reused_preflight_mismatch', '冻结用例来源的预检摘要与清单不一致', config.reuseCasesFrom);
  }
  const expectedCaseIds = manifest.cases.map((candidate) => candidate.id).sort();
  const actualCaseIds = Array.isArray(preflight.results)
    ? preflight.results.map((result) => result?.caseId).sort()
    : [];
  const preflightValid = preflight.schemaVersion === BENCHMARK_SCHEMA_VERSION
    && preflight.synthetic === true
    && actualCaseIds.length === expectedCaseIds.length
    && JSON.stringify(actualCaseIds) === JSON.stringify(expectedCaseIds)
    && preflight.results.every((result) => result?.status === 'passed');
  if (!preflightValid) {
    throw new DeveloperEffectivenessBenchmarkError('reused_preflight_invalid', '冻结用例来源的预检结果不完整或未通过', config.reuseCasesFrom);
  }
  return { ...source, manifest, preflight };
}

export function persistFrozenCases(config, manifest) {
  for (const candidate of manifest.cases) {
    const caseRoot = path.join(config.runRoot, 'cases', candidate.id);
    writeTextAtomic(config.repositoryRoot, path.join(caseRoot, 'public-requirement.md'), `${candidate.publicRequirement.trim()}\n`, { mustNotExist: true });
    writeTextAtomic(config.repositoryRoot, path.join(caseRoot, 'seed.patch'), `${candidate.seedPatch.trimEnd()}\n`, { mustNotExist: true });
    writeTextAtomic(config.repositoryRoot, path.join(caseRoot, 'evaluator.patch'), `${candidate.evaluatorPatch.trimEnd()}\n`, { mustNotExist: true });
    writeTextAtomic(config.repositoryRoot, path.join(caseRoot, 'reference.patch'), `${candidate.referencePatch.trimEnd()}\n`, { mustNotExist: true });
    writeTextAtomic(config.repositoryRoot, path.join(caseRoot, 'equivalent.patch'), `${candidate.equivalentPatch.trimEnd()}\n`, { mustNotExist: true });
    writeTextAtomic(config.repositoryRoot, path.join(caseRoot, 'mutant.patch'), `${candidate.mutantPatch.trimEnd()}\n`, { mustNotExist: true });
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
      expectedRoute: candidate.expectedRoute,
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
