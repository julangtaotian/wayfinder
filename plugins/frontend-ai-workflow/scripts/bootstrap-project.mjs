import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCliArgs } from './cli-arguments.mjs';
import { inspectProject } from './inspect-project.mjs';
import { BUNDLED_OPENSPEC_VERSION } from './openspec-cli.mjs';
import { assertSafeProjectRoot, collectProjectScope } from './collect-project-scope.mjs';
import {
  ProjectPathError,
  atomicWriteProjectFile,
  projectPathFailure,
  resolveSafeProjectPath,
} from './project-path-safety.mjs';
import {
  detectWorkflowLayout,
  findManagedRange,
  LEGACY_WORKFLOW_PATH,
  WAYFINDER_PATH,
} from './workflow-layout.mjs';

export const WORKFLOW_VERSION = '0.17.1';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templateRoot = path.join(pluginRoot, 'assets', 'templates');

const FILES = [
  // Wayfinder 集中工作流元数据和项目导航，AGENTS 与 OpenSpec 保持外部约定位置。
  { source: 'AGENTS.md', target: 'AGENTS.md', managedKind: 'html', preserveManagedBlocks: ['deep-guardrails'], updateWhenDeep: true },
  { source: 'wayfinder/frontend.md', target: WAYFINDER_PATH, managedKind: 'html', managedBlocks: ['meta', 'facts', 'scope'], requiredManagedBlocks: ['meta', 'facts', 'scope', 'analysis'], migrateManagedBlocks: ['facts'], updateWhenDeep: true },
  { source: 'openspec/config.yaml', target: 'openspec/config.yaml', managedKind: 'yaml', updateWhenDeep: true },
];

function snapshotValue(scope, preservedSettings, scopeValue, settingsKey, fallback) {
  if (scope) return scopeValue;
  if (preservedSettings?.[settingsKey] !== undefined) return preservedSettings[settingsKey];
  return fallback;
}

function nonNegativeInteger(value, fallback = '0') {
  return /^\d+$/u.test(String(value)) ? String(value) : fallback;
}

// 范围扫描与项目地图是两阶段工作：重新扫描时必须让旧地图显式失效，不能沿用“已完成”结论。
function analysisStateVariables(scope, preservedSettings) {
  if (scope) {
    return {
      status: 'pending',
      coveredFiles: '0',
      updatedAt: '未完成',
    };
  }
  if (preservedSettings?.deepAnalysis === 'true') {
    const status = ['pending', 'partial', 'complete'].includes(preservedSettings.analysisStatus)
      ? preservedSettings.analysisStatus
      : 'pending';
    return {
      status,
      coveredFiles: nonNegativeInteger(preservedSettings.analysisCoveredFiles),
      updatedAt: preservedSettings.analysisUpdatedAt || '未完成',
    };
  }
  return {
    status: 'not-requested',
    coveredFiles: '0',
    updatedAt: '未执行',
  };
}

function platformCommandSummary(platformCommands) {
  if (!platformCommands.targets.length) return '未识别';
  return platformCommands.targets.map(({ target, devCandidates, buildCandidates }) => {
    const dev = devCandidates.length
      ? devCandidates.map(({ command }) => command).join('、')
      : '未识别';
    const build = buildCandidates.length
      ? buildCandidates.map(({ command }) => command).join('、')
      : '未识别';
    return `${target}（开发候选：${dev}；构建候选：${build}）`;
  }).join('；');
}

function testCommandSummary(inspection) {
  if (inspection.commandSemantics.test.status === 'placeholder') {
    return `不可用（${inspection.commandSemantics.test.command} 为失败占位脚本）`;
  }
  return inspection.commands.test;
}

function testEntryGuidance(inspection) {
  if (inspection.commandSemantics.test.status === 'detected') {
    return `检测到的测试入口为 \`${inspection.commands.test}\`，仍需按本次影响面选择最窄验证。`;
  }
  if (inspection.commandSemantics.test.status === 'placeholder') {
    return `\`${inspection.commandSemantics.test.command}\` 是失败占位脚本，不得运行它充当测试证据；改动需记录适用的聚焦验证、人工验证和剩余风险。`;
  }
  return '项目当前没有可用测试入口；改动需记录适用的聚焦验证、人工验证和剩余风险。';
}

function platformVerificationGuidance(inspection) {
  if (inspection.platformCommands.status === 'detected') {
    return '检测到的平台脚本只是候选；执行前确认发布目标，执行后记录实际命令、环境与结果。';
  }
  if (inspection.targetProfile.platform.frameworks.includes('wechat-native')) {
    return '原生微信小程序未提供显式平台脚本；开发、预览、上传与真机验证需记录微信开发者工具或外部 CI 的环境和结果。';
  }
  if (inspection.targetProfile.platform.kind !== 'unknown') {
    return '已识别平台框架但未提供显式平台脚本；需求与变更需记录人工开发工具或外部 CI 的环境和结果。';
  }
  return '未识别额外平台命令；只按仓库实际存在的开发、构建和测试入口验证。';
}

