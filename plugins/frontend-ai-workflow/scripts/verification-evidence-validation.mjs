import fs from 'node:fs';
import path from 'node:path';
import { ProjectPathError } from './project-path-safety.mjs';
import {
  VerificationSemanticError,
  computeVerificationSemanticBinding,
} from './verification-semantics.mjs';
import { UI_REVIEW_STATE_VERSION } from './ui-review-contract.mjs';
import { assertState } from './ui-review-state.mjs';
import {
  EVIDENCE_KINDS,
  EVIDENCE_SCHEMA_VERSION,
  LEGACY_EVIDENCE_SCHEMA_VERSION,
  EvidenceError,
  computeWorkspaceFingerprint,
  extractEvidenceReferences,
  hashFile,
  isInside,
  normalizedRepositoryPath,
  relativeToRoot,
  resolveSafePath,
  stableJson,
  verificationEvidenceRequired,
} from './verification-evidence-foundation.mjs';

export function createEvidenceFileDescriptor(root, candidate, label = '证据文件') {
  const absolutePath = resolveSafePath(root, candidate, label, { mustExist: true });
  if (!fs.statSync(absolutePath).isFile()) {
    throw new EvidenceError('invalid_evidence_file', `${label}必须是普通文件：${candidate}`, candidate);
  }
  return {
    path: relativeToRoot(root, absolutePath),
    bytes: fs.statSync(absolutePath).size,
    sha256: hashFile(absolutePath),
  };
}

function invalidManifest(code, message, target, evidenceId, extra = {}) {
  return {
    ok: false,
    code,
    status: 'failed',
    target,
    evidenceId,
    fresh: extra.fresh ?? null,
    trust: extra.trust ?? null,
    message,
    ...extra,
  };
}

function validateEvidenceFileDescriptor(root, descriptor, label, evidenceId) {
  const target = normalizedRepositoryPath(descriptor?.path);
  if (
    !descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)
    || !target || !Number.isInteger(descriptor.bytes) || descriptor.bytes < 0
    || !/^[a-f0-9]{64}$/u.test(descriptor.sha256 || '')
  ) {
    return invalidManifest('invalid_evidence_file_descriptor', `${label}缺少路径、字节数或 SHA-256`, target || label, evidenceId);
  }
  if (descriptor.path !== target) {
    return invalidManifest('invalid_evidence_file_descriptor', `${label}路径必须是规范化的项目相对路径`, target, evidenceId);
  }
  let absolutePath;
  try {
    absolutePath = resolveSafePath(root, target, label, { mustExist: true });
  } catch (error) {
    const normalized = error instanceof EvidenceError ? error : new EvidenceError('evidence_file_missing', error.message, target);
    return invalidManifest(normalized.code, normalized.message, normalized.target || target, evidenceId);
  }
  const stats = fs.statSync(absolutePath);
  if (!stats.isFile()) return invalidManifest('invalid_evidence_file', `${label}必须是普通文件`, target, evidenceId);
  if (stats.size !== descriptor.bytes) return invalidManifest('evidence_file_size_mismatch', `${label}字节数与记录不一致`, target, evidenceId);
  const currentHash = hashFile(absolutePath);
  if (currentHash !== descriptor.sha256) return invalidManifest('evidence_file_hash_mismatch', `${label}内容哈希与记录不一致`, target, evidenceId);
  return { ok: true, absolutePath, target };
}

function validateEvidenceFiles(root, descriptors, label, evidenceId) {
  if (!Array.isArray(descriptors)) {
    return invalidManifest('invalid_evidence_file_descriptor', `${label}必须是文件描述数组`, label, evidenceId);
  }
  for (const [index, descriptor] of descriptors.entries()) {
    const validation = validateEvidenceFileDescriptor(root, descriptor, `${label}[${index}]`, evidenceId);
    if (!validation.ok) return validation;
  }
  return { ok: true };
}

export function assertEvidenceFiles(root, descriptors, label, evidenceId) {
  const validation = validateEvidenceFiles(root, descriptors, label, evidenceId);
  if (!validation.ok) throw new EvidenceError(validation.code, validation.message, validation.target);
}

function validExternal(manifest) {
  const external = manifest.external;
  return external && typeof external === 'object'
    && /^https?:\/\//iu.test(external.url || '')
    && /^[a-f0-9]{40,64}$/iu.test(external.commit || '')
    && Array.isArray(external.jobs)
    && external.jobs.length > 0
    && external.jobs.every((job) => job && typeof job.name === 'string' && job.status === 'passed');
}

