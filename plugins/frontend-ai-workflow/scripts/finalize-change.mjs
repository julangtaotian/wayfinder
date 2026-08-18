import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkChange, validateDeclaredTestPlan } from './check-change.mjs';
import { assertSafeProjectRoot, resolveProjectRoot } from './collect-project-scope.mjs';
import { runOpenSpecSync } from './openspec-cli.mjs';
import { validateRequirementDecisions } from './validate-requirement-decisions.mjs';

function parseEngineJson(output) {
  const start = String(output || '').indexOf('{');
  if (start < 0) return null;
  try {
    return JSON.parse(output.slice(start));
  } catch {
    return null;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 只改写 Markdown 行内代码中的所选活动变更路径，URL、其他变更和普通文字保持原样。
export function buildEvidenceReferenceRewrites(content, changeName, archiveName) {
  const sourcePrefix = `openspec/changes/${changeName}/`;
  const targetPrefix = `openspec/changes/archive/${archiveName}/`;
  const rewrites = [];
  const rewritten = String(content).replace(/`([^`]+)`/gu, (match, candidate) => {
    if (!candidate.startsWith(sourcePrefix)) return match;
    const target = `${targetPrefix}${candidate.slice(sourcePrefix.length)}`;
    rewrites.push({ from: candidate, to: target });
    return `\`${target}\``;
  });
  return {
    content: rewritten,
    rewrites: [...new Map(rewrites.map((item) => [item.from, item])).values()],
  };
}

export function rewriteRequirementForArchive(content, changeName, archiveName, { allowAccepted = false } = {}) {
  const matches = [...String(content).matchAll(/^(-\s*状态：\s*)(.+?)\s*$/gmu)];
  if (matches.length !== 1) throw new Error(`需求状态字段数量异常：${matches.length}`);
  const currentStatus = matches[0][2].trim();
  if (currentStatus !== '待验证' && !(allowAccepted && currentStatus === '已验收')) {
    throw new Error(`完成写入前需求必须为“待验证”，当前为“${currentStatus}”`);
  }
  const accepted = currentStatus === '已验收'
    ? String(content)
    : String(content).replace(new RegExp(`^${escapeRegExp(matches[0][0])}$`, 'mu'), '- 状态：已验收');
  return buildEvidenceReferenceRewrites(accepted, changeName, archiveName);
}

function atomicWrite(file, content) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.finalize-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(temporary, content, 'utf8');
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function archivedChangeCandidates(root, changeName) {
  const archiveRoot = path.join(root, 'openspec', 'changes', 'archive');
  if (!fs.existsSync(archiveRoot)) return [];
  return fs.readdirSync(archiveRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && (
      entry.name === changeName || entry.name.endsWith(`-${changeName}`)
    ))
    .map((entry) => path.join(archiveRoot, entry.name))
    .sort();
}

function safeArchiveTarget(root, archiveName, { mustExist = false } = {}) {
  if (
    typeof archiveName !== 'string'
    || !archiveName
    || path.basename(archiveName) !== archiveName
    || path.win32.basename(archiveName) !== archiveName
  ) {
    throw new Error(`归档名称不安全：${archiveName || '空值'}`);
  }
  const archiveRoot = path.join(root, 'openspec', 'changes', 'archive');
  const target = path.join(archiveRoot, archiveName);
  const relative = path.relative(archiveRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`归档目标越出安全范围：${target}`);
  }
  if (mustExist && (!fs.existsSync(target) || !fs.statSync(target).isDirectory())) {
    throw new Error(`规划引擎报告成功但实际归档目录不存在：${target}`);
  }
  return target;
}

function resolveRecoveryContext({ target, requirement, change }) {
  const root = resolveProjectRoot(target);
  assertSafeProjectRoot(root);
  const requirementPath = path.resolve(root, requirement || '');
  const relative = path.relative(root, requirementPath);
  if (!requirement || !relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`需求路径越出项目范围：${requirement || '空值'}`);
  }
  if (!fs.existsSync(requirementPath)) throw new Error(`需求文件不存在：${requirementPath}`);
  const candidates = archivedChangeCandidates(root, change);
  if (candidates.length !== 1) return null;
  return {
    root,
    requirementPath,
    changeName: change,
    changePath: candidates[0],
    archiveName: path.basename(candidates[0]),
  };
}

