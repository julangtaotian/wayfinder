// AI-code-start lines:293 tool:Codex
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// AI-code-start lines:1 tool:Codex
import { spawnSync } from 'node:child_process';

const DECISION_HEADERS = ['ID', '决策项', '状态', '取值', '来源'];
const EVIDENCE_HEADERS = ['验收ID', '验收点', '关联决策', '验证方式', '证据位置', '断言结果'];
// AI-code-start lines:7 tool:Codex
const ENHANCED_EVIDENCE_HEADERS = [...EVIDENCE_HEADERS, '验证记录'];
const VERIFICATION_RECORD_HEADERS = ['验证ID', '验证类型', '执行内容或环境', '执行日期', '结果', '证据位置'];
const DECISION_STATUSES = new Set(['已确认', '项目默认', '暂定', '待确认']);
const EXECUTABLE_STATUSES = new Set(['已确认', '项目默认']);
const VERIFICATION_METHODS = new Set(['自动', '人工', '自动+人工']);
const REQUIREMENT_STATUSES = new Set(['草稿', '已确认', '实施中', '待验证', '已验收']);
const VALIDATION_STAGES = new Set(['plan', 'implement', 'precomplete', 'complete']);
const VERIFICATION_RESULTS = new Set(['计划', '未执行', '通过', '失败', '阻断']);
// AI-code-start lines:3 tool:Codex
const INTERACTION_STATE_HEADERS = ['状态', '覆盖决定', '触发或前置条件', '期望结果', '验证方式', '关联验收', '不适用理由'];
const REQUIRED_INTERACTION_STATES = ['初始（已有数据）', '用户操作', '刷新', '空态', '错误态', '卸载'];
const INTERACTION_COVERAGE_DECISIONS = new Set(['覆盖', '不适用']);
// AI-code-start lines:3 tool:Codex
const CHANGE_SCOPE_HEADERS = ['变更', '决策范围', '验收范围'];
const DELIVERY_STAGES = new Set(['precomplete', 'complete']);
const IMPLEMENTABLE_REQUIREMENT_STATUSES = new Set(['已确认', '实施中']);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPlaceholder(value) {
  return !value || /^(待填写|未填写|-|—)$/u.test(value);
}

