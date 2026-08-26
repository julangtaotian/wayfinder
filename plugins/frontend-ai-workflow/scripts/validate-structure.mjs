import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BUNDLED_OPENSPEC_VERSION, inspectBundledOpenSpec } from './openspec-cli.mjs';
import {
  BUNDLED_PLAYWRIGHT_VERSION,
  SUPPORTED_PLAYWRIGHT_PLATFORMS,
  inspectBundledPlaywright,
  readPlaywrightDistribution,
  verifyPlaywrightIntegrity,
} from './playwright-runtime.mjs';
import { PLATFORM_PLUGIN_SIZE_BUDGETS, measureLogicalSize } from './package-plugin-platform.mjs';
import { WORKFLOW_VERSION } from './bootstrap-project.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(scriptDir, '..');
const repositoryRoot = path.resolve(pluginRoot, '..', '..');
const PUBLIC_SKILLS = [
  'frontend-change',
  'frontend-requirement-write',
  'frontend-test',
  'frontend-ui-fix',
  'frontend-ui-review',
  'frontend-ui-verify',
  'frontend-workflow-bootstrap',
  'frontend-workflow-check',
  'frontend-workflow-upgrade',
];
const INTERNAL_WORKFLOW_REFERENCES = [
  'apply-change.md',
  'archive-change.md',
  'explore.md',
  'propose.md',
  'sync-specs.md',
  'update-change.md',
];
// 深度模式依赖这些固定资产，缺失时插件不能承诺可审计的项目分析。
const DEEP_ANALYSIS_ASSETS = [
  'scripts/collect-project-scope.mjs',
  'scripts/migrate-wayfinder-project.mjs',
  'assets/templates/wayfinder/frontend.md',
  'references/deep-project-analysis.md',
];
// 需求决策校验器是跨文档一致性的固定能力，必须随插件一起发布。
const REQUIREMENT_DECISION_ASSETS = [
  'scripts/validate-requirement-decisions.mjs',
];
// 旧需求预览与矩阵校验共同构成 P2 的安全迁移能力，发布时必须齐备。
const REQUIREMENT_MIGRATION_ASSETS = [
  'scripts/preview-requirement-upgrade.mjs',
  'scripts/requirement-archive.mjs',
  'references/requirement-guidelines.md',
];
const DELIVERY_GUARD_ASSETS = [
  'scripts/check-change.mjs',
  'scripts/check-project-output.mjs',
  'scripts/finalize-change.mjs',
  'scripts/project-path-safety.mjs',
  'scripts/repository-footprint.mjs',
  'references/cross-platform-ci-checklist.md',
];
const PROJECT_PROFILE_ASSETS = [
  'scripts/project-target-profile.mjs',
  'references/project-detection.md',
];
const TEST_WORKFLOW_ASSETS = [
  'scripts/inspect-test-context.mjs',
  'scripts/validate-test-plan.mjs',
  'scripts/verification-evidence.mjs',
  'scripts/verification-evidence-foundation.mjs',
  'scripts/verification-semantics.mjs',
  'assets/templates/openspec/test-plan.md',
  'references/test-case-guidelines.md',
];
const CORE_MODULAR_ASSETS = [
  'scripts/real-project-validation.mjs',
  'scripts/real-project-validation-foundation.mjs',
];
// 完整性脚本与受管清单必须共同发布，避免安装后只能生成却无法复核运行时。
const RUNTIME_INTEGRITY_ASSETS = [
  'scripts/runtime-integrity.mjs',
  'runtime/openspec-integrity.json',
];
// UI 验收的状态合同、报告器、模板和共享说明必须作为一个整体发布。
const UI_REVIEW_ASSETS = [
  'scripts/ui-review-contract.mjs',
  'scripts/ui-review-config.mjs',
  'scripts/ui-review-plan.mjs',
  'scripts/ui-review-state.mjs',
  'scripts/ui-review-storage.mjs',
  'scripts/ui-review-workflow-cli.mjs',
  'scripts/ui-review-workflow.mjs',
  'scripts/ui-review-runner.mjs',
  'scripts/ui-review-report.mjs',
  'scripts/playwright-adapter-runner.mjs',
  'scripts/playwright-runtime.mjs',
  'scripts/build-playwright-platform.mjs',
  'scripts/package-plugin-platform.mjs',
  'scripts/ui-review-interactions.mjs',
  'scripts/ui-review-comparator.mjs',
  'assets/templates/ui-review/config.json',
  'assets/templates/ui-review/playwright-adapter.mjs',
  'references/ui-review-workflow.md',
];
const UI_REVIEW_FILE_LIMITS = new Map([
  ['plugins/frontend-ai-workflow/scripts/ui-review-workflow.mjs', 120],
  ['plugins/frontend-ai-workflow/scripts/ui-review-contract.mjs', 500],
  ['plugins/frontend-ai-workflow/scripts/ui-review-config.mjs', 500],
  ['plugins/frontend-ai-workflow/scripts/ui-review-plan.mjs', 500],
  ['plugins/frontend-ai-workflow/scripts/ui-review-state.mjs', 500],
  ['plugins/frontend-ai-workflow/scripts/ui-review-storage.mjs', 500],
  ['plugins/frontend-ai-workflow/scripts/ui-review-workflow-cli.mjs', 500],
  ['tests/ui-review-automation.test.mjs', 80],
  ['tests/ui-review-automation/fixtures.mjs', 500],
  ['tests/ui-review-automation/config.cases.mjs', 500],
  ['tests/ui-review-automation/state.cases.mjs', 500],
  ['tests/ui-review-automation/comparison.cases.mjs', 500],
  ['tests/ui-review-automation/runtime-capture.cases.mjs', 500],
  ['tests/ui-review-automation/cli-contract.cases.mjs', 500],
]);
const UI_REVIEW_PUBLIC_EXPORTS = [
  'BUNDLED_UI_REVIEW_ADAPTER',
  'DEFAULT_UI_REVIEW_CONFIG',
  'UI_REVIEW_CONFIG_VERSION',
  'UI_REVIEW_STATE_VERSION',
  'completeRepairRun',
  'completeReviewRun',
  'completeVerifyRun',
  'createCapturePlan',
  'createReviewRun',
  'createVerifyRun',
  'evaluateRepairGate',
  'loadUiReviewConfig',
  'normalizeUiFinding',
  'normalizeUiReviewConfig',
  'readRunState',
  'resolveSafeProjectPath',
  'runUiReviewWorkflowCli',
  'writeRunState',
];
const UI_REVIEW_LAYER_ORDER = [
  'ui-review-contract.mjs',
  'ui-review-config.mjs',
  'ui-review-plan.mjs',
  'ui-review-state.mjs',
  'ui-review-storage.mjs',
  'ui-review-workflow-cli.mjs',
  'ui-review-workflow.mjs',
];
const PLAYWRIGHT_SHARED_RUNTIME_ASSETS = [
  'runtime/playwright/package.json',
  'runtime/playwright/package-lock.json',
  'runtime/playwright/integrity/shared.json',
  'runtime/playwright/node_modules/playwright/LICENSE',
  'runtime/playwright/node_modules/playwright-core/LICENSE',
  'runtime/playwright/node_modules/pngjs/LICENSE',
  'runtime/playwright/node_modules/pixelmatch/LICENSE',
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function validatePlugin(errors) {
  const manifestPath = path.join(pluginRoot, '.codex-plugin', 'plugin.json');
  const manifest = readJson(manifestPath);
  if (manifest.name !== 'frontend-ai-workflow') errors.push('plugin name 必须为 frontend-ai-workflow');
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version || '')) {
    errors.push('plugin version 不是有效 semver');
  }
  if (!manifest.description || !manifest.author?.name) errors.push('plugin manifest 缺少描述或作者');
  if (manifest.skills !== './skills/') errors.push('plugin skills 路径必须为 ./skills/');
  const releaseVersion = String(manifest.version || '').split('+', 1)[0];
  const packageVersion = readJson(path.join(repositoryRoot, 'package.json')).version;
  if (releaseVersion !== packageVersion) errors.push(`plugin 与根 package 版本不一致：${releaseVersion} / ${packageVersion}`);
  if (releaseVersion !== WORKFLOW_VERSION) errors.push(`plugin 与受管工作流版本不一致：${releaseVersion} / ${WORKFLOW_VERSION}`);
  if (!Array.isArray(manifest.interface?.defaultPrompt) || manifest.interface.defaultPrompt.length > 3) {
    errors.push('plugin defaultPrompt 必须是最多 3 项的数组');
  }
}

