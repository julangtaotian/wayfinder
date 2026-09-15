import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { readExternalCiReceipt } from './external-ci-receipt.mjs';
import { resolveSafeProjectPath } from './project-path-safety.mjs';
import { buildRealDeveloperEffectivenessRecord } from './real-developer-effectiveness-evidence.mjs';
import {
  REAL_DEVELOPER_EVIDENCE_GENERATOR,
  REAL_DEVELOPER_EVIDENCE_KIND,
  REAL_DEVELOPER_EFFECT_STATUSES,
} from './real-developer-effectiveness-statistics.mjs';
import { validateSupportSourceDescriptor } from './real-project-support-evidence.mjs';

const REVISION_PATTERN = /^[a-f0-9]{40}$/u;
const EVIDENCE_STATUSES = new Set(['passed', 'limited', 'blocked']);
const PROJECT_ID_PATTERN = /^P[1-9][0-9]*$/u;
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,79}$/iu;
const STANDARD_LOCAL_GENERATOR = 'frontend-ai-workflow/local-verification-receipt';
const STANDARD_PROJECT_GENERATOR = 'frontend-ai-workflow/real-project-support-evidence';
const STANDARD_EFFECTIVENESS_GENERATOR = REAL_DEVELOPER_EVIDENCE_GENERATOR;
const REQUIRED_LOCAL_STEPS = new Set([
  'static', 'footprint', 'lifecycle', 'tests', 'structure', 'openspec', 'runtime-version', 'runtime-integrity',
]);
const EXPECTED_CI_RECEIPT_JOBS = new Set([
  'shared-linux-x64',
  'platform-darwin-arm64',
  'platform-darwin-x64',
  'platform-linux-x64',
  'platform-linux-arm64',
  'platform-win32-x64',
]);
export const SUPPORT_MATRIX_COMBINATIONS = Object.freeze([
  Object.freeze({ id: 'vue3-vite-vitest-npm', framework: 'vue3', buildTool: 'vite', packageManager: 'npm', runner: 'vitest', fixture: true, certifiable: true }),
  Object.freeze({ id: 'vue2-vite-pnpm', framework: 'vue2', buildTool: 'vite', packageManager: 'pnpm', runner: 'unverified', fixture: true, certifiable: false }),
  Object.freeze({ id: 'vue-webpack-yarn-jest', framework: 'vue', buildTool: 'webpack', packageManager: 'yarn', runner: 'jest', fixture: true, certifiable: false }),
  Object.freeze({ id: 'react-vite-npm', framework: 'react', buildTool: 'vite', packageManager: 'npm', runner: 'unverified', fixture: true, certifiable: false }),
  Object.freeze({ id: 'react-webpack-npm-jest', framework: 'react', buildTool: 'webpack', packageManager: 'npm', runner: 'jest', fixture: true, certifiable: false }),
  Object.freeze({ id: 'wechat-native-npm-manual', framework: 'wechat-native', buildTool: 'native-tooling', packageManager: 'npm', runner: 'manual', fixture: true, certifiable: false }),
  Object.freeze({ id: 'workspace-monorepo', framework: 'multiple', buildTool: 'multiple', packageManager: 'multiple', runner: 'multiple', fixture: false, certifiable: false }),
]);
export const KNOWN_SUPPORT_GAPS = Object.freeze([
  'pnpm-native-test',
  'react-vite-real-project',
  'workspace-monorepo',
  'multi-app',
  'remote-design-sync',
  'backend-chain',
]);

export class SupportEvidenceError extends Error {
  constructor(code, message, target = null) {
    super(message);
    this.name = 'SupportEvidenceError';
    this.code = code;
    this.status = 'failed';
    this.target = target;
  }
}

function fail(code, message, target = null) {
  throw new SupportEvidenceError(code, message, target);
}

function normalizeRevision(revision, required) {
  const value = String(revision || '').trim().toLowerCase();
  if (!value && !required) return null;
  if (!REVISION_PATTERN.test(value)) fail('invalid_support_revision', '支持证据 revision 必须是 40 位十六进制提交', value || null);
  return value;
}

