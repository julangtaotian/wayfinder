// AI-code-start lines:210 tool:Codex
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectProject } from './inspect-project.mjs';
import { runOpenSpecSync } from './openspec-cli.mjs';
// AI-code-start lines:1 tool:Codex
import { collectProjectScope } from './collect-project-scope.mjs';
import {
  detectWorkflowLayout,
  LEGACY_FRONTEND_PATH,
  LEGACY_REQUIREMENT_TEMPLATE_PATH,
  LEGACY_WORKFLOW_PATH,
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

// Wayfinder 的元数据和项目地图共用一个文档，检查只验证受管结构与机器字段。
function checkWayfinder(root, errors) {
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
  if (enabled) {
    if (!settings.scopeVersion || settings.scopeVersion === '未执行') errors.push('Wayfinder 缺少有效 scopeVersion');
    if (!/^\d+$/.test(settings.scopeIncludedFiles || '')) errors.push('Wayfinder 缺少有效 scopeIncludedFiles');
    if (!/^\d+$/.test(settings.scopeExcludedFiles || '')) errors.push('Wayfinder 缺少有效 scopeExcludedFiles');
    checkGuardrails(root, errors);
  }
  // AI-code-start lines:9 tool:Codex
  return {
    enabled,
    scopeVersion: settings.scopeVersion || null,
    scopeFingerprint: settings.scopeFingerprint || null,
    scopeScannedAt: settings.scopeScannedAt || null,
    scopeGitCommit: settings.scopeGitCommit || null,
    scopeGitDirty: settings.scopeGitDirty || null,
    contextPath: WAYFINDER_PATH,
    version: settings.version || null,
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

// AI-code-start lines:31 tool:Codex
function inspectCommandEvidence(inspection) {
  return Object.fromEntries(Object.entries(inspection.commands).map(([kind, command]) => [
    kind,
    {
      command,
      status: command === '未配置' ? 'missing' : 'detected',
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

function checkAnalysisFreshness(root, deepAnalysis, warnings) {
  if (!deepAnalysis.enabled) return { checked: false, stale: null, currentFingerprint: null };
  if (!deepAnalysis.scopeFingerprint || deepAnalysis.scopeFingerprint === '未执行') {
    warnings.push('深度项目地图缺少范围指纹；请显式刷新深度分析后再判断新鲜度。');
    return { checked: false, stale: null, currentFingerprint: null };
  }
  const current = collectProjectScope(root);
  const stale = current.fingerprint !== deepAnalysis.scopeFingerprint;
  if (stale) warnings.push('项目文件快照已变化，Wayfinder 深度项目地图可能过期；请预览并显式刷新深度分析。');
  return { checked: true, stale, currentFingerprint: current.fingerprint };
}

export function checkProject(target = process.cwd()) {
  const inspection = inspectProject(target);
  const errors = [];
  const warnings = [];
  const layout = detectWorkflowLayout(inspection.root);

  checkOuterManagedFiles(inspection.root, errors);
  const deepAnalysis = layout === 'legacy'
    ? checkLegacy(inspection.root, errors)
    : (checkRequiredFiles(inspection.root, WAYFINDER_REQUIRED_FILES, errors), checkWayfinder(inspection.root, errors));
  if (layout === 'legacy') warnings.push('检测到旧工作流布局；请先运行 Wayfinder 迁移预览，普通升级不会自动移动文件。');
  if (layout === 'none') warnings.push('未检测到 Wayfinder 或旧工作流元数据。');
  if (!inspection.scriptNames.build) warnings.push('package.json 未配置构建脚本');
  if (!inspection.scriptNames.test) warnings.push('package.json 未配置测试脚本');
  if (!inspection.scriptNames.lint) warnings.push('package.json 未配置 lint 脚本');
  // AI-code-start lines:3 tool:Codex
  if (inspection.commandSemantics.lint.status === 'unverified') {
    warnings.push(`lint 脚本语义未验证：${inspection.commandSemantics.lint.command}；请确认其是否执行静态检查。`);
  }
  if (!inspection.scriptNames.typecheck) warnings.push('package.json 未配置类型检查脚本');

  const planningEngine = checkPlanningEngine(inspection.root, errors);
  // AI-code-start lines:3 tool:Codex
  deepAnalysis.freshness = checkAnalysisFreshness(inspection.root, deepAnalysis, warnings);
  const activeChanges = checkActiveChanges(inspection.root, warnings);
  return {
    ok: errors.length === 0,
    root: inspection.root,
    layout,
    migrationRequired: layout === 'legacy',
    version: deepAnalysis.version,
    preset: inspection.preset,
    commands: inspection.commands,
    // AI-code-start lines:1 tool:Codex
    commandEvidence: inspectCommandEvidence(inspection),
    commandSemantics: inspection.commandSemantics,
    planningEngine,
    activeChanges,
    deepAnalysis,
    errors,
    warnings,
  };
}

function parseArgs(argv) {
  const args = { target: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--target') {
      args.target = argv[index + 1];
      index += 1;
    }
  }
  return args;
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