function validateRuntime(errors) {
  const runtime = inspectBundledOpenSpec();
  if (!runtime.available) {
    errors.push(`插件内置 OpenSpec 运行时不可用：${runtime.error?.message || '未知错误'}`);
    return;
  }
  if (runtime.version !== BUNDLED_OPENSPEC_VERSION) {
    errors.push(`插件内置 OpenSpec 版本不一致：${runtime.version}`);
  }
  if (!fs.existsSync(path.join(pluginRoot, 'runtime', 'openspec', 'LICENSE'))) {
    errors.push('插件内置 OpenSpec 运行时缺少 LICENSE');
  }
}

function validateMarketplace(errors) {
  const marketplace = readJson(path.join(repositoryRoot, '.agents', 'plugins', 'marketplace.json'));
  const entry = marketplace.plugins?.find((item) => item.name === 'frontend-ai-workflow');
  if (!entry) {
    errors.push('marketplace 缺少 frontend-ai-workflow');
    return;
  }
  if (entry.source?.path !== './plugins/frontend-ai-workflow') errors.push('marketplace source.path 不正确');
  if (!entry.policy?.installation || !entry.policy?.authentication || !entry.category) {
    errors.push('marketplace entry 缺少 policy 或 category');
  }
}

function validateSkills(errors) {
  const skillsRoot = path.join(pluginRoot, 'skills');
  const skillDirs = fs.readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (!skillDirs.length) errors.push('插件没有技能');
  const publicNames = skillDirs.map((entry) => entry.name).sort();
  if (JSON.stringify(publicNames) !== JSON.stringify(PUBLIC_SKILLS)) {
    errors.push(`公开技能必须严格限定为：${PUBLIC_SKILLS.join('、')}`);
  }

  for (const entry of skillDirs) {
    const skillPath = path.join(skillsRoot, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      errors.push(`技能缺少 SKILL.md：${entry.name}`);
      continue;
    }
    const content = fs.readFileSync(skillPath, 'utf8');
    if (!content.startsWith('---\n') || !content.includes(`name: ${entry.name}`) || !content.includes('description:')) {
      errors.push(`技能 frontmatter 异常：${entry.name}`);
    }
    if (content.includes('[TODO:')) errors.push(`技能仍包含 TODO：${entry.name}`);
    const metadataPath = path.join(skillsRoot, entry.name, 'agents', 'openai.yaml');
    if (!fs.existsSync(metadataPath)) errors.push(`技能缺少 agents/openai.yaml：${entry.name}`);
  }

  const fixMetadata = path.join(skillsRoot, 'frontend-ui-fix', 'agents', 'openai.yaml');
  if (fs.existsSync(fixMetadata) && !fs.readFileSync(fixMetadata, 'utf8').includes('allow_implicit_invocation: false')) {
    errors.push('frontend-ui-fix 必须禁止隐式调用');
  }

  const referenceRoot = path.join(pluginRoot, 'references', 'openspec');
  for (const file of INTERNAL_WORKFLOW_REFERENCES) {
    if (!fs.existsSync(path.join(referenceRoot, file))) errors.push(`缺少内部流程参考：${file}`);
  }
}

