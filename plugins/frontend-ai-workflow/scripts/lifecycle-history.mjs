import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { atomicWriteProjectFile, ensureSafeProjectDirectory } from './project-path-safety.mjs';
import {
  LIFECYCLE_CONFIG_PATH,
  LifecycleError,
  lifecycleEventYear,
  normalizeLifecycleEvent,
  normalizeRepositoryPath,
  readLifecycleConfig,
} from './lifecycle-contract.mjs';

function eventFiles(config) {
  const root = path.join(config.root, config.eventDirectory);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^\d{4}\.jsonl$/u.test(entry.name))
    .map((entry) => path.join(root, entry.name))
    .sort();
}

function diagnostic(code, target, message) {
  return { code, status: 'failed', target, message };
}

function git(root, args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', shell: false, maxBuffer: 10 * 1024 * 1024 });
}

export function lifecycleEventIdsAtRevision({ root = process.cwd(), revision } = {}) {
  const config = readLifecycleConfig(root);
  if (!revision) {
    return { ok: false, eventIds: new Set(), diagnostics: [diagnostic('lifecycle_base_unavailable', '.', '目标分支版本不可用')] };
  }
  const verify = git(config.root, ['rev-parse', '--verify', `${revision}^{commit}`]);
  if (verify.status !== 0) {
    return { ok: false, eventIds: new Set(), diagnostics: [diagnostic('lifecycle_base_unavailable', revision || '.', '目标分支版本不可用')] };
  }
  const listed = git(config.root, ['ls-tree', '-r', '--name-only', revision, '--', config.eventDirectory]);
  if (listed.status !== 0) {
    return { ok: false, eventIds: new Set(), diagnostics: [diagnostic('lifecycle_base_unavailable', revision, '无法读取目标分支事件')] };
  }
  const eventIds = new Set();
  const diagnostics = [];
  for (const file of listed.stdout.split('\n').filter((item) => item.endsWith('.jsonl'))) {
    const content = git(config.root, ['show', `${revision}:${file}`]);
    if (content.status !== 0) {
      diagnostics.push(diagnostic('lifecycle_base_unavailable', file, '无法读取目标分支事件文件'));
      continue;
    }
    for (const [index, line] of content.stdout.split('\n').entries()) {
      if (!line.trim()) continue;
      try {
        eventIds.add(normalizeLifecycleEvent(JSON.parse(line), { maxBytes: config.eventMaxBytes }).eventId);
      } catch (error) {
        diagnostics.push(diagnostic(error.code || 'invalid_lifecycle_event', `${file}:${index + 1}`, error.message));
      }
    }
  }
  return { ok: diagnostics.length === 0, eventIds, diagnostics };
}

export function readLifecycleEvents({ root = process.cwd(), config = null } = {}) {
  const resolved = config || readLifecycleConfig(root);
  const events = [];
  const diagnostics = [];
  for (const file of eventFiles(resolved)) {
    const relative = path.relative(resolved.root, file).replaceAll('\\', '/');
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].trim()) continue;
      try {
        events.push(normalizeLifecycleEvent(JSON.parse(lines[index]), { maxBytes: resolved.eventMaxBytes }));
      } catch (error) {
        diagnostics.push(diagnostic(error.code || 'invalid_lifecycle_event', `${relative}:${index + 1}`, error.message));
      }
    }
  }
  const byId = new Map();
  for (const event of events) {
    if (byId.has(event.eventId)) diagnostics.push(diagnostic('duplicate_lifecycle_event', event.eventId, 'eventId 重复'));
    else byId.set(event.eventId, event);
  }
  for (const event of events) {
    if (event.supersedes && !byId.has(event.supersedes)) {
      diagnostics.push(diagnostic('unknown_superseded_event', event.eventId, `supersedes 指向未知事件 ${event.supersedes}`));
    }
  }
  return { config: resolved, events, diagnostics };
}

export function projectLifecycleState({ root = process.cwd(), scope = '.', changeId, mergedEventIds = null, mergedRevision = null } = {}) {
  const normalizedScope = normalizeRepositoryPath(scope, 'scope', { allowRoot: true });
  const history = readLifecycleEvents({ root });
  const relevant = history.events.filter((event) => event.scope === normalizedScope && event.changeId === changeId);
  const activePath = path.join(history.config.root, 'openspec', 'changes', changeId);
  const active = fs.existsSync(activePath);
  const diagnostics = [...history.diagnostics];
  let mergedIds = mergedEventIds;
  if (mergedRevision) {
    const mergedHistory = lifecycleEventIdsAtRevision({ root: history.config.root, revision: mergedRevision });
    diagnostics.push(...mergedHistory.diagnostics);
    mergedIds = mergedHistory.eventIds;
  }
  if (relevant.length === 0) return { status: active ? 'active' : 'unknown', active, event: null, diagnostics };

  const revisions = new Map();
  for (const event of relevant) {
    if (revisions.has(event.revision)) diagnostics.push(diagnostic('lifecycle_revision_conflict', event.eventId, `revision ${event.revision} 存在分叉`));
    else revisions.set(event.revision, event);
  }
  for (const item of relevant) {
    if (item.revision === 1 && item.supersedes) diagnostics.push(diagnostic('invalid_lifecycle_supersedes', item.eventId, '首个 revision 不能 supersede 既有事件'));
    if (item.revision > 1) {
      const predecessor = relevant.find((candidate) => candidate.eventId === item.supersedes);
      if (!predecessor || predecessor.revision !== item.revision - 1) {
        diagnostics.push(diagnostic('invalid_lifecycle_supersedes', item.eventId, '后续 revision 必须 supersede 前一个 revision'));
      } else if (item.type === 'reopened' && !['accepted', 'cancelled', 'superseded'].includes(predecessor.type)) {
        diagnostics.push(diagnostic('invalid_reopen_target', item.eventId, 'reopened 必须 supersede 一个终态事件'));
      }
    }
  }
  const superseded = new Set(relevant.map((event) => event.supersedes).filter(Boolean));
  const heads = relevant.filter((event) => !superseded.has(event.eventId));
  if (heads.length !== 1 || diagnostics.some((item) => item.status === 'failed')) {
    return { status: 'unknown', active, event: null, diagnostics };
  }
  const head = heads[0];
  if (active) {
    if (head.type === 'reopened') return { status: 'active', active, event: head, diagnostics };
    diagnostics.push(diagnostic('active_terminal_conflict', changeId, '活动变更与终态事件同时存在且没有 reopened 关系'));
    return { status: 'unknown', active, event: head, diagnostics };
  }
  if (head.type === 'accepted') {
    const merged = mergedIds instanceof Set && mergedIds.has(head.eventId);
    return { status: merged ? 'accepted-merged' : 'accepted-local', active, event: head, diagnostics };
  }
  return { status: head.type, active, event: head, diagnostics };
}

