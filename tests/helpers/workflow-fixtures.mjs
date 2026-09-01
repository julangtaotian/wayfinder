import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runBootstrap, WORKFLOW_VERSION } from '../../plugins/frontend-ai-workflow/scripts/bootstrap-project.mjs';

export const pluginRoot = path.resolve('plugins/frontend-ai-workflow');
export const expectedPublicSkills = [
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

export function writeFixtureFile(root, file, content) {
  const filePath = path.join(root, file);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

export function createVueFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-ai-workflow-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src', 'views'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'components'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'request'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'router'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'store'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', '__tests__'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
  fs.writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify({
      name: 'sample-vue-app',
      scripts: { dev: 'vite', build: 'vite build', test: 'vitest run' },
      dependencies: { vue: '^3.5.0', 'element-plus': '^2.9.0' },
      devDependencies: { vite: '^6.0.0', vitest: '^2.0.0' },
    }, null, 2)}\n`,
  );
  const fixtureFiles = {
    'src/router/index.js': "import Home from '../views/Home.vue';\nexport const routes = [{ path: '/', component: Home }];\n",
    'src/request/http.js': "export function request(url) { return url; }\n",
    'src/serve/profile.js': "import { request } from '../request/http.js';\nexport const fetchProfile = () => request('/profile');\n",
    'src/common/permission.js': "export const canAccess = (role) => role === 'admin';\n",
    'src/views/Home.vue': '<template><main>Home</main></template>\n<script>\nexport default { name: \'Home\' };\n</script>\n',
    'vitest.config.js': "export default { test: { environment: 'jsdom' } };\n",
    'vite.config.js': "export default { base: '/sample/' };\n",
    'docs/oversized.md': '用于测试范围限制的文档内容。'.repeat(20),
    'node_modules/ignored.js': "throw new Error('依赖目录不应被扫描');\n",
  };
  for (const [file, content] of Object.entries(fixtureFiles)) writeFixtureFile(root, file, content);
  return root;
}

// 深度地图完成态必须同时满足全量覆盖与固定章节，避免只改元数据就被误判为完成。
export function completeWayfinderAnalysis(content) {
  const included = content.match(/scopeIncludedFiles: (\d+)/u)?.[1];
  assert.ok(included, 'Wayfinder 应包含深度扫描纳入文件数');
  return content
    .replace('analysisStatus: "pending"', 'analysisStatus: "complete"')
    .replace('analysisCoveredFiles: 0', `analysisCoveredFiles: ${included}`)
    .replace('analysisUpdatedAt: "未完成"', 'analysisUpdatedAt: "2026-08-05T00:00:00.000Z"')
    .replace(
      /<!-- frontend-ai-workflow:analysis:start[^\n]*-->[\s\S]*?<!-- frontend-ai-workflow:analysis:end -->/u,
      `<!-- frontend-ai-workflow:analysis:start version=${WORKFLOW_VERSION} -->
## 深度项目地图

<!-- frontend-ai-workflow:analysis-dimension:run-delivery -->
### 项目运行与交付边界

- 入口、构建与部署边界已按源码交叉核对（证据：\`vite.config.js\`）。

<!-- frontend-ai-workflow:analysis-dimension:functional-dependencies -->
### 功能与依赖链路

- 路由由 \`src/router/index.js\` 映射到 \`src/views/Home.vue\`。

<!-- frontend-ai-workflow:analysis-dimension:data-state-security -->
### 数据、状态与安全边界

- 资料请求经 \`src/serve/profile.js\` 调用 \`src/request/http.js\`。

<!-- frontend-ai-workflow:analysis-dimension:verification-risks -->
### 验证基线与高风险区域

- \`npm run test\` 是已识别的测试入口，实际执行结果仍以验证记录为准。

<!-- frontend-ai-workflow:analysis-dimension:facts-inferences-questions -->
## 事实、推断与待确认项

- 已确认事实均附源码路径；动态接口契约和运行时权限仍待实际环境确认。
<!-- frontend-ai-workflow:analysis:end -->`,
    );
}

