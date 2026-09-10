import {
  BENCHMARK_SCHEMA_VERSION, CASE_ID_PATTERN, COMPLEXITY_CODES, COMPLEXITY_MATRIX,
  EXPECTED_PROJECT_IDS, FORBIDDEN_CASE_PATHS, MANAGEMENT_PATHS, TASK_TYPES,
  assertContent, assertPlainObject, assertSafeRelativePath, assertString, fail,
  normalizeMachinePath, sha256, sha256Json,
} from './developer-effectiveness-benchmark-contract.mjs';

function patchPaths(patchContent) {
  const found = new Set();
  for (const line of String(patchContent || '').split('\n')) {
    const match = line.match(/^(?:---|\+\+\+) (?:[ab]\/)?(.+)$/u);
    if (!match || match[1] === '/dev/null') continue;
    const candidate = match[1].split('\t')[0];
    found.add(assertSafeRelativePath(candidate, '补丁目标'));
  }
  return [...found].sort();
}

function allowedByPrefixes(candidate, allowedPaths) {
  return allowedPaths.some((allowed) => candidate === allowed || candidate.startsWith(`${allowed}/`));
}

function validatePatchTargets(content, label, allowedPaths, { evaluator = false } = {}) {
  const paths = patchPaths(content);
  if (paths.length === 0) fail('patch_has_no_paths', `${label}没有可识别的项目相对路径`, label);
  for (const candidate of paths) {
    if (FORBIDDEN_CASE_PATHS.some((prefix) => candidate === prefix.replace(/\/$/u, '') || candidate.startsWith(prefix))) {
      fail('case_patch_forbidden_path', `${label}修改了禁止路径：${candidate}`, candidate);
    }
    if (evaluator && candidate.startsWith('.benchmark-evaluator/')) continue;
    if (!allowedByPrefixes(candidate, allowedPaths)) {
      fail('case_patch_outside_allowed_paths', `${label}越出允许路径：${candidate}`, candidate);
    }
  }
  return paths;
}

function validateAcceptance(acceptance, caseId) {
  assertPlainObject(acceptance, 'invalid_acceptance', `用例 ${caseId} 缺少验收命令`, caseId);
  if (acceptance.command !== 'node') fail('unsupported_acceptance_command', `用例 ${caseId} 只允许 node 验收入口`, caseId);
  if (!Array.isArray(acceptance.args) || acceptance.args.length === 0 || acceptance.args.some((item) => typeof item !== 'string' || !item)) {
    fail('invalid_acceptance_args', `用例 ${caseId} 的验收参数非法`, caseId);
  }
  const allowedFlags = new Set(['--test', '--test-reporter=spec']);
  let evaluatorTargets = 0;
  for (const argument of acceptance.args) {
    if (argument.startsWith('-')) {
      if (!allowedFlags.has(argument) && !argument.startsWith('--test-name-pattern=')) {
        fail('unsafe_acceptance_argument', `用例 ${caseId} 的验收参数不在允许范围：${argument}`, caseId);
      }
      continue;
    }
    const target = assertSafeRelativePath(argument, '验收参数路径');
    if (!target.startsWith('.benchmark-evaluator/')) {
      fail('unsafe_acceptance_target', `用例 ${caseId} 的验收目标必须位于隔离评估目录`, caseId);
    }
    evaluatorTargets += 1;
  }
  if (!acceptance.args.includes('--test') || evaluatorTargets === 0) {
    fail('invalid_acceptance_contract', `用例 ${caseId} 的验收必须使用 node --test 和隔离评估文件`, caseId);
  }
  const timeoutMs = Number(acceptance.timeoutMs);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 10 * 60_000) {
    fail('invalid_acceptance_timeout', `用例 ${caseId} 的验收超时非法`, caseId);
  }
  return { command: 'node', args: acceptance.args, timeoutMs };
}

function expectedCaseId(projectId, complexity, index = 1) {
  return `SYN-${projectId}-${COMPLEXITY_CODES[complexity]}${String(index).padStart(2, '0')}`;
}