function getSection(content, title) {
  const heading = new RegExp(`^##\\s+${escapeRegExp(title)}\\s*$`, 'mu');
  const match = heading.exec(content);
  if (!match) return null;
  const afterHeading = content.slice(match.index + match[0].length);
  const nextHeading = afterHeading.search(/^##\s+/mu);
  return nextHeading < 0 ? afterHeading : afterHeading.slice(0, nextHeading);
}

function parseTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function isDividerRow(cells) {
  return cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

// 仅解析模板规定的简单 Markdown 表格，避免把自然语言段落误判为机器字段。
function parseTable(section, headers, label, errors) {
  if (!section) {
    errors.push(`缺少“${label}”区块`);
    return [];
  }
  const lines = section.split(/\r?\n/u).filter((line) => line.trim().startsWith('|'));
  if (lines.length < 3) {
    errors.push(`“${label}”缺少有效 Markdown 表格`);
    return [];
  }
  const actualHeaders = parseTableRow(lines[0]);
  if (JSON.stringify(actualHeaders) !== JSON.stringify(headers)) {
    errors.push(`“${label}”表头必须为：${headers.join('、')}`);
    return [];
  }

  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = parseTableRow(line);
    if (isDividerRow(cells)) continue;
    if (cells.length !== headers.length) {
      errors.push(`“${label}”存在列数错误的表格行：${line.trim()}`);
      continue;
    }
    rows.push(Object.fromEntries(headers.map((header, index) => [header, cells[index]])));
  }
  if (!rows.length) errors.push(`“${label}”至少需要一条记录`);
  return rows;
}

function parseDecisionLedger(content, errors) {
  const rows = parseTable(getSection(content, '决策台账'), DECISION_HEADERS, '决策台账', errors);
  const decisions = new Map();
  for (const row of rows) {
    const id = row.ID;
    if (!/^D-\d{2,}$/u.test(id)) {
      errors.push(`决策 ID 无效：${id || '空值'}；必须使用 D-01 格式`);
      continue;
    }
    if (decisions.has(id)) {
      errors.push(`决策 ID 重复：${id}`);
      continue;
    }
    if (isPlaceholder(row.决策项)) errors.push(`决策 ${id} 缺少决策项`);
    if (!DECISION_STATUSES.has(row.状态)) {
      errors.push(`决策 ${id} 的状态无效：${row.状态 || '空值'}`);
    }
    if (isPlaceholder(row.取值)) errors.push(`决策 ${id} 缺少取值`);
    if (isPlaceholder(row.来源)) errors.push(`决策 ${id} 缺少来源`);
    decisions.set(id, row);
  }
  return decisions;
}

function parseAcceptanceIds(content, errors) {
  const section = getSection(content, '验收标准');
  if (!section) {
    errors.push('缺少“验收标准”区块');
    return new Set();
  }
  const ids = new Set();
  for (const match of section.matchAll(/\[(A-\d{2,})\]/gu)) {
    if (ids.has(match[1])) errors.push(`验收 ID 重复：${match[1]}`);
    ids.add(match[1]);
  }
  if (!ids.size) errors.push('“验收标准”缺少 A-01 格式的验收 ID');
  return ids;
}

// AI-code-start lines:74 tool:Codex
// 状态矩阵只校验已采用的新格式，历史需求缺失时保留兼容并给出可迁移提醒。
function linkedAcceptanceIds(value) {
  return [...String(value || '').matchAll(/A-\d{2,}/gu)].map((match) => match[0]);
}

function parseInteractionStateMatrix(content, acceptanceIds, stage, errors, warnings) {
  const section = getSection(content, '交互状态矩阵');
  if (!section) {
    if (DELIVERY_STAGES.has(stage)) warnings.push('需求缺少交互状态矩阵；历史需求可继续完成审计，建议按新版模板补充状态覆盖。');
    return { present: false, rows: [] };
  }

  const rows = parseTable(section, INTERACTION_STATE_HEADERS, '交互状态矩阵', errors);
  const states = new Map();
  for (const row of rows) {
    const state = row.状态;
    if (!REQUIRED_INTERACTION_STATES.includes(state)) {
      errors.push(`交互状态矩阵包含未知状态：${state || '空值'}`);
      continue;
    }
    if (states.has(state)) {
      errors.push(`交互状态矩阵状态重复：${state}`);
      continue;
    }
    states.set(state, row);

    if (!INTERACTION_COVERAGE_DECISIONS.has(row.覆盖决定)) {
      errors.push(`交互状态“${state}”的覆盖决定无效：${row.覆盖决定 || '空值'}；必须使用“覆盖”或“不适用”`);
      continue;
    }
    if (row.覆盖决定 === '不适用') {
      if (isPlaceholder(row.不适用理由)) errors.push(`交互状态“${state}”标记为“不适用”时必须说明理由`);
      continue;
    }

    for (const field of ['触发或前置条件', '期望结果', '验证方式', '关联验收']) {
      if (isPlaceholder(row[field])) errors.push(`交互状态“${state}”缺少${field}`);
    }
    if (!VERIFICATION_METHODS.has(row.验证方式)) {
      errors.push(`交互状态“${state}”的验证方式无效：${row.验证方式 || '空值'}`);
    }
    const acceptanceReferences = linkedAcceptanceIds(row.关联验收);
    if (!acceptanceReferences.length) {
      errors.push(`交互状态“${state}”缺少关联 A-* 验收`);
    } else {
      for (const acceptanceId of acceptanceReferences) {
        if (!acceptanceIds.has(acceptanceId)) errors.push(`交互状态“${state}”引用了未知验收：${acceptanceId}`);
      }
    }
  }

  for (const state of REQUIRED_INTERACTION_STATES) {
    if (!states.has(state)) errors.push(`交互状态矩阵缺少状态：${state}`);
  }
  return { present: true, rows };
}

// AI-code-start lines:148 tool:Codex
// 新旧验收映射并行解析，只有完成阶段才强制要求新版验证记录。
function parseRequirementStatus(content, stage, errors, warnings) {
  const section = getSection(content, '基本信息');
  const match = section?.match(/^-\s*状态：\s*(.+?)\s*$/mu);
  if (!match) {
    if (stage === 'complete') errors.push('完成阶段缺少“基本信息”中的需求状态');
    return null;
  }
  const status = match[1].trim();
  if (!REQUIREMENT_STATUSES.has(status)) {
    const message = `需求状态无效：${status}；必须使用${[...REQUIREMENT_STATUSES].join('、')}`;
    if (stage === 'complete') errors.push(message);
    else warnings.push(message);
  }
  // AI-code-start lines:12 tool:Codex
  if (stage === 'plan' && status !== '已确认') {
    errors.push(`规划阶段要求需求状态为“已确认”，当前为“${status}”`);
  }
  if (stage === 'implement' && !IMPLEMENTABLE_REQUIREMENT_STATUSES.has(status)) {
    errors.push(`实施阶段要求需求状态为“已确认”或“实施中”，当前为“${status}”`);
  }
  if (stage === 'precomplete' && status !== '待验证') {
    errors.push(`完成前校验要求需求状态为“待验证”，当前为“${status}”`);
  }
  if (stage === 'complete' && status !== '已验收') {
    errors.push(`完成阶段要求需求状态为“已验收”，当前为“${status}”`);
  }
  return status;
}

function parseVerificationRecords(content, errors) {
  const section = getSection(content, '验证记录');
  if (!section) return null;
  const rows = parseTable(section, VERIFICATION_RECORD_HEADERS, '验证记录', errors);
  const records = new Map();
  for (const row of rows) {
    const id = row.验证ID;
    if (!/^V-\d{2,}$/u.test(id)) {
      errors.push(`验证记录 ID 无效：${id || '空值'}；必须使用 V-01 格式`);
      continue;
    }
    if (records.has(id)) {
      errors.push(`验证记录 ID 重复：${id}`);
      continue;
    }
    if (!VERIFICATION_METHODS.has(row.验证类型)) errors.push(`验证记录 ${id} 的验证类型无效：${row.验证类型 || '空值'}`);
    for (const field of ['执行内容或环境', '执行日期', '结果', '证据位置']) {
      if (isPlaceholder(row[field])) errors.push(`验证记录 ${id} 缺少${field}`);
    }
    if (!VERIFICATION_RESULTS.has(row.结果)) errors.push(`验证记录 ${id} 的结果无效：${row.结果 || '空值'}`);
    records.set(id, row);
  }
  return records;
}

function parseEvidenceTable(section, errors) {
  if (!section) {
    errors.push('缺少“验收—证据映射”区块');
    return { rows: [], enhanced: false };
  }
  const lines = section.split(/\r?\n/u).filter((line) => line.trim().startsWith('|'));
  if (lines.length < 3) {
    errors.push('“验收—证据映射”缺少有效 Markdown 表格');
    return { rows: [], enhanced: false };
  }
  const headers = parseTableRow(lines[0]);
  const enhanced = JSON.stringify(headers) === JSON.stringify(ENHANCED_EVIDENCE_HEADERS);
  const legacy = JSON.stringify(headers) === JSON.stringify(EVIDENCE_HEADERS);
  if (!enhanced && !legacy) {
    errors.push(`“验收—证据映射”表头必须为：${EVIDENCE_HEADERS.join('、')}，或新版表头：${ENHANCED_EVIDENCE_HEADERS.join('、')}`);
    return { rows: [], enhanced: false };
  }
  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = parseTableRow(line);
    if (isDividerRow(cells)) continue;
    if (cells.length !== headers.length) {
      errors.push(`“验收—证据映射”存在列数错误的表格行：${line.trim()}`);
      continue;
    }
    rows.push(Object.fromEntries(headers.map((header, index) => [header, cells[index]])));
  }
  if (!rows.length) errors.push('“验收—证据映射”至少需要一条记录');
  return { rows, enhanced };
}

