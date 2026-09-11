import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { atomicWriteProjectFile, removeProjectFile } from './project-path-safety.mjs';
import {
  createEventId,
  normalizeLifecycleEvent,
  readLifecycleConfig,
  sha256,
} from './lifecycle-contract.mjs';
import { inspectGitCompletionState } from './lifecycle-transaction.mjs';
import { readLifecycleEvents } from './lifecycle-history.mjs';

const LEGACY_PREFIXES = ['openspec/changes/archive/', 'requirements/archive/', '.frontend-ui-review/runs/'];
const OUTPUT_EXTENSIONS = new Set(['.json', '.jsonl', '.md', '.txt', '.png', '.jpg', '.jpeg', '.webp', '.log', '.csv']);

function git(root, args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', shell: false, maxBuffer: 20 * 1024 * 1024 });
}

function normalize(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//u, '');
}

function isLegacyRequirementStub(config, file) {
  if (!/^requirements\/REQ-\d{4}-\d+[^/]*\.md$/u.test(file)) return false;
  return fs.readFileSync(path.join(config.root, file), 'utf8').includes('<!-- requirement-archive-stub:v1 -->');
}

function isCandidate(config, file) {
  return LEGACY_PREFIXES.some((prefix) => file.startsWith(prefix))
    || file.startsWith('outputs/')
    || file === 'requirements/index.json'
    || isLegacyRequirementStub(config, file);
}

function textFile(file) {
  return ['.md', '.json', '.jsonl', '.txt', '.mjs', '.js', '.yaml', '.yml'].includes(path.extname(file).toLowerCase());
}

function requirementId(content, fallback) {
  return content.match(/REQ-\d{4}-\d+/u)?.[0] || fallback;
}

function requirementLinksChange(content, changeId) {
  const source = String(content);
  const association = source.match(/^\s*-\s*关联变更：\s*(.+?)\s*$/mu)?.[1] || '';
  const quoted = [...association.matchAll(/`([^`]+)`/gu)].map((match) => match[1]);
  const values = quoted.length ? quoted : association.split(/[、,，\s]+/u);
  const linkedByMetadata = values
    .map((value) => value.trim().replace(/^openspec\/changes\//u, ''))
    .some((value) => value === changeId);
  if (linkedByMetadata) return true;
  return source.split(/\r?\n/u).some((line) => {
    if (!line.trim().startsWith('|')) return false;
    const firstCell = line.split('|')[1]?.trim().replaceAll('`', '').replace(/^openspec\/changes\//u, '');
    return firstCell === changeId;
  });
}

function archiveEvents(config, trackedFiles) {
  const roots = new Set(trackedFiles
    .filter((file) => file.startsWith('openspec/changes/archive/'))
    .map((file) => file.split('/').slice(0, 4).join('/')));
  const events = [];
  const diagnostics = [];
  for (const archiveRoot of [...roots].sort()) {
    const archiveName = archiveRoot.split('/').at(-1);
    const match = archiveName.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/u);
    if (!match) {
      diagnostics.push({ code: 'unrecognized_archive_name', status: 'blocked', target: archiveRoot });
      continue;
    }
    const [, date, changeId] = match;
    const archiveFiles = trackedFiles.filter((file) => file.startsWith(`${archiveRoot}/`));
    const requirementArchives = trackedFiles.filter((file) => file.startsWith('requirements/archive/')
      && textFile(file)
      && requirementLinksChange(fs.readFileSync(path.join(config.root, file), 'utf8'), changeId));
    if (requirementArchives.length !== 1) {
      diagnostics.push({
        code: requirementArchives.length === 0 ? 'missing_migration_requirement' : 'ambiguous_migration_requirement',
        status: 'blocked',
        target: changeId,
      });
      continue;
    }
    const requirementArchive = requirementArchives[0];
    const reqContent = requirementArchive ? fs.readFileSync(path.join(config.root, requirementArchive), 'utf8') : '';
    const resolvedRequirementId = requirementId(reqContent, null);
    if (!resolvedRequirementId) {
      diagnostics.push({ code: 'invalid_migration_requirement', status: 'blocked', target: requirementArchive });
      continue;
    }
    const specContents = archiveFiles.filter((file) => /\/specs\/.*\.md$/u.test(file)).map((file) => fs.readFileSync(path.join(config.root, file), 'utf8'));
    const occurredAt = `${date}T12:00:00.000Z`;
    const specDigest = sha256(specContents.join('\n---\n'));
    const event = {
      schemaVersion: 2,
      eventId: createEventId({ changeId, revision: 1, occurredAt, specDigest }),
      scope: '.',
      changeId,
      requirementId: resolvedRequirementId,
      type: 'accepted',
      revision: 1,
      occurredAt,
      baseRevision: null,
      capabilities: archiveFiles.filter((file) => /\/specs\/.*\/spec\.md$/u.test(file)).map((file) => file.match(/\/specs\/(.*)\/spec\.md$/u)?.[1]).filter(Boolean).sort(),
      specDigest,
      checks: [{ name: 'legacy-migration', status: 'recorded' }],
      trust: 'external-recorded',
      supersedes: null,
    };
    events.push(normalizeLifecycleEvent(event, { maxBytes: config.eventMaxBytes }));
  }
  return { events, diagnostics };
}

