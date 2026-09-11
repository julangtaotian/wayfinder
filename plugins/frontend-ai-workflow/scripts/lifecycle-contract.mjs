import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolveCanonicalProjectRoot, resolveSafeProjectPath } from './project-path-safety.mjs';

export const LIFECYCLE_SCHEMA_VERSION = 2;
export const LIFECYCLE_WRITER_VERSION = '0.19.0';
export const LIFECYCLE_CONFIG_PATH = '.frontend-workflow.json';
export const LIFECYCLE_MODES = new Set(['legacy-readonly', 'v2']);
export const LIFECYCLE_EVENT_TYPES = new Set(['accepted', 'cancelled', 'superseded', 'reopened']);
export const LIFECYCLE_TRUST_LEVELS = new Set(['declared', 'local-verified', 'external-recorded']);
export const DEFAULT_LIFECYCLE_CONFIG = Object.freeze({
  schemaVersion: LIFECYCLE_SCHEMA_VERSION,
  minimumWriterVersion: LIFECYCLE_WRITER_VERSION,
  lifecycleMode: 'legacy-readonly',
  eventDirectory: '.workflow-history',
  runtimeDirectory: '.frontend-ai-workflow',
  strictEvidenceMaxBytes: 4096,
  eventMaxBytes: 4096,
});

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const EVENT_ID = /^[a-z0-9][a-z0-9-]{7,95}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

export class LifecycleError extends Error {
  constructor(code, message, target = null, status = 'blocked') {
    super(message);
    this.name = 'LifecycleError';
    this.code = code;
    this.status = status;
    this.target = target;
  }
}

function fail(code, message, target = null) {
  throw new LifecycleError(code, message, target);
}

export function canonicalText(value) {
  return String(value ?? '').replace(/\r\n?/gu, '\n').normalize('NFC');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(canonicalText(value), 'utf8').digest('hex');
}

export function normalizeRepositoryPath(value, label = '仓库路径', { allowRoot = false } = {}) {
  const raw = canonicalText(value).trim().replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/+$/u, '');
  if ((allowRoot && (raw === '' || raw === '.'))) return '.';
  if (!raw || path.posix.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    fail('invalid_lifecycle_path', `${label}必须是仓库相对路径`, raw || null);
  }
  const segments = raw.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    fail('invalid_lifecycle_path', `${label}不能包含空路径段、. 或 ..`, raw);
  }
  if (raw.length > 240 || CONTROL_CHARACTERS.test(raw)) {
    fail('invalid_lifecycle_path', `${label}包含控制字符或长度超过 240`, raw.slice(0, 240));
  }
  return raw;
}

function requireSafeId(value, label) {
  const normalized = canonicalText(value).trim();
  if (!SAFE_ID.test(normalized)) fail('invalid_lifecycle_event', `${label}格式无效`, normalized.slice(0, 128));
  return normalized;
}

function normalizeStringArray(value, label, { maxItems = 64, maxLength = 240 } = {}) {
  if (!Array.isArray(value) || value.length > maxItems) fail('invalid_lifecycle_event', `${label}必须是至多 ${maxItems} 项的数组`, label);
  const result = value.map((item) => {
    const text = canonicalText(item).trim();
    if (!text || text.length > maxLength || CONTROL_CHARACTERS.test(text)) {
      fail('invalid_lifecycle_event', `${label}包含空值、控制字符或超长内容`, label);
    }
    return text;
  });
  if (new Set(result).size !== result.length) fail('invalid_lifecycle_event', `${label}不能包含重复项`, label);
  return result;
}

function normalizeChecks(value) {
  if (!Array.isArray(value) || value.length > 32) fail('invalid_lifecycle_event', 'checks 必须是至多 32 项的数组', 'checks');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('invalid_lifecycle_event', `checks[${index}] 必须是对象`, 'checks');
    const name = requireSafeId(item.name, `checks[${index}].name`);
    const status = canonicalText(item.status).trim();
    if (!['passed', 'pending', 'recorded', 'failed'].includes(status)) {
      fail('invalid_lifecycle_event', `checks[${index}].status 无效`, status);
    }
    return { name, status };
  });
}

