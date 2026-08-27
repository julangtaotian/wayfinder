import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkChange } from './check-change.mjs';
import { runOpenSpecSync } from './openspec-cli.mjs';
import {
  ProjectPathError,
  atomicWriteProjectFile,
  projectPathFailure,
} from './project-path-safety.mjs';
import { archiveRequirement as archiveAcceptedRequirement } from './requirement-archive.mjs';
import { migrateArchivedRequirementReferences } from './finalize-change-references.mjs';
import {
  partialFailure,
  postArchiveAudit,
  preflightFinalizeSurface,
  prepareTestPlanRewrite,
  recoverArchivedChange,
  rewriteRequirementForArchive,
  safeArchiveTarget,
} from './finalize-change-archive.mjs';

export {
  buildEvidenceReferenceRewrites,
  rewriteRequirementForArchive,
  rewriteTestPlanForArchive,
} from './finalize-change-archive.mjs';

function parseEngineJson(output) {
  const start = String(output || '').indexOf('{');
  if (start < 0) return null;
  try {
    return JSON.parse(output.slice(start));
  } catch {
    return null;
  }
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
    atomicWrite: null,
    postArchiveAudit,
    archiveRequirement: archiveAcceptedRequirement,
    ...injected,
  };
  let check;
  try {
    check = services.checkChange({ target, requirement, change, stage: 'precomplete' });
  } catch (error) {
    if (!/变更目录不存在/u.test(error.message)) throw error;
    let recovered;
    try {
      recovered = recoverArchivedChange({ target, requirement, change, write }, services);
    } catch (recoveryError) {
      if (!(recoveryError instanceof ProjectPathError)) throw recoveryError;
      return projectPathFailure(recoveryError, { write, actions: [] });
    }
    if (recovered) return recovered;
    throw error;
  }
  if (!check.ok) return { ok: false, write, check, actions: [] };
  try {
    preflightFinalizeSurface(check);
  } catch (error) {
    if (!(error instanceof ProjectPathError)) throw error;
    return { ...projectPathFailure(error, { write, actions: [] }), check };
  }
  const writeFile = services.atomicWrite || ((file, content) => atomicWriteProjectFile(
    check.root,
    file,
    content,
    { label: '完成流程文件' },
  ));
  const predictedArchiveName = path.basename(check.archive?.targetPath || '');
  const originalRequirement = fs.readFileSync(check.requirementPath, 'utf8');
  const predictedRequirement = rewriteRequirementForArchive(
    originalRequirement,
    check.changeName,
    predictedArchiveName,
  );
  let predictedTestPlan;
  try {
    predictedTestPlan = prepareTestPlanRewrite(check.changePath, check.changeName, predictedArchiveName);
  } catch (error) {
    return {
      ok: false,
      code: 'test_plan_rewrite_failed',
      status: 'failed',
      write,
      check,
      actions: [],
      errors: [`无法生成测试方案归档迁移：${error.message}`],
    };
  }
  const actions = [
    { action: 'validate', target: check.changeName },
    { action: 'sync-and-archive', target: check.archive?.targetPath || null },
    ...(predictedTestPlan.required ? [{
      action: 'rewrite-test-plan-references',
      target: path.join(check.archive?.targetPath || check.changePath, 'test-plan.md'),
      rewrites: predictedTestPlan.rewrites,
      changeRenamed: predictedTestPlan.changeRenamed,
    }] : []),
    { action: 'rewrite-evidence-references', target: check.requirementPath, rewrites: predictedRequirement.rewrites },
    { action: 'mark-requirement-accepted', target: check.requirementPath },
    { action: 'archive-requirement', target: check.requirementPath },
    { action: 'rewrite-archived-requirement-references', target: check.archive?.targetPath || null },
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
      testPlanRewrites: predictedTestPlan.rewrites,
      testPlanChangeRenamed: predictedTestPlan.changeRenamed,
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
    preflightFinalizeSurface(check, { archiveTarget, phase: 'after' });
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
  let nextTestPlan;
  try {
    nextTestPlan = prepareTestPlanRewrite(archiveTarget, check.changeName, archiveName);
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
      failedStage: 'test-plan-rewrite',
      error: `变更已归档，但测试方案迁移无法生成：${error.message}`,
    });
  }
  if (nextTestPlan.exists) {
    try {
      writeFile(nextTestPlan.testPlanPath, nextTestPlan.content);
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
        testPlanRewrites: nextTestPlan.rewrites,
        testPlanChangeRenamed: nextTestPlan.changeRenamed,
        failedStage: 'test-plan-write',
        error: `变更已归档，但测试方案迁移写入失败：${error.message}`,
      });
    }
  }
  try {
    writeFile(check.requirementPath, nextRequirement.content);
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
      testPlanRewrites: nextTestPlan.rewrites,
      testPlanChangeRenamed: nextTestPlan.changeRenamed,
      failedStage: 'requirement-write',
      error: `变更已归档，但需求状态或证据引用更新失败：${error.message}`,
    });
  }
  let requirementArchive;
  try {
    requirementArchive = services.archiveRequirement({
      root: check.root,
      requirementPath: check.requirementPath,
      write: true,
    });
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
      testPlanRewrites: nextTestPlan.rewrites,
      testPlanChangeRenamed: nextTestPlan.changeRenamed,
      failedStage: 'requirement-archive',
      error: `变更已归档，但需求正文分层归档失败：${error.message}`,
    });
  }
  let archivedRequirementReferences;
  try {
    archivedRequirementReferences = migrateArchivedRequirementReferences({
      root: check.root,
      changePath: archiveTarget,
      sourceRequirementPath: check.requirementPath,
      archivedRequirementPath: requirementArchive.archivePath,
      writeFile,
    });
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
      testPlanRewrites: nextTestPlan.rewrites,
      testPlanChangeRenamed: nextTestPlan.changeRenamed,
      failedStage: 'archived-requirement-reference-rewrite',
      error: `变更已归档，但年度需求引用迁移失败：${error.message}`,
    });
  }
  const audit = services.postArchiveAudit({
    requirementPath: requirementArchive.archivePath,
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
      testPlanRewrites: nextTestPlan.rewrites,
      testPlanChangeRenamed: nextTestPlan.changeRenamed,
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
    testPlanRewrites: nextTestPlan.rewrites,
    testPlanChangeRenamed: nextTestPlan.changeRenamed,
    postArchiveAudit: audit,
    requirementStatus: '已验收',
    requirementArchive,
    archivedRequirementReferences,
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
