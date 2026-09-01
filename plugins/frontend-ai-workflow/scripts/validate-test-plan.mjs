import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertSafeProjectRoot } from './collect-project-scope.mjs';
import { inspectTestContext } from './inspect-test-context.mjs';
import { ProjectPathError, resolveSafeProjectPath } from './project-path-safety.mjs';
import { validateVerificationEvidenceRecords } from './verification-evidence.mjs';

const STAGES = new Set(['plan', 'implement', 'complete']);
const PLAN_STATUSES = new Set(['草稿', '就绪', '已实现', '已验证']);
const CASE_STATUSES = new Set(['计划', '已实现', '通过', '失败', '阻断', '人工通过']);
const PRIORITIES = new Set(['P0', 'P1', 'P2']);
const VERIFICATION_TYPES = new Set(['自动', '视觉', '人工']);
const TEST_LEVELS = new Set(['单元', '组件', '集成', '端到端', '视觉', '人工']);
const RESULT_CATEGORIES = new Set([
  '未执行', '通过', '产品实现缺陷', '测试设计错误', '测试代码错误',
  '需求歧义', '环境阻塞', '历史无关失败',
]);
const IMPLEMENTABLE_REQUIREMENT_STATUSES = new Set(['已确认', '实施中']);
const INTERACTION_STATES = new Set(['初始（已有数据）', '用户操作', '刷新', '空态', '错误态', '卸载']);
const PLACEHOLDER_PATTERN = /^(?:待填写|待确认|待执行|未填写|未确认|-|—)$/u;
const GENERATED_TEST_PATTERN = /\.generated\.(?:spec|test)\.[cm]?[jt]sx?$/iu;
const SAFE_TEST_FILE_PATTERN = /(?:^|\/)(?:[^/]+\.)?(?:spec|test)\.[cm]?[jt]sx?$/iu;
const REQUIRED_CASE_FIELDS = [
  '状态', '优先级', '验证类型', '测试层级', '关联决策', '关联验收', '关联规格',
  '状态矩阵', '前置条件', '测试数据', '测试替身', '操作', '可观察断言', '目标测试',
  '测试定位', '聚焦命令', '关联验证', '结果分类', '证据',
];
const REQUIRED_CONTEXT_FIELDS = [
  '测试命令状态', '测试命令', '测试运行器', '测试目录', 'Git 基线', '兼容说明',
];

function normalizedPath(value) {
  return String(value || '').split(path.sep).join('/');
}

function stripCode(value) {
  const trimmed = String(value || '').trim();
  return trimmed.startsWith('`') && trimmed.endsWith('`') ? trimmed.slice(1, -1).trim() : trimmed;
}

function resolveExistingFile(target, label) {
  if (!target) throw new Error(`必须提供 ${label}`);
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`${label}不存在：${resolved}`);
  return fs.realpathSync(resolved);
}

function resolveExistingDirectory(target, label) {
  if (!target) throw new Error(`必须提供 ${label}`);
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) throw new Error(`${label}不存在：${resolved}`);
  return fs.realpathSync(resolved);
}

function findProjectRoot(start) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, 'package.json'))) return fs.realpathSync(current);
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`无法从变更目录定位含 package.json 的项目根：${start}`);
    current = parent;
  }
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function getSection(content, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`^##\\s+${escaped}\\s*$`, 'mu').exec(content);
  if (!heading) return null;
  const after = content.slice(heading.index + heading[0].length);
  const nextHeading = after.search(/^##\s+/mu);
  return nextHeading < 0 ? after : after.slice(0, nextHeading);
}

function parseBulletFields(section) {
  const fields = new Map();
  for (const match of String(section || '').matchAll(/^[-*]\s*([^：:\n]+)[：:]\s*(.*?)\s*$/gmu)) {
    fields.set(match[1].trim(), match[2].trim());
  }
  return fields;
}