function postArchiveAudit({ requirementPath, changePath }) {
  const requirementValidation = validateRequirementDecisions(requirementPath, {
    changePath,
    stage: 'complete',
  });
  const testPlan = validateDeclaredTestPlan({
    changePath,
    requirementPath,
    stage: 'precomplete',
  });
  const errors = [...requirementValidation.errors, ...testPlan.errors];
  return {
    ok: errors.length === 0,
    requirementValidation,
    testPlanRequired: testPlan.required,
    testPlanValidation: testPlan.validation,
    errors,
    warnings: [...requirementValidation.warnings, ...testPlan.warnings],
  };
}

function partialFailure({
  write,
  check,
  actions,
  archiveResult,
  archiveRoot,
  archiveWarnings,
  archiveTarget,
  rewrites,
  failedStage,
  error,
}) {
  return {
    ok: false,
    code: 'archive_partial_failure',
    status: 'partial',
    write,
    check,
    actions,
    archiveResult,
    archiveRoot,
    archiveWarnings,
    archiveTarget,
    rewrites,
    failedStage,
    recovery: {
      change: check?.changeName || null,
      archiveTarget,
      repeatable: true,
      projectCommandsExecuted: false,
    },
    errors: [error],
  };
}

function recoverArchivedChange({ target, requirement, change, write }, services) {
  const recovery = resolveRecoveryContext({ target, requirement, change });
  if (!recovery) return null;
  const original = fs.readFileSync(recovery.requirementPath, 'utf8');
  const next = rewriteRequirementForArchive(original, recovery.changeName, recovery.archiveName, { allowAccepted: true });
  const actions = [
    { action: 'recover-references', target: recovery.requirementPath, rewrites: next.rewrites },
    { action: 'post-archive-audit', target: recovery.changePath },
  ];
  if (!write) {
    return {
      ok: true,
      code: 'archive_recovery_ready',
      status: 'ready',
      write: false,
      recovery: true,
      archiveTarget: recovery.changePath,
      rewrites: next.rewrites,
      actions,
    };
  }
  try {
    services.atomicWrite(recovery.requirementPath, next.content);
  } catch (error) {
    return partialFailure({
      write,
      check: { changeName: recovery.changeName },
      actions,
      archiveResult: { archivedAs: recovery.archiveName },
      archiveRoot: null,
      archiveWarnings: [],
      archiveTarget: recovery.changePath,
      rewrites: next.rewrites,
      failedStage: 'requirement-write',
      error: `归档恢复写入失败：${error.message}`,
    });
  }
  const audit = services.postArchiveAudit({
    requirementPath: recovery.requirementPath,
    changePath: recovery.changePath,
  });
  if (!audit.ok) {
    return partialFailure({
      write,
      check: { changeName: recovery.changeName },
      actions,
      archiveResult: { archivedAs: recovery.archiveName },
      archiveRoot: null,
      archiveWarnings: audit.warnings,
      archiveTarget: recovery.changePath,
      rewrites: next.rewrites,
      failedStage: 'post-archive-audit',
      error: `归档恢复审计失败：${audit.errors.join('；')}`,
    });
  }
  return {
    ok: true,
    code: 'archive_recovered',
    status: 'passed',
    write: true,
    recovery: true,
    archiveTarget: recovery.changePath,
    rewrites: next.rewrites,
    actions,
    postArchiveAudit: audit,
    requirementStatus: '已验收',
  };
}

