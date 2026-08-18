import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCliArgs } from './cli-arguments.mjs';
import { inspectProject } from './inspect-project.mjs';
import { runOpenSpecSync } from './openspec-cli.mjs';
import { collectProjectScope } from './collect-project-scope.mjs';
import { runUpdate } from './update-project.mjs';
import { auditProjectVerificationEvidence } from './verification-evidence.mjs';
import {
  detectWorkflowLayout,
  LEGACY_FRONTEND_PATH,
  LEGACY_REQUIREMENT_TEMPLATE_PATH,
  LEGACY_WORKFLOW_PATH,
  managedBlock,
  markerPatterns,
  readLegacyWorkflowSettings,
  readWayfinderSettings,
  WAYFINDER_BLOCKS,
  WAYFINDER_PATH,
} from './workflow-layout.mjs';

const WAYFINDER_REQUIRED_FILES = [
  'AGENTS.md',
  'openspec/config.yaml',
  WAYFINDER_PATH,
];

const LEGACY_REQUIRED_FILES = [
  'AGENTS.md',
  LEGACY_REQUIREMENT_TEMPLATE_PATH,
  LEGACY_FRONTEND_PATH,
  'openspec/config.yaml',
  LEGACY_WORKFLOW_PATH,
];

const OUTER_MANAGED_FILES = [
  { file: 'AGENTS.md', kind: 'html' },
  { file: 'openspec/config.yaml', kind: 'yaml' },
];
const ANALYSIS_STATUSES = new Set(['not-requested', 'pending', 'partial', 'complete']);
const COMPLETE_ANALYSIS_DIMENSIONS = [
  { id: 'run-delivery', label: '项目运行与交付边界' },
  { id: 'functional-dependencies', label: '功能与依赖链路' },
  { id: 'data-state-security', label: '数据、状态与安全边界' },
  { id: 'verification-risks', label: '验证基线与高风险区域' },
  { id: 'facts-inferences-questions', label: '事实、推断与待确认项' },
];

function markerCount(content, kind, marker, block = null) {
  const patterns = markerPatterns(kind, block);
  return [...content.matchAll(patterns[marker])].length;
}

function checkRequiredFiles(root, files, errors) {
  for (const file of files) {
    if (!fs.existsSync(path.join(root, file))) errors.push(`缺少工作流文件：${file}`);
  }
}

function checkOuterManagedFiles(root, errors) {
  for (const descriptor of OUTER_MANAGED_FILES) {
    const filePath = path.join(root, descriptor.file);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const starts = markerCount(content, descriptor.kind, 'start');
    const ends = markerCount(content, descriptor.kind, 'end');
    if (starts !== 1 || ends !== 1) {
      errors.push(`${descriptor.file} 的受管标记异常：start=${starts}, end=${ends}`);
    }
  }
}

function checkGuardrails(root, errors) {
  const agentsPath = path.join(root, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) return;
  const content = fs.readFileSync(agentsPath, 'utf8');
  const starts = markerCount(content, 'html', 'start', 'deep-guardrails');
  const ends = markerCount(content, 'html', 'end', 'deep-guardrails');
  if (starts !== 1 || ends !== 1) {
    errors.push(`AGENTS.md 的 deep-guardrails 受管标记异常：start=${starts}, end=${ends}`);
  }
}

function isIsoTimestamp(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
    && !Number.isNaN(Date.parse(value));
}

function analysisBlock(content) {
  try {
    return managedBlock(content, 'html', 'analysis');
  } catch {
    return null;
  }
}

function literalCount(content, literal) {
  return content.split(literal).length - 1;
}

