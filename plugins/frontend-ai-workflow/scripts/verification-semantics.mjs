import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// 中文合同以具名常量集中管理；Unicode 字面量避免编辑器把中文字段误判为代码问题。
const semanticText = Object.freeze({
  sourceMissing: '\u7f3a\u5931\u6216\u4e3a\u7a7a',
  sourceEmpty: '\u5b58\u5728\u7a7a\u0020',
  duplicate: '\u0020\u91cd\u590d\uff1a',
  invalidEvidenceId: '\u8bc1\u636e\u0020\u0049\u0044\u0020\u65e0\u6548\uff1a',
  emptyValue: '\u7a7a\u503c',
  missingTestPlan: '\u4e25\u683c\u673a\u5668\u8bc1\u636e\u7f3a\u5c11\u0020\u0074\u0065\u0073\u0074\u002d\u0070\u006c\u0061\u006e\u002e\u006d\u0064',
  decisionLedger: '\u51b3\u7b56\u53f0\u8d26',
  verificationLog: '\u9a8c\u8bc1\u8bb0\u5f55',
  verificationId: '\u9a8c\u8bc1\u0049\u0044',
  acceptanceEvidenceMapping: '\u9a8c\u6536\u2014\u8bc1\u636e\u6620\u5c04',
  acceptanceId: '\u9a8c\u6536\u0049\u0044',
  revisionLog: '\u4fee\u8ba2\u8bb0\u5f55',
  revision: '\u4fee\u8ba2',
  verificationMissing: '\u9700\u6c42\u6ca1\u6709\u9a8c\u8bc1\u8bb0\u5f55\u0020',
  acceptanceCriteria: '\u9a8c\u6536\u6807\u51c6',
  acceptanceDuplicate: '\u9a8c\u6536\u0020\u0049\u0044\u0020\u91cd\u590d\uff1a',
  testCaseDuplicate: '\u6d4b\u8bd5\u65b9\u6848\u7528\u4f8b\u0020\u0049\u0044\u0020\u91cd\u590d\uff1a',
  verificationLink: '\u5173\u8054\u9a8c\u8bc1',
  testCaseMissing: '\u6d4b\u8bd5\u65b9\u6848\u6ca1\u6709\u5173\u8054\u0020',
  testCaseSuffix: '\u0020\u7684\u0020\u0054\u0043\u002d\u002a',
  acceptanceLink: '\u5173\u8054\u9a8c\u6536',
  acceptanceMissing: '\u0020\u6ca1\u6709\u5173\u8054\u0020\u0041\u002d\u002a',
  acceptanceNotFound: '\u9a8c\u6536\u6807\u51c6\u4e0d\u5b58\u5728\uff1a',
  acceptanceMappingNotFound: '\u9a8c\u6536\u6620\u5c04\u4e0d\u5b58\u5728\uff1a',
  verificationMethod: '\u9a8c\u8bc1\u65b9\u5f0f',
  assertionResult: '\u65ad\u8a00\u7ed3\u679c',
  decisionLink: '\u5173\u8054\u51b3\u7b56',
  decisionNotFound: '\u51b3\u7b56\u4e0d\u5b58\u5728\uff1a',
  confirmed: '\u5df2\u786e\u8ba4',
  projectDefault: '\u9879\u76ee\u9ed8\u8ba4',
  decisionNotExecutable: '\u51b3\u7b56\u4e0d\u53ef\u6267\u884c\uff1a',
  status: '\u72b6\u6001',
  decisionItem: '\u51b3\u7b56\u9879',
  value: '\u53d6\u503c',
  revisionMissing: '\u9700\u6c42\u7f3a\u5c11\u6709\u6548\u0020\u0052\u002d\u002a\u0020\u4fee\u8ba2',
  specificationLink: '\u5173\u8054\u89c4\u683c',
  stateMatrix: '\u72b6\u6001\u77e9\u9635',
  precondition: '\u524d\u7f6e\u6761\u4ef6',
  testData: '\u6d4b\u8bd5\u6570\u636e',
  testDouble: '\u6d4b\u8bd5\u66ff\u8eab',
  operation: '\u64cd\u4f5c',
  observableAssertion: '\u53ef\u89c2\u5bdf\u65ad\u8a00',
  targetTest: '\u76ee\u6807\u6d4b\u8bd5',
  testLocator: '\u6d4b\u8bd5\u5b9a\u4f4d',
  focusedCommand: '\u805a\u7126\u547d\u4ee4',
  verificationType: '\u9a8c\u8bc1\u7c7b\u578b',
  executionContext: '\u6267\u884c\u5185\u5bb9\u6216\u73af\u5883',
});

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
  for (const match of String(section || '').matchAll(/^[-*]\s*([^\uFF1A:\n]+)[\uFF1A:]\s*(.*?)\s*$/gmu)) {
    fields.set(match[1].trim(), match[2].trim().replace(/^`|`$/gu, ''));
  }
  return fields;
}

