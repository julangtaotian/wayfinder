import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CHECK_PROJECT_OBSERVATION_SAMPLE_LIMIT,
  formatProjectCheckOutput,
  summarizeProjectCheck,
} from '../plugins/frontend-ai-workflow/scripts/check-project-output.mjs';
import {
  AUTOMATIC_CONTEXT_BUDGETS,
  validateAutomaticContextBudgets,
} from '../plugins/frontend-ai-workflow/scripts/context-budget.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function completeResult() {
  const observations = Array.from({ length: 8 }, (_, index) => ({
    code: index < 6 ? 'wxml-attribute-spacing' : 'other-observation',
    path: `src/page-${index}.wxml`,
    line: index + 1,
  }));
  return {
    ok: true,
    root: '/workspace/project',
    layout: 'wayfinder',
    dependencyProfile: {
      schemaVersion: '1.0.0',
      totalPackages: 2,
      packages: [
        { name: 'vue', declarations: [{ group: 'dependencies', specifier: '^3.5.0' }] },
        { name: 'vite', declarations: [{ group: 'devDependencies', specifier: '^6.0.0' }] },
      ],
    },
    commands: { test: 'npm run test' },
    deepAnalysis: {
      enabled: true,
      observations,
      freshness: { checked: true, stale: false },
    },
    errors: [],
    warnings: [],
  };
}

function pluginRepositoryResult() {
  return {
    ...completeResult(),
    root: '/workspace/plugin-repository',
    layout: 'none',
    repositoryKind: 'plugin-repository',
    pluginRepository: {
      kind: 'plugin-repository',
      status: 'healthy',
      marketplace: '.agents/plugins/marketplace.json',
      plugins: [{
        name: 'frontend-ai-workflow',
        path: 'plugins/frontend-ai-workflow',
        manifestVersion: '0.19.0+codex.20260914072507',
        status: 'healthy',
      }],
      diagnostics: [],
      commands: {
        test: { command: 'npm run test', status: 'detected', executed: false },
        validate: { command: 'npm run validate', status: 'detected', executed: false },
      },
    },
    lifecycle: { schemaVersion: 2, mode: 'v2', eventCount: 68, diagnostics: [], runtimeIgnored: true },
    retiredWorkflowState: null,
    planningEngine: { available: true, healthy: true, source: 'bundled', version: '1.9.0' },
    activeChanges: { available: true, total: 0, completedNotArchived: [] },
    dependencyProfile: { schemaVersion: '1.0.0', totalPackages: 0, packages: [] },
    targetProfile: { kind: 'unknown', indicators: [] },
    commandEvidence: {},
    commandSemantics: {},
    platformCommands: {},
    managedContentFreshness: { checked: false },
  };
}

test('[TC-01] 插件仓库摘要有界且完整输出兼容', () => {
  const full = pluginRepositoryResult();
  const snapshot = structuredClone(full);
  const summary = formatProjectCheckOutput(full, { summary: true });
  const summaryBytes = Buffer.byteLength(JSON.stringify(summary, null, 2));
  const fullBytes = Buffer.byteLength(JSON.stringify(full, null, 2));

  assert.deepEqual(Object.keys(summary), [
    'schemaVersion',
    'mode',
    'ok',
    'root',
    'repositoryKind',
    'pluginRepository',
    'lifecycle',
    'retiredWorkflowState',
    'planningEngine',
    'activeChanges',
    'errors',
    'warnings',
  ]);
  assert.equal(summary.pluginRepository.status, 'healthy');
  assert.equal(summary.pluginRepository.plugins[0].manifestVersion, '0.19.0+codex.20260914072507');
  assert.equal(summary.pluginRepository.commands.validate.command, 'npm run validate');
  assert.equal('dependencyProfile' in summary, false);
  assert.equal('deepAnalysis' in summary, false);
  assert.equal(summaryBytes <= 2500, true, `插件 summary 为 ${summaryBytes} 字节`);
  assert.equal(summaryBytes / fullBytes <= 0.65, true, `插件 summary/full 比例为 ${summaryBytes / fullBytes}`);
  assert.deepEqual(full, snapshot, '格式化不得修改完整检查结果');
  assert.equal(formatProjectCheckOutput(full), full, '无显式模式必须保持完整结果兼容');
  assert.deepEqual(formatProjectCheckOutput(full, { summary: true }), summary, '重复格式化必须确定一致');
});

