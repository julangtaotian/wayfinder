import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCliArgs } from './cli-arguments.mjs';
import { runBootstrap, WORKFLOW_VERSION } from './bootstrap-project.mjs';
import { assertSafeProjectRoot } from './collect-project-scope.mjs';
import { inspectProject } from './inspect-project.mjs';
import {
  ProjectPathError,
  projectPathFailure,
  removeProjectFile,
  resolveSafeProjectPath,
} from './project-path-safety.mjs';
import {
  detectWorkflowLayout,
  findManagedRange,
  isOnlyManagedLegacyMetadata,
  LEGACY_FRONTEND_PATH,
  LEGACY_REQUIREMENT_TEMPLATE_PATH,
  LEGACY_WORKFLOW_PATH,
  readLegacyWorkflowSettings,
  WAYFINDER_PATH,
} from './workflow-layout.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templateRoot = path.join(pluginRoot, 'assets', 'templates');

function formatMetadata(settings, inspection) {
  const deepAnalysis = settings.deepAnalysis || 'false';
  const fields = {
    version: WORKFLOW_VERSION,
    openspecVersion: settings.openspecVersion || '未知',
    layout: 'wayfinder',
    project: inspection.name,
    preset: inspection.preset,
    packageManager: inspection.packageManager,
    deepAnalysis,
    // 旧布局没有可验证的覆盖统计，迁移后保留原地图正文但要求显式深度刷新后才能标记完成。
    analysisStatus: deepAnalysis === 'true' ? 'pending' : 'not-requested',
    analysisCoveredFiles: '0',
    analysisUpdatedAt: deepAnalysis === 'true' ? '未完成' : '未执行',
    scopeVersion: settings.scopeVersion || '未执行',
    scopeIncludedFiles: settings.scopeIncludedFiles || '0',
    scopeExcludedFiles: settings.scopeExcludedFiles || '0',
    scopeIncludedBytes: settings.scopeIncludedBytes || '0',
    scopeFingerprint: settings.scopeFingerprint || '未执行',
    scopeScannedAt: settings.scopeScannedAt || '未执行',
    scopeGitCommit: settings.scopeGitCommit || '不可用',
    scopeGitDirty: settings.scopeGitDirty || '不可用',
  };
  const lines = Object.entries(fields).map(([key, value]) => {
    if (/^(deepAnalysis|analysisCoveredFiles|scopeIncludedFiles|scopeExcludedFiles|scopeIncludedBytes|scopeGitDirty)$/.test(key)) return `${key}: ${value}`;
    return `${key}: "${String(value).replaceAll('"', '\\"')}"`;
  });
  return `<!-- frontend-ai-workflow:meta:start version=${WORKFLOW_VERSION} -->\n${lines.join('\n')}\n<!-- frontend-ai-workflow:meta:end -->`;
}