export function normalizeLifecycleEvent(value, { maxBytes = 4096 } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_lifecycle_event', '生命周期事件必须是对象');
  const event = {
    schemaVersion: Number(value.schemaVersion),
    eventId: canonicalText(value.eventId).trim(),
    scope: normalizeRepositoryPath(value.scope ?? '.', 'scope', { allowRoot: true }),
    changeId: requireSafeId(value.changeId, 'changeId'),
    requirementId: requireSafeId(value.requirementId, 'requirementId'),
    type: canonicalText(value.type).trim(),
    revision: Number(value.revision),
    occurredAt: canonicalText(value.occurredAt).trim(),
    baseRevision: value.baseRevision == null ? null : canonicalText(value.baseRevision).trim(),
    capabilities: normalizeStringArray(value.capabilities || [], 'capabilities'),
    specDigest: canonicalText(value.specDigest).trim(),
    checks: normalizeChecks(value.checks || []),
    trust: canonicalText(value.trust).trim(),
    supersedes: value.supersedes == null ? null : canonicalText(value.supersedes).trim(),
  };
  if (event.schemaVersion !== LIFECYCLE_SCHEMA_VERSION) fail('lifecycle_schema_mismatch', `生命周期事件 schemaVersion 必须为 ${LIFECYCLE_SCHEMA_VERSION}`);
  if (!EVENT_ID.test(event.eventId)) fail('invalid_lifecycle_event', 'eventId 格式无效', event.eventId);
  if (!LIFECYCLE_EVENT_TYPES.has(event.type)) fail('invalid_lifecycle_event', 'type 无效', event.type);
  if (!Number.isSafeInteger(event.revision) || event.revision < 1) fail('invalid_lifecycle_event', 'revision 必须是正整数', String(event.revision));
  const date = new Date(event.occurredAt);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== event.occurredAt) fail('invalid_lifecycle_event', 'occurredAt 必须是 ISO UTC 时间', event.occurredAt);
  if (event.baseRevision && !/^[a-f0-9]{7,64}$/u.test(event.baseRevision)) fail('invalid_lifecycle_event', 'baseRevision 格式无效', event.baseRevision);
  if (!SHA256.test(event.specDigest)) fail('invalid_lifecycle_event', 'specDigest 必须是 SHA-256', event.specDigest);
  if (!LIFECYCLE_TRUST_LEVELS.has(event.trust)) fail('invalid_lifecycle_event', 'trust 无效', event.trust);
  if (event.supersedes && !EVENT_ID.test(event.supersedes)) fail('invalid_lifecycle_event', 'supersedes 格式无效', event.supersedes);
  const bytes = Buffer.byteLength(`${JSON.stringify(event)}\n`, 'utf8');
  if (bytes > maxBytes) fail('lifecycle_event_too_large', `生命周期事件超过 ${maxBytes} 字节`, event.eventId);
  return event;
}

export function readLifecycleConfig(root = process.cwd()) {
  const repositoryRoot = resolveCanonicalProjectRoot(root);
  const configPath = path.join(repositoryRoot, LIFECYCLE_CONFIG_PATH);
  if (!fs.existsSync(configPath)) return { root: repositoryRoot, configPath, ...DEFAULT_LIFECYCLE_CONFIG, source: 'default' };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    fail('invalid_lifecycle_config', `生命周期配置无法解析：${error.message}`, LIFECYCLE_CONFIG_PATH);
  }
  const config = { ...DEFAULT_LIFECYCLE_CONFIG, ...parsed };
  if (config.schemaVersion !== LIFECYCLE_SCHEMA_VERSION) fail('lifecycle_schema_mismatch', `生命周期配置 schemaVersion 必须为 ${LIFECYCLE_SCHEMA_VERSION}`, LIFECYCLE_CONFIG_PATH);
  if (!LIFECYCLE_MODES.has(config.lifecycleMode)) fail('invalid_lifecycle_config', 'lifecycleMode 无效', LIFECYCLE_CONFIG_PATH);
  const versionParts = (value) => String(value).split('.').map((item) => Number(item));
  const compareVersions = (left, right) => {
    const a = versionParts(left);
    const b = versionParts(right);
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
    }
    return 0;
  };
  if (!/^\d+\.\d+\.\d+$/u.test(config.minimumWriterVersion) || compareVersions(LIFECYCLE_WRITER_VERSION, config.minimumWriterVersion) < 0) {
    fail('lifecycle_writer_mismatch', `当前写入器 ${LIFECYCLE_WRITER_VERSION} 不满足最低版本 ${config.minimumWriterVersion}`, LIFECYCLE_CONFIG_PATH);
  }
  for (const field of ['eventDirectory', 'runtimeDirectory']) normalizeRepositoryPath(config[field], field);
  for (const field of ['strictEvidenceMaxBytes', 'eventMaxBytes']) {
    if (!Number.isSafeInteger(config[field]) || config[field] < 512 || config[field] > 65536) fail('invalid_lifecycle_config', `${field} 必须是 512 到 65536 的整数`, LIFECYCLE_CONFIG_PATH);
  }
  resolveSafeProjectPath(repositoryRoot, config.eventDirectory, '生命周期事件目录');
  resolveSafeProjectPath(repositoryRoot, config.runtimeDirectory, '工作流运行时目录');
  return { root: repositoryRoot, configPath, ...config, source: 'file' };
}

export function lifecycleEventYear(event) {
  return new Date(event.occurredAt).getUTCFullYear().toString();
}

export function createEventId({ changeId, revision, occurredAt, specDigest }) {
  const digest = sha256(`${changeId}\n${revision}\n${occurredAt}\n${specDigest}`).slice(0, 24);
  return `evt-${digest}`;
}