function validateLocalValidation(value, revision) {
  if (!value) return null;
  if (value.schemaVersion !== 1 || value.status !== 'passed' || String(value.revision || '').toLowerCase() !== revision) {
    fail('invalid_local_validation_evidence', '本地统一验证证据必须使用 schemaVersion 1、passed 状态并匹配 revision', 'localValidation');
  }
  const standard = value.kind === 'local-verification-receipt';
  if (!standard) {
    return {
      status: 'passed', code: String(value.code || 'local_validation_passed'), revision,
      trust: 'legacy-recorded', certifying: false, source: null,
    };
  }
  const completed = Array.isArray(value.completed) ? value.completed.map(String) : [];
  const platform = value.platform;
  const runner = value.evidence?.runner;
  if (value.generator?.id !== STANDARD_LOCAL_GENERATOR || value.generator?.version !== 1
    || value.code !== 'verification_passed' || value.scope !== 'all'
    || !platform || !['platform', 'arch', 'node'].every((field) => typeof platform[field] === 'string' && platform[field])
    || !Number.isSafeInteger(value.durationMs) || value.durationMs < 0
    || completed.length !== new Set(completed).size
    || [...REQUIRED_LOCAL_STEPS].some((step) => !completed.includes(step))
    || value.evidence?.stepCount !== completed.length
    || !validateSupportSourceDescriptor(runner) || runner.path !== 'scripts/verify.mjs') {
    fail('invalid_standard_local_validation', '标准本地统一验证回执的生成器、阶段、平台或来源摘要无效', 'localValidation');
  }
  return {
    status: 'passed', code: value.code, revision,
    trust: 'generated', certifying: true, platform: { ...platform }, source: { runner: { ...runner } },
  };
}

function validateRealProjectEvidence(value, revision) {
  if (!value) return { mapped: new Map(), trust: null, certifying: false, source: null };
  if (value.schemaVersion !== 1 || String(value.revision || '').toLowerCase() !== revision || !Array.isArray(value.combinations)) {
    fail('invalid_real_project_evidence', '真实项目证据 schema 或 revision 无效', 'realProjectEvidence');
  }
  const standard = value.kind === 'real-project-support-evidence';
  if (standard) {
    const files = value.source?.files;
    const sourcePaths = Array.isArray(files) ? files.map((item) => String(item?.path || '')) : [];
    if (value.generator?.id !== STANDARD_PROJECT_GENERATOR || value.generator?.version !== 1
      || value.status !== 'passed' || !RUN_ID_PATTERN.test(String(value.runId || ''))
      || !Array.isArray(files) || files.length !== 3 || files.some((item) => !validateSupportSourceDescriptor(item))
      || new Set(sourcePaths).size !== 3
      || sourcePaths.filter((sourcePath) => sourcePath.endsWith('/inspection/results.json')).length !== 1
      || sourcePaths.filter((sourcePath) => sourcePath.endsWith('/native-test/results.json')).length !== 1
      || sourcePaths.some((sourcePath) => !sourcePath.includes('/real-project-validation/'))) {
      fail('invalid_standard_real_project_evidence', '标准真实项目证据的生成器、runId 或来源摘要无效', 'realProjectEvidence');
    }
  }
  const known = new Set(SUPPORT_MATRIX_COMBINATIONS.map((item) => item.id));
  const mapped = new Map();
  const seenProjects = new Set();
  for (const [index, item] of value.combinations.entries()) {
    const id = String(item?.id || '');
    const status = String(item?.status || '');
    if (!known.has(id)) fail('unknown_support_combination', '真实项目证据包含未知组合', id || `combinations[${index}]`);
    if (mapped.has(id)) fail('duplicate_support_combination', '真实项目证据包含重复组合', id);
    if (!EVIDENCE_STATUSES.has(status)) fail('invalid_support_evidence_status', '真实项目证据状态无效', id);
    let projectIds;
    let projects;
    if (standard) {
      projectIds = Array.isArray(item.projectIds) ? item.projectIds.map(String) : [];
      projects = Array.isArray(item.projects) ? item.projects : [];
      if (!projectIds.length || projectIds.length !== new Set(projectIds).size
        || projectIds.some((projectId) => !PROJECT_ID_PATTERN.test(projectId) || seenProjects.has(projectId))
        || projects.length !== projectIds.length
        || projects.some((project, projectIndex) => project?.id !== projectIds[projectIndex]
          || !REVISION_PATTERN.test(String(project?.commit || '').toLowerCase()))) {
        fail('invalid_standard_real_project_projects', '标准真实项目证据的匿名项目与提交无效', id);
      }
      projectIds.forEach((projectId) => seenProjects.add(projectId));
    } else {
      projectIds = [String(item.projectId || 'unknown')];
      projects = [];
    }
    mapped.set(id, {
      status,
      code: String(item.code || 'real_project_recorded'),
      projectIds,
      projects,
      revision,
      runId: standard ? value.runId : null,
      trust: standard ? 'generated' : 'legacy-recorded',
      certifying: standard,
    });
  }
  return {
    mapped,
    trust: standard ? 'generated' : 'legacy-recorded',
    certifying: standard,
    source: standard ? { files: value.source.files.map((item) => ({ ...item })) } : null,
  };
}