// 完成态只接受可追溯的全量覆盖和固定地图维度；旧版缺少字段时仅提醒，避免把升级前项目直接判坏。
function checkAnalysisContract(content, settings, errors, warnings) {
  const errorsBefore = errors.length;
  const fallback = {
    status: 'unknown',
    coveredFiles: null,
    totalFiles: null,
    updatedAt: null,
    complete: false,
  };
  if (settings.deepAnalysis !== 'true') return fallback;

  const status = settings.analysisStatus;
  const coveredFiles = Number(settings.analysisCoveredFiles);
  const totalFiles = Number(settings.scopeIncludedFiles);
  const updatedAt = settings.analysisUpdatedAt || null;
  if (!status || settings.analysisCoveredFiles === undefined || !updatedAt) {
    warnings.push('深度项目地图缺少完成状态或覆盖统计；请显式刷新并按新版 Wayfinder 合同补齐。');
    return fallback;
  }
  if (!ANALYSIS_STATUSES.has(status) || status === 'not-requested') {
    errors.push(`Wayfinder 的 analysisStatus 无效：${status}`);
    return { status: status || 'unknown', coveredFiles: null, totalFiles: null, updatedAt, complete: false };
  }
  if (!Number.isSafeInteger(coveredFiles) || coveredFiles < 0) {
    errors.push('Wayfinder 的 analysisCoveredFiles 必须是非负整数');
  }
  if (!Number.isSafeInteger(totalFiles) || totalFiles < 0) {
    errors.push('Wayfinder 的 scopeIncludedFiles 无法用于校验项目地图覆盖度');
  }
  if (Number.isSafeInteger(coveredFiles) && Number.isSafeInteger(totalFiles) && coveredFiles > totalFiles) {
    errors.push('Wayfinder 的 analysisCoveredFiles 不得超过 scopeIncludedFiles');
  }

  const body = analysisBlock(content);
  if (body === null) {
    return {
      status,
      coveredFiles: Number.isSafeInteger(coveredFiles) ? coveredFiles : null,
      totalFiles: Number.isSafeInteger(totalFiles) ? totalFiles : null,
      updatedAt,
      complete: false,
    };
  }
  if (status === 'pending') {
    if (coveredFiles !== 0) errors.push('analysisStatus 为 pending 时，analysisCoveredFiles 必须为 0');
    warnings.push('深度扫描范围已建立，但项目地图仍待生成；不得将现有地图作为完整项目上下文。');
  } else {
    if (!isIsoTimestamp(updatedAt || '')) {
      errors.push(`analysisStatus 为 ${status} 时，analysisUpdatedAt 必须是有效 ISO 时间`);
    }
    if (status === 'partial' && (!Number.isSafeInteger(totalFiles) || coveredFiles <= 0 || coveredFiles >= totalFiles)) {
      errors.push('analysisStatus 为 partial 时，analysisCoveredFiles 必须大于 0 且小于 scopeIncludedFiles');
    }
    if (status === 'partial') {
      if (body.includes('frontend-ai-workflow:analysis:pending') || body.includes('深度项目地图（待生成）')) {
        errors.push('analysisStatus 为 partial 时，深度项目地图不得保留待生成占位内容');
      }
      warnings.push(`深度项目地图仅覆盖 ${coveredFiles}/${totalFiles} 个纳入文件；不得将它作为完整项目上下文。`);
    }
    if (status === 'complete') {
      if (coveredFiles !== totalFiles) errors.push('analysisStatus 为 complete 时，analysisCoveredFiles 覆盖数必须等于纳入文件数');
      if (body.includes('frontend-ai-workflow:analysis:pending') || body.includes('深度项目地图（待生成）')) {
        errors.push('analysisStatus 为 complete 时，深度项目地图不得保留待生成占位内容');
      }
      const invalidDimensions = COMPLETE_ANALYSIS_DIMENSIONS.flatMap(({ id, label }) => {
        const marker = `<!-- frontend-ai-workflow:analysis-dimension:${id} -->`;
        const count = literalCount(body, marker);
        return count === 1 ? [] : [`${label}（标记数：${count}）`];
      });
      if (invalidDimensions.length) {
        errors.push(`analysisStatus 为 complete 时，深度项目地图维度标记异常：${invalidDimensions.join('、')}`);
      }
    }
  }
  return {
    status,
    coveredFiles: Number.isSafeInteger(coveredFiles) ? coveredFiles : null,
    totalFiles: Number.isSafeInteger(totalFiles) ? totalFiles : null,
    updatedAt,
    complete: status === 'complete' && coveredFiles === totalFiles && errors.length === errorsBefore,
  };
}

