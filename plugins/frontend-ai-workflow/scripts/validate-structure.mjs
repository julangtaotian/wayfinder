import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUNDLED_OPENSPEC_VERSION, inspectBundledOpenSpec } from './openspec-cli.mjs';
import { WORKFLOW_VERSION } from './bootstrap-project.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(scriptDir, '..');
const repositoryRoot = path.resolve(pluginRoot, '..', '..');
const PUBLIC_SKILLS = [
  'frontend-change',
  'frontend-requirement-write',
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
  'references/requirement-guidelines.md',
];
const DELIVERY_GUARD_ASSETS = [
  'scripts/check-change.mjs',
  'scripts/finalize-change.mjs',
];
const PROJECT_PROFILE_ASSETS = [
  'scripts/project-target-profile.mjs',
  'references/project-detection.md',
];
// 完整性脚本与受管清单必须共同发布，避免安装后只能生成却无法复核运行时。
const RUNTIME_INTEGRITY_ASSETS = [
  'scripts/runtime-integrity.mjs',
  'runtime/openspec-integrity.json',
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

function validateRuntimeIntegrityAssets(errors) {
  for (const file of RUNTIME_INTEGRITY_ASSETS) {
    if (!fs.existsSync(path.join(pluginRoot, file))) errors.push(`缺少运行时完整性资产：${file}`);
  }
}

const errors = [];
try {
  validatePlugin(errors);
  validateRuntime(errors);
  validateMarketplace(errors);
  validateSkills(errors);
  validateDeepAnalysisAssets(errors);
  validateRequirementDecisionAssets(errors);
  validateRequirementMigrationAssets(errors);
  validateDeliveryGuardAssets(errors);
  validateProjectProfileAssets(errors);
  validateRuntimeIntegrityAssets(errors);
} catch (error) {
  errors.push(error.message);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Frontend AI Workflow structure is valid.');
}