function parseCaseBlocks(content, errors) {
  const matches = [...content.matchAll(/^###\s+(TC-\d{2,})[：:]\s*(.+?)\s*$/gmu)];
  const cases = [];
  const ids = new Set();
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const end = matches[index + 1]?.index ?? content.length;
    const id = match[1];
    if (ids.has(id)) errors.push(`测试用例 ID 重复：${id}`);
    ids.add(id);
    cases.push({ id, title: match[2].trim(), fields: parseBulletFields(content.slice(match.index + match[0].length, end)) });
  }
  if (!cases.length) errors.push('测试方案至少需要一条 TC-01 格式的测试用例');
  return cases;
}

function parseRequirement(content) {
  const decisionSection = getSection(content, '决策台账') || '';
  const decisions = new Map();
  for (const line of decisionSection.split(/\r?\n/u)) {
    const cells = line.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|').map((cell) => cell.trim());
    if (/^D-\d{2,}$/u.test(cells[0] || '')) decisions.set(cells[0], cells[2]);
  }
  const acceptanceSection = getSection(content, '验收标准') || '';
  const acceptanceIds = new Set([...acceptanceSection.matchAll(/\b(A-\d{2,})\b/gu)].map((match) => match[1]));
  const revisions = [...content.matchAll(/\|\s*(R-(\d{2,}))\s*\|/gu)]
    .map((match) => ({ id: match[1], number: Number(match[2]) }))
    .sort((left, right) => left.number - right.number);
  const verificationSection = getSection(content, '验证记录') || '';
  const verifications = new Map();
  for (const line of verificationSection.split(/\r?\n/u)) {
    const cells = line.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|').map((cell) => cell.trim());
    if (/^V-\d{2,}$/u.test(cells[0] || '')) {
      verifications.set(cells[0], { id: cells[0], type: cells[1], result: cells[4], evidence: cells[5] });
    }
  }
  const status = parseBulletFields(getSection(content, '基本信息')).get('状态') || null;
  return { decisions, acceptanceIds, revisions, verifications, status };
}

export function changeScopeCandidates(changePath) {
  const exact = path.basename(changePath);
  if (path.basename(path.dirname(changePath)) !== 'archive') return [exact];
  const logical = exact.replace(/^\d{4}-\d{2}-\d{2}-/u, '');
  return logical === exact ? [exact] : [exact, logical];
}

function scopedReferences(content, changePath) {
  const section = getSection(content, '关联变更范围') || '';
  const candidates = new Set(changeScopeCandidates(changePath));
  for (const line of section.split(/\r?\n/u)) {
    const cells = line.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|').map((cell) => cell.trim());
    if (!candidates.has(stripCode(cells[0]))) continue;
    return {
      decisions: new Set(String(cells[1] || '').match(/D-\d{2,}/gu) || []),
      acceptances: new Set(String(cells[2] || '').match(/A-\d{2,}/gu) || []),
    };
  }
  return { decisions: new Set(), acceptances: new Set() };
}

function splitReferences(value, pattern) {
  return [...new Set(String(value || '').match(pattern) || [])];
}

function validateProjectRelativePath(root, value, label, errors, { mustExist = false } = {}) {
  const candidate = stripCode(value);
  if (!candidate || candidate === '不适用') return null;
  try {
    return resolveSafeProjectPath(root, candidate, label, {
      mustExist,
      allowDirectory: false,
    }).absolutePath;
  } catch (error) {
    if (error instanceof ProjectPathError) {
      errors.push(`${error.code}：${label}必须是安全的项目相对路径：${candidate}（${error.message}）`);
      return null;
    }
    throw error;
  }
}

function validateRequiredFields(testCase, stage, errors) {
  for (const field of REQUIRED_CASE_FIELDS) {
    const value = testCase.fields.get(field);
    if (!value) errors.push(`${testCase.id} 缺少字段：${field}`);
    if (PLACEHOLDER_PATTERN.test(stripCode(value))) {
      const allowed = stage !== 'complete' && field === '证据' && stripCode(value) === '待执行';
      if (!allowed) errors.push(`${testCase.id} 的${field}仍为占位值：${value}`);
    }
  }
}

function validateCase({ testCase, stage, root, requirement, scope, evidenceValidation, errors }) {
  validateRequiredFields(testCase, stage, errors);
  const value = (field) => stripCode(testCase.fields.get(field));
  if (!CASE_STATUSES.has(value('状态'))) errors.push(`${testCase.id} 的状态无效：${value('状态') || '空值'}`);
  if (!PRIORITIES.has(value('优先级'))) errors.push(`${testCase.id} 的优先级无效：${value('优先级') || '空值'}`);
  if (!VERIFICATION_TYPES.has(value('验证类型'))) errors.push(`${testCase.id} 的验证类型无效：${value('验证类型') || '空值'}`);
  if (!TEST_LEVELS.has(value('测试层级'))) errors.push(`${testCase.id} 的测试层级无效：${value('测试层级') || '空值'}`);
  if (!RESULT_CATEGORIES.has(value('结果分类'))) errors.push(`${testCase.id} 的结果分类无效：${value('结果分类') || '空值'}`);
  const states = String(value('状态矩阵') || '').split(/[、,，]/u).map((item) => item.trim()).filter(Boolean);
  if (!states.length || states.some((state) => !INTERACTION_STATES.has(state))) {
    errors.push(`${testCase.id} 的状态矩阵无效：${value('状态矩阵') || '空值'}`);
  }

  const decisions = splitReferences(value('关联决策'), /D-\d{2,}/gu);
  const acceptances = splitReferences(value('关联验收'), /A-\d{2,}/gu);
  const verifications = splitReferences(value('关联验证'), /V-\d{2,}/gu);
  if (!decisions.length) errors.push(`${testCase.id} 缺少 D-* 决策引用`);
  if (!acceptances.length) errors.push(`${testCase.id} 缺少 A-* 验收引用`);
  if (!verifications.length) errors.push(`${testCase.id} 缺少 V-* 验证引用`);
  for (const id of decisions) {
    if (!requirement.decisions.has(id)) errors.push(`${testCase.id} 引用了未知决策：${id}`);
    else if (!['已确认', '项目默认'].includes(requirement.decisions.get(id))) errors.push(`${testCase.id} 引用了不可执行决策：${id}`);
    if (!scope.decisions.has(id)) errors.push(`${testCase.id} 的决策不在所选变更范围：${id}`);
  }
  for (const id of acceptances) {
    if (!requirement.acceptanceIds.has(id)) errors.push(`${testCase.id} 引用了未知验收：${id}`);
    if (!scope.acceptances.has(id)) errors.push(`${testCase.id} 的验收不在所选变更范围：${id}`);
  }
  for (const id of verifications) {
    if (!requirement.verifications.has(id)) errors.push(`${testCase.id} 引用了未知验证记录：${id}`);
  }

  const type = value('验证类型');
  const target = value('目标测试');
  if (type === '自动') {
    const targetPath = validateProjectRelativePath(root, target, `${testCase.id} 的目标测试`, errors, { mustExist: stage === 'complete' });
    if (!SAFE_TEST_FILE_PATTERN.test(target)) errors.push(`${testCase.id} 的目标测试必须使用 .spec.* 或 .test.*：${target || '空值'}`);
    if (GENERATED_TEST_PATTERN.test(target)) errors.push(`${testCase.id} 默认不得修改生成测试：${target}`);
    if (value('测试定位') === '不适用') errors.push(`${testCase.id} 的自动用例必须提供测试定位`);
    if (value('聚焦命令') === '不适用') errors.push(`${testCase.id} 的自动用例必须提供聚焦命令`);
    if (stage === 'complete' && targetPath && fs.existsSync(targetPath) && fs.statSync(targetPath).size <= 1024 * 1024) {
      const locator = value('测试定位');
      if (!fs.readFileSync(targetPath, 'utf8').includes(locator)) {
        errors.push(`${testCase.id} 的目标测试不包含记录的测试定位：${locator}`);
      }
    }
  } else {
    for (const field of ['目标测试', '测试定位', '聚焦命令']) {
      if (value(field) !== '不适用') errors.push(`${testCase.id} 的${type || '非自动'}用例应将${field}写为“不适用”`);
    }
  }

  if (stage === 'complete') {
    const expectedStatus = type === '自动' ? '通过' : '人工通过';
    if (value('状态') !== expectedStatus) errors.push(`${testCase.id} 完成阶段状态必须为“${expectedStatus}”`);
    if (value('结果分类') !== '通过') errors.push(`${testCase.id} 完成阶段结果分类必须为“通过”`);
    for (const id of verifications) {
      if (requirement.verifications.get(id)?.result !== '通过') errors.push(`${testCase.id} 的验证记录尚未通过：${id}`);
    }
    if (type === '自动' && evidenceValidation.required) {
      const matchingLocator = evidenceValidation.diagnostics.some((diagnostic) => (
        diagnostic.status === 'passed'
        && diagnostic.kind === 'local-command'
        && verifications.includes(diagnostic.evidenceId)
        && diagnostic.locator === value('测试定位')
        && diagnostic.locatorMatches > 0
      ));
      if (!matchingLocator) {
        errors.push(`${testCase.id} 缺少与测试定位完全一致的本地机器证据：${value('测试定位')}`);
      }
    }
    validateProjectRelativePath(root, value('证据'), `${testCase.id} 的证据`, errors, { mustExist: true });
  }
}

// 校验器只读检查严格 Markdown 合同；任何失败都由调用方显式处理，不会改写方案或需求。
export function validateTestPlan(plan, {
  requirement,
  change,
  stage = 'plan',
} = {}) {
  if (!STAGES.has(stage)) throw new Error(`测试方案校验阶段无效：${stage}`);
  const planPath = resolveExistingFile(plan, '测试方案');
  const requirementPath = resolveExistingFile(requirement, '需求文件');
  const changePath = resolveExistingDirectory(change, '变更目录');
  const root = findProjectRoot(changePath);
  assertSafeProjectRoot(root);
  if (!isInside(root, planPath) || !isInside(root, requirementPath) || !isInside(root, changePath)) {
    throw new Error('测试方案、需求和变更必须位于同一项目范围内');
  }
  const expectedPlanPath = path.join(changePath, 'test-plan.md');
  if (planPath !== expectedPlanPath) throw new Error(`测试方案必须位于所选变更根目录：${expectedPlanPath}`);

  const content = fs.readFileSync(planPath, 'utf8');
  const requirementContent = fs.readFileSync(requirementPath, 'utf8');
  const errors = [];
  const warnings = [];
  const basic = parseBulletFields(getSection(content, '基本信息'));
  const contextFields = parseBulletFields(getSection(content, '测试上下文'));
  const planStatus = stripCode(basic.get('状态'));
  const changeName = path.basename(changePath);
  const requirementRelative = normalizedPath(path.relative(root, requirementPath));
  if (!PLAN_STATUSES.has(planStatus)) errors.push(`测试方案状态无效：${planStatus || '空值'}`);
  if (stripCode(basic.get('需求')) !== requirementRelative) errors.push(`测试方案需求路径必须为：${requirementRelative}`);
  if (stripCode(basic.get('变更')) !== changeName) errors.push(`测试方案变更必须为完整名称：${changeName}`);
  if (!basic.get('默认聚焦命令')) errors.push('测试方案缺少默认聚焦命令');
  for (const field of REQUIRED_CONTEXT_FIELDS) {
    const fieldValue = stripCode(contextFields.get(field));
    if (!fieldValue || PLACEHOLDER_PATTERN.test(fieldValue)) errors.push(`测试上下文缺少有效字段：${field}`);
  }
  if (!['detected', 'missing', 'placeholder'].includes(stripCode(contextFields.get('测试命令状态')))) {
    errors.push(`测试命令状态无效：${stripCode(contextFields.get('测试命令状态')) || '空值'}`);
  }

  const requirementData = parseRequirement(requirementContent);
  const evidenceValidation = validateVerificationEvidenceRecords({
    root,
    changePath,
    requirementPath,
    records: [...requirementData.verifications.values()],
  });
  for (const diagnostic of evidenceValidation.diagnostics) {
    if (diagnostic.status === 'failed') {
      errors.push(`${diagnostic.code}：${diagnostic.message || diagnostic.target || '机器证据校验失败'}`);
    } else if (diagnostic.status === 'warning') {
      warnings.push(`${diagnostic.code}：${diagnostic.message || diagnostic.target || '证据信任边界提醒'}`);
    }
  }
  const latestRevision = requirementData.revisions.at(-1)?.id || null;
  const revisionBaseline = stripCode(basic.get('需求修订基线'));
  const stale = Boolean(latestRevision && revisionBaseline !== latestRevision);
  if (!/^R-\d{2,}$/u.test(revisionBaseline || '')) errors.push(`需求修订基线无效：${revisionBaseline || '空值'}`);
  if (stale) errors.push(`测试方案已过期：需求最新修订为 ${latestRevision}，方案基线为 ${revisionBaseline || '空值'}`);
  const scope = scopedReferences(requirementContent, changePath);
  if (!scope.decisions.size || !scope.acceptances.size) errors.push(`需求没有所选变更的可执行范围：${changeName}`);

  const testCases = parseCaseBlocks(content, errors);
  for (const testCase of testCases) {
    validateCase({ testCase, stage, root, requirement: requirementData, scope, evidenceValidation, errors });
  }

  let context = null;
  if (stage !== 'plan') {
    if (!IMPLEMENTABLE_REQUIREMENT_STATUSES.has(requirementData.status) && stage === 'implement') {
      errors.push(`实施阶段要求需求状态为“已确认”或“实施中”，当前为“${requirementData.status || '空值'}”`);
    }
    if (!['就绪', '已实现', '已验证'].includes(planStatus)) errors.push(`实施阶段要求测试方案至少为“就绪”，当前为“${planStatus || '空值'}”`);
    context = inspectTestContext(root);
    if (stripCode(contextFields.get('测试命令状态')) !== context.testCommand.status) {
      errors.push(`测试方案命令状态与当前项目不一致：方案为 ${stripCode(contextFields.get('测试命令状态'))}，当前为 ${context.testCommand.status}`);
    }
    if (testCases.some((testCase) => stripCode(testCase.fields.get('验证类型')) === '自动')
      && context.testCommand.status !== 'detected') {
      errors.push('自动测试实现要求项目存在 detected 测试命令');
    }
  }
  if (stage === 'complete' && planStatus !== '已验证') errors.push('完成阶段要求测试方案状态为“已验证”');

  const automaticCases = testCases.filter((item) => stripCode(item.fields.get('验证类型')) === '自动').length;
  const visualCases = testCases.filter((item) => stripCode(item.fields.get('验证类型')) === '视觉').length;
  return {
    ok: errors.length === 0,
    stage,
    root,
    planPath,
    requirementPath,
    changePath,
    planStatus,
    revisionBaseline,
    latestRevision,
    stale,
    caseCount: testCases.length,
    automaticCases,
    visualCases,
    manualCases: testCases.length - automaticCases - visualCases,
    testContext: context,
    evidenceValidation,
    errors,
    warnings,
  };
}

function parseArgs(argv) {
  const args = { plan: null, requirement: null, change: null, stage: 'plan' };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!['--plan', '--requirement', '--change', '--stage'].includes(option)) throw new Error(`不支持的参数：${option}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`参数 ${option} 缺少值`);
    args[option.slice(2)] = value;
    index += 1;
  }
  return args;
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = validateTestPlan(args.plan, args);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