function validateDeepAnalysisAssets(errors) {
  for (const file of DEEP_ANALYSIS_ASSETS) {
    if (!fs.existsSync(path.join(pluginRoot, file))) errors.push(`缺少深度分析资产：${file}`);
  }
}

function validateRequirementDecisionAssets(errors) {
  for (const file of REQUIREMENT_DECISION_ASSETS) {
    if (!fs.existsSync(path.join(pluginRoot, file))) errors.push(`缺少需求决策资产：${file}`);
  }
}

function validateRequirementMigrationAssets(errors) {
  for (const file of REQUIREMENT_MIGRATION_ASSETS) {
    if (!fs.existsSync(path.join(pluginRoot, file))) errors.push(`缺少需求迁移资产：${file}`);
  }
}

function validateDeliveryGuardAssets(errors) {
  for (const file of DELIVERY_GUARD_ASSETS) {
    if (!fs.existsSync(path.join(pluginRoot, file))) errors.push(`缺少交付门禁资产：${file}`);
  }
}

function validateProjectProfileAssets(errors) {
  for (const file of PROJECT_PROFILE_ASSETS) {
    if (!fs.existsSync(path.join(pluginRoot, file))) errors.push(`缺少项目画像资产：${file}`);
  }
}

function validateTestWorkflowAssets(errors) {
  for (const file of TEST_WORKFLOW_ASSETS) {
    if (!fs.existsSync(path.join(pluginRoot, file))) errors.push(`缺少测试用例工作流资产：${file}`);
  }
}

function validateCoreModularAssets(errors) {
  for (const file of CORE_MODULAR_ASSETS) {
    if (!fs.existsSync(path.join(pluginRoot, file))) errors.push(`缺少核心模块化资产：${file}`);
  }
}

function validateRuntimeIntegrityAssets(errors) {
  for (const file of RUNTIME_INTEGRITY_ASSETS) {
    if (!fs.existsSync(path.join(pluginRoot, file))) errors.push(`缺少运行时完整性资产：${file}`);
  }
}

function validateUiReviewAssets(errors) {
  for (const file of UI_REVIEW_ASSETS) {
    if (!fs.existsSync(path.join(pluginRoot, file))) errors.push(`缺少 UI 验收资产：${file}`);
  }
}

