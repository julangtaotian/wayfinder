import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { readExternalCiReceipt } from './external-ci-receipt.mjs';
import { resolveSafeProjectPath } from './project-path-safety.mjs';

const REVISION_PATTERN = /^[a-f0-9]{40}$/u;
const EVIDENCE_STATUSES = new Set(['passed', 'limited', 'blocked']);
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
  return { status: 'passed', code: String(value.code || 'local_validation_passed'), revision };
}

function validateRealProjectEvidence(value, revision) {
  if (!value) return new Map();
  if (value.schemaVersion !== 1 || String(value.revision || '').toLowerCase() !== revision || !Array.isArray(value.combinations)) {
    fail('invalid_real_project_evidence', '真实项目证据 schema 或 revision 无效', 'realProjectEvidence');
  }
  const known = new Set(SUPPORT_MATRIX_COMBINATIONS.map((item) => item.id));
  const mapped = new Map();
  for (const [index, item] of value.combinations.entries()) {
    const id = String(item?.id || '');
    const status = String(item?.status || '');
    if (!known.has(id)) fail('unknown_support_combination', '真实项目证据包含未知组合', id || `combinations[${index}]`);
    if (mapped.has(id)) fail('duplicate_support_combination', '真实项目证据包含重复组合', id);
    if (!EVIDENCE_STATUSES.has(status)) fail('invalid_support_evidence_status', '真实项目证据状态无效', id);
    mapped.set(id, {
      status,
      code: String(item.code || 'real_project_recorded'),
      projectId: String(item.projectId || 'unknown'),
      revision,
    });
  }
  return mapped;
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
  else if (realProject.status !== 'passed') gaps.push(`local-real-project:${realProject.status}`);
  if (!localValidation) gaps.push('local-validation');
  if (!ci) gaps.push('five-platform-ci');
  if (!definition.certifiable) gaps.push('certification-not-declared');
  let status = 'limited';
  if (!definition.fixture) status = 'uncovered';
  else if (realProject.status === 'blocked') status = 'blocked';
  else if (definition.certifiable && realProject.status === 'passed' && localValidation && ci) status = 'certified';
  return { ...definition, status, layers, gaps };
}

export function buildSupportEvidenceMatrix({ revision = null, realProjectEvidence = null, localValidation = null, externalCiReceipt = null } = {}) {
  const needsRevision = Boolean(realProjectEvidence || localValidation || externalCiReceipt);
  const normalizedRevision = normalizeRevision(revision, needsRevision);
  const realProjects = validateRealProjectEvidence(realProjectEvidence, normalizedRevision);
  const local = validateLocalValidation(localValidation, normalizedRevision);
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
    knownGaps: [...KNOWN_SUPPORT_GAPS],
    developerEffectiveness: {
      status: 'unmeasured',
      code: 'real_developer_samples_missing',
      benefitPercent: null,
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

export function projectSupportEvidenceMatrix({
  root = process.cwd(), revision = null, realProjectEvidencePath = null, localValidationPath = null, externalCiReceiptPath = null,
} = {}) {
  const external = externalCiReceiptPath
    ? readExternalCiReceipt({ root, receiptPath: externalCiReceiptPath, baseRevision: normalizeRevision(revision, true) }).receipt
    : null;
  return buildSupportEvidenceMatrix({
    revision,
    realProjectEvidence: realProjectEvidencePath ? readJson(root, realProjectEvidencePath, '真实项目证据') : null,
    localValidation: localValidationPath ? readJson(root, localValidationPath, '本地统一验证证据') : null,
    externalCiReceipt: external,
  });
}

function requiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) fail('missing_cli_value', `参数 ${option} 缺少值`, option);
  return value;
}

function parseArgs(argv) {
  const result = { root: process.cwd(), revision: null, realProjectEvidencePath: null, localValidationPath: null, externalCiReceiptPath: null };
  const options = new Map([
    ['--target', 'root'], ['--revision', 'revision'], ['--real-project-evidence', 'realProjectEvidencePath'],
    ['--local-validation', 'localValidationPath'], ['--external-ci-receipt', 'externalCiReceiptPath'],
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
