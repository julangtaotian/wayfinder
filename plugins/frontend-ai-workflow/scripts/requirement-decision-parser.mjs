// WebStorm 会将需求文档的中文字段和中文诊断逐字符误报；这些字段属于稳定输入契约，必须保留。
//noinspection NonAsciiCharacters
import path from 'node:path';

const DECISION_HEADERS = ['ID', '决策项', '状态', '取值', '来源'];
const EVIDENCE_HEADERS = ['验收ID', '验收点', '关联决策', '验证方式', '证据位置', '断言结果'];
const ENHANCED_EVIDENCE_HEADERS = [...EVIDENCE_HEADERS, '验证记录'];
const VERIFICATION_RECORD_HEADERS = ['验证ID', '验证类型', '执行内容或环境', '执行日期', '结果', '证据位置'];
const DECISION_STATUSES = new Set(['已确认', '项目默认', '暂定', '待确认']);
const EXECUTABLE_STATUSES = new Set(['已确认', '项目默认']);
const VERIFICATION_METHODS = new Set(['自动', '人工', '自动+人工']);
const REQUIREMENT_STATUSES = new Set(['草稿', '已确认', '实施中', '待验证', '已验收']);
const VERIFICATION_RESULTS = new Set(['计划', '未执行', '通过', '失败', '阻断']);
const INTERACTION_STATE_HEADERS = ['状态', '覆盖决定', '触发或前置条件', '期望结果', '验证方式', '关联验收', '不适用理由'];
const REQUIRED_INTERACTION_STATES = ['初始（已有数据）', '用户操作', '刷新', '空态', '错误态', '卸载'];
const INTERACTION_COVERAGE_DECISIONS = new Set(['覆盖', '不适用']);
const CHANGE_SCOPE_HEADERS = ['变更', '决策范围', '验收范围'];
const DELIVERY_STAGES = new Set(['precomplete', 'complete']);
const IMPLEMENTABLE_REQUIREMENT_STATUSES = new Set(['已确认', '实施中']);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPlaceholder(value) {
  return !value || /^(待填写|未填写|-|—)$/u.test(value);
}

export function getRequirementSection(content, title) {
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
  const rows = parseTable(getRequirementSection(content, '决策台账'), DECISION_HEADERS, '决策台账', errors);
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
    if (!DECISION_STATUSES.has(row.状态)) errors.push(`决策 ${id} 的状态无效：${row.状态 || '空值'}`);
    if (isPlaceholder(row.取值)) errors.push(`决策 ${id} 缺少取值`);
    if (isPlaceholder(row.来源)) errors.push(`决策 ${id} 缺少来源`);
    decisions.set(id, row);
  }
  return decisions;
}

function parseAcceptanceIds(content, errors) {
  const section = getRequirementSection(content, '验收标准');
  if (!section) {
    errors.push('缺少“验收标准”区块');
    return new Set();
  }
  const ids = new Set();
  // 兼容历史方括号格式，同时允许不触发 Markdown 未定义引用的普通 A-01 编号。
  for (const id of linkedRequirementIds(section, 'A')) {
    if (ids.has(id)) errors.push(`验收 ID 重复：${id}`);
    ids.add(id);
  }
  if (!ids.size) errors.push('“验收标准”缺少 A-01 格式的验收 ID');
  return ids;
}

export function linkedRequirementIds(value, prefix) {
  const pattern = new RegExp(`${prefix}-\\d{2,}`, 'gu');
  return [...String(value || '').matchAll(pattern)].map((match) => match[0]);
}

