// WebStorm 会将对用户可见的中文诊断逐字符误报；保留中文可确保命令行反馈一致。
//noinspection NonAsciiCharacters
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ProjectPathError, resolveSafeProjectPath } from './project-path-safety.mjs';
import { validateVerificationEvidenceRecords } from './verification-evidence.mjs';
import { getRequirementSection, linkedRequirementIds } from './requirement-decision-parser.mjs';

const EXECUTABLE_STATUSES = new Set(['已确认', '项目默认']);
const DELIVERY_STAGES = new Set(['precomplete', 'complete']);

function normalizedRepositoryPath(value) {
  // Git pathspec 和机器诊断统一使用仓库正斜杠，避免 Windows 反斜杠被当作转义符。
  return String(value || '').split(path.sep).join('/');
}

function taskRows(content) {
  return content.split(/\r?\n/u)
    .map((line) => line.match(/^\s*-\s*\[[ xX]\]\s*(.+)$/u))
    .filter(Boolean)
    .map((match) => match[1].trim());
}

function assertScopeCoverage(scope, taskDecisionIds, taskAcceptanceIds, errors) {
  if (!scope) return;
  for (const id of scope.decisionIds) {
    if (!taskDecisionIds.has(id)) errors.push(`tasks.md 未覆盖关联变更 ${scope.name} 的决策：${id}`);
  }
  for (const id of scope.acceptanceIds) {
    if (!taskAcceptanceIds.has(id)) errors.push(`tasks.md 未覆盖关联变更 ${scope.name} 的验收：${id}`);
  }
}

function collectMarkdownFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      files.push(...collectMarkdownFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryPath);
    }
  }
  return files;
}

function resolveChangeFiles(changePath, errors) {
  if (!changePath) return null;
  const resolved = path.resolve(changePath);
  if (!fs.existsSync(resolved)) {
    errors.push(`变更路径不存在：${resolved}`);
    return null;
  }
  const isDirectory = fs.statSync(resolved).isDirectory();
  const tasksPath = isDirectory ? path.join(resolved, 'tasks.md') : resolved;
  if (!fs.existsSync(tasksPath)) {
    errors.push(`变更缺少 tasks.md：${tasksPath}`);
    return null;
  }
  return {
    rootPath: isDirectory ? resolved : path.dirname(resolved),
    tasksPath,
    files: isDirectory ? collectMarkdownFiles(resolved) : [resolved],
  };
}

function validateTaskReferences(changePath, decisions, acceptanceIds, selectedScope, errors) {
  const change = resolveChangeFiles(changePath, errors);
  if (!change) return { taskPath: null, decisionCount: 0, acceptanceCount: 0 };
  let taskDecisionIds = new Set();
  let taskAcceptanceIds = new Set();
  for (const file of change.files) {
    const content = fs.readFileSync(file, 'utf8');
    const decisionIds = new Set([...content.matchAll(/\b(D-\d{2,})\b/gu)].map((match) => match[1]));
    const acceptanceReferences = new Set([...content.matchAll(/\b(A-\d{2,})\b/gu)].map((match) => match[1]));
    const label = normalizedRepositoryPath(path.relative(change.rootPath, file)) || path.basename(file);
    const isTasks = path.resolve(file) === path.resolve(change.tasksPath);
    const isSpecification = label.startsWith('specs/');
    const isBusinessPlan = isSpecification || ['proposal.md', 'design.md'].includes(path.basename(file));
    if (isTasks) {
      taskDecisionIds = decisionIds;
      taskAcceptanceIds = acceptanceReferences;
      if (!decisionIds.size) errors.push('tasks.md 缺少 D-* 决策引用');
      if (!acceptanceReferences.size) errors.push('tasks.md 缺少 A-* 验收引用');
      if (selectedScope) {
        for (const task of taskRows(content)) {
          const taskDecisions = linkedRequirementIds(task, 'D');
          const taskAcceptances = linkedRequirementIds(task, 'A');
          if (!taskDecisions.length && !taskAcceptances.length) errors.push(`任务缺少 D-* 或 A-* 引用：${task}`);
        }
      }
    }
    for (const id of decisionIds) {
      const decision = decisions.get(id);
      if (!decision) errors.push(`${label} 引用了未知决策：${id}`);
      else if (!EXECUTABLE_STATUSES.has(decision.状态)) errors.push(`${label} 引用了不可实施决策 ${id}：状态为“${decision.状态}”`);
    }
    for (const id of acceptanceReferences) {
      if (!acceptanceIds.has(id)) errors.push(`${label} 引用了未知验收：${id}`);
    }
    if (isBusinessPlan && !decisionIds.size) errors.push(`${label} 缺少 D-* 决策引用`);
    if (isSpecification && !acceptanceReferences.size) errors.push(`${label} 缺少 A-* 验收引用`);
  }
  assertScopeCoverage(selectedScope, taskDecisionIds, taskAcceptanceIds, errors);
  return {
    taskPath: change.tasksPath,
    decisionCount: taskDecisionIds.size,
    acceptanceCount: taskAcceptanceIds.size,
  };
}