export function validateSyntheticCase(candidate) {
  assertPlainObject(candidate, 'invalid_case', '模拟用例必须是对象');
  const id = assertString(candidate.id, 'invalid_case_id', '模拟用例缺少 ID', candidate.id || null);
  const match = id.match(CASE_ID_PATTERN);
  if (!match) fail('invalid_case_id', `模拟用例 ID 非法：${id}`, id);
  const projectId = assertString(candidate.projectId, 'invalid_case_project', `用例 ${id} 缺少项目 ID`, id);
  if (match[1] !== projectId || !EXPECTED_PROJECT_IDS.includes(projectId)) {
    fail('case_project_mismatch', `用例 ${id} 的项目 ID 不匹配`, id);
  }
  const complexity = assertString(candidate.complexity, 'invalid_case_complexity', `用例 ${id} 缺少复杂度`, id);
  if (COMPLEXITY_CODES[complexity] !== match[2] || !COMPLEXITY_MATRIX[projectId]?.includes(complexity)) {
    fail('case_complexity_mismatch', `用例 ${id} 的复杂度不符合第一轮矩阵`, id);
  }
  const expectedId = expectedCaseId(projectId, complexity);
  if (id !== expectedId) fail('unexpected_case_id', `用例 ID 应为 ${expectedId}`, id);
  const title = assertString(candidate.title, 'invalid_case_title', `用例 ${id} 缺少标题`, id);
  const taskType = assertString(candidate.taskType, 'invalid_case_type', `用例 ${id} 缺少任务类型`, id);
  if (!TASK_TYPES.has(taskType)) fail('invalid_case_type', `用例 ${id} 的任务类型非法`, id);
  const publicRequirement = assertString(candidate.publicRequirement, 'invalid_public_requirement', `用例 ${id} 缺少公开需求`, id);
  if (publicRequirement.length < 80) fail('public_requirement_too_short', `用例 ${id} 的公开需求过短`, id);
  if (/evaluator|reference\.patch|隐藏验收|参考实现/iu.test(publicRequirement)) {
    fail('public_requirement_leaks_evaluator', `用例 ${id} 的公开需求泄露了隐藏材料`, id);
  }
  if (candidate.requiresExternalSystem !== false || candidate.usesNetwork !== false) {
    fail('case_requires_external_system', `用例 ${id} 依赖外部系统或网络`, id);
  }
  if (!Array.isArray(candidate.allowedPaths) || candidate.allowedPaths.length === 0) {
    fail('case_allowed_paths_missing', `用例 ${id} 缺少允许路径`, id);
  }
  const allowedPaths = [...new Set(candidate.allowedPaths.map((item) => assertSafeRelativePath(item, '用例允许路径')))];
  // 补丁末尾换行属于 unified diff 语法，校验时不能像普通文本一样 trim。
  const seedPatch = assertContent(candidate.seedPatch, 'empty_patch', `用例 ${id} 缺少 seed patch`, id);
  const evaluatorPatch = assertContent(candidate.evaluatorPatch, 'empty_patch', `用例 ${id} 缺少 evaluator patch`, id);
  const referencePatch = assertContent(candidate.referencePatch, 'empty_patch', `用例 ${id} 缺少 reference patch`, id);
  const seedPaths = validatePatchTargets(seedPatch, `${id}.seed`, allowedPaths);
  const evaluatorPaths = validatePatchTargets(evaluatorPatch, `${id}.evaluator`, allowedPaths, { evaluator: true });
  const referencePaths = validatePatchTargets(referencePatch, `${id}.reference`, allowedPaths);
  const acceptance = validateAcceptance(candidate.acceptance, id);
  if (!Array.isArray(candidate.availabilityChecks)) {
    fail('invalid_availability_checks', `用例 ${id} 的可用性检查必须是数组`, id);
  }
  const availabilityChecks = candidate.availabilityChecks.map((item, index) => {
    assertPlainObject(item, 'invalid_availability_check', `用例 ${id} 的可用性检查必须是对象`, `${id}.${index}`);
    if (item.kind !== 'file') fail('unsupported_availability_check', `用例 ${id} 只允许文件可用性检查`, id);
    const target = assertSafeRelativePath(item.target, '可用性检查路径');
    if (!allowedByPrefixes(target, allowedPaths)) {
      fail('availability_check_outside_allowed_paths', `用例 ${id} 的可用性检查越出允许路径`, target);
    }
    return { kind: 'file', target };
  });
  if (!Array.isArray(candidate.clarifications)) fail('invalid_clarifications', `用例 ${id} 的澄清预案必须是数组`, id);
  const clarifications = candidate.clarifications.map((item, index) => {
    assertPlainObject(item, 'invalid_clarification', `用例 ${id} 的澄清项必须是对象`, `${id}.${index}`);
    return {
      pattern: assertString(item.pattern, 'invalid_clarification_pattern', `用例 ${id} 的澄清模式不能为空`, id),
      answer: assertString(item.answer, 'invalid_clarification_answer', `用例 ${id} 的澄清答案不能为空`, id),
    };
  });
  const maxReworks = Number(candidate.maxReworks);
  const maxClarifications = Number(candidate.maxClarifications);
  if (!Number.isInteger(maxReworks) || maxReworks < 0 || maxReworks > 3) {
    fail('invalid_max_reworks', `用例 ${id} 的返工上限非法`, id);
  }
  if (!Number.isInteger(maxClarifications) || maxClarifications < 0 || maxClarifications > 3) {
    fail('invalid_max_clarifications', `用例 ${id} 的澄清上限非法`, id);
  }
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    id,
    projectId,
    title,
    complexity,
    taskType,
    publicRequirement,
    allowedPaths,
    seedPatch,
    evaluatorPatch,
    referencePatch,
    clarifications,
    acceptance,
    availabilityChecks,
    maxReworks,
    maxClarifications,
    requiresExternalSystem: false,
    usesNetwork: false,
    patchPaths: { seed: seedPaths, evaluator: evaluatorPaths, reference: referencePaths },
  };
}