// 状态矩阵只校验已采用的新格式，历史需求缺失时保留兼容并给出可迁移提醒。
function parseInteractionStateMatrix(content, acceptanceIds, stage, errors, warnings) {
  const section = getRequirementSection(content, '交互状态矩阵');
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
    if (!VERIFICATION_METHODS.has(row.验证方式)) errors.push(`交互状态“${state}”的验证方式无效：${row.验证方式 || '空值'}`);
    const acceptanceReferences = linkedRequirementIds(row.关联验收, 'A');
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

function parseRequirementStatus(content, stage, errors, warnings) {
  const section = getRequirementSection(content, '基本信息');
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
  if (stage === 'plan' && status !== '已确认') errors.push(`规划阶段要求需求状态为“已确认”，当前为“${status}”`);
  if (stage === 'implement' && !IMPLEMENTABLE_REQUIREMENT_STATUSES.has(status)) {
    errors.push(`实施阶段要求需求状态为“已确认”或“实施中”，当前为“${status}”`);
  }
  if (stage === 'precomplete' && status !== '待验证') errors.push(`完成前校验要求需求状态为“待验证”，当前为“${status}”`);
  if (stage === 'complete' && status !== '已验收') errors.push(`完成阶段要求需求状态为“已验收”，当前为“${status}”`);
  return status;
}

function parseVerificationRecords(content, errors) {
  const section = getRequirementSection(content, '验证记录');
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

function hasVisualEvidence(record) {
  const environment = record.执行内容或环境 || '';
  const media = record.证据位置 || '';
  return /(\d{3,4}px|视口|设备)/u.test(environment)
    && /检查/u.test(environment)
    && /\.(?:png|jpe?g|webp|gif|mp4|webm)(?:$|\s|\))/iu.test(media);
}

function hasReviewableManualEvidence(record) {
  const environment = record.执行内容或环境 || '';
  const evidence = record.证据位置 || '';
  const visualIntent = /(视口|设备|浏览器|视觉|截图|录屏)/u.test(`${environment} ${evidence}`);
  if (visualIntent) return hasVisualEvidence(record);
  return /(复核|核对|检查)/u.test(environment) && !isPlaceholder(evidence);
}

function parseEvidenceMapping(content, decisions, acceptanceIds, verificationRecords, stage, errors) {
  const { rows, enhanced } = parseEvidenceTable(getRequirementSection(content, '验收—证据映射'), errors);
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
    const decisionIds = linkedRequirementIds(row.关联决策, 'D');
    if (!decisionIds.length) {
      errors.push(`验收映射 ${id} 缺少关联 D-* 决策`);
    } else {
      for (const decisionId of decisionIds) {
        const decision = decisions.get(decisionId);
        if (!decision) errors.push(`验收映射 ${id} 引用了未知决策：${decisionId}`);
        else if (!EXECUTABLE_STATUSES.has(decision.状态)) errors.push(`验收映射 ${id} 引用了不可验收决策 ${decisionId}：状态为“${decision.状态}”`);
      }
    }
    const recordIds = linkedRequirementIds(row.验证记录, 'V');
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
        const manualRecords = records.filter((record) => record.验证类型.includes('人工'));
        if (row.验证方式.includes('人工') && !manualRecords.some(hasReviewableManualEvidence)) {
          const hasVisualIntent = manualRecords.some((record) => (
            /(视口|设备|浏览器|视觉|截图|录屏)/u.test(`${record.执行内容或环境 || ''} ${record.证据位置 || ''}`)
          ));
          errors.push(hasVisualIntent
            ? `验收映射 ${id} 缺少视口或设备、检查项和截图或录屏证据`
            : `验收映射 ${id} 缺少复核或核对动作及可追溯人工证据`);
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
  const section = getRequirementSection(content, '关联变更范围');
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
    const decisionIds = new Set(linkedRequirementIds(row.决策范围, 'D'));
    const scopedAcceptanceIds = new Set(linkedRequirementIds(row.验收范围, 'A'));
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

export function parseRequirementDecisionDocument(content, { changePath = null, stage = 'plan', errors, warnings }) {
  const decisions = parseDecisionLedger(content, errors);
  const acceptanceIds = parseAcceptanceIds(content, errors);
  const interactionStateMatrix = parseInteractionStateMatrix(content, acceptanceIds, stage, errors, warnings);
  const requirementStatus = parseRequirementStatus(content, stage, errors, warnings);
  const verificationRecords = parseVerificationRecords(content, errors);
  const evidenceMapping = parseEvidenceMapping(content, decisions, acceptanceIds, verificationRecords, stage, errors);
  const selectedChangeScope = parseSelectedChangeScope(
    content,
    changePath,
    decisions,
    acceptanceIds,
    stage,
    errors,
    warnings,
  );
  return {
    decisions,
    acceptanceIds,
    interactionStateMatrix,
    requirementStatus,
    verificationRecords,
    evidenceMapping,
    selectedChangeScope,
  };
}
