import fs from 'node:fs';
import path from 'node:path';
import { validateDeclaredTestPlan } from './check-change.mjs';
import { assertSafeProjectRoot, resolveProjectRoot } from './collect-project-scope.mjs';
import {
  ProjectPathError,
  atomicWriteProjectFile,
  resolveSafeProjectPath,
} from './project-path-safety.mjs';
import { validateRequirementDecisions } from './validate-requirement-decisions.mjs';
import { migrateArchivedRequirementReferences } from './finalize-change-references.mjs';

const REQUIREMENT_STUB_MARKER = '<!-- requirement-archive-stub:v1 -->';

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

export function rewriteTestPlanForArchive(content, changeName, archiveName) {
  const matches = [...String(content).matchAll(/^(-\s*变更：\s*)(.+?)\s*$/gmu)];
  if (matches.length !== 1) throw new Error(`测试方案变更字段数量异常：${matches.length}`);
  const rawValue = matches[0][2].trim();
  const currentName = rawValue.startsWith('`') && rawValue.endsWith('`')
    ? rawValue.slice(1, -1).trim()
    : rawValue;
  if (currentName !== changeName && currentName !== archiveName) {
    throw new Error(`测试方案变更与归档目标不一致：${currentName || '空值'}`);
  }
  const changeRenamed = currentName !== archiveName;
  const renamed = changeRenamed
    ? String(content).replace(matches[0][0], `${matches[0][1]}${archiveName}`)
    : String(content);
  const references = buildEvidenceReferenceRewrites(renamed, changeName, archiveName);
  return {
    content: references.content,
    rewrites: references.rewrites,
    changeRenamed,
  };
}

export function prepareTestPlanRewrite(changePath, changeName, archiveName) {
  const testPlanPath = path.join(changePath, 'test-plan.md');
  const metadataPath = path.join(changePath, '.openspec.yaml');
  const required = fs.existsSync(metadataPath)
    && /^test_plan:\s*required\s*$/mu.test(fs.readFileSync(metadataPath, 'utf8'));
  if (!required || !fs.existsSync(testPlanPath)) {
    return {
      exists: false,
      required,
      testPlanPath,
      content: null,
      rewrites: [],
      changeRenamed: false,
    };
  }
  const rewritten = rewriteTestPlanForArchive(
    fs.readFileSync(testPlanPath, 'utf8'),
    changeName,
    archiveName,
  );
  return {
    exists: true,
    required,
    testPlanPath,
    ...rewritten,
  };
}

function archivedChangeCandidates(root, changeName) {
  const archive = resolveSafeProjectPath(root, 'openspec/changes/archive', '归档根目录');
  if (!archive.exists) return [];
  return fs.readdirSync(archive.absolutePath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && (
      entry.name === changeName || entry.name.endsWith(`-${changeName}`)
    ))
    .map((entry) => resolveSafeProjectPath(root, path.join(archive.absolutePath, entry.name), '归档恢复目标', {
      mustExist: true,
      allowAbsolute: true,
    }).absolutePath)
    .sort();
}

export function safeArchiveTarget(root, archiveName, { mustExist = false } = {}) {
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
  const safe = resolveSafeProjectPath(root, target, '归档目标', {
    mustExist,
    allowAbsolute: true,
  });
  if (mustExist && safe.kind !== 'directory') {
    throw new Error(`规划引擎报告成功但实际归档目录不存在：${target}`);
  }
  return safe.absolutePath;
}

