import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { readLifecycleConfig } from './lifecycle-contract.mjs';
import { atomicWriteProjectFile, resolveSafeProjectPath } from './project-path-safety.mjs';
import {
  REAL_DEVELOPER_EVIDENCE_GENERATOR,
  REAL_DEVELOPER_EVIDENCE_KIND,
  RealDeveloperEffectivenessError,
  analyzeRealDeveloperStudy,
} from './real-developer-effectiveness-statistics.mjs';

const REVISION_PATTERN = /^[a-f0-9]{40}$/u;
const MAX_STUDY_BYTES = 2 * 1024 * 1024;

function fail(code, message, target = null) {
  throw new RealDeveloperEffectivenessError(code, message, target);
}

function normalizeMachinePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//u, '');
}

function repositorySnapshot(root) {
  const run = (args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 1024 * 1024, shell: false });
    if (result.status !== 0) fail('effectiveness_repository_git_unavailable', '无法读取插件仓库 Git 状态', 'repository');
    return result.stdout.trim();
  };
  const topLevel = fs.realpathSync(path.resolve(run(['rev-parse', '--show-toplevel'])));
  const canonicalRoot = fs.realpathSync(path.resolve(root));
  const comparable = (value) => normalizeMachinePath(value).replace(/\/$/u, '');
  const left = comparable(topLevel);
  const right = comparable(canonicalRoot);
  if ((process.platform === 'win32' ? left.toLowerCase() : left) !== (process.platform === 'win32' ? right.toLowerCase() : right)) {
    fail('effectiveness_repository_git_root_mismatch', '目标目录必须是插件 Git 顶层目录', 'repository');
  }
  return { revision: run(['rev-parse', 'HEAD']).toLowerCase(), status: run(['status', '--porcelain=v1', '--untracked-files=all']) };
}

export function describeRealDeveloperStudySource(root, candidate) {
  const target = resolveSafeProjectPath(root, candidate, '真实开发者研究输入', { mustExist: true, allowDirectory: false });
  const content = fs.readFileSync(target.absolutePath);
  if (content.byteLength > MAX_STUDY_BYTES) fail('effectiveness_study_too_large', '真实开发者研究输入超过大小上限', target.projectPath);
  return {
    target,
    content,
    descriptor: {
      path: target.projectPath,
      bytes: content.byteLength,
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
    },
  };
}

function readStudy(root, candidate) {
  const source = describeRealDeveloperStudySource(root, candidate);
  let study;
  try {
    study = JSON.parse(source.content.toString('utf8'));
  } catch {
    fail('invalid_effectiveness_study_json', '真实开发者研究输入不是有效 JSON', source.target.projectPath);
  }
  return { ...source, study };
}

export function buildRealDeveloperEffectivenessRecord(study, descriptor) {
  const analysis = analyzeRealDeveloperStudy(study);
  return {
    schemaVersion: 1,
    kind: REAL_DEVELOPER_EVIDENCE_KIND,
    generator: { id: REAL_DEVELOPER_EVIDENCE_GENERATOR, version: 1 },
    ...analysis,
    source: { study: { ...descriptor } },
    limitations: [
      '本结果只证明所记录真实配对样本在预先固定门槛下的阶段性差异，不能外推全部项目或团队长期生产率。',
      '输入观测由研究执行者记录，生成器验证结构、统计和摘要，但不提供独立身份认证或远程签名。',
      '合成基准、fixture、Git 提交时长和代码行数没有参与真实收益结论。',
    ],
  };
}