function linkedVerificationIds(value) {
  return [...String(value || '').matchAll(/V-\d{2,}/gu)].map((match) => match[0]);
}

function hasVisualEvidence(record) {
  const environment = record.执行内容或环境 || '';
  const media = record.证据位置 || '';
  return /(\d{3,4}px|视口|设备)/u.test(environment)
    && /检查/u.test(environment)
    && /\.(?:png|jpe?g|webp|gif|mp4|webm)(?:$|\s|\))/iu.test(media);
}

function parseEvidenceMapping(content, decisions, acceptanceIds, verificationRecords, stage, errors) {
  const { rows, enhanced } = parseEvidenceTable(getSection(content, '验收—证据映射'), errors);
  const evidenceIds = new Set();
  const mappingRecords = new Map();
  for (const row of rows) {
    const id = row.验收ID;
    if (!/^A-\d{2,}$/u.test(id)) {
      errors.push(`验收映射 ID 无效：${id || '空值'}；必须使用 A-01 格式`);
      continue;
    }
    if (evidenceIds.has(id)) errors.push(`验收映射 ID 重复：${id}`);
    evidenceIds.add(id);
    if (isPlaceholder(row.验收点)) errors.push(`验收映射 ${id} 缺少验收点`);
    if (!VERIFICATION_METHODS.has(row.验证方式)) errors.push(`验收映射 ${id} 的验证方式无效：${row.验证方式 || '空值'}`);
    if (isPlaceholder(row.证据位置)) errors.push(`验收映射 ${id} 缺少证据位置`);
    if (isPlaceholder(row.断言结果)) errors.push(`验收映射 ${id} 缺少断言结果`);
    const decisionIds = [...row.关联决策.matchAll(/D-\d{2,}/gu)].map((match) => match[0]);
    if (!decisionIds.length) {
      errors.push(`验收映射 ${id} 缺少关联 D-* 决策`);
    } else {
      for (const decisionId of decisionIds) {
        const decision = decisions.get(decisionId);
        if (!decision) errors.push(`验收映射 ${id} 引用了未知决策：${decisionId}`);
        else if (!EXECUTABLE_STATUSES.has(decision.状态)) errors.push(`验收映射 ${id} 引用了不可验收决策 ${decisionId}：状态为“${decision.状态}”`);
      }
    }

    const recordIds = enhanced ? linkedVerificationIds(row.验证记录) : [];
    mappingRecords.set(id, recordIds);
    if (enhanced && !recordIds.length) errors.push(`验收映射 ${id} 缺少关联 V-* 验证记录`);
    for (const recordId of recordIds) {
      if (!verificationRecords?.has(recordId)) errors.push(`验收映射 ${id} 引用了未知验证记录：${recordId}`);
    }
    if (DELIVERY_STAGES.has(stage)) {
      if (!enhanced || !verificationRecords) {
        errors.push(`完成阶段要求验收映射 ${id} 使用新版验证记录`);
      } else {
        const records = recordIds.map((recordId) => verificationRecords.get(recordId)).filter(Boolean);
        if (records.some((record) => record.结果 !== '通过')) errors.push(`验收映射 ${id} 存在未通过的验证记录`);
        if (row.验证方式.includes('人工') && !records.some((record) => record.验证类型.includes('人工') && hasVisualEvidence(record))) {
          errors.push(`验收映射 ${id} 缺少视口或设备、检查项和截图或录屏证据`);
        }
      }
    }
  }

  for (const id of acceptanceIds) {
    if (!evidenceIds.has(id)) errors.push(`验收标准 ${id} 缺少验收—证据映射`);
  }
  for (const id of evidenceIds) {
    if (!acceptanceIds.has(id)) errors.push(`验收映射 ${id} 未对应任何验收标准`);
  }
  return { evidenceIds, enhanced, mappingRecords };
}