// 支持矩阵只创建识别和工作流所需的真实文件，不安装或执行任何第三方依赖。
export const SUPPORTED_PROJECT_MATRIX = [
  {
    id: 'vue2-vite-pnpm',
    preset: 'vue2-vite',
    packageManager: 'pnpm',
    lockfile: 'pnpm-lock.yaml',
    dependencies: { vue: '^2.7.16' },
    devDependencies: { vite: '^5.4.0', '@vitejs/plugin-vue2': '^2.3.0' },
    sourceFile: 'src/views/Home.vue',
  },
  {
    id: 'vue-webpack-yarn',
    preset: 'vue-webpack',
    packageManager: 'yarn',
    lockfile: 'yarn.lock',
    dependencies: { vue: '^3.5.0' },
    devDependencies: { webpack: '^5.95.0', 'webpack-cli': '^5.1.0' },
    sourceFile: 'src/views/Home.vue',
  },
  {
    id: 'react-vite-npm',
    preset: 'react-vite',
    packageManager: 'npm',
    lockfile: 'package-lock.json',
    dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
    devDependencies: { vite: '^6.0.0' },
    sourceFile: 'src/pages/Home.jsx',
  },
  {
    id: 'react-webpack-yarn',
    preset: 'react-webpack',
    packageManager: 'yarn',
    lockfile: 'yarn.lock',
    dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
    devDependencies: { webpack: '^5.95.0', 'webpack-cli': '^5.1.0' },
    sourceFile: 'src/pages/Home.jsx',
  },
];

export function expectedScriptCommand(packageManager, scriptName) {
  if (packageManager === 'yarn') return `yarn ${scriptName}`;
  if (packageManager === 'pnpm') return `pnpm run ${scriptName}`;
  return `npm run ${scriptName}`;
}

export function createMatrixFixture(t, fixture) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `misleading-${fixture.id}-`));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFixtureFile(root, fixture.lockfile, fixture.packageManager === 'npm' ? '{}\n' : '# fixture lockfile\n');
  writeFixtureFile(root, 'package.json', `${JSON.stringify({
    name: fixture.id,
    scripts: {
      dev: fixture.devDependencies.vite ? 'vite' : 'webpack serve',
      build: fixture.devDependencies.vite ? 'vite build' : 'webpack --mode production',
      test: 'node --test',
      lint: 'eslint .',
    },
    dependencies: fixture.dependencies,
    devDependencies: fixture.devDependencies,
  }, null, 2)}\n`);
  writeFixtureFile(root, fixture.sourceFile, fixture.sourceFile.endsWith('.vue')
    ? '<template><main>Fixture</main></template>\n'
    : "export function Home() { return 'Fixture'; }\n");
  writeFixtureFile(root, 'src/components/Shared.js', "export const shared = 'fixture';\n");
  writeFixtureFile(root, 'src/request/http.js', "export const request = (url) => url;\n");
  writeFixtureFile(root, 'src/router/index.js', 'export const routes = [];\n');
  writeFixtureFile(root, 'src/store/index.js', 'export const state = {};\n');
  writeFixtureFile(root, 'tests/existing.spec.js', "export default 'fixture';\n");
  return root;
}

// 交付门槛 fixture 用 HEAD 固化已有测试，避免暂存的新文件污染“新建/复用”基线。
export function initializeGitBaseline(root, relativePath = 'tests/existing.spec.js') {
  writeFixtureFile(root, relativePath, "export default 'existing';\n");
  const initialized = spawnSync('git', ['init', '-q', root], { encoding: 'utf8' });
  assert.equal(initialized.status, 0, initialized.stderr);
  const added = spawnSync('git', ['-C', root, 'add', relativePath], { encoding: 'utf8' });
  assert.equal(added.status, 0, added.stderr);
  const committed = spawnSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-q', '-m', 'fixture baseline'], { encoding: 'utf8' });
  assert.equal(committed.status, 0, committed.stderr);
}