function validateDeveloperEffectiveness(value, revision) {
  if (!value) return null;
  const statuses = new Set(REAL_DEVELOPER_EFFECT_STATUSES);
  if (value.schemaVersion !== 1 || value.kind !== REAL_DEVELOPER_EVIDENCE_KIND
    || value.generator?.id !== STANDARD_EFFECTIVENESS_GENERATOR || value.generator?.version !== 1
    || String(value.revision || '').toLowerCase() !== revision || !statuses.has(value.status)
    || typeof value.studyId !== 'string' || !RUN_ID_PATTERN.test(value.studyId)
    || !Number.isSafeInteger(value.sample?.projectCount) || value.sample.projectCount < 1
    || !Number.isSafeInteger(value.sample?.pairCount) || value.sample.pairCount < 1
    || !validateSupportSourceDescriptor(value.source?.study)
    || !value.primaryMetric || !value.qualityGuardrails || !value.tokenUsage || !Array.isArray(value.pairs)) {
    fail('invalid_developer_effectiveness_evidence', '真实开发者效果证据的 schema、生成器、样本或来源无效', 'developerEffectiveness');
  }
  const benefitPercent = value.status === 'demonstrated-improvement' ? value.benefitPercent : null;
  if ((value.status === 'demonstrated-improvement'
    && (!Number.isFinite(benefitPercent) || benefitPercent < 10 || benefitPercent !== value.primaryMetric.medianImprovementPercent))
    || (value.status !== 'demonstrated-improvement' && value.benefitPercent !== null)) {
    fail('invalid_developer_effectiveness_benefit', '真实开发者效果证据的收益与结论状态不一致', 'developerEffectiveness.benefitPercent');
  }
  return {
    status: value.status,
    code: String(value.code || ''),
    benefitPercent,
    trust: 'generated',
    studyId: value.studyId,
    projectCount: value.sample.projectCount,
    pairCount: value.sample.pairCount,
    comparablePairCount: value.sample.comparablePairCount,
    source: { study: { ...value.source.study } },
    reasons: Array.isArray(value.reasons) ? value.reasons.map(String) : [],
  };
}

function layer(status, code, extra = {}) {
  return { status, code, ...extra };
}

function combinationProjection(definition, { realProjects, localValidation, ci }) {
  const fixture = definition.fixture
    ? layer('declared', 'deterministic_fixture_declared', { evidence: 'tests/helpers/workflow-fixtures.mjs' })
    : layer('uncovered', 'fixture_not_declared');
  const realProject = realProjects.get(definition.id) || layer('unavailable', 'real_project_evidence_missing');
  const local = localValidation || layer('unavailable', 'local_validation_evidence_missing');
  const fivePlatformCi = ci
    ? layer('recorded', 'five_platform_ci_recorded', { revision: ci.revision, trust: 'external-recorded', reference: ci.reference })
    : layer('unavailable', 'five_platform_ci_evidence_missing');
  const layers = { fixture, localRealProject: realProject, localValidation: local, fivePlatformCi };
  const gaps = [];
  if (!definition.fixture) gaps.push('fixture');
  if (!realProjects.has(definition.id)) gaps.push('local-real-project');
  else if (!realProject.certifying) gaps.push('local-real-project:legacy-recorded');
  else if (realProject.status !== 'passed') gaps.push(`local-real-project:${realProject.status}`);
  if (!localValidation) gaps.push('local-validation');
  else if (!localValidation.certifying) gaps.push('local-validation:legacy-recorded');
  if (!ci) gaps.push('five-platform-ci');
  if (!definition.certifiable) gaps.push('certification-not-declared');
  let status = 'limited';
  if (!definition.fixture) status = 'uncovered';
  else if (realProject.status === 'blocked') status = 'blocked';
  else if (definition.certifiable && realProject.status === 'passed' && realProject.certifying
    && localValidation?.certifying && ci) status = 'certified';
  return { ...definition, status, layers, gaps };
}