// AI-code-start lines:72 tool:Codex
function linkedIds(value, prefix) {
  const pattern = new RegExp(`${prefix}-\\d{2,}`, 'gu');
  return [...String(value || '').matchAll(pattern)].map((match) => match[0]);
}

function selectedChangeNames(changePath) {
  if (!changePath) return [];
  const resolved = path.resolve(changePath);
  const exact = path.basename(resolved);
  if (path.basename(path.dirname(resolved)) !== 'archive') return [exact];
  const fallback = exact.replace(/^\d{4}-\d{2}-\d{2}-/u, '');
  return fallback === exact ? [exact] : [exact, fallback];
}

// 关联矩阵存在时才启用精确范围门槛，历史需求继续使用原有整体引用检查。
function parseSelectedChangeScope(content, changePath, decisions, acceptanceIds, stage, errors, warnings) {
  if (!changePath) return null;
  const section = getSection(content, '关联变更范围');
  if (!section) {
    if (stage !== 'plan') warnings.push('需求缺少“关联变更范围”；已按历史整体引用规则检查，建议人工确认本变更边界。');
    return null;
  }
  const rows = parseTable(section, CHANGE_SCOPE_HEADERS, '关联变更范围', errors);
  const scopes = new Map();
  for (const row of rows) {
    const name = row.变更.trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name)) {
      errors.push(`关联变更名称无效：${name || '空值'}；必须使用 kebab-case`);
      continue;
    }
    if (scopes.has(name)) {
      errors.push(`关联变更范围重复：${name}`);
      continue;
    }
    const decisionIds = new Set(linkedIds(row.决策范围, 'D'));
    const scopedAcceptanceIds = new Set(linkedIds(row.验收范围, 'A'));
    if (!decisionIds.size) errors.push(`关联变更 ${name} 缺少 D-* 决策范围`);
    if (!scopedAcceptanceIds.size) errors.push(`关联变更 ${name} 缺少 A-* 验收范围`);
    for (const id of decisionIds) {
      const decision = decisions.get(id);
      if (!decision) errors.push(`关联变更 ${name} 引用了未知决策：${id}`);
      else if (!EXECUTABLE_STATUSES.has(decision.状态)) errors.push(`关联变更 ${name} 引用了不可实施决策 ${id}：状态为“${decision.状态}”`);
    }
    for (const id of scopedAcceptanceIds) {
      if (!acceptanceIds.has(id)) errors.push(`关联变更 ${name} 引用了未知验收：${id}`);
    }
    scopes.set(name, { name, decisionIds, acceptanceIds: scopedAcceptanceIds });
  }

  const names = selectedChangeNames(changePath);
  const name = names.find((candidate) => scopes.has(candidate)) || names[0];
  const selected = scopes.get(name);
  if (!selected) errors.push(`关联变更范围未声明当前变更：${names[0]}`);
  return selected || null;
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
    const label = path.relative(change.rootPath, file) || path.basename(file);
    const isTasks = path.resolve(file) === path.resolve(change.tasksPath);
    const isSpecification = label.startsWith(`specs${path.sep}`);
    const isBusinessPlan = isSpecification || ['proposal.md', 'design.md'].includes(path.basename(file));
    if (isTasks) {
      taskDecisionIds = decisionIds;
      taskAcceptanceIds = acceptanceReferences;
      if (!decisionIds.size) errors.push('tasks.md 缺少 D-* 决策引用');
      if (!acceptanceReferences.size) errors.push('tasks.md 缺少 A-* 验收引用');
      // AI-code-start lines:8 tool:Codex
      if (selectedScope) {
        for (const task of taskRows(content)) {
          const taskDecisions = linkedIds(task, 'D');
          const taskAcceptances = linkedIds(task, 'A');
          if (!taskDecisions.length && !taskAcceptances.length) errors.push(`任务缺少 D-* 或 A-* 引用：${task}`);
        }
      }
    }
    for (const id of decisionIds) {
      const decision = decisions.get(id);
      if (!decision) {
        errors.push(`${label} 引用了未知决策：${id}`);
      } else if (!EXECUTABLE_STATUSES.has(decision.状态)) {
        errors.push(`${label} 引用了不可实施决策 ${id}：状态为“${decision.状态}”`);
      }
    }
    for (const id of acceptanceReferences) {
      if (!acceptanceIds.has(id)) errors.push(`${label} 引用了未知验收：${id}`);
    }
    if (isBusinessPlan && !decisionIds.size) errors.push(`${label} 缺少 D-* 决策引用`);
    if (isSpecification && !acceptanceReferences.size) errors.push(`${label} 缺少 A-* 验收引用`);
  }
  // AI-code-start lines:1 tool:Codex
  assertScopeCoverage(selectedScope, taskDecisionIds, taskAcceptanceIds, errors);
  return {
    taskPath: change.tasksPath,
    decisionCount: taskDecisionIds.size,
    acceptanceCount: taskAcceptanceIds.size,
  };
}