export function renderDeliveryRequirement({
  status = '已验收',
  acceptanceChecked = true,
  testStrategy = '复用',
  testPath = 'tests/existing.spec.js',
  verificationResult = '通过',
  includeManual = false,
  manualEnvironment = '视口：1440px；检查项：卡片不重叠',
  manualEvidence = 'artifacts/dashboard-1440.png',
  decisionValue = '使用验证记录',
} = {}) {
  const check = acceptanceChecked ? 'x' : ' ';
  const manualRecord = includeManual
    ? `| V-02 | 人工 | ${manualEnvironment} | 2026-07-24 | 通过 | ${manualEvidence} |\n`
    : '';
  const verificationMethod = includeManual ? '自动+人工' : '自动';
  const recordIds = includeManual ? 'V-01、V-02' : 'V-01';
  return `# 交付证据示例

## 基本信息

- 状态：${status}

## 决策台账

| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 交付门槛 | 已确认 | ${decisionValue} | 用户确认 |

## 测试与验证

- 测试文件策略：${testStrategy}；目标路径：${testPath}；基线证据：Git 基线；选择理由：覆盖交付门槛。

## 验证记录

| 验证ID | 验证类型 | 执行内容或环境 | 执行日期 | 结果 | 证据位置 |
| --- | --- | --- | --- | --- | --- |
| V-01 | 自动 | 命令：npm test | 2026-07-24 | ${verificationResult} | 终端输出：通过 |
${manualRecord}
## 验收标准

- [${check}] [A-01] 交付证据完整。

## 验收—证据映射

| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 | 验证记录 |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 交付证据完整 | D-01 | ${verificationMethod} | 需求验证记录 | 证据可观察 | ${recordIds} |
`;
}

export function renderGovernedDeliveryRequirement({
  status = '待验证',
  changeName = 'delivery',
  evidenceLocation = '终端输出：通过',
  ...options
} = {}) {
  return renderDeliveryRequirement({ status, ...options })
    .replace('终端输出：通过', evidenceLocation)
    .replace('## 验收标准', `## 关联变更范围

| 变更 | 决策范围 | 验收范围 |
| --- | --- | --- |
| ${changeName} | D-01 | A-01 |

## 修订记录

| 修订 | 日期 | 影响决策 | 影响验收 | 验证与任务处理 |
| --- | --- | --- | --- | --- |
| R-01 | 2026-07-29 | D-01 | A-01 | 首次建立，V-01 保持当前计划。 |

## 验收标准`);
}

// 固定六行矩阵让 fixture 能分别覆盖完整状态、不适用理由和历史兼容分支。
export function renderStateMatrixRequirement({ includeMatrix = true, unmountReason = '本次不涉及订阅、计时器或可取消请求。' } = {}) {
  const matrix = includeMatrix
    ? `
## 交互状态矩阵

| 状态 | 覆盖决定 | 触发或前置条件 | 期望结果 | 验证方式 | 关联验收 | 不适用理由 |
| --- | --- | --- | --- | --- | --- | --- |
| 初始（已有数据） | 覆盖 | 首次进入已有数据页面 | 数据立即渲染 | 自动 | A-01 | — |
| 用户操作 | 覆盖 | 用户选择筛选项 | 页面按筛选更新 | 自动 | A-01 | — |
| 刷新 | 覆盖 | 用户触发刷新 | 展示最新结果 | 自动 | A-02 | — |
| 空态 | 覆盖 | 接口返回空数据 | 展示空态 | 自动 | A-02 | — |
| 错误态 | 覆盖 | 接口返回失败 | 展示错误反馈 | 自动 | A-02 | — |
| 卸载 | 不适用 | 本次没有资源生命周期变化 | 不新增卸载断言 | 自动 | — | ${unmountReason} |
`
    : '';
  return `# 状态矩阵示例

## 基本信息

- 状态：已确认

## 决策台账

| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 状态覆盖 | 已确认 | 使用状态矩阵 | 用户确认 |
${matrix}
## 验收标准

- [ ] [A-01] 初始数据和用户操作正确。
- [ ] [A-02] 刷新、空态和错误态正确。

## 验收—证据映射

| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 |
| --- | --- | --- | --- | --- | --- |
| A-01 | 主流程 | D-01 | 自动 | tests/state.spec.js | 主流程可观察 | 
| A-02 | 边界状态 | D-01 | 自动 | tests/state.spec.js | 边界状态可观察 | 
`;
}

