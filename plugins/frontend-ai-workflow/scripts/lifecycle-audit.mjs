import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { normalizeLifecycleEvent, readLifecycleConfig } from './lifecycle-contract.mjs';
import { readLifecycleEvents } from './lifecycle-history.mjs';

function git(root, args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', shell: false, maxBuffer: 10 * 1024 * 1024 });
}

function diagnostic(code, target, status, message) {
  return { code, target, status, message };
}

function readBaseFile(root, baseRevision, file) {
  const result = git(root, ['show', `${baseRevision}:${file}`]);
  return result.status === 0 ? result.stdout : null;
}

function parseEventLines(content, maxBytes) {
  return String(content || '').split('\n').filter((line) => line.trim()).map((line) => normalizeLifecycleEvent(JSON.parse(line), { maxBytes }));
}

export function auditLifecycle({ root = process.cwd(), baseRevision = null, requireBase = false } = {}) {
  const config = readLifecycleConfig(root);
  const history = readLifecycleEvents({ config });
  const diagnostics = [...history.diagnostics];
  const retiredPrefixes = ['requirements/archive/', 'openspec/changes/archive/'];
  const tracked = git(config.root, ['ls-files', '-z']);
  if (tracked.status !== 0) diagnostics.push(diagnostic('git_index_unavailable', '.', 'failed', '无法读取 Git index'));
  const trackedFiles = tracked.status === 0 ? tracked.stdout.split('\0').filter(Boolean).map((item) => item.replaceAll('\\', '/')) : [];
  if (config.lifecycleMode === 'v2') {
    for (const prefix of retiredPrefixes) {
      const count = trackedFiles.filter((file) => file.startsWith(prefix)).length;
      if (count) diagnostics.push(diagnostic('mixed_lifecycle_storage', prefix, 'failed', `v2 模式仍跟踪 ${count} 个旧归档文件`));
    }
  }
  if (!baseRevision) {
    if (requireBase) diagnostics.push(diagnostic('lifecycle_base_unavailable', '.', 'unavailable', '无法确定生命周期差异基线'));
    return summarize(config, history.events, diagnostics, null);
  }
  const verify = git(config.root, ['rev-parse', '--verify', `${baseRevision}^{commit}`]);
  if (verify.status !== 0) {
    diagnostics.push(diagnostic('lifecycle_base_unavailable', baseRevision, 'unavailable', '生命周期差异基线不存在'));
    return summarize(config, history.events, diagnostics, baseRevision);
  }
  const diff = git(config.root, ['diff', '--no-renames', '--name-status', '-z', baseRevision, '--', 'openspec/changes', config.eventDirectory]);
  if (diff.status !== 0) {
    diagnostics.push(diagnostic('lifecycle_diff_unavailable', baseRevision, 'unavailable', '无法读取生命周期 Git 差异'));
    return summarize(config, history.events, diagnostics, baseRevision);
  }
  const parts = diff.stdout.split('\0').filter(Boolean);
  const deletedChanges = new Set();
  for (let index = 0; index + 1 < parts.length; index += 2) {
    const status = parts[index];
    const file = parts[index + 1].replaceAll('\\', '/');
    if (status.startsWith('D') && file.startsWith('openspec/changes/') && !file.startsWith('openspec/changes/archive/')) {
      const changeId = file.split('/')[2];
      if (changeId) deletedChanges.add(changeId);
    }
    if (!file.startsWith(`${config.eventDirectory}/`) || !file.endsWith('.jsonl')) continue;
    const current = fs.existsSync(path.join(config.root, file)) ? fs.readFileSync(path.join(config.root, file), 'utf8') : '';
    const previous = readBaseFile(config.root, baseRevision, file) || '';
    if (previous && !current.startsWith(previous)) {
      diagnostics.push(diagnostic('lifecycle_history_rewritten', file, 'failed', '既有生命周期事件被修改或删除'));
    }
  }
  const baseEventIds = new Set();
  for (const file of trackedFiles.filter((item) => item.startsWith(`${config.eventDirectory}/`) && item.endsWith('.jsonl'))) {
    const content = readBaseFile(config.root, baseRevision, file);
    if (!content) continue;
    try {
      for (const event of parseEventLines(content, config.eventMaxBytes)) baseEventIds.add(event.eventId);
    } catch (error) {
      diagnostics.push(diagnostic('invalid_base_lifecycle_history', file, 'failed', error.message));
    }
  }
  const newTerminalChanges = new Set(history.events
    .filter((event) => !baseEventIds.has(event.eventId) && ['accepted', 'cancelled', 'superseded'].includes(event.type))
    .map((event) => event.changeId));
  for (const changeId of deletedChanges) {
    if (!newTerminalChanges.has(changeId)) diagnostics.push(diagnostic('missing_lifecycle_event', changeId, 'failed', '活动变更删除缺少新增终态事件'));
  }
  return summarize(config, history.events, diagnostics, baseRevision);
}

function summarize(config, events, diagnostics, baseRevision) {
  diagnostics.sort((left, right) => left.code.localeCompare(right.code) || String(left.target).localeCompare(String(right.target)));
  return {
    ok: diagnostics.every((item) => item.status !== 'failed' && item.status !== 'unavailable'),
    code: diagnostics.length ? 'lifecycle_audit_failed' : 'lifecycle_audit_ok',
    status: diagnostics.length ? 'failed' : 'passed',
    mode: config.lifecycleMode,
    schemaVersion: config.schemaVersion,
    baseRevision,
    counts: { events: events.length, diagnostics: diagnostics.length },
    diagnostics,
  };
}

function parseArgs(argv) {
  const args = { root: process.cwd(), baseRevision: process.env.LIFECYCLE_BASE_SHA || null, requireBase: false };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--require-base') args.requireBase = true;
    else if (['--target', '--base'].includes(option)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`参数 ${option} 缺少值`);
      if (option === '--target') args.root = value;
      else args.baseRevision = value;
      index += 1;
    } else throw new Error(`不支持的参数：${option}`);
  }
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = auditLifecycle(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: error.code || 'lifecycle_audit_error', status: 'failed', target: error.target || null, errors: [error.message] }, null, 2));
    process.exitCode = 1;
  }
}