// Wayfinder 的元数据和项目地图共用一个文档，检查只验证受管结构与机器字段。
function checkWayfinder(root, errors, warnings) {
  const file = path.join(root, WAYFINDER_PATH);
  if (!fs.existsSync(file)) return { enabled: false, scopeVersion: null, contextPath: WAYFINDER_PATH };
  const content = fs.readFileSync(file, 'utf8');
  for (const block of WAYFINDER_BLOCKS) {
    const starts = markerCount(content, 'html', 'start', block);
    const ends = markerCount(content, 'html', 'end', block);
    if (starts !== 1 || ends !== 1) {
      errors.push(`wayfinder/frontend.md 的 ${block} 受管标记异常：start=${starts}, end=${ends}`);
    }
  }

  let settings = {};
  try {
    settings = readWayfinderSettings(root) || {};
  } catch (error) {
    errors.push(`Wayfinder 元数据异常：${error.message}`);
  }
  if (!settings.version) errors.push('Wayfinder 缺少有效 version');
  if (settings.layout !== 'wayfinder') errors.push('Wayfinder 缺少 layout: wayfinder');
  const enabled = settings.deepAnalysis === 'true';
  let analysis = {
    status: 'not-requested',
    coveredFiles: 0,
    totalFiles: 0,
    updatedAt: '未执行',
    complete: false,
  };
  if (enabled) {
    if (!settings.scopeVersion || settings.scopeVersion === '未执行') errors.push('Wayfinder 缺少有效 scopeVersion');
    if (!/^\d+$/.test(settings.scopeIncludedFiles || '')) errors.push('Wayfinder 缺少有效 scopeIncludedFiles');
    if (!/^\d+$/.test(settings.scopeExcludedFiles || '')) errors.push('Wayfinder 缺少有效 scopeExcludedFiles');
    checkGuardrails(root, errors);
    analysis = checkAnalysisContract(content, settings, errors, warnings);
  }
  return {
    enabled,
    scopeVersion: settings.scopeVersion || null,
    scopeFingerprint: settings.scopeFingerprint || null,
    scopeScannedAt: settings.scopeScannedAt || null,
    scopeGitCommit: settings.scopeGitCommit || null,
    scopeGitDirty: settings.scopeGitDirty || null,
    contextPath: WAYFINDER_PATH,
    version: settings.version || null,
    analysis,
  };
}

function checkLegacy(root, errors) {
  checkRequiredFiles(root, LEGACY_REQUIRED_FILES, errors);
  const context = path.join(root, LEGACY_FRONTEND_PATH);
  if (fs.existsSync(context)) {
    const content = fs.readFileSync(context, 'utf8');
    for (const block of ['scope', 'analysis']) {
      const starts = markerCount(content, 'html', 'start', block);
      const ends = markerCount(content, 'html', 'end', block);
      if (starts !== 1 || ends !== 1) {
        errors.push(`旧 frontend.md 的 ${block} 受管标记异常：start=${starts}, end=${ends}`);
      }
    }
  }
  let settings = {};
  try {
    settings = readLegacyWorkflowSettings(root) || {};
  } catch (error) {
    errors.push(`旧工作流元数据异常：${error.message}`);
  }
  const enabled = settings.deepAnalysis === 'true';
  if (enabled) checkGuardrails(root, errors);
  return { enabled, scopeVersion: settings.scopeVersion || null, contextPath: LEGACY_FRONTEND_PATH, version: settings.version || null };
}

function parsePlanningEngineJson(output) {
  const start = output.indexOf('{');
  if (start < 0) return null;
  try {
    return JSON.parse(output.slice(start));
  } catch {
    return null;
  }
}

