import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { runVerification } from './verify.mjs';
import { readLifecycleConfig } from '../plugins/frontend-ai-workflow/scripts/lifecycle-contract.mjs';
import {
  atomicWriteProjectFile,
  resolveSafeProjectPath,
} from '../plugins/frontend-ai-workflow/scripts/project-path-safety.mjs';

const REVISION_PATTERN = /^[a-f0-9]{40}$/u;
const RECEIPT_KIND = 'local-verification-receipt';
const GENERATOR_ID = 'frontend-ai-workflow/local-verification-receipt';

export class LocalVerificationReceiptError extends Error {
  constructor(code, message, target = null) {
    super(message);
    this.name = 'LocalVerificationReceiptError';
    this.code = code;
    this.status = 'failed';
    this.target = target;
  }
}

function fail(code, message, target = null) {
  throw new LocalVerificationReceiptError(code, message, target);
}

function normalizeMachinePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/\/$/u, '');
}

function runGit(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    shell: false,
  });
  if (result.status !== 0) fail('local_verification_git_unavailable', '无法读取本地验证仓库的 Git 状态', 'git');
  return result.stdout.trim();
}

export function collectRepositorySnapshot(root) {
  const repositoryRoot = fs.realpathSync(path.resolve(root));
  const topLevelText = runGit(repositoryRoot, ['rev-parse', '--show-toplevel']);
  let topLevel;
  try {
    topLevel = fs.realpathSync(path.resolve(topLevelText));
  } catch {
    fail('local_verification_git_root_invalid', 'Git 顶层目录无法规范化', 'git-root');
  }
  const comparableRoot = normalizeMachinePath(repositoryRoot);
  const comparableTopLevel = normalizeMachinePath(topLevel);
  const sameRoot = process.platform === 'win32'
    ? comparableRoot.toLowerCase() === comparableTopLevel.toLowerCase()
    : comparableRoot === comparableTopLevel;
  if (!sameRoot) fail('local_verification_git_root_mismatch', '目标目录必须是 Git 顶层目录', 'git-root');
  return {
    revision: runGit(repositoryRoot, ['rev-parse', 'HEAD']).toLowerCase(),
    status: runGit(repositoryRoot, ['status', '--porcelain=v1', '--untracked-files=all']),
  };
}

function normalizeOptions({ root = process.cwd(), revision, output = null, write = false } = {}) {
  const normalizedRevision = String(revision || '').trim().toLowerCase();
  if (!REVISION_PATTERN.test(normalizedRevision)) {
    fail('invalid_local_verification_revision', '本地验证 revision 必须是 40 位十六进制提交', normalizedRevision || null);
  }
  const config = readLifecycleConfig(root);
  const defaultOutput = `${config.runtimeDirectory}/runs/local-validation/${normalizedRevision.slice(0, 12)}.json`;
  const outputPath = String(output || defaultOutput).trim().replaceAll('\\', '/').replace(/^\.\//u, '');
  const target = resolveSafeProjectPath(config.root, outputPath, '本地验证回执输出', {
    mustExist: false,
    allowDirectory: false,
  });
  const allowedPrefix = `${config.runtimeDirectory}/runs/local-validation/`;
  if (!target.projectPath.startsWith(allowedPrefix)) {
    fail('local_verification_receipt_outside_runtime', `本地验证回执必须位于 ${allowedPrefix}`, target.projectPath);
  }
  return {
    root: config.root,
    revision: normalizedRevision,
    output: target.projectPath,
    write: write === true,
  };
}

function assertSnapshot(snapshot, revision, phase) {
  if (!snapshot || String(snapshot.revision || '').toLowerCase() !== revision) {
    fail('local_verification_revision_mismatch', `本地验证${phase}提交与目标 revision 不一致`, phase);
  }
  if (String(snapshot.status || '')) {
    fail('local_verification_workspace_dirty', `本地验证${phase}工作区不是干净状态`, phase);
  }
}

function verificationSourceDescriptor(root) {
  const source = resolveSafeProjectPath(root, 'scripts/verify.mjs', '统一验证入口', {
    mustExist: true,
    allowDirectory: false,
  });
  const content = fs.readFileSync(source.absolutePath);
  return {
    path: source.projectPath,
    bytes: content.byteLength,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
  };
}

export function collectLocalVerificationReceipt(options = {}, operations = {}) {
  const config = normalizeOptions(options);
  const preview = {
    ok: true,
    status: 'planned',
    code: 'local_verification_receipt_plan',
    write: false,
    revision: config.revision,
    scope: 'all',
    command: ['node', 'scripts/verify.mjs'],
    output: config.output,
    preconditions: ['exact-revision', 'clean-worktree', 'git-top-level', 'output-missing'],
  };
  if (!config.write) return preview;

  const existing = resolveSafeProjectPath(config.root, config.output, '本地验证回执输出', {
    allowDirectory: false,
  });
  if (existing.exists) fail('local_verification_receipt_exists', '本地验证回执已存在，禁止覆盖', existing.projectPath);

  const readSnapshot = operations.readSnapshot || collectRepositorySnapshot;
  assertSnapshot(readSnapshot(config.root), config.revision, '执行前');
  const now = operations.now || Date.now;
  const startedAt = now();
  const executeVerification = operations.runVerification || runVerification;
  const verification = executeVerification({
    repositoryRoot: config.root,
    scope: 'all',
    report: operations.report || ((message) => console.log(message)),
    reportError: operations.reportError || ((message) => console.error(message)),
  });
  if (!verification?.ok || verification.status !== 0 || verification.scope !== 'all') {
    fail('local_verification_failed', '固定完整统一验证未通过', verification?.failedStep || 'verify');
  }
  const finishedAt = now();
  assertSnapshot(readSnapshot(config.root), config.revision, '执行后');
  const descriptor = verificationSourceDescriptor(config.root);
  const platform = operations.platform || {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
  };
  const receipt = {
    schemaVersion: 1,
    kind: RECEIPT_KIND,
    generator: { id: GENERATOR_ID, version: 1 },
    status: 'passed',
    revision: config.revision,
    code: 'verification_passed',
    scope: 'all',
    platform,
    durationMs: Math.max(0, finishedAt - startedAt),
    completed: [...verification.completed],
    evidence: {
      runner: descriptor,
      stepCount: verification.completed.length,
    },
  };
  atomicWriteProjectFile(config.root, config.output, `${JSON.stringify(receipt, null, 2)}\n`, {
    label: '本地验证回执',
    mustNotExist: true,
    operations: operations.fileOperations || {},
  });
  return {
    ...preview,
    status: 'recorded',
    code: 'local_verification_receipt_recorded',
    write: true,
    durationMs: receipt.durationMs,
    completed: receipt.completed,
    receipt: config.output,
  };
}

function requiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) fail('missing_cli_value', `参数 ${option} 缺少值`, option);
  return value;
}

function parseArgs(argv) {
  const result = { root: process.cwd(), revision: null, output: null, write: false };
  const valueOptions = new Map([
    ['--target', 'root'], ['--revision', 'revision'], ['--output', 'output'],
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
    code: error?.code || 'local_verification_receipt_failed',
    target: error?.target || null,
    error: error?.message || String(error),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(collectLocalVerificationReceipt(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(JSON.stringify(publicFailure(error), null, 2));
    process.exitCode = 1;
  }
}