test('[TC-06] 普通项目精简检查输出保留必要事实并限制可恢复长数组', () => {
  const full = completeResult();
  const snapshot = structuredClone(full);
  const summary = summarizeProjectCheck(full);

  assert.equal(summary.schemaVersion, '1.0.0');
  assert.equal(summary.mode, 'summary');
  assert.deepEqual(summary.dependencyProfile, full.dependencyProfile, '完整直接依赖画像不得截断');
  assert.equal(summary.deepAnalysis.totalObservations, 8);
  assert.equal(summary.deepAnalysis.observations.length, CHECK_PROJECT_OBSERVATION_SAMPLE_LIMIT);
  assert.equal(summary.deepAnalysis.omittedObservations, 3);
  assert.deepEqual(summary.deepAnalysis.observationCounts, {
    'other-observation': 2,
    'wxml-attribute-spacing': 6,
  });
  assert.deepEqual(full, snapshot, '格式化不得修改完整检查结果');
  assert.equal(formatProjectCheckOutput(full), full, '无显式模式必须保持完整结果兼容');
});

test('[TC-04] Skill、仓库读取路由与版本保持一致', async () => {
  const [skill, agents, rootPackage, manifest, managedFiles, bootstrap, readme] = await Promise.all([
    readFile(path.join(PROJECT_ROOT, 'plugins/frontend-ai-workflow/skills/frontend-workflow-check/SKILL.md'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'AGENTS.md'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'package.json'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'plugins/frontend-ai-workflow/.codex-plugin/plugin.json'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'plugins/frontend-ai-workflow/references/managed-files.md'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'plugins/frontend-ai-workflow/scripts/bootstrap-project.mjs'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'README.md'), 'utf8'),
  ]);

  assert.match(skill, /check-project\.mjs[^\n]+--summary/u);
  assert.match(agents, /## AI 读取路由/u);
  assert.match(agents, /runtime\/\*\*\/node_modules/u);
  assert.match(agents, /outputs/u);

  assert.equal(JSON.parse(rootPackage).version, '0.19.0');
  assert.match(JSON.parse(manifest).version, /^0\.19\.0\+codex\.\d{14}$/u);
  assert.match(managedFiles, /0\.19\.0/u);
  assert.match(bootstrap, /WORKFLOW_VERSION\s*=\s*'0\.19\.0'/u);
  assert.match(readme, /0\.19\.0/u);
});

test('[TC-08] 真实自动上下文资产满足硬预算且统一验证已接线', async () => {
  const [frontendDeliverySkill, managedAgents, structureValidator] = await Promise.all([
    readFile(path.join(PROJECT_ROOT, 'plugins/frontend-ai-workflow/skills/frontend-delivery/SKILL.md'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'plugins/frontend-ai-workflow/assets/templates/AGENTS.md'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'plugins/frontend-ai-workflow/scripts/validate-structure.mjs'), 'utf8'),
  ]);
  const result = validateAutomaticContextBudgets({ frontendDeliverySkill, managedAgents });

  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.assets.frontendDeliverySkill.bytes <= AUTOMATIC_CONTEXT_BUDGETS.frontendDeliverySkill.bytes, true);
  assert.equal(result.assets.frontendDeliverySkill.nonEmptyLines <= AUTOMATIC_CONTEXT_BUDGETS.frontendDeliverySkill.nonEmptyLines, true);
  assert.equal(result.assets.managedAgents.bytes <= AUTOMATIC_CONTEXT_BUDGETS.managedAgents.bytes, true);
  assert.equal(result.assets.managedAgents.listItems <= AUTOMATIC_CONTEXT_BUDGETS.managedAgents.listItems, true);
  assert.match(frontendDeliverySkill, /workflow-cli\.mjs/u);
  assert.doesNotMatch(frontendDeliverySkill, /\.\.\/\.\.\/references\//u);
  assert.match(structureValidator, /validateAutomaticContextBudgets/u);
  assert.match(structureValidator, /diagnostic\.code.*diagnostic\.target.*diagnostic\.actual.*diagnostic\.limit/su);
});