export function appendLifecycleEvent({ root = process.cwd(), event, strictEvidence = null } = {}) {
  const config = readLifecycleConfig(root);
  if (config.lifecycleMode !== 'v2') throw new LifecycleError('lifecycle_write_disabled', '当前仓库处于 legacy-readonly，禁止写入 v2 事件', LIFECYCLE_CONFIG_PATH);
  const normalized = normalizeLifecycleEvent(event, { maxBytes: config.eventMaxBytes });
  let evidencePayload = null;
  if (strictEvidence !== null) {
    evidencePayload = `${JSON.stringify(strictEvidence, null, 2)}\n`;
    if (Buffer.byteLength(evidencePayload, 'utf8') > config.strictEvidenceMaxBytes) {
      throw new LifecycleError('strict_evidence_too_large', `严格证据超过 ${config.strictEvidenceMaxBytes} 字节`, normalized.eventId);
    }
  }

  const evidenceDirectory = path.join(config.root, config.eventDirectory, 'evidence');
  const evidencePath = evidencePayload === null ? null : path.join(evidenceDirectory, `${normalized.eventId}.json`);
  if (evidencePath && fs.existsSync(evidencePath) && fs.readFileSync(evidencePath, 'utf8') !== evidencePayload) {
    throw new LifecycleError('strict_evidence_conflict', '同一事件的严格证据内容不一致', normalized.eventId);
  }
  const ensureEvidence = () => {
    if (!evidencePath || fs.existsSync(evidencePath)) return;
    ensureSafeProjectDirectory(config.root, evidenceDirectory, '严格证据目录');
    atomicWriteProjectFile(config.root, evidencePath, evidencePayload, { label: '严格证据包', mustNotExist: true });
  };

  const history = readLifecycleEvents({ config });
  if (history.diagnostics.length) throw new LifecycleError('lifecycle_history_invalid', '生命周期历史包含无效事件，禁止追加', normalized.eventId);
  if (history.events.some((item) => item.eventId === normalized.eventId)) {
    const existing = history.events.find((item) => item.eventId === normalized.eventId);
    if (JSON.stringify(existing) === JSON.stringify(normalized)) {
      ensureEvidence();
      return { event: existing, appended: false, idempotent: true, evidencePath };
    }
    throw new LifecycleError('duplicate_lifecycle_event', '同一 eventId 的内容不一致', normalized.eventId);
  }
  const related = history.events.filter((item) => item.scope === normalized.scope && item.changeId === normalized.changeId);
  if (related.some((item) => item.revision === normalized.revision)) throw new LifecycleError('lifecycle_revision_conflict', '相同 revision 已存在', normalized.eventId);
  const predecessor = related.find((item) => item.eventId === normalized.supersedes);
  if (normalized.revision === 1 && normalized.supersedes) {
    throw new LifecycleError('invalid_lifecycle_supersedes', '首个 revision 不能 supersede 既有事件', normalized.eventId);
  }
  if (normalized.revision > 1 && (!predecessor || predecessor.revision !== normalized.revision - 1)) {
    throw new LifecycleError('invalid_lifecycle_supersedes', '后续 revision 必须 supersede 同一变更的前一个 revision', normalized.eventId);
  }
  if (normalized.type === 'reopened' && !['accepted', 'cancelled', 'superseded'].includes(predecessor?.type)) {
    throw new LifecycleError('invalid_reopen_target', 'reopened 必须 supersede 一个终态事件', normalized.eventId);
  }

  const directory = path.join(config.root, config.eventDirectory);
  ensureSafeProjectDirectory(config.root, directory, '生命周期事件目录');
  const file = path.join(directory, `${lifecycleEventYear(normalized)}.jsonl`);
  const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const content = `${previous && !previous.endsWith('\n') ? `${previous}\n` : previous}${JSON.stringify(normalized)}\n`;
  atomicWriteProjectFile(config.root, file, content, { label: '生命周期事件文件' });

  ensureEvidence();
  return { event: normalized, appended: true, idempotent: false, evidencePath };
}