// 迁移时只替换文档标题并插入元数据，旧范围、地图和维护者内容全部原样带入。
function convertLegacyFrontend(content, settings, inspection) {
  const scopeRange = findManagedRange(content, 'html', 'scope');
  findManagedRange(content, 'html', 'analysis');
  const bodyBeforeScope = content.slice(0, scopeRange.start).replace(/^# .*\n/, '');
  return `# ${inspection.name} Wayfinder\n\n${formatMetadata(settings, inspection)}\n${bodyBeforeScope}${content.slice(scopeRange.start)}`;
}

function requirementTemplateAction(root) {
  const safe = resolveSafeProjectPath(root, LEGACY_REQUIREMENT_TEMPLATE_PATH, '旧需求模板');
  if (!safe.exists) return { file: LEGACY_REQUIREMENT_TEMPLATE_PATH, action: 'skip', reason: '旧需求模板不存在' };
  const current = fs.readFileSync(safe.absolutePath, 'utf8');
  const builtin = fs.readFileSync(path.join(templateRoot, 'requirements', '_template.md'), 'utf8');
  if (current === builtin) return { file: LEGACY_REQUIREMENT_TEMPLATE_PATH, action: 'delete', reason: '内容与插件内置模板一致' };
  return { file: LEGACY_REQUIREMENT_TEMPLATE_PATH, action: 'keep', reason: '检测到项目自定义模板，保留供需求编写继续使用' };
}

function legacyMetadataAction(root) {
  const safe = resolveSafeProjectPath(root, LEGACY_WORKFLOW_PATH, '旧工作流元数据');
  if (!safe.exists) return { file: LEGACY_WORKFLOW_PATH, action: 'skip', reason: '旧工作流元数据不存在' };
  try {
    const content = fs.readFileSync(safe.absolutePath, 'utf8');
    if (isOnlyManagedLegacyMetadata(content)) return { file: LEGACY_WORKFLOW_PATH, action: 'delete', reason: '元数据已完整迁入 Wayfinder' };
    return { file: LEGACY_WORKFLOW_PATH, action: 'keep', reason: '包含项目自定义元数据，保留供人工处理' };
  } catch (error) {
    return { file: LEGACY_WORKFLOW_PATH, action: 'conflict', reason: error.message };
  }
}

function removePlannedFiles(root, actions) {
  for (const action of actions) {
    if (action.action !== 'delete') continue;
    removeProjectFile(root, action.file, { label: '迁移清理目标' });
  }
}

export function runWayfinderMigration({ target = process.cwd(), write = false } = {}) {
  const inspection = inspectProject(target);
  assertSafeProjectRoot(inspection.root);
  try {
    for (const candidate of [
      LEGACY_FRONTEND_PATH,
      LEGACY_WORKFLOW_PATH,
      LEGACY_REQUIREMENT_TEMPLATE_PATH,
      WAYFINDER_PATH,
      'AGENTS.md',
      'openspec/config.yaml',
    ]) {
      resolveSafeProjectPath(inspection.root, candidate, '迁移目标');
    }
  } catch (error) {
    if (!(error instanceof ProjectPathError)) throw error;
    return { ...projectPathFailure(error, { write }), layout: null };
  }
  const layout = detectWorkflowLayout(inspection.root);
  if (layout !== 'legacy') {
    return {
      ok: false,
      write,
      layout,
      actions: [{ file: WAYFINDER_PATH, action: 'skip', reason: '目标不是可迁移的旧工作流布局' }],
    };
  }

  const legacyFrontend = resolveSafeProjectPath(inspection.root, LEGACY_FRONTEND_PATH, '旧前端上下文');
  if (!legacyFrontend.exists) {
    return { ok: false, write, layout, actions: [{ file: LEGACY_FRONTEND_PATH, action: 'conflict', reason: '缺少可迁移的旧前端上下文' }] };
  }

  let wayfinderContent;
  let settings;
  try {
    settings = readLegacyWorkflowSettings(inspection.root) || {};
    wayfinderContent = convertLegacyFrontend(fs.readFileSync(legacyFrontend.absolutePath, 'utf8'), settings, inspection);
  } catch (error) {
    return { ok: false, write, layout, actions: [{ file: LEGACY_FRONTEND_PATH, action: 'conflict', reason: error.message }] };
  }

  const bootstrap = runBootstrap({
    target: inspection.root,
    write: false,
    updateManaged: true,
    deep: settings.deepAnalysis === 'true',
    allowLegacy: true,
    contentOverrides: { [WAYFINDER_PATH]: wayfinderContent },
  });
  const cleanup = [
    { file: LEGACY_FRONTEND_PATH, action: 'delete', reason: '完整内容已迁入 wayfinder/frontend.md' },
    legacyMetadataAction(inspection.root),
    requirementTemplateAction(inspection.root),
  ];
  const actions = [...bootstrap.actions, ...cleanup];
  if (!bootstrap.ok || cleanup.some((action) => action.action === 'conflict')) {
    return { ok: false, write, layout, actions };
  }

  if (write) {
    const applied = runBootstrap({
      target: inspection.root,
      write: true,
      updateManaged: true,
      deep: settings.deepAnalysis === 'true',
      allowLegacy: true,
      contentOverrides: { [WAYFINDER_PATH]: wayfinderContent },
    });
    if (!applied.ok) return { ok: false, write, layout, actions: [...applied.actions, ...cleanup] };
    // 新文档与 AGENTS 已落盘后才删除经过安全判定的旧文件，失败时只会保留重复副本。
    try {
      removePlannedFiles(inspection.root, cleanup);
    } catch (error) {
      if (!(error instanceof ProjectPathError)) throw error;
      return { ...projectPathFailure(error, { write, actions }), layout };
    }
  }

  return { ok: true, write, layout: 'wayfinder', migratedFrom: 'legacy', actions };
}

function parseArgs(argv) {
  return parseCliArgs(argv, {
    defaults: {
      target: process.cwd(),
      write: false,
    },
    valueOptions: {
      '--target': 'target',
    },
    booleanOptions: {
      '--write': 'write',
    },
  });
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const result = runWayfinderMigration(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