// 正常完成入口不接受跳过校验或跳过规格参数，默认仅返回动作预览。
export function finalizeChange({
  target = process.cwd(),
  requirement,
  change,
  write = false,
} = {}, injected = {}) {
  const services = {
    checkChange,
    runOpenSpecSync,
    atomicWrite,
    postArchiveAudit,
    ...injected,
  };
  let check;
  try {
    check = services.checkChange({ target, requirement, change, stage: 'precomplete' });
  } catch (error) {
    if (!/变更目录不存在/u.test(error.message)) throw error;
    const recovered = recoverArchivedChange({ target, requirement, change, write }, services);
    if (recovered) return recovered;
    throw error;
  }
  if (!check.ok) return { ok: false, write, check, actions: [] };
  const predictedArchiveName = path.basename(check.archive?.targetPath || '');
  const originalRequirement = fs.readFileSync(check.requirementPath, 'utf8');
  const predictedRequirement = rewriteRequirementForArchive(
    originalRequirement,
    check.changeName,
    predictedArchiveName,
  );
  const actions = [
    { action: 'validate', target: check.changeName },
    { action: 'sync-and-archive', target: check.archive?.targetPath || null },
    { action: 'rewrite-evidence-references', target: check.requirementPath, rewrites: predictedRequirement.rewrites },
    { action: 'mark-requirement-accepted', target: check.requirementPath },
    { action: 'post-archive-audit', target: check.archive?.targetPath || null },
  ];
  if (!write) {
    return {
      ok: true,
      code: 'finalize_ready',
      status: 'ready',
      write,
      check,
      actions,
      archiveTarget: check.archive?.targetPath || null,
      rewrites: predictedRequirement.rewrites,
    };
  }

  const archived = services.runOpenSpecSync(
    ['archive', check.changeName, '--json', '--yes'],
    { cwd: check.root, encoding: 'utf8' },
  );
  if (!archived.available || archived.status !== 0) {
    return {
      ok: false,
      code: 'archive_failed',
      status: 'failed',
      write,
      check,
      actions,
      errors: [`规格同步或归档失败：${(archived.stderr || archived.stdout || archived.error?.message || '未知错误').trim()}`],
    };
  }

  const rawArchiveResult = parseEngineJson(archived.stdout);
  const archiveResult = rawArchiveResult?.archive || rawArchiveResult;
  const archiveRoot = rawArchiveResult?.root || null;
  const archiveWarnings = rawArchiveResult?.warnings || archiveResult?.warnings || [];
  const archiveName = archiveResult?.archivedAs || predictedArchiveName;
  let archiveTarget;
  try {
    archiveTarget = safeArchiveTarget(check.root, archiveName, { mustExist: true });
  } catch (error) {
    return partialFailure({
      write,
      check,
      actions,
      archiveResult,
      archiveRoot,
      archiveWarnings,
      archiveTarget: null,
      rewrites: [],
      failedStage: 'archive-target',
      error: `变更已报告归档成功，但归档目标无法安全确认：${error.message}`,
    });
  }
  const nextRequirement = rewriteRequirementForArchive(
    originalRequirement,
    check.changeName,
    archiveName,
  );
  try {
    services.atomicWrite(check.requirementPath, nextRequirement.content);
  } catch (error) {
    return partialFailure({
      write,
      check,
      actions,
      archiveResult,
      archiveRoot,
      archiveWarnings,
      archiveTarget,
      rewrites: nextRequirement.rewrites,
      failedStage: 'requirement-write',
      error: `变更已归档，但需求状态或证据引用更新失败：${error.message}`,
    });
  }
  const audit = services.postArchiveAudit({
    requirementPath: check.requirementPath,
    changePath: archiveTarget,
  });
  if (!audit.ok) {
    return partialFailure({
      write,
      check,
      actions,
      archiveResult,
      archiveRoot,
      archiveWarnings: [...archiveWarnings, ...audit.warnings],
      archiveTarget,
      rewrites: nextRequirement.rewrites,
      failedStage: 'post-archive-audit',
      error: `变更已归档，但归档后完整审计失败：${audit.errors.join('；')}`,
    });
  }
  return {
    ok: true,
    code: 'finalized',
    status: 'passed',
    write,
    check,
    actions,
    archiveResult,
    archiveRoot,
    archiveWarnings,
    archiveTarget,
    rewrites: nextRequirement.rewrites,
    postArchiveAudit: audit,
    requirementStatus: '已验收',
  };
}

function parseArgs(argv) {
  const args = { target: process.cwd(), requirement: null, change: null, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (['--target', '--requirement', '--change'].includes(value)) {
      const key = value.slice(2);
      if (!argv[index + 1]) throw new Error(`参数 ${value} 缺少值`);
      args[key] = argv[index + 1];
      index += 1;
    } else if (value === '--write') {
      args.write = true;
    } else {
      throw new Error(`不支持的参数：${value}`);
    }
  }
  if (!args.requirement) throw new Error('必须提供 --requirement');
  if (!args.change) throw new Error('必须提供 --change');
  return args;
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const result = finalizeChange(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
