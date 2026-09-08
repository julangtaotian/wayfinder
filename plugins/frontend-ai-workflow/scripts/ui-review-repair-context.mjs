import fs from 'node:fs';
import { resolveSafeProjectPath } from './project-path-safety.mjs';
import { requireObject, requireString, sha256, stableJson } from './ui-review-contract.mjs';
import { scenarioById } from './ui-review-plan.mjs';
import { assertMutableState, normalizeUiFinding } from './ui-review-state.mjs';

function reject(code, message, target = null) {
  throw Object.assign(new Error(message), { code, target, status: 'blocked' });
}

function checkBaseline(state, config, proposal) {
  assertMutableState(state, 'review', 'needs-fix');
  const scenario = scenarioById(config, state.scenarioId);
  if (proposal.runId !== state.runId || proposal.scenarioFingerprint !== state.scenarioFingerprint
    || scenario.fingerprint !== state.scenarioFingerprint) {
    reject('UI_REPAIR_BASELINE_STALE', '修复上下文与当前验收基线不一致', state.runId);
  }
  return scenario;
}

function sourceCandidate(projectRoot, raw, finding, scenario) {
  const source = requireObject(raw.sourceTarget, '修复源码');
  const safe = resolveSafeProjectPath(projectRoot, source.file, '修复源码', { mustExist: true, allowDirectory: false });
  const declared = scenario.targets.filter((target) => target.selector === finding.selector && target.sourcePath);
  if (declared.some((target) => target.sourcePath !== safe.projectPath)) {
    reject('UI_REPAIR_SOURCE_MISMATCH', '修复源码与目标节点声明不一致', safe.projectPath);
  }
  const bytes = fs.readFileSync(safe.absolutePath);
  if (raw.sourceSha256 !== sha256(bytes)) {
    reject('UI_REPAIR_SOURCE_STALE', '源码摘要已变化，请重新核对修复上下文', safe.projectPath);
  }
  // 摘要绑定原始字节；锚点按统一换行匹配，避免 CRLF 平台误判。
  const content = bytes.toString('utf8').replaceAll('\r\n', '\n');
  const anchor = requireString(source.anchor, '源码锚点').replaceAll('\r\n', '\n');
  const first = content.indexOf(anchor);
  if (first < 0 || content.indexOf(anchor, first + 1) !== -1) {
    reject('UI_REPAIR_ANCHOR_INVALID', '源码锚点不存在或不能唯一定位', safe.projectPath);
  }
  const candidate = normalizeUiFinding({
    ...finding,
    sourceTarget: { ...source, file: safe.projectPath, anchor },
    changeScope: raw.changeScope,
    forbiddenChanges: raw.forbiddenChanges,
    verification: raw.verification,
  });
  const directory = resolveSafeProjectPath(projectRoot, candidate.verification.workingDirectory, '验证工作目录', { mustExist: true });
  if (directory.kind !== 'directory') reject('UI_REPAIR_DIRECTORY_INVALID', '验证工作目录必须是目录', directory.projectPath);
  return { ...candidate, findingFingerprint: finding.fingerprint, sourceSha256: raw.sourceSha256 };
}

// 只补齐候选，不改原始 findings、报告或截图；预览与写入共用此纯状态转换。
export function prepareRepairContext(projectRoot, state, config, input) {
  try {
    const proposal = requireObject(input, '修复上下文');
    const scenario = checkBaseline(state, config, proposal);
    if (!Array.isArray(proposal.candidates) || proposal.candidates.length === 0) {
      reject('UI_REPAIR_CANDIDATES_EMPTY', '至少需要一个有源码依据的修复候选');
    }
    const seen = new Set();
    const candidates = proposal.candidates.map((value) => {
      const raw = requireObject(value, '修复候选');
      const matches = (state.findings || []).filter((finding) => finding.id === raw.findingId);
      if (matches.length !== 1 || matches[0].fingerprint !== raw.findingFingerprint) {
        reject('UI_REPAIR_FINDING_STALE', '候选没有唯一匹配的原始发现', raw.findingId);
      }
      if (seen.has(raw.findingId)) reject('UI_REPAIR_DUPLICATE', '修复候选重复', raw.findingId);
      seen.add(raw.findingId);
      return sourceCandidate(projectRoot, raw, matches[0], scenario);
    });
    const repairContext = {
      runId: state.runId,
      scenarioFingerprint: state.scenarioFingerprint,
      findingsSha256: sha256(stableJson(state.findings)),
    };
    if (stableJson(state.repairCandidates) === stableJson(candidates)
      && stableJson(state.repairContext) === stableJson(repairContext)) return state;
    return { ...state, repairCandidates: candidates, repairContext, updatedAt: new Date().toISOString() };
  } catch (error) {
    // 保留共享路径校验的机器 code，普通字段错误统一归入上下文错误。
    error.code ||= 'UI_REPAIR_CONTEXT_INVALID';
    error.status ||= 'blocked';
    throw error;
  }
}

export function assertRepairContextFresh(projectRoot, state, config) {
  if (!state.repairContext) return; // 历史 v2 候选继续沿用原门禁，不伪造来源摘要。
  if (state.repairContext.findingsSha256 !== sha256(stableJson(state.findings))) {
    reject('UI_REPAIR_FINDING_STALE', '原始发现已变化，请重新核对修复上下文', state.runId);
  }
  const refreshed = prepareRepairContext(projectRoot, state, config, {
    ...state.repairContext,
    candidates: state.repairCandidates.map((candidate) => ({ ...candidate, findingId: candidate.id })),
  });
  if (stableJson(refreshed.repairCandidates) !== stableJson(state.repairCandidates)) {
    reject('UI_REPAIR_FINDING_STALE', '修复候选与原始发现不一致', state.runId);
  }
}
