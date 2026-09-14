import fs from 'node:fs';
import { LifecycleError, readLifecycleConfig } from './lifecycle-contract.mjs';
import { resolveSafeProjectPath } from './project-path-safety.mjs';

const MAX_RECEIPT_BYTES = 8192;
const MAX_REFERENCE_LENGTH = 500;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

function fail(code, message, target = null) {
  throw new LifecycleError(code, message, target);
}

function normalizeReference(value) {
  const reference = String(value || '').trim();
  if (!reference || reference.length > MAX_REFERENCE_LENGTH || /[\u0000-\u001f\u007f]/u.test(reference)) {
    fail('invalid_external_ci_receipt', '外部 CI 引用为空、过长或包含控制字符');
  }
  let parsed;
  try {
    parsed = new URL(reference);
  } catch {
    fail('invalid_external_ci_receipt', '外部 CI 引用必须是合法 HTTPS URL', reference.slice(0, 120));
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    fail('invalid_external_ci_receipt', '外部 CI 引用必须是无凭据的 HTTPS URL', reference.slice(0, 120));
  }
  return reference;
}

export function readExternalCiReceipt({ root = process.cwd(), receiptPath = null, baseRevision = null } = {}) {
  if (!receiptPath) return { check: { name: 'external-ci', status: 'pending' }, receipt: null };
  const config = readLifecycleConfig(root);
  const target = resolveSafeProjectPath(config.root, receiptPath, '外部 CI 回执', { mustExist: true, allowDirectory: false });
  const allowedPrefix = `${config.runtimeDirectory}/runs/ci-receipts/`;
  if (!target.projectPath.startsWith(allowedPrefix)) {
    fail('external_ci_receipt_outside_runtime', `外部 CI 回执必须位于 ${allowedPrefix}`, target.projectPath);
  }
  const stats = fs.statSync(target.absolutePath);
  if (stats.size > MAX_RECEIPT_BYTES) fail('external_ci_receipt_too_large', `外部 CI 回执超过 ${MAX_RECEIPT_BYTES} 字节`, target.projectPath);
  let receipt;
  try {
    receipt = JSON.parse(fs.readFileSync(target.absolutePath, 'utf8'));
  } catch (error) {
    fail('invalid_external_ci_receipt', `外部 CI 回执无法解析：${error.message}`, target.projectPath);
  }
  if (!receipt || receipt.schemaVersion !== 1 || receipt.status !== 'recorded') {
    fail('invalid_external_ci_receipt', '外部 CI 回执必须使用 schemaVersion 1 和 recorded 状态', target.projectPath);
  }
  const revision = String(receipt.revision || '').trim();
  if (!/^[a-f0-9]{7,64}$/u.test(revision) || !baseRevision || revision !== baseRevision) {
    fail('external_ci_revision_mismatch', '外部 CI 回执 revision 与当前最终候选不一致', revision || target.projectPath);
  }
  if (!Array.isArray(receipt.jobs) || receipt.jobs.length < 1 || receipt.jobs.length > 32) {
    fail('invalid_external_ci_receipt', '外部 CI 回执 jobs 必须包含 1 到 32 项', target.projectPath);
  }
  const names = new Set();
  const jobs = receipt.jobs.map((job, index) => {
    const name = String(job?.name || '').trim();
    const status = String(job?.status || '').trim();
    if (!SAFE_NAME.test(name) || names.has(name) || status !== 'passed') {
      fail('invalid_external_ci_receipt', `外部 CI 回执 jobs[${index}] 必须具有唯一安全名称且状态为 passed`, target.projectPath);
    }
    names.add(name);
    return { name, status };
  });
  const reference = normalizeReference(receipt.reference);
  return {
    check: { name: 'external-ci', status: 'recorded', reference, revision },
    receipt: { schemaVersion: 1, status: 'recorded', revision, reference, jobs },
  };
}