function templateVariables(inspection, scope = null, preservedSettings = null) {
  const deepAnalysis = Boolean(scope) || preservedSettings?.deepAnalysis === 'true';
  const analysis = analysisStateVariables(scope, preservedSettings);
  const targetEvidence = inspection.targetProfile.evidence.length
    ? inspection.targetProfile.evidence.join('、')
    : '未识别';
  const platformFrameworks = inspection.targetProfile.platform.frameworks.length
    ? inspection.targetProfile.platform.frameworks.join('、')
    : '未识别';
  const platformEvidence = inspection.targetProfile.platform.evidence.length
    ? inspection.targetProfile.platform.evidence.join('、')
    : '未识别';
  const platformCommandTargets = inspection.platformCommands.targets.length
    ? inspection.platformCommands.targets.map(({ target }) => target).join('、')
    : '未识别';
  const platformCommandEvidence = inspection.platformCommands.evidence.length
    ? inspection.platformCommands.evidence.join('、')
    : '未识别';
  return {
    WORKFLOW_VERSION,
    OPENSPEC_VERSION: BUNDLED_OPENSPEC_VERSION,
    PROJECT_NAME: inspection.name,
    PRESET: inspection.preset,
    TECH_STACK: inspection.techStack.join('、'),
    DEPENDENCY_PROFILE_SCHEMA: inspection.dependencyProfile.schemaVersion,
    DEPENDENCY_PROFILE_SOURCE: inspection.dependencyProfile.source,
    DEPENDENCY_PACKAGE_COUNT: inspection.dependencyProfile.totalPackages,
    DEPENDENCY_SUMMARY_STATUS: inspection.dependencyProfile.summary.status,
    DEPENDENCY_SUMMARY_DISPLAYED: inspection.dependencyProfile.summary.displayedPackages,
    DEPENDENCY_SUMMARY_OMITTED: inspection.dependencyProfile.summary.omittedPackages,
    DEPENDENCY_SUMMARY: inspection.dependencyProfile.summary.text,
    TARGET_FORM_FACTOR: inspection.targetProfile.formFactor,
    TARGET_PROFILE_SOURCE: inspection.targetProfile.source,
    TARGET_PROFILE_EVIDENCE: targetEvidence,
    TARGET_PLATFORM_KIND: inspection.targetProfile.platform.kind,
    TARGET_PLATFORM_FRAMEWORKS: platformFrameworks,
    TARGET_PLATFORM_SOURCE: inspection.targetProfile.platform.source,
    TARGET_PLATFORM_EVIDENCE: platformEvidence,
    PLATFORM_COMMAND_STATUS: inspection.platformCommands.status,
    PLATFORM_COMMAND_TARGETS: platformCommandTargets,
    PLATFORM_COMMAND_EVIDENCE: platformCommandEvidence,
    PLATFORM_COMMAND_SUMMARY: platformCommandSummary(inspection.platformCommands),
    PLATFORM_VERIFICATION_GUIDANCE: platformVerificationGuidance(inspection),
    PACKAGE_MANAGER: inspection.packageManager,
    DEV_COMMAND: inspection.commands.dev,
    BUILD_COMMAND: inspection.commands.build,
    RELEASE_BUILD_COMMAND: inspection.commandSemantics.releaseBuild.command,
    TEST_COMMAND: testCommandSummary(inspection),
    TEST_STATUS: inspection.commandSemantics.test.status,
    TEST_ENTRY_GUIDANCE: testEntryGuidance(inspection),
    LINT_COMMAND: inspection.commands.lint,
    LINT_STATUS: inspection.commandSemantics.lint.status,
    TYPECHECK_COMMAND: inspection.commands.typecheck,
    VIEWS_PATH: inspection.paths.views,
    COMPONENTS_PATH: inspection.paths.components,
    REQUEST_PATH: inspection.paths.request,
    ROUTER_PATH: inspection.paths.router,
    STORE_PATH: inspection.paths.store,
    TESTS_PATH: inspection.paths.tests,
    DEEP_ANALYSIS: deepAnalysis ? 'true' : 'false',
    DEEP_ANALYSIS_LABEL: deepAnalysis ? '已启用' : '未启用（普通初始化仅生成可追溯的识别基线）',
    ANALYSIS_STATUS: analysis.status,
    ANALYSIS_COVERED_FILES: analysis.coveredFiles,
    ANALYSIS_UPDATED_AT: analysis.updatedAt,
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

function findLegacyWayfinderFactsRange(content) {
  const heading = '## 项目概览';
  const start = content.indexOf(heading);
  if (start < 0 || start !== content.lastIndexOf(heading)) {
    throw new Error('旧 Wayfinder 项目事实区域缺少唯一的“项目概览”标题');
  }
  const scopeRange = findManagedRange(content, 'html', 'scope');
  if (start >= scopeRange.start) throw new Error('旧 Wayfinder 项目事实区域顺序异常');
  return { start, end: scopeRange.start };
}

// 旧版 Wayfinder 的人类可读项目事实没有标记，只允许按稳定标题边界迁移一次。
function migrateManagedBlocks(existing, rendered, descriptor) {
  let migrated = existing;
  for (const block of descriptor.migrateManagedBlocks || []) {
    const marker = `frontend-ai-workflow:${block}:`;
    if (migrated.includes(marker)) continue;
    if (descriptor.target !== WAYFINDER_PATH || block !== 'facts') {
      throw new Error(`没有可用的受管区块迁移规则：${block}`);
    }
    const currentRange = findLegacyWayfinderFactsRange(migrated);
    const nextRange = findManagedRange(rendered, descriptor.managedKind, block);
    const nextBlock = rendered.slice(nextRange.start, nextRange.end);
    migrated = `${migrated.slice(0, currentRange.start)}${nextBlock}\n\n${migrated.slice(currentRange.end)}`;
  }
  return migrated;
}

function replaceManagedBlocks(existing, rendered, descriptor) {
  const merged = mergePreservedBlocks(existing, rendered, descriptor);
  const migrated = migrateManagedBlocks(existing, merged, descriptor);
  const requiredBlocks = descriptor.requiredManagedBlocks || descriptor.managedBlocks || [null];
  for (const block of requiredBlocks) {
    findManagedRange(migrated, descriptor.managedKind, block);
    findManagedRange(merged, descriptor.managedKind, block);
  }

  // 范围区块可由脚本刷新，AI 分析区块始终保留给深度扫描流程维护。
  let nextContent = migrated;
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
  const targetPath = resolveSafeProjectPath(root, descriptor.target, '受管目标').absolutePath;
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
    if (error instanceof ProjectPathError) throw error;
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
  assertSafeProjectRoot(inspection.root);
  let layout = null;
  let scope = null;
  let planned = [];
  try {
    // 预览与写入共享相同预检，避免规划阶段先跟随项目内链接读取现有内容。
    for (const descriptor of FILES) {
      resolveSafeProjectPath(inspection.root, descriptor.target, '受管目标');
    }
    resolveSafeProjectPath(inspection.root, LEGACY_WORKFLOW_PATH, '旧工作流元数据');
    // 旧布局只能由显式迁移调用接管，普通初始化和升级不得隐式产生两套上下文。
    layout = detectWorkflowLayout(inspection.root);
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
    scope = deep ? collectProjectScope(inspection.root) : null;
    const variables = templateVariables(inspection, scope, preservedScopeSettings);
    planned = FILES.map((descriptor) =>
      planFile(inspection.root, descriptor, variables, { updateManaged, onlyManaged, deep, contentOverrides }),
    );

    if (planned.some((item) => item.action === 'conflict')) {
      return { ok: false, write, version: WORKFLOW_VERSION, layout, inspection, scope, actions: publicActions(planned) };
    }

    if (write) {
      for (const item of planned) {
        if (!['create', 'update'].includes(item.action)) continue;
        atomicWriteProjectFile(inspection.root, item.file, item.content, { label: '受管目标' });
      }
    }
  } catch (error) {
    if (!(error instanceof ProjectPathError)) throw error;
    return {
      ...projectPathFailure(error, { write, actions: publicActions(planned) }),
      version: WORKFLOW_VERSION,
      layout,
      inspection,
      scope,
    };
  }

  return { ok: true, write, version: WORKFLOW_VERSION, layout: 'wayfinder', inspection, scope, actions: publicActions(planned) };
}

function publicActions(actions) {
  return actions.map(({ content, ...item }) => item);
}

function parseArgs(argv) {
  return parseCliArgs(argv, {
    defaults: {
      target: process.cwd(),
      write: false,
      updateManaged: false,
      onlyManaged: false,
      deep: false,
    },
    valueOptions: {
      '--target': 'target',
    },
    booleanOptions: {
      '--write': 'write',
      '--update-managed': 'updateManaged',
      '--only-managed': 'onlyManaged',
      '--deep': 'deep',
    },
  });
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
