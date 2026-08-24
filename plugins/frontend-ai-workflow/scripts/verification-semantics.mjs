import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export class VerificationSemanticError extends Error {
  constructor(code, message, target = null) {
    super(message);
    this.name = 'VerificationSemanticError';
    this.code = code;
    this.target = target;
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function getSection(content, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`^##\\s+${escaped}\\s*$`, 'mu').exec(content);
  if (!heading) return '';
  const after = content.slice(heading.index + heading[0].length);
  const nextHeading = after.search(/^##\s+/mu);
  return nextHeading < 0 ? after : after.slice(0, nextHeading);
}

function parseTable(section, requiredHeader) {
  const rows = String(section || '').split(/\r?\n/u)
    .filter((line) => /^\s*\|/u.test(line))
    .map((line) => line.trim().replace(/^\||\|$/gu, '').split('|').map((cell) => cell.trim()));
  const headerIndex = rows.findIndex((cells) => cells.includes(requiredHeader));
  if (headerIndex < 0) return [];
  const header = rows[headerIndex];
  return rows.slice(headerIndex + 2).map((cells) => Object.fromEntries(
    header.map((name, index) => [name, cells[index] || '']),
  ));
}

function ids(value, prefix) {
  return [...new Set(String(value || '').match(new RegExp(`${prefix}-\\d{2,}`, 'gu')) || [])].sort();
}

function parseBulletFields(section) {
  const fields = new Map();
  for (const match of String(section || '').matchAll(/^[-*]\s*([^：:\n]+)[：:]\s*(.*?)\s*$/gmu)) {
    fields.set(match[1].trim(), match[2].trim().replace(/^`|`$/gu, ''));
  }
  return fields;
}

function parseCases(content) {
  const matches = [...content.matchAll(/^###\s+(TC-\d{2,})[：:]\s*(.+?)\s*$/gmu)];
  return matches.map((match, index) => {
    const end = matches[index + 1]?.index ?? content.length;
    return {
      id: match[1],
      title: match[2].trim(),
      fields: parseBulletFields(content.slice(match.index + match[0].length, end)),
    };
  });
}

function requireRows(rows, label, target) {
  if (!rows.length) throw new VerificationSemanticError('semantic_source_missing', `${label}缺失或为空`, target);
  return rows;
}

function requireUniqueRows(rows, key, label, target) {
  const seen = new Set();
  for (const row of rows) {
    const id = row[key];
    if (!id) throw new VerificationSemanticError('semantic_source_ambiguous', `${label}存在空 ${key}`, target);
    if (seen.has(id)) throw new VerificationSemanticError('semantic_source_ambiguous', `${label}${key} 重复：${id}`, id);
    seen.add(id);
  }
  return rows;
}

export function buildVerificationSemanticSnapshot({ requirementPath, changePath, evidenceId } = {}) {
  if (!/^V-\d{2,}$/u.test(evidenceId || '')) {
    throw new VerificationSemanticError('invalid_evidence_id', `证据 ID 无效：${evidenceId || '空值'}`, evidenceId || null);
  }
  const requirementContent = fs.readFileSync(requirementPath, 'utf8');
  const testPlanPath = path.join(changePath, 'test-plan.md');
  if (!fs.existsSync(testPlanPath)) {
    throw new VerificationSemanticError('semantic_test_plan_missing', '严格机器证据缺少 test-plan.md', testPlanPath);
  }
  const testPlanContent = fs.readFileSync(testPlanPath, 'utf8');

  const decisionRows = requireUniqueRows(
    requireRows(parseTable(getSection(requirementContent, '决策台账'), 'ID'), '决策台账', requirementPath),
    'ID', '决策台账', requirementPath,
  );
  const verificationRows = requireUniqueRows(
    requireRows(parseTable(getSection(requirementContent, '验证记录'), '验证ID'), '验证记录', requirementPath),
    '验证ID', '验证记录', requirementPath,
  );
  const mappingRows = requireUniqueRows(
    requireRows(parseTable(getSection(requirementContent, '验收—证据映射'), '验收ID'), '验收—证据映射', requirementPath),
    '验收ID', '验收—证据映射', requirementPath,
  );
  const revisionRows = requireUniqueRows(
    requireRows(parseTable(getSection(requirementContent, '修订记录'), '修订'), '修订记录', requirementPath),
    '修订', '修订记录', requirementPath,
  );
  const verification = verificationRows.find((row) => row.验证ID === evidenceId);
  if (!verification) {
    throw new VerificationSemanticError('semantic_verification_missing', `需求没有验证记录 ${evidenceId}`, evidenceId);
  }

  const acceptances = new Map();
  for (const match of getSection(requirementContent, '验收标准').matchAll(/^\s*-\s*\[[ xX]\]\s*\[(A-\d{2,})\]\s*(.+?)\s*$/gmu)) {
    if (acceptances.has(match[1])) {
      throw new VerificationSemanticError('semantic_acceptance_ambiguous', `验收 ID 重复：${match[1]}`, match[1]);
    }
    acceptances.set(match[1], match[2].trim());
  }

  const allCases = parseCases(testPlanContent);
  const caseIds = new Set();
  for (const testCase of allCases) {
    if (caseIds.has(testCase.id)) {
      throw new VerificationSemanticError('semantic_test_case_ambiguous', `测试方案用例 ID 重复：${testCase.id}`, testCase.id);
    }
    caseIds.add(testCase.id);
  }
  const cases = allCases.filter((testCase) => ids(testCase.fields.get('关联验证'), 'V').includes(evidenceId));
  if (!cases.length) {
    throw new VerificationSemanticError('semantic_test_case_missing', `测试方案没有关联 ${evidenceId} 的 TC-*`, evidenceId);
  }
  const selectedMappings = mappingRows.filter((row) => ids(row.验证记录, 'V').includes(evidenceId));
  const acceptanceIds = [...new Set([
    ...selectedMappings.flatMap((row) => ids(row.验收ID, 'A')),
    ...cases.flatMap((testCase) => ids(testCase.fields.get('关联验收'), 'A')),
  ])].sort();
  if (!acceptanceIds.length) {
    throw new VerificationSemanticError('semantic_acceptance_missing', `${evidenceId} 没有关联 A-*`, evidenceId);
  }
  const selectedAcceptances = acceptanceIds.map((id) => {
    const text = acceptances.get(id);
    if (!text) throw new VerificationSemanticError('semantic_acceptance_missing', `验收标准不存在：${id}`, id);
    const row = mappingRows.find((candidate) => candidate.验收ID === id);
    if (!row) throw new VerificationSemanticError('semantic_acceptance_mapping_missing', `验收映射不存在：${id}`, id);
    return {
      id,
      text,
      method: row.验证方式,
      observableAssertion: row.断言结果,
      verificationIds: ids(row.验证记录, 'V'),
    };
  });

  const decisionIds = [...new Set([
    ...selectedAcceptances.flatMap((acceptance) => {
      const row = mappingRows.find((candidate) => candidate.验收ID === acceptance.id);
      return ids(row?.关联决策, 'D');
    }),
    ...cases.flatMap((testCase) => ids(testCase.fields.get('关联决策'), 'D')),
  ])].sort();
  const selectedDecisions = decisionIds.map((id) => {
    const row = decisionRows.find((candidate) => candidate.ID === id);
    if (!row) throw new VerificationSemanticError('semantic_decision_missing', `决策不存在：${id}`, id);
    if (!['已确认', '项目默认'].includes(row.状态)) {
      throw new VerificationSemanticError('semantic_decision_unconfirmed', `决策不可执行：${id} / ${row.状态 || '空值'}`, id);
    }
    return { id, item: row.决策项, status: row.状态, value: row.取值 };
  });

  const revisions = revisionRows.flatMap((row) => /^R-(\d{2,})$/u.test(row.修订 || '')
    ? [{ id: row.修订, number: Number(row.修订.slice(2)) }]
    : []).sort((left, right) => left.number - right.number);
  const revision = revisions.at(-1)?.id;
  if (!revision) throw new VerificationSemanticError('semantic_revision_missing', '需求缺少有效 R-* 修订', requirementPath);

  const caseFields = [
    '关联决策', '关联验收', '关联规格', '状态矩阵', '前置条件', '测试数据', '测试替身',
    '操作', '可观察断言', '目标测试', '测试定位', '聚焦命令', '关联验证',
  ];
  return stableValue({
    semanticSchemaVersion: 1,
    revision,
    verification: {
      id: evidenceId,
      type: verification.验证类型,
      execution: verification.执行内容或环境,
    },
    decisions: selectedDecisions,
    acceptances: selectedAcceptances,
    testCases: cases.sort((left, right) => left.id.localeCompare(right.id)).map((testCase) => ({
      id: testCase.id,
      title: testCase.title,
      ...Object.fromEntries(caseFields.map((field) => [field, testCase.fields.get(field) || ''])),
    })),
  });
}

export function computeVerificationSemanticBinding(options = {}) {
  const snapshot = buildVerificationSemanticSnapshot(options);
  const serialized = JSON.stringify(snapshot);
  return {
    version: snapshot.semanticSchemaVersion,
    algorithm: 'sha256',
    revision: snapshot.revision,
    decisionIds: snapshot.decisions.map((item) => item.id),
    acceptanceIds: snapshot.acceptances.map((item) => item.id),
    verificationId: snapshot.verification.id,
    testCaseIds: snapshot.testCases.map((item) => item.id),
    sha256: crypto.createHash('sha256').update(serialized).digest('hex'),
  };
}