function parseCases(content) {
  const matches = [...content.matchAll(/^###\s+(TC-\d{2,})[\uFF1A:]\s*(.+?)\s*$/gmu)];
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
  if (!rows.length) throw new VerificationSemanticError('semantic_source_missing', `${label}${semanticText.sourceMissing}`, target);
  return rows;
}

function requireUniqueRows(rows, key, label, target) {
  const seen = new Set();
  for (const row of rows) {
    const id = row[key];
    if (!id) throw new VerificationSemanticError('semantic_source_ambiguous', `${label}${semanticText.sourceEmpty}${key}`, target);
    if (seen.has(id)) throw new VerificationSemanticError('semantic_source_ambiguous', `${label}${key}${semanticText.duplicate}${id}`, id);
    seen.add(id);
  }
  return rows;
}

export function buildVerificationSemanticSnapshot({ requirementPath, changePath, evidenceId } = {}) {
  if (!/^V-\d{2,}$/u.test(evidenceId || '')) {
    throw new VerificationSemanticError('invalid_evidence_id', `${semanticText.invalidEvidenceId}${evidenceId || semanticText.emptyValue}`, evidenceId || null);
  }
  // Node 标准库由真实运行时验证；未加载 Node 声明的 IDE 不应把这些确定性 API 视为未解析引用。
  //noinspection JSUnresolvedReference
  const requirementContent = readFileSync(requirementPath, 'utf8');
  const testPlanPath = path.join(changePath, 'test-plan.md');
  //noinspection JSUnresolvedReference
  if (!existsSync(testPlanPath)) {
    throw new VerificationSemanticError('semantic_test_plan_missing', semanticText.missingTestPlan, testPlanPath);
  }
  //noinspection JSUnresolvedReference
  const testPlanContent = readFileSync(testPlanPath, 'utf8');

  const decisionRows = requireUniqueRows(
    requireRows(parseTable(getSection(requirementContent, semanticText.decisionLedger), 'ID'), semanticText.decisionLedger, requirementPath),
    'ID', semanticText.decisionLedger, requirementPath,
  );
  const verificationRows = requireUniqueRows(
    requireRows(parseTable(getSection(requirementContent, semanticText.verificationLog), semanticText.verificationId), semanticText.verificationLog, requirementPath),
    semanticText.verificationId, semanticText.verificationLog, requirementPath,
  );
  const mappingRows = requireUniqueRows(
    requireRows(parseTable(getSection(requirementContent, semanticText.acceptanceEvidenceMapping), semanticText.acceptanceId), semanticText.acceptanceEvidenceMapping, requirementPath),
    semanticText.acceptanceId, semanticText.acceptanceEvidenceMapping, requirementPath,
  );
  const revisionRows = requireUniqueRows(
    requireRows(parseTable(getSection(requirementContent, semanticText.revisionLog), semanticText.revision), semanticText.revisionLog, requirementPath),
    semanticText.revision, semanticText.revisionLog, requirementPath,
  );
  const verification = verificationRows.find((row) => row[semanticText.verificationId] === evidenceId);
  if (!verification) {
    throw new VerificationSemanticError('semantic_verification_missing', `${semanticText.verificationMissing}${evidenceId}`, evidenceId);
  }

  const acceptances = new Map();
  // 支持普通编号和标准页内链接，避免编辑器把验收编号误判为未定义引用。
  for (const match of getSection(requirementContent, semanticText.acceptanceCriteria).matchAll(/^\s*-\s*\[[ xX]\]\s*(?:\[(A-\d{2,})\](?:\([^\r\n)]*\))?\s+|(A-\d{2,})[\uFF1A:]\s*)(.+?)\s*$/gmu)) {
    const id = match[1] || match[2];
    const text = match[3].trim();
    if (acceptances.has(id)) {
      throw new VerificationSemanticError('semantic_acceptance_ambiguous', `${semanticText.acceptanceDuplicate}${id}`, id);
    }
    acceptances.set(id, text);
  }

  const allCases = parseCases(testPlanContent);
  const caseIds = new Set();
  for (const testCase of allCases) {
    if (caseIds.has(testCase.id)) {
      throw new VerificationSemanticError('semantic_test_case_ambiguous', `${semanticText.testCaseDuplicate}${testCase.id}`, testCase.id);
    }
    caseIds.add(testCase.id);
  }
  const cases = allCases.filter((testCase) => ids(testCase.fields.get(semanticText.verificationLink), 'V').includes(evidenceId));
  if (!cases.length) {
    throw new VerificationSemanticError('semantic_test_case_missing', `${semanticText.testCaseMissing}${evidenceId}${semanticText.testCaseSuffix}`, evidenceId);
  }
  const selectedMappings = mappingRows.filter((row) => ids(row[semanticText.verificationLog], 'V').includes(evidenceId));
  const acceptanceIds = [...new Set([
    ...selectedMappings.flatMap((row) => ids(row[semanticText.acceptanceId], 'A')),
    ...cases.flatMap((testCase) => ids(testCase.fields.get(semanticText.acceptanceLink), 'A')),
  ])].sort();
  if (!acceptanceIds.length) {
    throw new VerificationSemanticError('semantic_acceptance_missing', `${evidenceId}${semanticText.acceptanceMissing}`, evidenceId);
  }
  const selectedAcceptances = acceptanceIds.map((id) => {
    const text = acceptances.get(id);
    if (!text) throw new VerificationSemanticError('semantic_acceptance_missing', `${semanticText.acceptanceNotFound}${id}`, id);
    const row = mappingRows.find((candidate) => candidate[semanticText.acceptanceId] === id);
    if (!row) throw new VerificationSemanticError('semantic_acceptance_mapping_missing', `${semanticText.acceptanceMappingNotFound}${id}`, id);
    return {
      id,
      text,
      method: row[semanticText.verificationMethod],
      observableAssertion: row[semanticText.assertionResult],
      verificationIds: ids(row[semanticText.verificationLog], 'V'),
    };
  });

  const decisionIds = [...new Set([
    ...selectedAcceptances.flatMap((acceptance) => {
      const row = mappingRows.find((candidate) => candidate[semanticText.acceptanceId] === acceptance.id);
      return ids(row?.[semanticText.decisionLink], 'D');
    }),
    ...cases.flatMap((testCase) => ids(testCase.fields.get(semanticText.decisionLink), 'D')),
  ])].sort();
  const selectedDecisions = decisionIds.map((id) => {
    const row = decisionRows.find((candidate) => candidate['ID'] === id);
    if (!row) throw new VerificationSemanticError('semantic_decision_missing', `${semanticText.decisionNotFound}${id}`, id);
    if (![semanticText.confirmed, semanticText.projectDefault].includes(row[semanticText.status])) {
      throw new VerificationSemanticError('semantic_decision_unconfirmed', `${semanticText.decisionNotExecutable}${id} / ${row[semanticText.status] || semanticText.emptyValue}`, id);
    }
    return { id, item: row[semanticText.decisionItem], status: row[semanticText.status], value: row[semanticText.value] };
  });

  const revisions = revisionRows.flatMap((row) => /^R-(\d{2,})$/u.test(row[semanticText.revision] || '')
    ? [{ id: row[semanticText.revision], number: Number(row[semanticText.revision].slice(2)) }]
    : []).sort((left, right) => left.number - right.number);
  const revision = revisions.at(-1)?.id;
  if (!revision) throw new VerificationSemanticError('semantic_revision_missing', semanticText.revisionMissing, requirementPath);

  const caseFields = [
    semanticText.decisionLink, semanticText.acceptanceLink, semanticText.specificationLink, semanticText.stateMatrix,
    semanticText.precondition, semanticText.testData, semanticText.testDouble, semanticText.operation,
    semanticText.observableAssertion, semanticText.targetTest, semanticText.testLocator, semanticText.focusedCommand,
    semanticText.verificationLink,
  ];
  return stableValue({
    semanticSchemaVersion: 1,
    revision,
    verification: {
      id: evidenceId,
      type: verification[semanticText.verificationType],
      execution: verification[semanticText.executionContext],
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
    //noinspection JSUnresolvedReference
    sha256: createHash('sha256').update(serialized).digest('hex'),
  };
}