// Git 基线只用于核验测试策略，不会修改目标仓库或把无基线项目当作失败。
function findProjectRoot(requirementPath) {
  let current = path.dirname(requirementPath);
  while (path.dirname(current) !== current) {
    if (fs.existsSync(path.join(current, 'package.json'))) return current;
    current = path.dirname(current);
  }
  return path.dirname(path.dirname(requirementPath));
}

function inspectGitBaseline(root) {
  const insideWorkTree = spawnSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  if (insideWorkTree.status !== 0 || insideWorkTree.stdout.trim() !== 'true') return { available: false };
  const head = spawnSync('git', ['-C', root, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' });
  return { available: head.status === 0 };
}

function isGitTracked(root, relativePath) {
  const pathspec = normalizedRepositoryPath(relativePath);
  return spawnSync('git', ['-C', root, 'cat-file', '-e', `HEAD:${pathspec}`], { encoding: 'utf8' }).status === 0;
}

function validateVerificationEvidencePaths(requirementPath, changePath, verificationRecords, stage, errors, warnings) {
  if (!verificationRecords || !changePath) {
    return {
      recorded: verificationRecords?.size || 0,
      verifiedFiles: 0,
      required: false,
      executed: false,
      diagnostics: [],
    };
  }
  const root = findProjectRoot(requirementPath);
  for (const [id, record] of verificationRecords) {
    if (DELIVERY_STAGES.has(stage) && record.结果 === '通过' && !/^\d{4}-\d{2}-\d{2}$/u.test(record.执行日期)) {
      errors.push(`验证记录 ${id} 的通过日期无效：${record.执行日期 || '空值'}`);
    }
  }
  const validation = validateVerificationEvidenceRecords({
    root,
    changePath,
    requirementPath,
    records: [...verificationRecords.values()],
  });
  for (const diagnostic of validation.diagnostics) {
    if (diagnostic.status === 'failed') {
      errors.push(`${diagnostic.code}：${diagnostic.message || diagnostic.target || '机器证据校验失败'}`);
      continue;
    }
    if (diagnostic.status !== 'warning') continue;
    if (stage === 'precomplete' && diagnostic.code === 'evidence_file_missing') {
      errors.push(`${diagnostic.code}：${diagnostic.message || diagnostic.target}`);
    } else {
      warnings.push(`${diagnostic.code}：${diagnostic.message || diagnostic.target || '证据信任边界提醒'}`);
    }
  }
  return {
    recorded: verificationRecords.size,
    verifiedFiles: validation.verifiedFiles,
    required: validation.required,
    executed: validation.executed,
    diagnostics: validation.diagnostics,
  };
}

function parseTestFileStrategy(content) {
  const section = getRequirementSection(content, '测试与验证');
  const match = section?.match(/^-\s*测试文件策略：\s*(新建|复用)；\s*目标路径：`?([^；`\n]+)`?；\s*基线证据：([^；\n]+)；\s*选择理由：(.+)$/mu);
  if (!match) return null;
  return {
    strategy: match[1],
    targetPath: match[2].trim(),
    baselineEvidence: match[3].trim(),
    reason: match[4].trim(),
  };
}

function validateTestFileStrategy(requirementPath, content, stage, errors, warnings) {
  const strategy = parseTestFileStrategy(content);
  if (!strategy) {
    if (DELIVERY_STAGES.has(stage)) errors.push('交付阶段缺少新版测试文件策略或基线证据');
    return null;
  }
  const root = findProjectRoot(requirementPath);
  let safeTarget;
  try {
    safeTarget = resolveSafeProjectPath(root, strategy.targetPath, '测试文件策略目标路径', {
      allowDirectory: false,
    });
  } catch (error) {
    if (error instanceof ProjectPathError) {
      errors.push(`${error.code}：${error.message}`);
      return { ...strategy, root, targetPath: null, exists: false, baselineAvailable: false };
    }
    throw error;
  }
  const targetPath = safeTarget.absolutePath;
  const relativePath = safeTarget.projectPath;
  const exists = fs.existsSync(targetPath);
  const baseline = inspectGitBaseline(root);
  if (strategy.strategy === '复用' && !exists) errors.push(`复用测试文件不存在：${strategy.targetPath}`);
  if (baseline.available) {
    const tracked = isGitTracked(root, relativePath);
    if (strategy.strategy === '复用' && !tracked) {
      errors.push(`复用测试文件未受 Git 基线跟踪：${strategy.targetPath}；请改为“新建”或选择已有专用测试`);
    }
    if (strategy.strategy === '新建' && tracked && !DELIVERY_STAGES.has(stage)) {
      errors.push(`新建测试文件已受 Git 基线跟踪：${strategy.targetPath}；请改为“复用”或选择新路径`);
    }
  } else {
    warnings.push(`无法确认测试文件 Git 基线：${strategy.targetPath}；已保留存在性检查`);
  }
  if (DELIVERY_STAGES.has(stage) && !exists) errors.push(`交付阶段缺少目标测试文件：${strategy.targetPath}`);
  return { ...strategy, root, targetPath, exists, baselineAvailable: baseline.available };
}

function validateCompletionState(content, changePath, acceptanceIds, stage, errors) {
  if (!DELIVERY_STAGES.has(stage)) return;
  const acceptanceSection = getRequirementSection(content, '验收标准') || '';
  const acceptanceIdsByCheckbox = (statePattern) => (
    [...acceptanceSection.matchAll(new RegExp(`^\\s*-\\s*\\[${statePattern}\\]\\s*(.+)$`, 'gmu'))]
      .flatMap((match) => linkedRequirementIds(match[1], 'A'))
  );
  const unfinished = acceptanceIdsByCheckbox('\\s');
  for (const id of unfinished) errors.push(`完成阶段存在未勾选验收：${id}`);
  if (stage === 'precomplete') {
    const checked = new Set(acceptanceIdsByCheckbox('[xX]'));
    for (const id of acceptanceIds) {
      if (!checked.has(id)) errors.push(`完成前校验要求验收使用已勾选复选框：${id}`);
    }
  }
  const change = resolveChangeFiles(changePath, errors);
  if (!change) {
    errors.push('完成阶段必须提供包含 tasks.md 的变更路径');
    return;
  }
  const taskContent = fs.readFileSync(change.tasksPath, 'utf8');
  const unfinishedTasks = [...taskContent.matchAll(/^\s*-\s*\[\s\]\s*(.+)$/gmu)].map((match) => match[1]);
  for (const task of unfinishedTasks) errors.push(`完成阶段存在未完成任务：${task}`);
  if (!acceptanceIds.size) errors.push('完成阶段缺少可验证验收项');
}

export function validateRequirementDelivery({
  requirementPath,
  content,
  changePath,
  stage,
  decisions,
  acceptanceIds,
  verificationRecords,
  selectedChangeScope,
  errors,
  warnings,
}) {
  const taskReferences = validateTaskReferences(changePath, decisions, acceptanceIds, selectedChangeScope, errors);
  const evidenceFiles = validateVerificationEvidencePaths(
    requirementPath,
    changePath,
    verificationRecords,
    stage,
    errors,
    warnings,
  );
  const testFileStrategy = validateTestFileStrategy(requirementPath, content, stage, errors, warnings);
  validateCompletionState(content, changePath, acceptanceIds, stage, errors);
  return { taskReferences, evidenceFiles, testFileStrategy };
}
