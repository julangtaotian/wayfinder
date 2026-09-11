import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectLifecycleState } from './lifecycle-history.mjs';

export function getLifecycleStatus({ root = process.cwd(), scope = '.', changeId, mergedRevision = null } = {}) {
  if (!changeId) throw new Error('必须提供 changeId');
  const result = projectLifecycleState({ root, scope, changeId, mergedRevision });
  return {
    ok: result.status !== 'unknown',
    code: result.status === 'unknown' ? 'lifecycle_status_unknown' : 'lifecycle_status_ok',
    status: result.status,
    active: result.active,
    scope,
    changeId,
    mergedRevision,
    event: result.event ? {
      eventId: result.event.eventId,
      type: result.event.type,
      revision: result.event.revision,
      occurredAt: result.event.occurredAt,
      requirementId: result.event.requirementId,
      trust: result.event.trust,
      checks: result.event.checks,
    } : null,
    diagnostics: result.diagnostics,
  };
}

function parseArgs(argv) {
  const args = { root: process.cwd(), scope: '.', changeId: null, mergedRevision: process.env.LIFECYCLE_BASE_SHA || null };
  const options = new Map([
    ['--target', 'root'],
    ['--scope', 'scope'],
    ['--change', 'changeId'],
    ['--base', 'mergedRevision'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const field = options.get(argv[index]);
    if (!field) throw new Error(`不支持的参数：${argv[index]}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`参数 ${argv[index]} 缺少值`);
    args[field] = value;
    index += 1;
  }
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = getLifecycleStatus(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: error.code || 'lifecycle_status_failed', status: 'failed', errors: [error.message] }, null, 2));
    process.exitCode = 1;
  }
}