async function validateUiReviewStructure(errors, distribution) {
  for (const [file, limit] of UI_REVIEW_FILE_LIMITS) {
    if (distribution.kind === 'platform' && file.startsWith('tests/')) continue;
    const absolutePath = path.join(repositoryRoot, file);
    if (!fs.existsSync(absolutePath)) {
      errors.push(`缺少 UI 验收模块化文件：${file}`);
      continue;
    }
    const lines = fs.readFileSync(absolutePath, 'utf8').trimEnd().split(/\r?\n/u).length;
    if (lines > limit) errors.push(`UI 验收模块超过 ${limit} 行：${file}（${lines} 行）`);
  }

  const entryPath = path.join(pluginRoot, 'scripts', 'ui-review-workflow.mjs');
  if (fs.existsSync(entryPath)) {
    const publicModule = await import(pathToFileURL(entryPath).href);
    const actualExports = Object.keys(publicModule).sort();
    const expectedExports = [...UI_REVIEW_PUBLIC_EXPORTS].sort();
    if (JSON.stringify(actualExports) !== JSON.stringify(expectedExports)) {
      errors.push(`UI 验收公共导出必须严格限定为：${expectedExports.join('、')}`);
    }
  }

  // 领域层只能依赖更底层模块，避免兼容门面或 CLI 反向渗透到核心合同。
  const layerIndex = new Map(UI_REVIEW_LAYER_ORDER.map((file, index) => [file, index]));
  for (const file of UI_REVIEW_LAYER_ORDER) {
    const source = fs.readFileSync(path.join(pluginRoot, 'scripts', file), 'utf8');
    for (const match of source.matchAll(/from '\.\/(ui-review-[^']+\.mjs)'/gu)) {
      const dependency = match[1];
      if (layerIndex.has(dependency) && layerIndex.get(dependency) >= layerIndex.get(file)) {
        errors.push(`UI 验收模块依赖方向错误：${file} -> ${dependency}`);
      }
    }
  }
}

function validatePlaywrightRuntime(errors, distribution) {
  const platformKeys = distribution.kind === 'platform'
    ? [distribution.platformKey]
    : SUPPORTED_PLAYWRIGHT_PLATFORMS;
  const requiredAssets = [
    ...PLAYWRIGHT_SHARED_RUNTIME_ASSETS,
    ...platformKeys.flatMap((platformKey) => [
      `runtime/playwright/platforms/${platformKey}.json`,
      `runtime/playwright/integrity/${platformKey}.json`,
    ]),
  ];
  if (distribution.kind === 'platform') requiredAssets.push('runtime/playwright/distribution.json');
  for (const file of requiredAssets) {
    if (!fs.existsSync(path.join(pluginRoot, file))) errors.push(`缺少 Playwright 运行时资产：${file}`);
  }
  const runtime = inspectBundledPlaywright();
  if (!runtime.valid) {
    errors.push(`插件内置 Playwright 运行时不可用：${runtime.reason || '未知错误'}`);
  } else if (runtime.version !== BUNDLED_PLAYWRIGHT_VERSION) {
    errors.push(`插件内置 Playwright 版本不一致：${runtime.version}`);
  }
  const integrity = verifyPlaywrightIntegrity({ verifyAllPlatforms: true });
  if (!integrity.ok) errors.push(`Playwright 跨平台完整性校验失败：${integrity.errors.join('；')}`);
  if (distribution.kind === 'platform') {
    const expectedBudget = PLATFORM_PLUGIN_SIZE_BUDGETS[distribution.platformKey];
    if (distribution.budgetBytes !== expectedBudget) {
      errors.push(`平台成品体积预算不一致：${distribution.budgetBytes} / ${expectedBudget}`);
    }
    if (distribution.stripped !== (distribution.platformKey === 'linux-arm64')) {
      errors.push(`平台成品去符号标记不正确：${distribution.platformKey}`);
    }
    const sizeBytes = measureLogicalSize(pluginRoot);
    if (sizeBytes > expectedBudget) errors.push(`平台成品超过体积预算：${sizeBytes} > ${expectedBudget}`);
  }
}

const errors = [];
try {
  const distribution = readPlaywrightDistribution();
  validatePlugin(errors);
  validateRuntime(errors);
  validateMarketplace(errors);
  validateSkills(errors);
  validateDeepAnalysisAssets(errors);
  validateRequirementDecisionAssets(errors);
  validateRequirementMigrationAssets(errors);
  validateDeliveryGuardAssets(errors);
  validateProjectProfileAssets(errors);
  validateTestWorkflowAssets(errors);
  validateCoreModularAssets(errors);
  validateRuntimeIntegrityAssets(errors);
  validateUiReviewAssets(errors);
  await validateUiReviewStructure(errors, distribution);
  validatePlaywrightRuntime(errors, distribution);
} catch (error) {
  errors.push(error.message);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Frontend AI Workflow structure is valid.');
}