function checkPlanningEngine(root, errors) {
  const result = runOpenSpecSync(['doctor', '--json'], { cwd: root, encoding: 'utf8' });
  if (!result.available) {
    errors.push(`插件内置规划引擎不可用：${result.error?.message || '未知错误'}`);
    return { available: false, healthy: null, source: 'bundled', version: result.runtimeVersion };
  }
  if (result.status !== 0) {
    errors.push(`规划引擎健康检查失败：${(result.stderr || result.stdout || '').trim()}`);
    return { available: true, healthy: false, source: result.source, version: result.runtimeVersion };
  }
  const data = parsePlanningEngineJson(result.stdout);
  const healthy = data?.root?.healthy === true;
  if (!healthy) errors.push('规划引擎未报告 healthy=true');
  return { available: true, healthy, source: result.source, version: result.runtimeVersion };
}

function inspectCommandEvidence(inspection) {
  return Object.fromEntries(Object.entries(inspection.commands).map(([kind, command]) => [
    kind,
    {
      command: kind === 'test' && inspection.commandSemantics.test.status === 'placeholder'
        ? inspection.commandSemantics.test.command
        : command,
      status: kind === 'test'
        ? inspection.commandSemantics.test.status
        : (command === '未配置' ? 'missing' : 'detected'),
      executed: false,
    },
  ]));
}

function checkActiveChanges(root, warnings) {
  const result = runOpenSpecSync(['list', '--json'], { cwd: root, encoding: 'utf8' });
  if (!result.available || result.status !== 0) {
    return { available: false, total: 0, completedNotArchived: [] };
  }
  const data = parsePlanningEngineJson(result.stdout);
  const changes = Array.isArray(data?.changes) ? data.changes : [];
  const completedNotArchived = changes
    .filter((change) => change.status === 'complete')
    .map((change) => change.name);
  if (completedNotArchived.length) {
    warnings.push(`检测到 ${completedNotArchived.length} 个已完成但仍未归档的活跃变更：${completedNotArchived.join('、')}`);
  }
  return { available: true, total: changes.length, completedNotArchived };
}

function checkAnalysisState(root, deepAnalysis, warnings) {
  if (!deepAnalysis.enabled) {
    return {
      freshness: { checked: false, stale: null, currentFingerprint: null },
      validationEvidence: null,
      observations: [],
    };
  }
  const current = collectProjectScope(root);
  let freshness;
  if (!deepAnalysis.scopeFingerprint || deepAnalysis.scopeFingerprint === '未执行') {
    warnings.push('深度项目地图缺少范围指纹；请显式刷新深度分析后再判断新鲜度。');
    freshness = { checked: false, stale: null, currentFingerprint: current.fingerprint };
  } else {
    const stale = current.fingerprint !== deepAnalysis.scopeFingerprint;
    if (stale) warnings.push('项目文件快照已变化，Wayfinder 深度项目地图可能过期；请预览并显式刷新深度分析。');
    freshness = { checked: true, stale, currentFingerprint: current.fingerprint };
  }

  const wxmlObservations = current.observations.filter((item) => item.code === 'wxml-attribute-spacing');
  if (wxmlObservations.length) {
    const locations = wxmlObservations.slice(0, 5).map((item) => `${item.path}:${item.line}`);
    const omitted = wxmlObservations.length > locations.length ? `，另有 ${wxmlObservations.length - locations.length} 处` : '';
    warnings.push(`静态发现 ${wxmlObservations.length} 处 WXML 属性之间可能缺少空白：${locations.join('、')}${omitted}；未执行 WXML 语法解析或平台编译，请使用微信开发者工具或外部 CI 确认。`);
  }
  return {
    freshness,
    validationEvidence: current.validationEvidence,
    observations: current.observations,
  };
}

function checkManagedContentFreshness(root, layout, warnings) {
  if (layout !== 'wayfinder') return { checked: false, stale: null, files: [] };
  const preview = runUpdate({ target: root });
  if (!preview.ok) return { checked: false, stale: null, files: [] };
  const files = preview.actions
    .filter((item) => item.action === 'update')
    .map((item) => item.file);
  if (files.length) {
    warnings.push(`受管工作流内容与当前项目识别结果不一致：${files.join('、')}；请先预览并显式升级。`);
  }
  return { checked: true, stale: files.length > 0, files };
}