function collectReferences(config, trackedFiles, candidates) {
  const candidateFiles = [...candidates].sort();
  const references = [];
  const referenceSources = trackedFiles.filter((item) => {
    if (candidates.has(item) || item.startsWith('plugins/frontend-ai-workflow/runtime/') || !textFile(item)) return false;
    const stats = fs.lstatSync(path.join(config.root, item));
    return stats.isFile() && stats.size <= 1024 * 1024;
  });
  for (const file of referenceSources) {
    const content = fs.readFileSync(path.join(config.root, file), 'utf8');
    for (const candidate of candidateFiles) {
      const candidateDirectory = `${path.posix.dirname(candidate)}/`;
      const directoryIsSpecific = !['./', 'outputs/', 'requirements/', 'requirements/archive/', 'openspec/changes/archive/', '.frontend-ui-review/runs/'].includes(candidateDirectory);
      if (content.includes(candidate) || (directoryIsSpecific && content.includes(candidateDirectory))) {
        references.push({ file, reference: candidate });
      }
    }
  }
  return references;
}

function collectLocalSpecReferences(config, trackedFiles) {
  return trackedFiles
    .filter((file) => file.startsWith('openspec/specs/') && file.endsWith('/spec.md'))
    .map((file) => {
      const content = fs.readFileSync(path.join(config.root, file), 'utf8');
      const references = [...new Set([...content.matchAll(/\b[DA]-\d+\b/gu)].map((match) => match[0]))].sort();
      return references.length ? { file, references } : null;
    })
    .filter(Boolean);
}

function eventConflicts(events, existingEvents = []) {
  const conflicts = [];
  const eventIds = new Set();
  const revisions = new Set();
  for (const event of events) {
    const revisionKey = `${event.scope}\0${event.changeId}\0${event.revision}`;
    if (eventIds.has(event.eventId)) conflicts.push({ code: 'duplicate_migration_event', status: 'blocked', target: event.eventId });
    if (revisions.has(revisionKey)) conflicts.push({ code: 'migration_revision_conflict', status: 'blocked', target: `${event.changeId}:${event.revision}` });
    eventIds.add(event.eventId);
    revisions.add(revisionKey);
    const sameId = existingEvents.find((item) => item.eventId === event.eventId);
    if (sameId && JSON.stringify(sameId) !== JSON.stringify(event)) {
      conflicts.push({ code: 'migration_event_content_conflict', status: 'blocked', target: event.eventId });
    }
    const sameRevision = existingEvents.find((item) => item.scope === event.scope
      && item.changeId === event.changeId
      && item.revision === event.revision
      && item.eventId !== event.eventId);
    if (sameRevision) conflicts.push({ code: 'migration_revision_conflict', status: 'blocked', target: `${event.changeId}:${event.revision}` });
  }
  return conflicts;
}