// 旧布局 fixture 用于验证显式迁移，不依赖已移除的旧版模板资产。
export function writeLegacyWorkflow(root, options = {}) {
  fs.rmSync(path.join(root, 'wayfinder'), { recursive: true, force: true });
  const requirementTemplate = fs.readFileSync(path.join(pluginRoot, 'assets', 'templates', 'requirements', '_template.md'), 'utf8');
  writeFixtureFile(root, 'requirements/_template.md', options.requirementTemplate || requirementTemplate);
  writeFixtureFile(root, '.ai-workflow.yaml', `# frontend-ai-workflow:start version=0.5.0\nversion: "0.5.0"\nopenspecVersion: "1.6.0"\npreset: "vue3-vite"\nproject: "sample-vue-app"\npackageManager: "npm"\ndeepAnalysis: true\nscopeVersion: "1.0.0"\nscopeIncludedFiles: 9\nscopeExcludedFiles: 1\nscopeIncludedBytes: 999\ndeepContext: "docs/ai-context/frontend.md"\n# frontend-ai-workflow:end\n\n# 可在此处追加项目自己的工作流元数据。\n${options.customMetadata || ''}`);
  writeFixtureFile(root, 'docs/ai-context/frontend.md', `# sample-vue-app 前端上下文\n\n项目维护者说明：迁移后必须保留。\n\n<!-- frontend-ai-workflow:scope:start version=0.5.0 -->\n## 深度扫描范围\n\n- 深度分析状态：true。\n<!-- frontend-ai-workflow:scope:end -->\n\n<!-- frontend-ai-workflow:analysis:start version=0.5.0 -->\n## 深度项目地图\n\n- 已确认事实：请求经统一封装。\n<!-- frontend-ai-workflow:analysis:end -->\n`);
}

// 最小运行时 fixture 复现根包、生产依赖、许可证和入口，专门用于验证漂移分支。
export function createRuntimeIntegrityFixture(t) {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-runtime-'));
  const integrityPath = path.join(path.dirname(runtimeRoot), `${path.basename(runtimeRoot)}-integrity.json`);
  t.after(() => {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
    fs.rmSync(integrityPath, { force: true });
  });
  writeFixtureFile(runtimeRoot, 'package.json', `${JSON.stringify({
    name: '@fission-ai/openspec',
    version: '1.9.0',
    license: 'MIT',
    bin: { openspec: './bin/openspec.js' },
    dependencies: { 'fixture-dependency': '1.0.0' },
  }, null, 2)}\n`);
  writeFixtureFile(runtimeRoot, 'bin/openspec.js', '#!/usr/bin/env node\n');
  writeFixtureFile(runtimeRoot, 'LICENSE', 'MIT fixture license\n');
  writeFixtureFile(runtimeRoot, 'node_modules/fixture-dependency/package.json', `${JSON.stringify({
    name: 'fixture-dependency',
    version: '1.0.0',
    license: 'Apache-2.0',
  }, null, 2)}\n`);
  writeFixtureFile(runtimeRoot, 'node_modules/fixture-dependency/index.js', "export default 'fixture';\n");
  writeFixtureFile(runtimeRoot, 'node_modules/fixture-dependency/LICENSE.txt', 'Apache fixture license\n');
  return { runtimeRoot, integrityPath };
}

export function writeManagedChange(root, {
  changeName = 'delivery',
  tasks = '- [x] [D-01] [A-01] 完成交付门槛。\n',
  skipSpecs = false,
  specPath = 'delivery-guard/spec.md',
} = {}) {
  runBootstrap({ target: root, write: true });
  const skipMetadata = skipSpecs ? 'skip_specs: true\n' : '';
  writeFixtureFile(root, `openspec/changes/${changeName}/.openspec.yaml`, `schema: spec-driven\ncreated: 2026-07-29\n${skipMetadata}`);
  writeFixtureFile(root, `openspec/changes/${changeName}/proposal.md`, `## Why

需要验证交付门槛。（D-01；A-01）

## What Changes

- 增加交付门槛。（D-01；A-01）

## Capabilities

### New Capabilities

${skipSpecs ? '- 无。本变更不改变可观察行为。' : '- `delivery-guard`: 交付门槛。'}

### Modified Capabilities

- 无。

## Impact

- 工作流测试。
`);
  writeFixtureFile(root, `openspec/changes/${changeName}/design.md`, `## Context

使用现有工作流。（D-01；A-01）

## Goals / Non-Goals

**Goals:** 验证交付。

**Non-Goals:** 不修改业务页面。

## Decisions

- 复用内置运行时。（D-01；A-01）

## Risks / Trade-offs

- 无。
`);
  if (!skipSpecs) writeFixtureFile(root, `openspec/changes/${changeName}/specs/${specPath}`, `## ADDED Requirements

### Requirement: 交付必须通过门槛
系统 MUST 在归档前验证交付。（D-01；A-01）

#### Scenario: 门槛通过
- **WHEN** 所有交付项完成
- **THEN** 系统允许归档
`);
  writeFixtureFile(root, `openspec/changes/${changeName}/tasks.md`, tasks);
}
