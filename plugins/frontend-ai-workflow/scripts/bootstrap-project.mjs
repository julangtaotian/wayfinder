import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectProject } from './inspect-project.mjs';
import { BUNDLED_OPENSPEC_VERSION } from './openspec-cli.mjs';
// AI-code-start lines:1 tool:Codex
import { assertSafeProjectRoot, collectProjectScope } from './collect-project-scope.mjs';
// AI-code-start lines:5 tool:Codex
import {
  detectWorkflowLayout,
  findManagedRange,
  LEGACY_WORKFLOW_PATH,
  WAYFINDER_PATH,
} from './workflow-layout.mjs';

// AI-code-start lines:1 tool:Codex
export const WORKFLOW_VERSION = '0.10.0';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templateRoot = path.join(pluginRoot, 'assets', 'templates');

const FILES = [
  // AI-code-start lines:4 tool:Codex
  // Wayfinder 集中工作流元数据和项目导航，AGENTS 与 OpenSpec 保持外部约定位置。
  { source: 'AGENTS.md', target: 'AGENTS.md', managedKind: 'html', preserveManagedBlocks: ['deep-guardrails'], updateWhenDeep: true },
  { source: 'wayfinder/frontend.md', target: WAYFINDER_PATH, managedKind: 'html', managedBlocks: ['meta', 'scope'], requiredManagedBlocks: ['meta', 'scope', 'analysis'], updateWhenDeep: true },
  { source: 'openspec/config.yaml', target: 'openspec/config.yaml', managedKind: 'yaml' },
];

// AI-code-start lines:12 tool:Codex
function snapshotValue(scope, preservedSettings, scopeValue, settingsKey, fallback) {
  if (scope) return scopeValue;
  if (preservedSettings?.[settingsKey] !== undefined) return preservedSettings[settingsKey];
  return fallback;
}

function templateVariables(inspection, scope = null, preservedSettings = null) {
  const deepAnalysis = Boolean(scope) || preservedSettings?.deepAnalysis === 'true';
  return {
    WORKFLOW_VERSION,
    OPENSPEC_VERSION: BUNDLED_OPENSPEC_VERSION,
    PROJECT_NAME: inspection.name,
    PRESET: inspection.preset,
    TECH_STACK: inspection.techStack.join('、'),
    PACKAGE_MANAGER: inspection.packageManager,
    DEV_COMMAND: inspection.commands.dev,
    BUILD_COMMAND: inspection.commands.build,
    // AI-code-start lines:2 tool:Codex
    RELEASE_BUILD_COMMAND: inspection.commandSemantics.releaseBuild.command,
    TEST_COMMAND: inspection.commands.test,
    LINT_COMMAND: inspection.commands.lint,
    LINT_STATUS: inspection.commandSemantics.lint.status,
    TYPECHECK_COMMAND: inspection.commands.typecheck,
    VIEWS_PATH: inspection.paths.views,
    COMPONENTS_PATH: inspection.paths.components,
    REQUEST_PATH: inspection.paths.request,
    ROUTER_PATH: inspection.paths.router,
    STORE_PATH: inspection.paths.store,
    TESTS_PATH: inspection.paths.tests,
    // AI-code-start lines:5 tool:Codex
    // AI-code-start lines:12 tool:Codex
    DEEP_ANALYSIS: deepAnalysis ? 'true' : 'false',
    SCOPE_VERSION: snapshotValue(scope, preservedSettings, scope?.version, 'scopeVersion', '未执行'),
    SCOPE_INCLUDED_FILES: snapshotValue(scope, preservedSettings, scope?.summary.includedFiles, 'scopeIncludedFiles', 0),
    SCOPE_EXCLUDED_FILES: snapshotValue(scope, preservedSettings, scope?.summary.excludedFiles, 'scopeExcludedFiles', 0),
    SCOPE_INCLUDED_BYTES: snapshotValue(scope, preservedSettings, scope?.summary.includedBytes, 'scopeIncludedBytes', 0),
    SCOPE_FINGERPRINT: snapshotValue(scope, preservedSettings, scope?.fingerprint, 'scopeFingerprint', '未执行'),
    SCOPE_SCANNED_AT: snapshotValue(scope, preservedSettings, scope ? new Date().toISOString() : null, 'scopeScannedAt', '未执行'),
    SCOPE_GIT_COMMIT: snapshotValue(scope, preservedSettings, scope?.git.commit || '不可用', 'scopeGitCommit', '不可用'),
    SCOPE_GIT_DIRTY: snapshotValue(scope, preservedSettings, scope?.git.dirty ?? '不可用', 'scopeGitDirty', '不可用'),
  };
}

function renderTemplate(source, variables) {
  const rendered = source.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(variables, key)) {
      throw new Error(`模板变量缺失：${key}`);
    }
    return String(variables[key]);
  });
  if (/\{\{[A-Z_]+\}\}/.test(rendered)) {
    throw new Error('模板仍包含未替换变量');
  }
  return rendered.endsWith('\n') ? rendered : `${rendered}\n`;
}