export function validateEvidenceManifest({
  root,
  changePath,
  evidencePath,
  expectedId,
  expectedRequirement,
  manifest,
  strict = verificationEvidenceRequired(changePath),
} = {}) {
  let resolved;
  let data = manifest;
  try {
    const projectRoot = fs.realpathSync(path.resolve(root));
    resolved = resolveSafePath(projectRoot, evidencePath, '机器证据', { mustExist: data === undefined });
    const realChangePath = fs.realpathSync(path.resolve(changePath));
    if (!isInside(realChangePath, resolved)) {
      return invalidManifest('unsafe_evidence_path', '机器证据必须位于所选变更目录内', relativeToRoot(projectRoot, resolved), expectedId);
    }
    if (data === undefined) {
      try {
        data = JSON.parse(fs.readFileSync(resolved, 'utf8'));
      } catch (error) {
        return invalidManifest('invalid_evidence_json', `机器证据 JSON 无法解析：${error.message}`, relativeToRoot(projectRoot, resolved), expectedId);
      }
    }
    const target = relativeToRoot(projectRoot, resolved);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return invalidManifest('invalid_evidence_manifest', '机器证据必须是 JSON 对象', target, expectedId);
    if (data.schemaVersion === LEGACY_EVIDENCE_SCHEMA_VERSION) {
      if (strict) {
        return invalidManifest('legacy_evidence_schema', '严格证据门禁不接受历史 schema v1，请重新生成机器证据', target, expectedId, { trust: 'legacy' });
      }
      return {
        ok: true,
        code: 'legacy_evidence_schema',
        status: 'warning',
        target,
        evidenceId: expectedId,
        fresh: null,
        trust: 'legacy',
        kind: data.kind || null,
        manifest: data,
        message: '历史 schema v1 仅作兼容记录，不计入可信机器证据',
      };
    }
    if (data.schemaVersion !== EVIDENCE_SCHEMA_VERSION) return invalidManifest('unsupported_evidence_schema', `机器证据版本不受支持：${String(data.schemaVersion)}`, target, expectedId);
    if (data.evidenceId !== expectedId) return invalidManifest('evidence_id_mismatch', `机器证据 ID 与验证记录不一致：${data.evidenceId || '空值'} / ${expectedId}`, target, expectedId);
    if (!EVIDENCE_KINDS.has(data.kind)) return invalidManifest('unsupported_evidence_kind', `机器证据类型不受支持：${data.kind || '空值'}`, target, expectedId);
    if (data.status !== 'passed') return invalidManifest('evidence_not_passed', `机器证据状态不是 passed：${data.status || '空值'}`, target, expectedId);
    const canonicalChange = path.basename(changePath).replace(/^\d{4}-\d{2}-\d{2}-/u, '');
    if (data.change !== canonicalChange) return invalidManifest('evidence_change_mismatch', `机器证据变更不一致：${data.change || '空值'} / ${canonicalChange}`, target, expectedId);
    let recordedRequirement;
    try {
      recordedRequirement = resolveSafePath(projectRoot, data.requirement, '机器证据关联需求', { mustExist: true });
    } catch (error) {
      const normalized = error instanceof EvidenceError ? error : new EvidenceError('evidence_requirement_missing', error.message, data.requirement || null);
      return invalidManifest(normalized.code, normalized.message, normalized.target, expectedId);
    }
    if (expectedRequirement) {
      const selectedRequirement = resolveSafePath(projectRoot, expectedRequirement, '所选需求', { mustExist: true });
      if (fs.realpathSync(recordedRequirement) !== fs.realpathSync(selectedRequirement)) {
        return invalidManifest('evidence_requirement_mismatch', '机器证据关联需求与当前需求不一致', target, expectedId);
      }
    }
    resolveSafePath(projectRoot, path.join(changePath, 'test-plan.md'), '机器证据测试方案', { mustExist: true });

    let currentSemanticBinding;
    try {
      currentSemanticBinding = computeVerificationSemanticBinding({ requirementPath: recordedRequirement, changePath, evidenceId: expectedId });
    } catch (error) {
      const normalized = error instanceof VerificationSemanticError
        ? error
        : new VerificationSemanticError('semantic_binding_failed', error.message, target);
      return invalidManifest(normalized.code, normalized.message, normalized.target || target, expectedId, { fresh: false });
    }
    if (
      !data.semanticBinding || typeof data.semanticBinding !== 'object' || Array.isArray(data.semanticBinding)
      || stableJson(data.semanticBinding) !== stableJson(currentSemanticBinding)
    ) {
      return invalidManifest('stale_semantic_evidence', '机器证据对应的需求决策、验收、验证或测试语义已经变化', target, expectedId, {
        fresh: false,
        semanticFresh: false,
        actualSemanticBinding: currentSemanticBinding,
        recordedSemanticBinding: data.semanticBinding || null,
      });
    }

    const logValidation = validateEvidenceFiles(projectRoot, data.logs, '验证日志', expectedId);
    if (!logValidation.ok) return logValidation;
    const artifactValidation = validateEvidenceFiles(projectRoot, data.artifacts, '验证产物', expectedId);
    if (!artifactValidation.ok) return artifactValidation;

    if (data.kind === 'local-command') {
      if (!data.command || typeof data.command.executable !== 'string' || !Array.isArray(data.command.args)) {
        return invalidManifest('invalid_evidence_command', '本地机器证据缺少命令参数', target, expectedId);
      }
      if (data.exitCode !== 0) return invalidManifest('evidence_command_failed', `机器证据退出码不是 0：${String(data.exitCode)}`, target, expectedId);
      if (typeof data.locator !== 'string' || !data.locator || !Number.isInteger(data.locatorMatches) || data.locatorMatches <= 0) {
        return invalidManifest('zero_test_locator', '机器证据没有命中计划测试定位', target, expectedId);
      }
      if (data.logs.length === 0 || data.logs.some((item) => !['stdout', 'stderr'].includes(item?.stream))) {
        return invalidManifest('invalid_evidence_logs', '本地机器证据缺少可校验的 stdout/stderr 日志', target, expectedId);
      }
      if (!/^[a-f0-9]{64}$/u.test(data.workspaceFingerprint || '')) return invalidManifest('invalid_workspace_fingerprint', '机器证据缺少有效工作区指纹', target, expectedId);
      const current = computeWorkspaceFingerprint(projectRoot).digest;
      if (current !== data.workspaceFingerprint) {
        return invalidManifest('stale_evidence', '机器证据对应的工作区已经变化', target, expectedId, { fresh: false, actualFingerprint: current, recordedFingerprint: data.workspaceFingerprint });
      }
      return { ok: true, code: 'evidence_valid', status: 'passed', target, evidenceId: expectedId, fresh: true, trust: 'local-captured', kind: data.kind, manifest: data };
    }

    if (data.kind === 'external-ci') {
      if (!validExternal(data)) return invalidManifest('invalid_external_evidence', '外部 CI 证据缺少 URL、精确提交或通过任务', target, expectedId);
      return {
        ok: true,
        code: 'external_evidence_recorded',
        status: 'recorded',
        target,
        evidenceId: expectedId,
        fresh: null,
        trust: 'external-recorded',
        kind: data.kind,
        manifest: data,
        message: '外部 CI 引用已记录，但当前插件没有独立远程读取回执',
      };
    }

    const uiReview = data.uiReview;
    if (
      !uiReview || typeof uiReview !== 'object' || Array.isArray(uiReview)
      || typeof uiReview.runId !== 'string' || typeof uiReview.scenarioId !== 'string'
      || !/^[a-f0-9]{64}$/u.test(uiReview.scenarioFingerprint || '')
      || typeof uiReview.actualCapture !== 'string' || typeof uiReview.statePath !== 'string'
    ) {
      return invalidManifest('invalid_ui_review_evidence', 'UI Review 证据缺少运行、场景、采集器或状态路径身份', target, expectedId);
    }
    if (uiReview.state?.path !== normalizedRepositoryPath(uiReview.statePath)) {
      return invalidManifest('ui_review_state_mismatch', 'UI Review 状态文件描述与状态路径不一致', target, expectedId);
    }
    const stateValidation = validateEvidenceFileDescriptor(projectRoot, uiReview.state, 'UI Review 状态', expectedId);
    if (!stateValidation.ok) return stateValidation;
    let state;
    try {
      state = JSON.parse(fs.readFileSync(stateValidation.absolutePath, 'utf8'));
      assertState(state);
    } catch (error) {
      return invalidManifest('invalid_ui_review_state', `UI Review 状态无效：${error.message}`, stateValidation.target, expectedId);
    }
    if (state.schemaVersion !== UI_REVIEW_STATE_VERSION) return invalidManifest('legacy_ui_review_state', '严格 UI Review 证据不接受历史状态版本', stateValidation.target, expectedId, { trust: 'legacy' });
    if (state.status !== 'passed') return invalidManifest('ui_review_not_passed', `UI Review 状态不是 passed：${state.status || '空值'}`, stateValidation.target, expectedId);
    if (
      state.runId !== uiReview.runId
      || state.scenarioId !== uiReview.scenarioId
      || state.scenarioFingerprint !== uiReview.scenarioFingerprint
      || state.capture !== uiReview.actualCapture
    ) {
      return invalidManifest('ui_review_identity_mismatch', 'UI Review 清单与持久状态身份不一致', stateValidation.target, expectedId);
    }
    const requiredArtifactPaths = [
      state.artifacts?.actualScreenshot,
      state.artifacts?.annotatedScreenshot,
      state.artifacts?.report,
    ].map(normalizedRepositoryPath);
    if (requiredArtifactPaths.some((item) => !item)) return invalidManifest('invalid_ui_review_artifacts', 'UI Review 状态缺少截图或报告路径', stateValidation.target, expectedId);
    const recordedArtifactPaths = data.artifacts.map((item) => normalizedRepositoryPath(item.path)).sort();
    if (stableJson(recordedArtifactPaths) !== stableJson([...requiredArtifactPaths].sort())) {
      return invalidManifest('ui_review_artifact_mismatch', 'UI Review 清单没有完整绑定实际截图、标注截图和报告', target, expectedId);
    }
    return { ok: true, code: 'ui_review_evidence_valid', status: 'passed', target, evidenceId: expectedId, fresh: true, trust: 'ui-review-state', kind: data.kind, manifest: data };
  } catch (error) {
    const normalized = error instanceof EvidenceError || error instanceof ProjectPathError
      ? error
      : new EvidenceError('invalid_evidence_manifest', error.message);
    return invalidManifest(normalized.code, normalized.message, normalized.target || evidencePath || null, expectedId);
  }
}