function normalizeOptions({ root = process.cwd(), study = null, revision, output = null, write = false } = {}) {
  const normalizedRevision = String(revision || '').trim().toLowerCase();
  if (!REVISION_PATTERN.test(normalizedRevision)) fail('invalid_effectiveness_revision', '插件 revision 必须是 40 位十六进制提交', normalizedRevision || null);
  const config = readLifecycleConfig(root);
  const studyPath = String(study || '').trim().replaceAll('\\', '/').replace(/^\.\//u, '');
  if (!studyPath) fail('effectiveness_study_required', '必须显式提供真实开发者研究输入', 'study');
  const allowedStudyPrefix = `${config.runtimeDirectory}/runs/developer-effectiveness-studies/`;
  if (!studyPath.startsWith(allowedStudyPrefix)) {
    fail('effectiveness_study_outside_runtime', `真实开发者研究输入必须位于 ${allowedStudyPrefix}`, studyPath);
  }
  const loaded = readStudy(config.root, studyPath);
  const record = buildRealDeveloperEffectivenessRecord(loaded.study, loaded.descriptor);
  if (record.revision !== normalizedRevision) {
    fail('effectiveness_revision_mismatch', '真实开发者研究与目标插件 revision 不一致', 'study.revision');
  }
  const outputPath = String(output || `${config.runtimeDirectory}/runs/developer-effectiveness-evidence/${record.studyId}-${normalizedRevision.slice(0, 12)}.json`)
    .trim().replaceAll('\\', '/').replace(/^\.\//u, '');
  const target = resolveSafeProjectPath(config.root, outputPath, '真实开发者效果证据输出', { allowDirectory: false });
  const allowedOutputPrefix = `${config.runtimeDirectory}/runs/developer-effectiveness-evidence/`;
  if (!target.projectPath.startsWith(allowedOutputPrefix)) {
    fail('effectiveness_evidence_outside_runtime', `真实开发者效果证据必须位于 ${allowedOutputPrefix}`, target.projectPath);
  }
  return {
    root: config.root,
    revision: normalizedRevision,
    study: loaded.study,
    source: loaded.descriptor,
    record,
    output: target.projectPath,
    outputExists: target.exists,
    write: write === true,
  };
}

export function projectRealDeveloperEffectivenessEvidence(options = {}, operations = {}) {
  const config = normalizeOptions(options);
  const preview = {
    ok: true,
    status: 'planned',
    code: 'real_developer_effectiveness_evidence_plan',
    write: false,
    revision: config.revision,
    studyId: config.record.studyId,
    conclusion: config.record.status,
    benefitPercent: config.record.benefitPercent,
    reasons: config.record.reasons,
    sample: config.record.sample,
    primaryMetric: config.record.primaryMetric,
    qualityGuardrails: config.record.qualityGuardrails,
    operationalMetrics: config.record.operationalMetrics,
    tokenUsage: config.record.tokenUsage,
    source: config.record.source,
    output: config.output,
    outputExists: config.outputExists,
  };
  if (!config.write) return preview;
  if (config.outputExists) fail('effectiveness_evidence_exists', '真实开发者效果证据已存在，禁止覆盖', config.output);
  // 写入前绑定干净且精确的插件提交，防止工作区变化与证据声称的版本脱节。
  const readSnapshot = operations.readSnapshot || repositorySnapshot;
  const snapshot = readSnapshot(config.root);
  if (String(snapshot?.revision || '').toLowerCase() !== config.revision || String(snapshot?.status || '')) {
    fail('effectiveness_repository_snapshot_mismatch', '插件仓库提交或工作区状态与目标 revision 不一致', 'repository');
  }
  atomicWriteProjectFile(config.root, config.output, `${JSON.stringify(config.record, null, 2)}\n`, {
    label: '真实开发者效果证据',
    mustNotExist: true,
    operations: operations.fileOperations || {},
  });
  return {
    ...preview,
    status: 'recorded',
    code: 'real_developer_effectiveness_evidence_recorded',
    write: true,
    receipt: config.output,
  };
}

function requiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) fail('missing_cli_value', `参数 ${option} 缺少值`, option);
  return value;
}

function parseArgs(argv) {
  const result = { root: process.cwd(), study: null, revision: null, output: null, write: false };
  const valueOptions = new Map([
    ['--target', 'root'], ['--study', 'study'], ['--revision', 'revision'], ['--output', 'output'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--write') result.write = true;
    else if (valueOptions.has(option)) {
      result[valueOptions.get(option)] = requiredValue(argv, index, option);
      index += 1;
    } else fail('unsupported_cli_argument', `不支持的参数：${option}`, option);
  }
  return result;
}

function publicFailure(error) {
  return {
    ok: false,
    status: error?.status || 'failed',
    code: error?.code || 'real_developer_effectiveness_evidence_failed',
    target: normalizeMachinePath(error?.target || ''),
    error: error?.message || String(error),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(projectRealDeveloperEffectivenessEvidence(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(JSON.stringify(publicFailure(error), null, 2));
    process.exitCode = 1;
  }
}