export function buildSupportEvidenceMatrix({
  revision = null,
  realProjectEvidence = null,
  localValidation = null,
  externalCiReceipt = null,
  developerEffectivenessEvidence = null,
} = {}) {
  const needsRevision = Boolean(realProjectEvidence || localValidation || externalCiReceipt || developerEffectivenessEvidence);
  const normalizedRevision = normalizeRevision(revision, needsRevision);
  const realProjectLayer = validateRealProjectEvidence(realProjectEvidence, normalizedRevision);
  const realProjects = realProjectLayer.mapped;
  const local = validateLocalValidation(localValidation, normalizedRevision);
  const developerEffectiveness = validateDeveloperEffectiveness(developerEffectivenessEvidence, normalizedRevision);
  let ci = null;
  if (externalCiReceipt) {
    const jobNames = Array.isArray(externalCiReceipt.jobs)
      ? externalCiReceipt.jobs.map((job) => String(job?.name || ''))
      : [];
    if (externalCiReceipt.schemaVersion !== 1 || externalCiReceipt.status !== 'recorded'
      || String(externalCiReceipt.revision || '').toLowerCase() !== normalizedRevision
      || !Array.isArray(externalCiReceipt.jobs) || externalCiReceipt.jobs.length !== 6
      || externalCiReceipt.jobs.some((job) => job?.status !== 'passed')
      || new Set(jobNames).size !== EXPECTED_CI_RECEIPT_JOBS.size
      || jobNames.some((name) => !EXPECTED_CI_RECEIPT_JOBS.has(name))) {
      fail('invalid_external_ci_evidence', '五平台 CI 回执无效、任务不完整或 revision 不匹配', 'externalCiReceipt');
    }
    ci = { revision: normalizedRevision, reference: externalCiReceipt.reference };
  }
  const combinations = SUPPORT_MATRIX_COMBINATIONS.map((definition) => combinationProjection(definition, {
    realProjects, localValidation: local, ci,
  }));
  const counts = Object.fromEntries(['certified', 'limited', 'blocked', 'uncovered']
    .map((status) => [status, combinations.filter((item) => item.status === status).length]));
  return {
    schemaVersion: 1,
    status: counts.blocked ? 'blocked' : counts.uncovered || counts.limited ? 'limited' : 'certified',
    code: 'support_evidence_matrix_projected',
    write: false,
    revision: normalizedRevision,
    counts,
    combinations,
    evidenceSummary: {
      localValidation: local ? { trust: local.trust, certifying: local.certifying, source: local.source } : null,
      realProjects: realProjectEvidence ? {
        trust: realProjectLayer.trust,
        certifying: realProjectLayer.certifying,
        source: realProjectLayer.source,
        projectIds: [...new Set([...realProjects.values()].flatMap((item) => item.projectIds))].sort(),
      } : null,
      fivePlatformCi: ci ? { trust: 'external-recorded', revision: ci.revision, reference: ci.reference } : null,
      developerEffectiveness: developerEffectiveness ? {
        trust: developerEffectiveness.trust,
        studyId: developerEffectiveness.studyId,
        source: developerEffectiveness.source,
      } : null,
    },
    knownGaps: [...KNOWN_SUPPORT_GAPS],
    developerEffectiveness: developerEffectiveness || {
      status: 'unmeasured', code: 'real_developer_samples_missing', benefitPercent: null,
    },
    limitations: [
      'fixture、本机真实项目、本地统一验证和五平台 CI 互不替代。',
      '合成配对数据不能证明真实开发者、团队或生产收益。',
    ],
  };
}

function readJson(root, candidate, label) {
  const target = resolveSafeProjectPath(root, candidate, label, { mustExist: true, allowDirectory: false });
  try {
    return JSON.parse(fs.readFileSync(target.absolutePath, 'utf8'));
  } catch {
    fail('invalid_support_evidence_json', `${label}不是有效 JSON`, target.projectPath);
  }
}