// AI-code-start lines:12 tool:Codex
// 升级通用规则时保留深度扫描写入的项目专属硬约束，避免回退为占位内容。
function mergePreservedBlocks(existing, rendered, descriptor) {
  let merged = rendered;
  for (const block of descriptor.preserveManagedBlocks || []) {
    const marker = `frontend-ai-workflow:${block}:`;
    // 旧版模板尚未提供嵌套区块时，允许用新版占位区块安全迁移。
    if (!existing.includes(marker)) continue;
    const existingRange = findManagedRange(existing, descriptor.managedKind, block);
    const renderedRange = findManagedRange(merged, descriptor.managedKind, block);
    const existingBlock = existing.slice(existingRange.start, existingRange.end);
    merged = `${merged.slice(0, renderedRange.start)}${existingBlock}${merged.slice(renderedRange.end)}`;
  }
  return merged;
}

function replaceManagedBlocks(existing, rendered, descriptor) {
  const merged = mergePreservedBlocks(existing, rendered, descriptor);
  const requiredBlocks = descriptor.requiredManagedBlocks || descriptor.managedBlocks || [null];
  for (const block of requiredBlocks) {
    findManagedRange(existing, descriptor.managedKind, block);
    findManagedRange(merged, descriptor.managedKind, block);
  }

  // 范围区块可由脚本刷新，AI 分析区块始终保留给深度扫描流程维护。
  let nextContent = existing;
  for (const block of descriptor.managedBlocks || [null]) {
    const currentRange = findManagedRange(nextContent, descriptor.managedKind, block);
    const nextRange = findManagedRange(merged, descriptor.managedKind, block);
    const nextBlock = merged.slice(nextRange.start, nextRange.end);
    nextContent = `${nextContent.slice(0, currentRange.start)}${nextBlock}${nextContent.slice(currentRange.end)}`;
  }
  return nextContent;
}

function planFile(root, descriptor, variables, options) {
  const templatePath = path.join(templateRoot, descriptor.source);
  const targetPath = path.join(root, descriptor.target);
  const rendered = options.contentOverrides[descriptor.target]
    || renderTemplate(fs.readFileSync(templatePath, 'utf8'), variables);

  if (!fs.existsSync(targetPath)) {
    if (options.onlyManaged) {
      return { file: descriptor.target, action: 'skip', reason: '升级不创建缺失文件' };
    }
    return { file: descriptor.target, action: 'create', content: rendered };
  }

  const mayUpdate = options.updateManaged || (options.deep && descriptor.updateWhenDeep);
  if (!mayUpdate || !descriptor.managedKind) {
    return { file: descriptor.target, action: 'skip', reason: '文件已存在，未覆盖' };
  }

  try {
    const existing = fs.readFileSync(targetPath, 'utf8');
    const content = replaceManagedBlocks(existing, rendered, descriptor);
    if (content === existing) {
      return { file: descriptor.target, action: 'unchanged', reason: '受管区块已是最新' };
    }
    return { file: descriptor.target, action: 'update', content };
  } catch (error) {
    return { file: descriptor.target, action: 'conflict', reason: error.message };
  }
}

export function runBootstrap({
  target = process.cwd(),
  write = false,
  updateManaged = false,
  onlyManaged = false,
  deep = false,
  allowLegacy = false,
  preservedScopeSettings = null,
  contentOverrides = {},
} = {}) {
  const inspection = inspectProject(target);
  // AI-code-start lines:7 tool:Codex
  assertSafeProjectRoot(inspection.root);
  // AI-code-start lines:12 tool:Codex
  // 旧布局只能由显式迁移调用接管，普通初始化和升级不得隐式产生两套上下文。
  const layout = detectWorkflowLayout(inspection.root);
  if (layout === 'legacy' && !allowLegacy) {
    return {
      ok: true,
      write,
      version: WORKFLOW_VERSION,
      layout,
      migrationRequired: true,
      inspection,
      scope: null,
      actions: [{ file: LEGACY_WORKFLOW_PATH, action: 'skip', reason: '检测到旧工作流布局，请先执行 Wayfinder 迁移预览' }],
    };
  }
  const scope = deep ? collectProjectScope(inspection.root) : null;
  // AI-code-start lines:1 tool:Codex
  const variables = templateVariables(inspection, scope, preservedScopeSettings);
  // AI-code-start lines:1 tool:Codex
  const descriptors = FILES;
  const planned = descriptors.map((descriptor) =>
    planFile(inspection.root, descriptor, variables, { updateManaged, onlyManaged, deep, contentOverrides }),
  );

  if (planned.some((item) => item.action === 'conflict')) {
    return { ok: false, write, version: WORKFLOW_VERSION, layout, inspection, scope, actions: publicActions(planned) };
  }

  if (write) {
    for (const item of planned) {
      if (!['create', 'update'].includes(item.action)) continue;
      const targetPath = path.join(inspection.root, item.file);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, item.content, 'utf8');
    }
  }

  return { ok: true, write, version: WORKFLOW_VERSION, layout: 'wayfinder', inspection, scope, actions: publicActions(planned) };
}

function publicActions(actions) {
  return actions.map(({ content, ...item }) => item);
}

function parseArgs(argv) {
  const args = { target: process.cwd(), write: false, updateManaged: false, onlyManaged: false, deep: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--target') {
      args.target = argv[index + 1];
      index += 1;
    } else if (arg === '--write') {
      args.write = true;
    } else if (arg === '--update-managed') {
      args.updateManaged = true;
    } else if (arg === '--only-managed') {
      args.onlyManaged = true;
    // AI-code-start lines:2 tool:Codex
    } else if (arg === '--deep') {
      args.deep = true;
    }
  }
  return args;
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const result = runBootstrap(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
