import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertSafeProjectRoot, resolveProjectRoot } from './collect-project-scope.mjs';
import { listRequirementEntries } from './requirement-archive.mjs';

const REQUIREMENT_FILE_PATTERN = /^REQ-[^.]+\.md$/u;
const REQUIREMENT_STATUSES = new Set(['草稿', '已确认', '实施中', '待验证', '已验收']);
const STRUCTURE_CHECKS = [
  { field: 'decisionLedger', label: '决策台账', pattern: /^##\s+决策台账\s*$/mu },
  { field: 'evidenceMapping', label: '验收—证据映射', pattern: /^##\s+验收—证据映射\s*$/mu },
  { field: 'changeScope', label: '关联变更范围', pattern: /^##\s+关联变更范围\s*$/mu },
  { field: 'revisionHistory', label: '修订记录', pattern: /^##\s+修订记录\s*$/mu },
];

function readRequirementStatus(content) {
  const match = content.match(/^-\s*状态：\s*(.+?)\s*$/mu);
  if (!match) return { status: null, statusKind: 'missing', active: true };
  const status = match[1].trim();
  if (!REQUIREMENT_STATUSES.has(status)) return { status, statusKind: 'invalid', active: true };
  return { status, statusKind: 'known', active: status !== '已验收' };
}

// 预览只检查稳定结构，不尝试理解或补全历史需求中的业务事实。
function inspectRequirementPath(root, projectPath) {
  const absolutePath = path.join(root, projectPath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const statusInfo = readRequirementStatus(content);
  const missing = STRUCTURE_CHECKS
    .filter(({ pattern }) => !pattern.test(content))
    .map(({ field }) => field);
  if (statusInfo.statusKind !== 'known') missing.push('requirementStatus');
  return {
    path: projectPath,
    status: statusInfo.status,
    statusKind: statusInfo.statusKind,
    active: statusInfo.active,
    missing,
  };
}

function listRequirementFiles(requirementsRoot) {
  if (!fs.existsSync(requirementsRoot)) return [];
  return fs.readdirSync(requirementsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && REQUIREMENT_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export function previewRequirementUpgrade(target = process.cwd(), { includeArchive = false } = {}) {
  const root = resolveProjectRoot(target);
  assertSafeProjectRoot(root);
  const requirementsRoot = path.join(root, 'requirements');
  const warnings = [];
  if (!fs.existsSync(requirementsRoot)) warnings.push('未检测到标准需求目录：requirements');

  const requirementPaths = includeArchive
    ? listRequirementEntries(root, { includeArchive: true }).map((entry) => entry.path)
    : listRequirementFiles(requirementsRoot).map((fileName) => path.posix.join('requirements', fileName));
  const requirements = requirementPaths.map((projectPath) => inspectRequirementPath(root, projectPath));
  const activeRequirements = requirements.filter((requirement) => requirement.active);
  const issues = activeRequirements
    .filter((requirement) => requirement.missing.length)
    .map((requirement) => ({
      path: requirement.path,
      status: requirement.status,
      statusKind: requirement.statusKind,
      missing: requirement.missing,
    }));
  for (const requirement of activeRequirements) {
    if (requirement.statusKind === 'missing') warnings.push(`需求缺少统一状态：${requirement.path}`);
    if (requirement.statusKind === 'invalid') warnings.push(`需求状态无效：${requirement.path}（${requirement.status}）`);
  }

  return {
    ok: true,
    write: false,
    root,
    scannedDirectory: includeArchive ? 'requirements/archive' : 'requirements',
    includeArchive,
    requirements,
    activeRequirements,
    issues,
    warnings,
  };
}

function parseArgs(argv) {
  const args = { target: process.cwd(), json: false, includeArchive: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--target') {
      if (!argv[index + 1]) throw new Error('参数 --target 缺少目录');
      args.target = argv[index + 1];
      index += 1;
    } else if (value === '--json') {
      args.json = true;
    } else if (value === '--history') {
      args.includeArchive = true;
    } else if (value === '--write') {
      throw new Error('旧需求升级预览仅支持只读模式，不支持 --write');
    } else {
      throw new Error(`不支持的参数：${value}`);
    }
  }
  return args;
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = previewRequirementUpgrade(args.target, { includeArchive: args.includeArchive });
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`旧需求升级预览完成：${result.activeRequirements.length} 份需要关注，${result.issues.length} 份存在结构缺口。`);
      for (const issue of result.issues) console.log(`- ${issue.path}：${issue.missing.join('、')}`);
      for (const warning of result.warnings) console.log(`- 警告：${warning}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