function verifyDescriptor(root, descriptor, label) {
  const target = resolveSafeProjectPath(root, descriptor.path, label, { mustExist: true, allowDirectory: false });
  const content = fs.readFileSync(target.absolutePath);
  const digest = crypto.createHash('sha256').update(content).digest('hex');
  if (content.byteLength !== descriptor.bytes || digest !== descriptor.sha256) {
    fail('support_evidence_source_mismatch', `${label}大小或摘要与标准回执不一致`, target.projectPath);
  }
  return { target, content };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function verifyStandardEvidenceSources(root, realProjectEvidence, localValidation, developerEffectivenessEvidence) {
  if (realProjectEvidence?.kind === 'real-project-support-evidence') {
    for (const [index, descriptor] of realProjectEvidence.source.files.entries()) {
      verifyDescriptor(root, descriptor, `真实项目来源[${index}]`);
    }
  }
  if (localValidation?.kind === 'local-verification-receipt') {
    verifyDescriptor(root, localValidation.evidence.runner, '本地统一验证来源');
  }
  if (developerEffectivenessEvidence?.kind === REAL_DEVELOPER_EVIDENCE_KIND) {
    // 不能只信任回执自身摘要；必须读取研究源文件并按当前规则完整重算标准结果。
    const verified = verifyDescriptor(root, developerEffectivenessEvidence.source.study, '真实开发者效果来源');
    let study;
    try {
      study = JSON.parse(verified.content.toString('utf8'));
    } catch {
      fail('invalid_developer_effectiveness_source_json', '真实开发者效果来源不是有效 JSON', verified.target.projectPath);
    }
    const expected = buildRealDeveloperEffectivenessRecord(study, developerEffectivenessEvidence.source.study);
    if (canonicalJson(expected) !== canonicalJson(developerEffectivenessEvidence)) {
      fail('developer_effectiveness_evidence_mismatch', '真实开发者效果证据与来源重算结果不一致', 'developerEffectiveness');
    }
  }
}

export function projectSupportEvidenceMatrix({
  root = process.cwd(), revision = null, realProjectEvidencePath = null, localValidationPath = null, externalCiReceiptPath = null,
  developerEffectivenessEvidencePath = null,
} = {}) {
  const realProjectEvidence = realProjectEvidencePath ? readJson(root, realProjectEvidencePath, '真实项目证据') : null;
  const localValidation = localValidationPath ? readJson(root, localValidationPath, '本地统一验证证据') : null;
  const external = externalCiReceiptPath
    ? readExternalCiReceipt({ root, receiptPath: externalCiReceiptPath, baseRevision: normalizeRevision(revision, true) }).receipt
    : null;
  const developerEffectivenessEvidence = developerEffectivenessEvidencePath
    ? readJson(root, developerEffectivenessEvidencePath, '真实开发者效果证据')
    : null;
  const projected = buildSupportEvidenceMatrix({
    revision,
    realProjectEvidence,
    localValidation,
    externalCiReceipt: external,
    developerEffectivenessEvidence,
  });
  verifyStandardEvidenceSources(root, realProjectEvidence, localValidation, developerEffectivenessEvidence);
  return projected;
}

function requiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) fail('missing_cli_value', `参数 ${option} 缺少值`, option);
  return value;
}

function parseArgs(argv) {
  const result = {
    root: process.cwd(), revision: null, realProjectEvidencePath: null, localValidationPath: null,
    externalCiReceiptPath: null, developerEffectivenessEvidencePath: null,
  };
  const options = new Map([
    ['--target', 'root'], ['--revision', 'revision'], ['--real-project-evidence', 'realProjectEvidencePath'],
    ['--local-validation', 'localValidationPath'], ['--external-ci-receipt', 'externalCiReceiptPath'],
    ['--developer-effectiveness-evidence', 'developerEffectivenessEvidencePath'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!options.has(option)) fail('unsupported_cli_argument', `不支持的参数：${option}`, option);
    result[options.get(option)] = requiredValue(argv, index, option);
    index += 1;
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(projectSupportEvidenceMatrix(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      status: error?.status || 'failed',
      code: error?.code || 'support_evidence_failed',
      target: error?.target || null,
      error: error?.message || String(error),
    }, null, 2));
    process.exitCode = 1;
  }
}