function caseAssetDigests(candidate) {
  return {
    publicRequirement: sha256(candidate.publicRequirement),
    seedPatch: sha256(candidate.seedPatch),
    evaluatorPatch: sha256(candidate.evaluatorPatch),
    referencePatch: sha256(candidate.referencePatch),
    clarifications: sha256Json(candidate.clarifications),
    acceptance: sha256Json(candidate.acceptance),
    availabilityChecks: sha256Json(candidate.availabilityChecks),
  };
}

export function freezeSyntheticCases(candidates, frozenAt = new Date().toISOString(), projectIds = EXPECTED_PROJECT_IDS) {
  const expectedProjectIds = [...new Set(projectIds)].sort();
  if (expectedProjectIds.length === 0 || expectedProjectIds.some((item) => !EXPECTED_PROJECT_IDS.includes(item))) {
    fail('invalid_case_project_scope', '冻结用例的项目范围非法', 'cases');
  }
  const expectedCaseCount = expectedProjectIds.reduce((count, projectId) => count + COMPLEXITY_MATRIX[projectId].length, 0);
  if (!Array.isArray(candidates) || candidates.length !== expectedCaseCount) {
    fail('invalid_case_count', `当前范围必须恰好冻结 ${expectedCaseCount} 个用例`, 'cases');
  }
  const cases = candidates.map(validateSyntheticCase);
  const ids = new Set(cases.map((item) => item.id));
  if (ids.size !== expectedCaseCount) fail('duplicate_case_id', '模拟用例 ID 重复', 'cases');
  if (cases.some((item) => !expectedProjectIds.includes(item.projectId))) {
    fail('case_project_outside_scope', '模拟用例越出冻结项目范围', 'cases');
  }
  for (const projectId of expectedProjectIds) {
    const expected = COMPLEXITY_MATRIX[projectId].map((complexity) => expectedCaseId(projectId, complexity)).sort();
    const actual = cases.filter((item) => item.projectId === projectId).map((item) => item.id).sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      fail('case_matrix_mismatch', `项目 ${projectId} 的用例不符合复杂度矩阵`, projectId);
    }
  }
  const frozenCases = cases.sort((left, right) => left.id.localeCompare(right.id)).map((item) => ({
    ...item,
    assetDigests: caseAssetDigests(item),
  }));
  const manifest = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    synthetic: true,
    frozenAt,
    caseCount: frozenCases.length,
    cases: frozenCases,
  };
  if (expectedProjectIds.length !== EXPECTED_PROJECT_IDS.length) manifest.projectIds = expectedProjectIds;
  return { ...manifest, manifestDigest: sha256Json(manifest) };
}

export function verifyFrozenCases(manifest) {
  assertPlainObject(manifest, 'invalid_frozen_manifest', '冻结清单必须是对象');
  if (manifest.schemaVersion !== BENCHMARK_SCHEMA_VERSION || manifest.synthetic !== true) {
    fail('invalid_frozen_manifest', '冻结清单版本或合成标记非法', 'manifest');
  }
  const rebuilt = freezeSyntheticCases(manifest.cases, manifest.frozenAt, manifest.projectIds || EXPECTED_PROJECT_IDS);
  if (rebuilt.manifestDigest !== manifest.manifestDigest) {
    fail('frozen_manifest_drifted', '冻结清单内容摘要发生变化', 'manifest', 'defect');
  }
  return rebuilt;
}

export function detectExecutionRoute({ mode, eventText = '', finalRoute = 'unknown', changedPaths = [] }) {
  if (!['plugin', 'baseline'].includes(mode)) fail('invalid_execution_mode', `未知执行组：${mode}`, mode);
  const normalizedPaths = changedPaths.map(normalizeMachinePath);
  const managementPaths = normalizedPaths.filter((candidate) => MANAGEMENT_PATHS.some((prefix) => (
    candidate === prefix.replace(/\/$/u, '') || candidate.startsWith(prefix)
  )));
  if (mode === 'baseline') {
    const valid = finalRoute === 'baseline' && managementPaths.length === 0;
    return {
      route: 'baseline',
      valid,
      code: valid ? 'baseline_route_confirmed' : 'baseline_route_contaminated',
      evidence: { finalRoute, managementPaths },
    };
  }
  const fastEvent = /frontend-fast-change/iu.test(eventText);
  const fullEvent = /(?:frontend-change\/SKILL\.md|frontend-ai-workflow:frontend-change)/iu.test(eventText);
  const fullArtifacts = managementPaths.some((candidate) => candidate.startsWith('requirements/') || candidate.startsWith('openspec/'));
  if (finalRoute === 'fast' && fastEvent && !fullArtifacts) {
    return { route: 'fast', valid: true, code: 'plugin_fast_route_confirmed', evidence: { fastEvent, fullEvent, managementPaths } };
  }
  if (finalRoute === 'full' && fullArtifacts && (fullEvent || managementPaths.length >= 2)) {
    return { route: 'full', valid: true, code: 'plugin_full_route_confirmed', evidence: { fastEvent, fullEvent, managementPaths } };
  }
  return {
    route: ['fast', 'full'].includes(finalRoute) ? finalRoute : 'unknown',
    valid: false,
    code: 'plugin_route_evidence_missing',
    evidence: { fastEvent, fullEvent, managementPaths, finalRoute },
  };
}