function collectSymlinks(root, files) {
  const links = [];
  const checked = new Set();
  for (const file of files) {
    const segments = file.split('/');
    for (let index = 1; index <= segments.length; index += 1) {
      const target = path.join(root, ...segments.slice(0, index));
      if (checked.has(target) || !fs.existsSync(target)) continue;
      checked.add(target);
      if (fs.lstatSync(target).isSymbolicLink()) links.push(normalize(path.relative(root, target)));
    }
  }
  return links;
}

export function previewLifecycleMigration({ root = process.cwd() } = {}) {
  const config = readLifecycleConfig(root);
  const gitState = inspectGitCompletionState(config.root);
  const trackedResult = git(config.root, ['ls-files', '-z']);
  if (trackedResult.status !== 0) throw new Error('无法读取 Git 跟踪文件');
  const trackedFiles = trackedResult.stdout.split('\0').filter(Boolean).map(normalize).filter((file) => fs.existsSync(path.join(config.root, file)));
  const candidateFiles = trackedFiles.filter((file) => isCandidate(config, file)).sort();
  const migrationPaths = [...LEGACY_PREFIXES, 'outputs/', 'requirements/index.json', 'requirements/REQ-*.md'];
  const untrackedResult = git(config.root, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...migrationPaths]);
  const ignoredResult = git(config.root, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', ...migrationPaths]);
  const untracked = [...new Set([
    ...(untrackedResult.status === 0 ? untrackedResult.stdout.split('\0').filter(Boolean).map(normalize) : []),
    ...(ignoredResult.status === 0 ? ignoredResult.stdout.split('\0').filter(Boolean).map(normalize) : []),
  ])].sort();
  const dirtyResult = git(config.root, ['status', '--porcelain=v1', '-z', '--untracked-files=no', '--', ...migrationPaths]);
  const dirty = dirtyResult.status === 0
    ? dirtyResult.stdout.split('\0').filter(Boolean).map((entry) => normalize(entry.slice(3)))
    : [];
  const candidateSet = new Set([...candidateFiles, ...untracked]);
  const symlinks = collectSymlinks(config.root, candidateFiles);
  const unknownOutputs = candidateFiles.filter((file) => file.startsWith('outputs/') && !OUTPUT_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const references = collectReferences(config, trackedFiles, candidateSet);
  const localSpecReferences = collectLocalSpecReferences(config, trackedFiles);
  const archiveResult = archiveEvents(config, trackedFiles);
  const events = archiveResult.events;
  const history = readLifecycleEvents({ config });
  const blockers = [
    ...untracked.map((target) => ({ code: 'untracked_migration_target', status: 'blocked', target })),
    ...dirty.map((target) => ({ code: 'dirty_migration_target', status: 'blocked', target })),
    ...gitState.diagnostics.map((item) => ({ ...item, status: 'blocked' })),
    ...symlinks.map((target) => ({ code: 'migration_symlink', status: 'blocked', target })),
    ...unknownOutputs.map((target) => ({ code: 'unknown_output_file', status: 'blocked', target })),
    ...references.map((item) => ({ code: 'active_legacy_reference', status: 'blocked', target: item.file, reference: item.reference })),
    ...localSpecReferences.map((item) => ({
      code: 'local_spec_reference',
      status: 'blocked',
      target: item.file,
      references: item.references.slice(0, 20),
      referenceCount: item.references.length,
    })),
    ...archiveResult.diagnostics,
    ...history.diagnostics.map((item) => ({ ...item, status: 'blocked' })),
    ...eventConflicts(events, history.events),
  ];
  blockers.sort((left, right) => left.code.localeCompare(right.code) || left.target.localeCompare(right.target));
  const blockerCounts = Object.fromEntries([...new Set(blockers.map((item) => item.code))]
    .sort()
    .map((code) => [code, blockers.filter((item) => item.code === code).length]));
  return {
    ok: blockers.length === 0,
    code: blockers.length ? 'lifecycle_migration_blocked' : 'lifecycle_migration_ready',
    status: blockers.length ? 'blocked' : 'ready',
    write: false,
    mode: config.lifecycleMode,
    counts: { events: events.length, candidateFiles: candidateFiles.length, blockers: blockers.length },
    blockerCounts,
    events,
    candidateFiles,
    blockers,
  };
}

export function paginateLifecycleMigrationResult(result, { offset = 0, limit = 10, details = false } = {}) {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('offset 必须是非负整数');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('limit 必须是 1 到 100 的整数');
  const page = (items) => items.slice(offset, offset + limit);
  const events = page(result.events).map((event) => (details ? event : {
    eventId: event.eventId,
    changeId: event.changeId,
    requirementId: event.requirementId,
    type: event.type,
    revision: event.revision,
    occurredAt: event.occurredAt,
  }));
  return {
    ...result,
    events,
    candidateFiles: page(result.candidateFiles),
    blockers: page(result.blockers),
    page: {
      offset,
      limit,
      remainingEvents: Math.max(0, result.events.length - offset - limit),
      remainingCandidateFiles: Math.max(0, result.candidateFiles.length - offset - limit),
      remainingBlockers: Math.max(0, result.blockers.length - offset - limit),
    },
  };
}

function writeEventsForMigration(config, events) {
  const byYear = new Map();
  for (const event of events) {
    const year = event.occurredAt.slice(0, 4);
    const items = byYear.get(year) || [];
    items.push(event);
    byYear.set(year, items);
  }
  for (const [year, items] of byYear) {
    const target = path.join(config.root, config.eventDirectory, `${year}.jsonl`);
    const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    const known = new Set(existing.split('\n').filter(Boolean).map((line) => JSON.parse(line).eventId));
    const additions = items.filter((event) => !known.has(event.eventId)).map((event) => JSON.stringify(event)).join('\n');
    if (additions) atomicWriteProjectFile(config.root, target, `${existing}${existing && !existing.endsWith('\n') ? '\n' : ''}${additions}\n`, { label: '迁移生命周期事件' });
  }
}

function removeEmptyParents(root, files) {
  const directories = new Set(files.map((file) => path.dirname(path.join(root, file))));
  for (const directory of [...directories].sort((left, right) => right.length - left.length)) {
    let current = directory;
    while (current !== root && fs.existsSync(current) && fs.readdirSync(current).length === 0) {
      fs.rmdirSync(current);
      current = path.dirname(current);
    }
  }
}

export function migrateLifecycle({ root = process.cwd(), write = false } = {}) {
  const preview = previewLifecycleMigration({ root });
  if (!write || !preview.ok) return { ...preview, write: Boolean(write) };
  const config = readLifecycleConfig(root);
  writeEventsForMigration(config, preview.events);
  for (const file of preview.candidateFiles) removeProjectFile(config.root, file, { label: '生命周期迁移目标' });
  removeEmptyParents(config.root, preview.candidateFiles);
  const currentConfig = fs.existsSync(config.configPath)
    ? JSON.parse(fs.readFileSync(config.configPath, 'utf8'))
    : {
      schemaVersion: config.schemaVersion,
      minimumWriterVersion: config.minimumWriterVersion,
      eventDirectory: config.eventDirectory,
      runtimeDirectory: config.runtimeDirectory,
      strictEvidenceMaxBytes: config.strictEvidenceMaxBytes,
      eventMaxBytes: config.eventMaxBytes,
    };
  const nextConfig = { ...currentConfig, lifecycleMode: 'v2' };
  atomicWriteProjectFile(config.root, config.configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, { label: '生命周期配置' });
  return { ...preview, ok: true, code: 'lifecycle_migrated', status: 'passed', write: true };
}

function parseArgs(argv) {
  const args = { root: process.cwd(), write: false, offset: 0, limit: 10, details: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--write') args.write = true;
    else if (argv[index] === '--details') args.details = true;
    else if (['--target', '--offset', '--limit'].includes(argv[index])) {
      if (!argv[index + 1]) throw new Error(`参数 ${argv[index]} 缺少值`);
      if (argv[index] === '--target') args.root = argv[index + 1];
      else args[argv[index].slice(2)] = Number(argv[index + 1]);
      index += 1;
    } else throw new Error(`不支持的参数：${argv[index]}`);
  }
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = migrateLifecycle(args);
    console.log(JSON.stringify(paginateLifecycleMigrationResult(result, args), null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: error.code || 'lifecycle_migration_failed', status: 'failed', errors: [error.message] }, null, 2));
    process.exitCode = 1;
  }
}