// AI-code-start lines:104 tool:Codex
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
  const files = spawnSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' });
  return { available: files.status === 0 && Boolean(files.stdout.trim()) };
}

function isGitTracked(root, relativePath) {
  return spawnSync('git', ['-C', root, 'ls-files', '--error-unmatch', '--', relativePath], { encoding: 'utf8' }).status === 0;
}

// AI-code-start lines:40 tool:Codex
function persistentEvidencePath(value) {
  const candidate = String(value || '').trim().replace(/^`|`$/gu, '');
  if (!candidate.includes('/') || /[\s：；，、]/u.test(candidate)) return null;
  return candidate;
}

function validateVerificationEvidencePaths(requirementPath, verificationRecords, stage, errors) {
  if (stage !== 'precomplete' || !verificationRecords) return { recorded: verificationRecords?.size || 0, verifiedFiles: 0 };
  const root = findProjectRoot(requirementPath);
  let verifiedFiles = 0;
  for (const [id, record] of verificationRecords) {
    if (record.结果 === '通过' && !/^\d{4}-\d{2}-\d{2}$/u.test(record.执行日期)) {
      errors.push(`验证记录 ${id} 的通过日期无效：${record.执行日期 || '空值'}`);
    }
    const evidencePath = persistentEvidencePath(record.证据位置);
    if (!evidencePath) continue;
    const resolved = path.resolve(root, evidencePath);
    const relative = path.relative(root, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      errors.push(`验证记录 ${id} 的证据路径越出项目范围：${evidencePath}`);
      continue;
    }
    if (!fs.existsSync(resolved)) {
      errors.push(`验证记录 ${id} 的持久证据不存在：${evidencePath}`);
      continue;
    }
    verifiedFiles += 1;
  }
  return { recorded: verificationRecords.size, verifiedFiles };
}