function resolveRecoveryContext({ target, requirement, change }) {
  const root = resolveProjectRoot(target);
  assertSafeProjectRoot(root);
  const requirementPath = resolveSafeProjectPath(root, requirement || '', '需求文件', {
    mustExist: true,
    allowDirectory: false,
  }).absolutePath;
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

function plannedSpecPaths(check) {
  const deltaRoot = path.join(check.changePath, 'specs');
  const declared = check.planningStatus?.artifactPaths?.specs?.existingOutputPaths;
  if (!Array.isArray(declared)) return [];
  return declared.map((deltaPath) => {
    const resolvedDeltaPath = path.isAbsolute(deltaPath)
      ? path.resolve(deltaPath)
      : path.resolve(check.changePath, deltaPath);
    const relative = path.relative(deltaRoot, resolvedDeltaPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new ProjectPathError('unsafe_project_path', `Delta spec 越出变更规格目录：${deltaPath}`, deltaPath);
    }
    return {
      deltaPath: resolvedDeltaPath,
      mainPath: path.join(check.root, 'openspec', 'specs', relative),
    };
  });
}

export function preflightFinalizeSurface(check, { archiveTarget = null, phase = 'before' } = {}) {
  const candidates = [
    [check.requirementPath, '需求文件', true, false],
    [path.join(check.root, 'openspec', 'changes', 'archive'), '归档根目录', false, true],
    [path.join(check.root, 'openspec', 'specs'), '主规格根目录', false, true],
    ...(phase === 'before' ? [
      [check.changePath, '活动变更目录', true, true],
      [path.join(check.changePath, 'specs'), 'Delta spec 根目录', false, true],
      [path.join(check.changePath, '.openspec.yaml'), '变更元数据', false, false],
      [path.join(check.changePath, 'test-plan.md'), '测试方案', false, false],
      [check.archive?.targetPath, '归档目标', false, true],
    ] : [
      [archiveTarget, '实际归档目标', true, true],
      [archiveTarget && path.join(archiveTarget, '.openspec.yaml'), '归档变更元数据', false, false],
      [archiveTarget && path.join(archiveTarget, 'test-plan.md'), '归档测试方案', false, false],
    ]),
  ];
  for (const pair of plannedSpecPaths(check)) {
    if (phase === 'before') candidates.push([pair.deltaPath, 'Delta spec', true, false]);
    candidates.push([pair.mainPath, '主规格目标', false, false]);
  }
  for (const [candidate, label, mustExist, expectedDirectory] of candidates) {
    if (!candidate) continue;
    const safe = resolveSafeProjectPath(check.root, candidate, label, {
      mustExist,
      allowDirectory: expectedDirectory,
      allowAbsolute: true,
    });
    if (safe.exists && expectedDirectory && safe.kind !== 'directory') {
      throw new ProjectPathError('project_path_not_directory', `${label}必须是普通目录：${safe.projectPath}`, safe.projectPath);
    }
  }
}

export function postArchiveAudit({ requirementPath, changePath }) {
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

export function partialFailure({
  write,
  check,
  actions,
  archiveResult,
  archiveRoot,
  archiveWarnings,
  archiveTarget,
  rewrites,
  testPlanRewrites = [],
  testPlanChangeRenamed = false,
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
    testPlanRewrites,
    testPlanChangeRenamed,
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

export function recoverArchivedChange({ target, requirement, change, write }, services) {
  const recovery = resolveRecoveryContext({ target, requirement, change });
  if (!recovery) return null;
  resolveSafeProjectPath(recovery.root, path.join(recovery.changePath, '.openspec.yaml'), '归档变更元数据', {
    allowAbsolute: true,
  });
  resolveSafeProjectPath(recovery.root, path.join(recovery.changePath, 'test-plan.md'), '归档测试方案', {
    allowAbsolute: true,
  });
  const writeFile = services.atomicWrite || ((file, content) => atomicWriteProjectFile(
    recovery.root,
    file,
    content,
    { label: '归档恢复文件' },
  ));
  const original = fs.readFileSync(recovery.requirementPath, 'utf8');
  const requirementAlreadyArchived = original.includes(REQUIREMENT_STUB_MARKER);
  const next = requirementAlreadyArchived
    ? { content: original, rewrites: [] }
    : rewriteRequirementForArchive(original, recovery.changeName, recovery.archiveName, { allowAccepted: true });
  let testPlan;
  try {
    testPlan = prepareTestPlanRewrite(recovery.changePath, recovery.changeName, recovery.archiveName);
  } catch (error) {
    return partialFailure({
      write,
      check: { changeName: recovery.changeName },
      actions: [],
      archiveResult: { archivedAs: recovery.archiveName },
      archiveRoot: null,
      archiveWarnings: [],
      archiveTarget: recovery.changePath,
      rewrites: next.rewrites,
      failedStage: 'test-plan-rewrite',
      error: `归档恢复无法生成测试方案迁移：${error.message}`,
    });
  }
  const actions = [
    ...(testPlan.required ? [{
      action: 'recover-test-plan',
      target: testPlan.testPlanPath,
      rewrites: testPlan.rewrites,
      changeRenamed: testPlan.changeRenamed,
    }] : []),
    ...(!requirementAlreadyArchived ? [{ action: 'recover-references', target: recovery.requirementPath, rewrites: next.rewrites }] : []),
    { action: 'archive-requirement', target: recovery.requirementPath },
    { action: 'recover-archived-requirement-references', target: recovery.changePath },
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
      testPlanRewrites: testPlan.rewrites,
      testPlanChangeRenamed: testPlan.changeRenamed,
      actions,
    };
  }
  if (testPlan.exists) {
    try {
      writeFile(testPlan.testPlanPath, testPlan.content);
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
        testPlanRewrites: testPlan.rewrites,
        testPlanChangeRenamed: testPlan.changeRenamed,
        failedStage: 'test-plan-write',
        error: `归档恢复测试方案写入失败：${error.message}`,
      });
    }
  }
  try {
    if (!requirementAlreadyArchived) writeFile(recovery.requirementPath, next.content);
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
      testPlanRewrites: testPlan.rewrites,
      testPlanChangeRenamed: testPlan.changeRenamed,
      failedStage: 'requirement-write',
      error: `归档恢复写入失败：${error.message}`,
    });
  }
  let requirementArchive;
  try {
    requirementArchive = services.archiveRequirement({
      root: recovery.root,
      requirementPath: recovery.requirementPath,
      write: true,
    });
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
      testPlanRewrites: testPlan.rewrites,
      testPlanChangeRenamed: testPlan.changeRenamed,
      failedStage: 'requirement-archive',
      error: `归档恢复无法分层需求正文：${error.message}`,
    });
  }
  let archivedRequirementReferences;
  try {
    archivedRequirementReferences = migrateArchivedRequirementReferences({
      root: recovery.root,
      changePath: recovery.changePath,
      sourceRequirementPath: recovery.requirementPath,
      archivedRequirementPath: requirementArchive.archivePath,
      writeFile,
    });
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
      testPlanRewrites: testPlan.rewrites,
      testPlanChangeRenamed: testPlan.changeRenamed,
      failedStage: 'archived-requirement-reference-rewrite',
      error: `归档恢复无法迁移年度需求引用：${error.message}`,
    });
  }
  const audit = services.postArchiveAudit({
    requirementPath: requirementArchive.archivePath,
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
      testPlanRewrites: testPlan.rewrites,
      testPlanChangeRenamed: testPlan.changeRenamed,
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
    testPlanRewrites: testPlan.rewrites,
    testPlanChangeRenamed: testPlan.changeRenamed,
    actions,
    postArchiveAudit: audit,
    requirementStatus: '已验收',
    requirementArchive,
    archivedRequirementReferences,
  };
}
