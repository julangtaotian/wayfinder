import fs from 'node:fs';
import path from 'node:path';
import { ProjectPathError, resolveSafeProjectPath } from './project-path-safety.mjs';

function normalizedProjectPath(root, candidate, label) {
  const safe = resolveSafeProjectPath(root, candidate, label, {
    mustExist: true,
    allowDirectory: label.includes('目录'),
    allowAbsolute: true,
  });
  const relative = path.relative(root, safe.absolutePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ProjectPathError('unsafe_project_path', `${label}越出项目范围：${candidate}`, candidate);
  }
  return relative.split(path.sep).join('/');
}

function rewriteTestPlanRequirement(content, sourceRequirement, archivedRequirement) {
  const matches = [...String(content).matchAll(/^(-\s*需求：\s*)`?([^`\n]+)`?\s*$/gmu)];
  if (matches.length !== 1) throw new Error(`测试方案需求字段数量异常：${matches.length}`);
  const current = matches[0][2].trim();
  if (current !== sourceRequirement && current !== archivedRequirement) {
    throw new Error(`测试方案需求路径与归档目标不一致：${current || '空值'}`);
  }
  if (current === archivedRequirement) return { content: String(content), changed: false };
  return {
    content: String(content).replace(matches[0][0], `${matches[0][1]}\`${archivedRequirement}\``),
    changed: true,
  };
}

function rewriteEvidenceRequirement(content, sourceRequirement, archivedRequirement, target) {
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch (error) {
    throw new Error(`机器证据不是有效 JSON：${target}：${error.message}`);
  }
  if (manifest.requirement !== sourceRequirement && manifest.requirement !== archivedRequirement) {
    throw new Error(`机器证据关联需求与归档目标不一致：${target}`);
  }
  if (manifest.requirement === archivedRequirement) return { content, changed: false };
  manifest.requirement = archivedRequirement;
  return { content: `${JSON.stringify(manifest, null, 2)}\n`, changed: true };
}

// 需求正文分层后，测试方案和机器证据必须同步指向年度正文，恢复执行保持幂等。
export function migrateArchivedRequirementReferences({
  root,
  changePath,
  sourceRequirementPath,
  archivedRequirementPath,
  writeFile,
}) {
  const sourceRequirement = normalizedProjectPath(root, sourceRequirementPath, '根需求文件');
  const archivedRequirement = normalizedProjectPath(root, archivedRequirementPath, '归档需求文件');
  const safeChange = resolveSafeProjectPath(root, changePath, '归档变更目录', {
    mustExist: true,
    allowDirectory: true,
    allowAbsolute: true,
  });
  const testPlanPath = path.join(safeChange.absolutePath, 'test-plan.md');
  const testPlan = fs.existsSync(testPlanPath)
    ? rewriteTestPlanRequirement(
      fs.readFileSync(testPlanPath, 'utf8'),
      sourceRequirement,
      archivedRequirement,
    )
    : { content: null, changed: false };
  const evidenceRoot = path.join(safeChange.absolutePath, 'evidence');
  const evidence = fs.existsSync(evidenceRoot)
    ? fs.readdirSync(evidenceRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^V-\d{2,}\.json$/u.test(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => {
        const target = path.join(evidenceRoot, entry.name);
        const rewritten = rewriteEvidenceRequirement(
          fs.readFileSync(target, 'utf8'),
          sourceRequirement,
          archivedRequirement,
          path.relative(root, target).split(path.sep).join('/'),
        );
        return { target, ...rewritten };
      })
    : [];

  if (testPlan.changed) writeFile(testPlanPath, testPlan.content);
  for (const item of evidence) {
    if (item.changed) writeFile(item.target, item.content);
  }
  return {
    sourceRequirement,
    archivedRequirement,
    testPlanChanged: testPlan.changed,
    evidenceChanged: evidence.filter((item) => item.changed).length,
    evidenceCount: evidence.length,
  };
}