function parseTestFileStrategy(content) {
  const section = getSection(content, '测试与验证');
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
  const targetPath = path.resolve(root, strategy.targetPath);
  const relativePath = path.relative(root, targetPath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    errors.push(`测试文件策略目标路径越出项目范围：${strategy.targetPath}`);
    return { ...strategy, root, targetPath, exists: false, baselineAvailable: false };
  }
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
  const acceptanceSection = getSection(content, '验收标准') || '';
  const unfinished = [...acceptanceSection.matchAll(/^\s*-\s*\[\s\]\s*\[(A-\d{2,})\]/gmu)].map((match) => match[1]);
  for (const id of unfinished) errors.push(`完成阶段存在未勾选验收：${id}`);
  // AI-code-start lines:7 tool:Codex
  if (stage === 'precomplete') {
    const checked = new Set([...acceptanceSection.matchAll(/^\s*-\s*\[[xX]\]\s*\[(A-\d{2,})\]/gmu)].map((match) => match[1]));
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

export function validateRequirementDecisions(requirementPath, options = {}) {
  const errors = [];
  const warnings = [];
  // AI-code-start lines:4 tool:Codex
  const stage = options.stage || 'plan';
  if (!VALIDATION_STAGES.has(stage)) errors.push(`校验阶段无效：${stage}；必须使用${[...VALIDATION_STAGES].join('、')}`);
  const resolvedRequirement = path.resolve(requirementPath || '');
  if (!requirementPath || !fs.existsSync(resolvedRequirement)) {
    return {
      ok: false,
      stage,
      requirementPath: resolvedRequirement,
      changePath: options.changePath ? path.resolve(options.changePath) : null,
      decisions: 0,
      acceptances: 0,
      taskReferences: { decisionCount: 0, acceptanceCount: 0 },
      errors: [`需求文件不存在：${resolvedRequirement}`],
      warnings,
    };
  }
  const content = fs.readFileSync(resolvedRequirement, 'utf8');
  const decisions = parseDecisionLedger(content, errors);
  const acceptanceIds = parseAcceptanceIds(content, errors);
  // AI-code-start lines:1 tool:Codex
  const interactionStateMatrix = parseInteractionStateMatrix(content, acceptanceIds, stage, errors, warnings);
  // AI-code-start lines:8 tool:Codex
  const requirementStatus = parseRequirementStatus(content, stage, errors, warnings);
  const verificationRecords = parseVerificationRecords(content, errors);
  const evidenceMapping = parseEvidenceMapping(content, decisions, acceptanceIds, verificationRecords, stage, errors);
  // AI-code-start lines:5 tool:Codex
  const selectedChangeScope = parseSelectedChangeScope(
    content, options.changePath, decisions, acceptanceIds, stage, errors, warnings,
  );
  const taskReferences = validateTaskReferences(options.changePath, decisions, acceptanceIds, selectedChangeScope, errors);
  const evidenceFiles = validateVerificationEvidencePaths(resolvedRequirement, verificationRecords, stage, errors);
  const testFileStrategy = validateTestFileStrategy(resolvedRequirement, content, stage, errors, warnings);
  validateCompletionState(content, options.changePath, acceptanceIds, stage, errors);
  return {
    ok: errors.length === 0,
    stage,
    requirementPath: resolvedRequirement,
    changePath: options.changePath ? path.resolve(options.changePath) : null,
    decisions: decisions.size,
    acceptances: acceptanceIds.size,
    requirementStatus,
    interactionStateMatrix: {
      present: interactionStateMatrix.present,
      rows: interactionStateMatrix.rows.length,
    },
    verificationRecords: verificationRecords?.size || 0,
    evidenceFormat: evidenceMapping.enhanced ? 'enhanced' : 'legacy',
    // AI-code-start lines:7 tool:Codex
    selectedChangeScope: selectedChangeScope ? {
      name: selectedChangeScope.name,
      decisions: selectedChangeScope.decisionIds.size,
      acceptances: selectedChangeScope.acceptanceIds.size,
    } : null,
    evidenceFiles,
    testFileStrategy,
    taskReferences,
    errors,
    warnings,
  };
}

function parseArgs(argv) {
  const args = { requirementPath: null, changePath: null, stage: 'plan', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--change') {
      args.changePath = argv[index + 1];
      index += 1;
    // AI-code-start lines:3 tool:Codex
    } else if (value === '--stage') {
      args.stage = argv[index + 1];
      index += 1;
    } else if (value === '--json') {
      args.json = true;
    } else if (!args.requirementPath) {
      args.requirementPath = value;
    } else {
      throw new Error(`不支持的参数：${value}`);
    }
  }
  if (!args.requirementPath) throw new Error('必须提供需求文件路径');
  return args;
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = validateRequirementDecisions(args.requirementPath, { changePath: args.changePath, stage: args.stage });
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.ok) {
      console.log(`需求决策校验通过：${result.decisions} 项决策，${result.acceptances} 项验收。`);
    } else {
      console.error(result.errors.map((error) => `- ${error}`).join('\n'));
    }
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