export function checkProject(target = process.cwd()) {
  const inspection = inspectProject(target);
  const errors = [];
  const warnings = [];
  const layout = detectWorkflowLayout(inspection.root);

  checkOuterManagedFiles(inspection.root, errors);
  const deepAnalysis = layout === 'legacy'
    ? checkLegacy(inspection.root, errors)
    : (checkRequiredFiles(inspection.root, WAYFINDER_REQUIRED_FILES, errors), checkWayfinder(inspection.root, errors, warnings));
  if (layout === 'legacy') warnings.push('检测到旧工作流布局；请先运行 Wayfinder 迁移预览，普通升级不会自动移动文件。');
  if (layout === 'none') warnings.push('未检测到 Wayfinder 或旧工作流元数据。');
  if (!inspection.scriptNames.build) warnings.push('package.json 未配置构建脚本');
  if (inspection.commandSemantics.test.status === 'placeholder') {
    warnings.push(`package.json 的 ${inspection.commandSemantics.test.scriptName} 是失败占位脚本，不作为可用测试入口`);
  } else if (!inspection.scriptNames.test) {
    warnings.push('package.json 未配置测试脚本');
  }
  if (!inspection.scriptNames.lint) warnings.push('package.json 未配置 lint 脚本');
  if (inspection.commandSemantics.lint.status === 'unverified') {
    warnings.push(`lint 脚本语义未验证：${inspection.commandSemantics.lint.command}；请确认其是否执行静态检查。`);
  }
  if (!inspection.scriptNames.typecheck) warnings.push('package.json 未配置类型检查脚本');
  if (
    inspection.targetProfile.platform.kind !== 'unknown'
    && inspection.platformCommands.status === 'missing'
  ) {
    const environment = inspection.targetProfile.platform.frameworks.includes('wechat-native')
      ? '微信开发者工具或外部 CI 的验证环境'
      : '人工开发工具或外部 CI 的验证环境';
    warnings.push(`已识别平台框架，但 package.json 未配置受支持的显式平台脚本；需求与变更必须记录${environment}。`);
  }

  const planningEngine = checkPlanningEngine(inspection.root, errors);
  const analysisState = checkAnalysisState(inspection.root, deepAnalysis, warnings);
  deepAnalysis.freshness = analysisState.freshness;
  deepAnalysis.validationEvidence = analysisState.validationEvidence;
  deepAnalysis.observations = analysisState.observations;
  const managedContentFreshness = checkManagedContentFreshness(inspection.root, layout, warnings);
  const activeChanges = checkActiveChanges(inspection.root, warnings);
  const verificationEvidenceAudit = auditProjectVerificationEvidence(inspection.root);
  for (const [code, count] of Object.entries(verificationEvidenceAudit.counts)) {
    warnings.push(`${code}：检测到 ${count} 项，完整目标见 verificationEvidenceAudit.diagnostics`);
  }
  return {
    ok: errors.length === 0,
    root: inspection.root,
    layout,
    migrationRequired: layout === 'legacy',
    version: deepAnalysis.version,
    preset: inspection.preset,
    targetProfile: inspection.targetProfile,
    commands: inspection.commands,
    commandEvidence: inspectCommandEvidence(inspection),
    commandSemantics: inspection.commandSemantics,
    platformCommands: inspection.platformCommands,
    planningEngine,
    activeChanges,
    verificationEvidenceAudit,
    managedContentFreshness,
    deepAnalysis,
    errors,
    warnings,
  };
}

function parseArgs(argv) {
  return parseCliArgs(argv, {
    defaults: { target: process.cwd() },
    valueOptions: {
      '--target': 'target',
    },
  });
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const result = checkProject(parseArgs(process.argv.slice(2)).target);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