function recordValue(record, english, chinese) {
  return record?.[english] ?? record?.[chinese] ?? null;
}

// 普通配置或报告 JSON 只作为持久资料，显式 V-* 或 evidence 目录才代表机器证据。
function isMachineEvidenceCandidate(candidatePath) {
  const normalized = candidatePath.replace(/\\/gu, '/');
  if (!normalized.toLowerCase().endsWith('.json')) return false;
  const segments = normalized.split('/').filter(Boolean);
  const fileName = segments.at(-1) || '';
  return /^V-\d+\.json$/iu.test(fileName)
    || segments.slice(0, -1).some((segment) => segment.toLowerCase() === 'evidence');
}

export function validateVerificationEvidenceRecords({ root, changePath, requirementPath = null, records = [] } = {}) {
  const projectRoot = fs.realpathSync(path.resolve(root));
  const required = verificationEvidenceRequired(changePath);
  const diagnostics = [];
  let verifiedFiles = 0;
  for (const record of records) {
    const id = recordValue(record, 'id', '验证ID');
    const type = recordValue(record, 'type', '验证类型');
    const result = recordValue(record, 'result', '结果');
    const evidence = recordValue(record, 'evidence', '证据位置');
    if (result !== '通过') continue;
    const references = extractEvidenceReferences(evidence);
    const existing = [];
    for (const candidate of references.paths) {
      try {
        const absolutePath = resolveSafePath(projectRoot, candidate, `验证记录 ${id} 的持久证据`, { mustExist: true });
        verifiedFiles += 1;
        existing.push({ path: candidate, absolutePath });
      } catch (error) {
        const normalized = error instanceof EvidenceError ? error : new EvidenceError('evidence_file_missing', error.message, candidate);
        diagnostics.push({ code: normalized.code, status: required ? 'failed' : 'warning', target: normalized.target || candidate, evidenceId: id, message: normalized.message });
      }
    }
    if (type !== '自动' && type !== '自动+人工') continue;
    const jsonEvidence = existing.filter((item) => isMachineEvidenceCandidate(item.path));
    let validMachineEvidence = false;
    for (const item of jsonEvidence) {
      const validation = validateEvidenceManifest({
        root: projectRoot,
        changePath,
        evidencePath: item.absolutePath,
        expectedId: id,
        expectedRequirement: requirementPath,
        strict: required,
      });
      diagnostics.push({
        code: validation.code,
        status: validation.ok ? validation.status : (required ? 'failed' : 'warning'),
        target: validation.target,
        evidenceId: id,
        kind: validation.kind || null,
        locator: validation.manifest?.locator || null,
        locatorMatches: validation.manifest?.locatorMatches ?? null,
        fresh: validation.fresh,
        trust: validation.trust,
        message: validation.message || null,
      });
      if (validation.ok && validation.status === 'passed' && ['local-captured', 'ui-review-state'].includes(validation.trust)) {
        validMachineEvidence = true;
      }
    }
    if (required && !validMachineEvidence) {
      diagnostics.push({ code: 'machine_evidence_missing', status: 'failed', target: id, evidenceId: id, fresh: null, trust: null, message: `自动验证记录 ${id} 缺少同 ID 的有效机器证据` });
    } else if (!required && !validMachineEvidence) {
      diagnostics.push({ code: 'legacy_markdown_evidence', status: 'warning', target: id, evidenceId: id, fresh: null, trust: 'legacy', message: `历史验证记录 ${id} 只有 Markdown 或其他非机器证据` });
    }
  }
  return {
    ok: !diagnostics.some((item) => item.status === 'failed'),
    required,
    executed: false,
    verifiedFiles,
    diagnostics,
  };
}
