import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { inspectProject } from '../plugins/frontend-ai-workflow/scripts/inspect-project.mjs';
import { runBootstrap, WORKFLOW_VERSION } from '../plugins/frontend-ai-workflow/scripts/bootstrap-project.mjs';
import { checkProject } from '../plugins/frontend-ai-workflow/scripts/check-project.mjs';
import { archiveTarget, checkChange, validatePlanningArtifacts, validatePlanningRoot } from '../plugins/frontend-ai-workflow/scripts/check-change.mjs';
import { finalizeChange } from '../plugins/frontend-ai-workflow/scripts/finalize-change.mjs';
import { runWayfinderMigration } from '../plugins/frontend-ai-workflow/scripts/migrate-wayfinder-project.mjs';
import { collectProjectScope, PROJECT_SCOPE_VERSION } from '../plugins/frontend-ai-workflow/scripts/collect-project-scope.mjs';
import {
  BUNDLED_OPENSPEC_VERSION,
  inspectBundledOpenSpec,
  runOpenSpecSync,
} from '../plugins/frontend-ai-workflow/scripts/openspec-cli.mjs';
import { runUpdate } from '../plugins/frontend-ai-workflow/scripts/update-project.mjs';
import { validateRequirementDecisions } from '../plugins/frontend-ai-workflow/scripts/validate-requirement-decisions.mjs';
import { previewRequirementUpgrade } from '../plugins/frontend-ai-workflow/scripts/preview-requirement-upgrade.mjs';
import {
  buildRuntimeIntegrityManifest,
  formatRuntimeIntegrityManifest,
  verifyRuntimeIntegrity,
  writeRuntimeIntegrity,
} from '../plugins/frontend-ai-workflow/scripts/runtime-integrity.mjs';
import {
  buildVerificationEnvironment,
  buildVerificationSteps,
  runVerification,
} from '../scripts/verify.mjs';

const pluginRoot = path.resolve('plugins/frontend-ai-workflow');
const expectedPublicSkills = [
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

function writeFixtureFile(root, file, content) {
  const filePath = path.join(root, file);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createVueFixture(t) {
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
    'src/views/Home.vue': '<template><main>Home</main></template>\n<script setup>\nconst title = \'Home\';\n</script>\n',
    'vitest.config.js': "export default { test: { environment: 'jsdom' } };\n",
    'vite.config.js': "export default { base: '/sample/' };\n",
    'docs/oversized.md': '用于测试范围限制的文档内容。'.repeat(20),
    'node_modules/ignored.js': "throw new Error('依赖目录不应被扫描');\n",
  };
  for (const [file, content] of Object.entries(fixtureFiles)) writeFixtureFile(root, file, content);
  return root;
}

// 深度地图完成态必须同时满足全量覆盖与固定章节，避免只改元数据就被误判为完成。
function completeWayfinderAnalysis(content) {
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
const SUPPORTED_PROJECT_MATRIX = [
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

function expectedScriptCommand(packageManager, scriptName) {
  if (packageManager === 'yarn') return `yarn ${scriptName}`;
  if (packageManager === 'pnpm') return `pnpm run ${scriptName}`;
  return `npm run ${scriptName}`;
}

function createMatrixFixture(t, fixture) {
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

// 交付门槛 fixture 用 Git 索引模拟已有测试，避免把本轮新文件误写为复用。
function initializeGitBaseline(root, relativePath = 'tests/existing.spec.js') {
  writeFixtureFile(root, relativePath, "export default 'existing';\n");
  const initialized = spawnSync('git', ['init', '-q', root], { encoding: 'utf8' });
  assert.equal(initialized.status, 0, initialized.stderr);
  const added = spawnSync('git', ['-C', root, 'add', relativePath], { encoding: 'utf8' });
  assert.equal(added.status, 0, added.stderr);
}

function renderDeliveryRequirement({
  status = '已验收',
  acceptanceChecked = true,
  taskChecked = true,
  testStrategy = '复用',
  testPath = 'tests/existing.spec.js',
  verificationResult = '通过',
  includeManual = false,
  manualEvidence = 'artifacts/dashboard-1440.png',
  decisionValue = '使用验证记录',
} = {}) {
  const check = acceptanceChecked ? 'x' : ' ';
  const task = taskChecked ? 'x' : ' ';
  const manualRecord = includeManual
    ? `| V-02 | 人工 | 视口：1440px；检查项：卡片不重叠 | 2026-07-24 | 通过 | ${manualEvidence} |\n`
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

// 固定六行矩阵让 fixture 能分别覆盖完整状态、不适用理由和历史兼容分支。
function renderStateMatrixRequirement({ includeMatrix = true, unmountReason = '本次不涉及订阅、计时器或可取消请求。' } = {}) {
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
function writeLegacyWorkflow(root, options = {}) {
  fs.rmSync(path.join(root, 'wayfinder'), { recursive: true, force: true });
  const requirementTemplate = fs.readFileSync(path.join(pluginRoot, 'assets', 'templates', 'requirements', '_template.md'), 'utf8');
  writeFixtureFile(root, 'requirements/_template.md', options.requirementTemplate || requirementTemplate);
  writeFixtureFile(root, '.ai-workflow.yaml', `# frontend-ai-workflow:start version=0.5.0\nversion: "0.5.0"\nopenspecVersion: "1.6.0"\npreset: "vue3-vite"\nproject: "sample-vue-app"\npackageManager: "npm"\ndeepAnalysis: true\nscopeVersion: "1.0.0"\nscopeIncludedFiles: 9\nscopeExcludedFiles: 1\nscopeIncludedBytes: 999\ndeepContext: "docs/ai-context/frontend.md"\n# frontend-ai-workflow:end\n\n# 可在此处追加项目自己的工作流元数据。\n${options.customMetadata || ''}`);
  writeFixtureFile(root, 'docs/ai-context/frontend.md', `# sample-vue-app 前端上下文\n\n项目维护者说明：迁移后必须保留。\n\n<!-- frontend-ai-workflow:scope:start version=0.5.0 -->\n## 深度扫描范围\n\n- 深度分析状态：true。\n<!-- frontend-ai-workflow:scope:end -->\n\n<!-- frontend-ai-workflow:analysis:start version=0.5.0 -->\n## 深度项目地图\n\n- 已确认事实：请求经统一封装。\n<!-- frontend-ai-workflow:analysis:end -->\n`);
}

test('识别 Vue 3 + Vite 项目及真实命令', (t) => {
  const root = createVueFixture(t);
  const result = inspectProject(root);

  assert.equal(result.preset, 'vue3-vite');
  assert.equal(result.packageManager, 'npm');
  assert.equal(result.commands.dev, 'npm run dev');
  assert.equal(result.commands.build, 'npm run build');
  assert.equal(result.commands.test, 'npm run test');
  // 只有默认构建时，交付构建必须明确显示为回退候选，避免夸大生产环境保证。
  assert.equal(result.commandSemantics.defaultBuild.command, 'npm run build');
  assert.equal(result.commandSemantics.releaseBuild.command, 'npm run build');
  assert.equal(result.commandSemantics.releaseBuild.source, 'default-fallback');
  assert.equal(result.paths.views, 'src/views');
});

test('受支持框架与包管理器矩阵完成识别、初始化、升级和检查', (t) => {
  for (const fixture of SUPPORTED_PROJECT_MATRIX) {
    const root = createMatrixFixture(t, fixture);
    const inspection = inspectProject(root);
    const expectedDevCommand = expectedScriptCommand(fixture.packageManager, 'dev');

    assert.equal(inspection.preset, fixture.preset, fixture.id);
    assert.equal(inspection.packageManager, fixture.packageManager, fixture.id);
    assert.equal(inspection.commands.dev, expectedDevCommand, fixture.id);
    assert.equal(inspection.commandSemantics.lint.status, 'verified', fixture.id);

    const preview = runBootstrap({ target: root });
    assert.equal(preview.ok, true, fixture.id);
    assert.equal(preview.write, false, fixture.id);
    assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false, fixture.id);

    const applied = runBootstrap({ target: root, write: true });
    assert.equal(applied.ok, true, fixture.id);
    const agentsPath = path.join(root, 'AGENTS.md');
    const customized = fs.readFileSync(agentsPath, 'utf8')
      .replace('## 工作流', '## 临时旧工作流')
      .concat(`\n项目保留内容：${fixture.id}\n`);
    fs.writeFileSync(agentsPath, customized, 'utf8');

    const repeated = runBootstrap({ target: root, write: true });
    assert.equal(repeated.actions.find((item) => item.file === 'AGENTS.md').action, 'skip', fixture.id);
    assert.match(fs.readFileSync(agentsPath, 'utf8'), /## 临时旧工作流/, fixture.id);

    const upgraded = runUpdate({ target: root, write: true });
    assert.equal(upgraded.ok, true, fixture.id);
    const nextAgents = fs.readFileSync(agentsPath, 'utf8');
    assert.match(nextAgents, /## 工作流/, fixture.id);
    assert.doesNotMatch(nextAgents, /## 临时旧工作流/, fixture.id);
    assert.match(nextAgents, new RegExp(`项目保留内容：${fixture.id}`), fixture.id);

    const checked = checkProject(root);
    assert.equal(checked.ok, true, fixture.id);
    assert.equal(checked.preset, fixture.preset, fixture.id);
    assert.equal(checked.commands.dev, expectedDevCommand, fixture.id);
  }

  const misleadingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vue-vite-project-'));
  t.after(() => fs.rmSync(misleadingRoot, { recursive: true, force: true }));
  writeFixtureFile(misleadingRoot, 'package.json', '{"name":"plain-project","scripts":{"build":"node --check index.js"}}\n');
  writeFixtureFile(misleadingRoot, 'index.js', "export default 'plain';\n");
  assert.equal(inspectProject(misleadingRoot).preset, 'generic-frontend');
});

test('命令语义区分默认构建、交付构建和未验证 lint', (t) => {
  const root = createVueFixture(t);
  writeFixtureFile(root, 'package.json', `${JSON.stringify({
    name: 'command-semantics-app',
    scripts: {
      build: 'vite build',
      'build:prod': 'cross-env APP_ENV=prod vite build',
      lint: 'vite optimize',
      test: 'vitest run',
    },
    dependencies: { vue: '^3.5.0' },
    devDependencies: { vite: '^6.0.0', vitest: '^2.0.0' },
  }, null, 2)}\n`);

  const inspection = inspectProject(root);
  assert.equal(inspection.commands.build, 'npm run build');
  assert.deepEqual(inspection.commandSemantics.defaultBuild, {
    scriptName: 'build',
    command: 'npm run build',
    source: 'explicit-default',
  });
  assert.deepEqual(inspection.commandSemantics.releaseBuild, {
    scriptName: 'build:prod',
    command: 'npm run build:prod',
    source: 'explicit-release',
  });
  assert.equal(inspection.commandSemantics.lint.status, 'unverified');

  runBootstrap({ target: root, write: true });
  const checked = checkProject(root);
  assert.equal(checked.commandSemantics.releaseBuild.command, 'npm run build:prod');
  assert.match(checked.warnings.join('\n'), /lint 脚本语义未验证/);

  // 已识别工具应升级为已验证，确保“未知”与“已验证”状态均有稳定覆盖。
  const packageFile = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  packageFile.scripts.lint = 'eslint .';
  writeFixtureFile(root, 'package.json', `${JSON.stringify(packageFile, null, 2)}\n`);
  assert.equal(inspectProject(root).commandSemantics.lint.status, 'verified');
});

test('完成阶段校验交付证据、人工视觉和测试 Git 基线', (t) => {
  const root = createVueFixture(t);
  const requirementPath = path.join(root, 'requirements', 'REQ-2026-001-delivery.md');
  const changePath = path.join(root, 'openspec', 'changes', 'delivery');
  initializeGitBaseline(root);
  writeFixtureFile(root, 'openspec/changes/delivery/tasks.md', '- [x] [D-01] [A-01] 完成交付门槛。\n');
  writeFixtureFile(root, 'requirements/REQ-2026-001-delivery.md', renderDeliveryRequirement());

  const complete = validateRequirementDecisions(requirementPath, { changePath, stage: 'complete' });
  assert.equal(complete.ok, true);
  assert.equal(complete.evidenceFormat, 'enhanced');
  assert.equal(complete.testFileStrategy.baselineAvailable, true);
  assert.match(complete.warnings.join('\n'), /缺少交互状态矩阵/);

  // 完成门槛必须同时核对需求验收勾选和变更任务，不允许只依赖验证记录。
  writeFixtureFile(root, 'requirements/REQ-2026-001-delivery.md', renderDeliveryRequirement({
    acceptanceChecked: false,
  }));
  const pendingAcceptance = validateRequirementDecisions(requirementPath, { changePath, stage: 'complete' });
  assert.equal(pendingAcceptance.ok, false);
  assert.match(pendingAcceptance.errors.join('\n'), /存在未勾选验收：A-01/);

  writeFixtureFile(root, 'openspec/changes/delivery/tasks.md', '- [ ] [D-01] [A-01] 完成交付门槛。\n');
  writeFixtureFile(root, 'requirements/REQ-2026-001-delivery.md', renderDeliveryRequirement());
  const pendingTask = validateRequirementDecisions(requirementPath, { changePath, stage: 'complete' });
  assert.equal(pendingTask.ok, false);
  assert.match(pendingTask.errors.join('\n'), /存在未完成任务/);
  writeFixtureFile(root, 'openspec/changes/delivery/tasks.md', '- [x] [D-01] [A-01] 完成交付门槛。\n');

  writeFixtureFile(root, 'requirements/REQ-2026-001-delivery.md', renderDeliveryRequirement({
    includeManual: true,
    manualEvidence: 'artifacts/dashboard-note.txt',
  }));
  const missingVisual = validateRequirementDecisions(requirementPath, { changePath, stage: 'complete' });
  assert.equal(missingVisual.ok, false);
  assert.match(missingVisual.errors.join('\n'), /缺少视口或设备、检查项和截图或录屏证据/);

  writeFixtureFile(root, 'tests/new.spec.js', "export default 'new';\n");
  writeFixtureFile(root, 'requirements/REQ-2026-001-delivery.md', renderDeliveryRequirement({
    status: '实施中',
    testPath: 'tests/new.spec.js',
  }));
  const untrackedReuse = validateRequirementDecisions(requirementPath, { changePath, stage: 'implement' });
  assert.equal(untrackedReuse.ok, false);
  assert.match(untrackedReuse.errors.join('\n'), /复用测试文件未受 Git 基线跟踪/);

  const noGitRoot = createVueFixture(t);
  const noGitRequirement = path.join(noGitRoot, 'requirements', 'REQ-2026-001-no-git.md');
  writeFixtureFile(noGitRoot, 'tests/existing.spec.js', "export default 'existing';\n");
  writeFixtureFile(noGitRoot, 'openspec/changes/delivery/tasks.md', '- [x] [D-01] [A-01] 完成交付门槛。\n');
  writeFixtureFile(noGitRoot, 'requirements/REQ-2026-001-no-git.md', renderDeliveryRequirement({
    status: '实施中',
  }));
  const noGit = validateRequirementDecisions(noGitRequirement, {
    changePath: path.join(noGitRoot, 'openspec', 'changes', 'delivery'),
    stage: 'implement',
  });
  assert.equal(noGit.ok, true);
  assert.match(noGit.warnings.join('\n'), /无法确认测试文件 Git 基线/);
});

test('交互状态矩阵覆盖六类状态并兼容历史需求', (t) => {
  const root = createVueFixture(t);
  const requirementPath = path.join(root, 'requirements', 'REQ-2026-003-state-matrix.md');
  writeFixtureFile(root, 'requirements/REQ-2026-003-state-matrix.md', renderStateMatrixRequirement());

  const valid = validateRequirementDecisions(requirementPath, { stage: 'plan' });
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.interactionStateMatrix, { present: true, rows: 6 });

  writeFixtureFile(root, 'requirements/REQ-2026-003-state-matrix.md', renderStateMatrixRequirement({
    unmountReason: '—',
  }));
  const missingReason = validateRequirementDecisions(requirementPath, { stage: 'plan' });
  assert.equal(missingReason.ok, false);
  assert.match(missingReason.errors.join('\n'), /标记为“不适用”时必须说明理由/);

  writeFixtureFile(root, 'requirements/REQ-2026-003-state-matrix.md', renderStateMatrixRequirement({ includeMatrix: false }));
  const legacy = validateRequirementDecisions(requirementPath, { stage: 'implement' });
  assert.equal(legacy.ok, true);
  assert.deepEqual(legacy.interactionStateMatrix, { present: false, rows: 0 });
});

test('旧需求升级预览只报告活跃缺口且不改写源文件', (t) => {
  const root = createVueFixture(t);
  const legacyPath = path.join(root, 'requirements', 'REQ-2026-001-legacy.md');
  const completePath = path.join(root, 'requirements', 'REQ-2026-002-complete.md');
  const legacyContent = '# 历史需求\n\n仅有旧格式内容。\n';
  const completeContent = '# 已验收需求\n\n## 基本信息\n\n- 状态：已验收\n\n## 决策台账\n\n| ID | 决策项 | 状态 | 取值 | 来源 |\n| --- | --- | --- | --- | --- |\n| D-01 | 示例 | 已确认 | 保持 | 用户确认 |\n\n## 验收—证据映射\n\n| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 |\n| --- | --- | --- | --- | --- | --- |\n| A-01 | 示例 | D-01 | 自动 | tests/example.spec.js | 通过 |\n';
  writeFixtureFile(root, 'requirements/REQ-2026-001-legacy.md', legacyContent);
  writeFixtureFile(root, 'requirements/REQ-2026-002-complete.md', completeContent);
  writeFixtureFile(root, 'requirements/README.md', '# 忽略的非标准文件\n');

  const preview = previewRequirementUpgrade(root);
  assert.equal(preview.ok, true);
  assert.equal(preview.write, false);
  assert.equal(preview.requirements.length, 2);
  assert.equal(preview.activeRequirements.length, 1);
  assert.deepEqual(preview.issues, [{
    path: 'requirements/REQ-2026-001-legacy.md',
    status: null,
    statusKind: 'missing',
    missing: ['decisionLedger', 'evidenceMapping', 'changeScope', 'revisionHistory', 'requirementStatus'],
  }]);
  assert.equal(fs.readFileSync(legacyPath, 'utf8'), legacyContent);
  assert.equal(fs.readFileSync(completePath, 'utf8'), completeContent);

  const emptyRoot = createVueFixture(t);
  const empty = previewRequirementUpgrade(emptyRoot);
  assert.deepEqual(empty.requirements, []);
  assert.deepEqual(empty.issues, []);
});

test('插件只公开团队自有技能', () => {
  const skills = fs.readdirSync(path.join(pluginRoot, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(skills, expectedPublicSkills);
  assert.equal(skills.some((name) => name.startsWith('openspec-')), false);
});

test('统一验证固定阶段顺序、短路失败并由 CI 单一调用', (t) => {
  const verificationRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'verification-runner-')));
  t.after(() => fs.rmSync(verificationRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(verificationRoot, 'tests'), { recursive: true });
  const steps = buildVerificationSteps(verificationRoot);
  assert.deepEqual(steps.map((step) => step.id), [
    'tests',
    'structure',
    'openspec',
    'openspec-archived',
    'runtime-version',
    'runtime-integrity',
    'playwright-integrity',
    'playwright-smoke',
  ]);

  const executed = [];
  const tempRoots = [];
  const messages = [];
  const errors = [];
  const lifecycle = [];
  const failed = runVerification({
    repositoryRoot: verificationRoot,
    execute: (step, _root, tempRoot) => {
      executed.push(step.id);
      tempRoots.push(tempRoot);
      return { status: step.id === 'openspec' ? 2 : 0 };
    },
    environment: {},
    prepareRuntime: () => lifecycle.push('prepare'),
    cleanupRuntime: () => lifecycle.push('cleanup'),
    report: (message) => messages.push(message),
    reportError: (message) => errors.push(message),
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.failedStep, 'openspec');
  assert.deepEqual(failed.completed, ['tests', 'structure']);
  assert.deepEqual(executed, ['tests', 'structure', 'openspec']);
  assert.deepEqual(lifecycle, ['prepare', 'cleanup']);
  const expectedTempRoot = path.join(verificationRoot, 'outputs', 'verify-runtime', 'tmp');
  assert.ok(tempRoots.every((tempRoot) => tempRoot === expectedTempRoot));
  assert.equal(fs.existsSync(path.join(verificationRoot, 'outputs', 'verify-runtime')), false);
  assert.match(errors[0], /OpenSpec 全量严格校验/);

  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const workflow = fs.readFileSync('.github/workflows/validate.yml', 'utf8');
  const attributes = fs.readFileSync('.gitattributes', 'utf8');
  assert.equal(packageJson.scripts.verify, 'node scripts/verify.mjs');
  assert.equal(packageJson.scripts['cleanup:test-runtime'], 'node scripts/cleanup-frontend-test-runtime.mjs');
  assert.match(workflow, /node-version: 20\.19\.0/);
  for (const [runner, platform] of [
    ['macos-15', 'darwin-arm64'],
    ['macos-15-intel', 'darwin-x64'],
    ['ubuntu-24.04', 'linux-x64'],
    ['ubuntu-24.04-arm', 'linux-arm64'],
    ['windows-2025', 'win32-x64'],
  ]) {
    assert.match(workflow, new RegExp(`- os: ${runner}\\r?\\n\\s+platform: ${platform}`));
  }
  assert.match(workflow, /UI_REVIEW_EXPECT_PLATFORM: \$\{\{ matrix\.platform \}\}/);
  assert.match(workflow, /package-plugin-platform\.mjs --write --platform \$\{\{ matrix\.platform \}\}/);
  // 产物上传必须使用默认运行于 Node.js 24 的 action，避免 CI 重新出现 Node.js 20 弃用警告。
  assert.match(workflow, /actions\/upload-artifact@v7/u);
  assert.doesNotMatch(workflow, /actions\/upload-artifact@v[1-6]\b/u);
  assert.deepEqual([...workflow.matchAll(/^\s*-\s*run:\s*(.+)$/gmu)].map((match) => match[1]), [
    'npm run verify',
  ]);
  assert.match(workflow, /run: npm run cleanup:test-runtime/u);
  assert.match(workflow, /if: always\(\)/u);
  assert.doesNotMatch(workflow, /npm test|npm run validate/);
  assert.match(attributes, /^\* text=auto eol=lf$/mu);
  assert.match(attributes, /platform-assets\/\*\* filter=lfs diff=lfs merge=lfs -text/u);
});

test('[TC-06] 统一验证隔离仓库内临时 fixture 的父 Git 状态', (t) => {
  const outputsRoot = path.resolve('outputs');
  fs.mkdirSync(outputsRoot, { recursive: true });
  const ceilingRoot = fs.mkdtempSync(path.join(outputsRoot, 'verify-git-ceiling-'));
  t.after(() => fs.rmSync(ceilingRoot, { recursive: true, force: true }));
  writeFixtureFile(ceilingRoot, '.gitignore', 'fixture/\n');
  writeFixtureFile(ceilingRoot, 'fixture/src/router/index.js', 'export const routes = [];\n');
  const fixtureRoot = path.join(ceilingRoot, 'fixture');
  const sourcePath = path.join(fixtureRoot, 'src/router/index.js');

  const inherited = spawnSync('git', ['-C', fixtureRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  assert.equal(inherited.status, 0, inherited.stderr);
  assert.equal(path.resolve(inherited.stdout.trim()), path.resolve('.'));
  const ignored = spawnSync('git', ['check-ignore', '--quiet', path.relative(path.resolve('.'), sourcePath)], {
    cwd: path.resolve('.'),
  });
  assert.equal(ignored.status, 0, 'fixture 源码应先命中父仓库忽略规则');

  const environment = buildVerificationEnvironment(ceilingRoot, process.env);
  const isolated = spawnSync('git', ['-C', fixtureRoot, 'rev-parse', '--is-inside-work-tree'], {
    encoding: 'utf8',
    env: environment,
  });
  assert.notEqual(isolated.status, 0, '统一验证环境不得让 fixture 继承父仓库 Git');
  assert.equal(environment.TMPDIR, ceilingRoot);
  assert.equal(environment.TMP, ceilingRoot);
  assert.equal(environment.TEMP, ceilingRoot);
  assert.equal(environment.GIT_CEILING_DIRECTORIES.split(path.delimiter).includes(ceilingRoot), true);
});

test('初始化默认 dry-run，显式 write 后创建工作流文件', (t) => {
  const root = createVueFixture(t);
  const preview = runBootstrap({ target: root });

  assert.equal(preview.ok, true);
  assert.equal(preview.write, false);
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false);
  assert.equal(preview.actions.filter((item) => item.action === 'create').length, 3);

  const applied = runBootstrap({ target: root, write: true });
  assert.equal(applied.ok, true);
  for (const file of ['AGENTS.md', 'openspec/config.yaml', 'wayfinder/frontend.md']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
  }

  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents, /sample-vue-app/);
  assert.match(agents, /npm run build/);
  assert.match(fs.readFileSync(path.join(root, 'openspec/config.yaml'), 'utf8'), /交付构建命令：npm run build/);
  assert.match(fs.readFileSync(path.join(root, 'openspec/config.yaml'), 'utf8'), /静态检查命令：未配置（语义：missing）/);
  assert.match(fs.readFileSync(path.join(root, 'openspec/config.yaml'), 'utf8'), /operations:/);
  assert.match(fs.readFileSync(path.join(root, 'openspec/config.yaml'), 'utf8'), /归档前必须通过插件完成预览/);
  assert.match(fs.readFileSync(path.join(root, 'wayfinder/frontend.md'), 'utf8'), /openspecVersion: "1\.9\.0"/);
  assert.match(fs.readFileSync(path.join(root, 'wayfinder/frontend.md'), 'utf8'), /layout: "wayfinder"/);
  assert.match(fs.readFileSync(path.join(root, 'wayfinder/frontend.md'), 'utf8'), /frontend-ai-workflow:facts:start/);
  assert.match(fs.readFileSync(path.join(root, 'wayfinder/frontend.md'), 'utf8'), /analysisStatus: "not-requested"/);
  assert.match(fs.readFileSync(path.join(root, 'wayfinder/frontend.md'), 'utf8'), /analysisCoveredFiles: 0/);
  assert.equal(fs.existsSync(path.join(root, '.ai-workflow.yaml')), false);
  assert.equal(fs.existsSync(path.join(root, 'requirements', '_template.md')), false);
});

test('重复初始化不覆盖文件，升级只替换受管区块', (t) => {
  const root = createVueFixture(t);
  runBootstrap({ target: root, write: true });
  const agentsPath = path.join(root, 'AGENTS.md');
  const customized = fs.readFileSync(agentsPath, 'utf8')
    .replace('## 工作流', '## 旧工作流')
    .concat('\n项目保留内容：不得覆盖。\n');
  fs.writeFileSync(agentsPath, customized);

  const repeated = runBootstrap({ target: root, write: true });
  assert.equal(repeated.actions.find((item) => item.file === 'AGENTS.md').action, 'skip');
  assert.match(fs.readFileSync(agentsPath, 'utf8'), /## 旧工作流/);

  const upgraded = runUpdate({ target: root, write: true });
  assert.equal(upgraded.ok, true);
  const nextAgents = fs.readFileSync(agentsPath, 'utf8');
  assert.match(nextAgents, /## 工作流/);
  assert.doesNotMatch(nextAgents, /## 旧工作流/);
  assert.match(nextAgents, /项目保留内容：不得覆盖。/);
});

test('旧 Wayfinder 项目事实安全迁移且检查报告受管内容漂移', (t) => {
  const root = createVueFixture(t);
  runBootstrap({ target: root, write: true });
  const wayfinderPath = path.join(root, 'wayfinder/frontend.md');
  const openspecPath = path.join(root, 'openspec/config.yaml');
  const legacyWayfinder = fs.readFileSync(wayfinderPath, 'utf8')
    .replace(/<!-- frontend-ai-workflow:facts:start[^\n]*-->\n/u, '')
    .replace(/<!-- frontend-ai-workflow:facts:end -->\n/u, '')
    .replace(/- 技术栈：[^\n]+/u, '- 技术栈：未识别。')
    .replace('## 深度项目地图（待生成）', '## 深度项目地图（项目保留）')
    .concat('\n项目自定义 Wayfinder 内容。\n');
  fs.writeFileSync(wayfinderPath, legacyWayfinder, 'utf8');
  fs.writeFileSync(openspecPath, fs.readFileSync(openspecPath, 'utf8').replace('预设：vue3-vite', '预设：generic-frontend'), 'utf8');

  const before = checkProject(root);
  assert.equal(before.managedContentFreshness.checked, true);
  assert.equal(before.managedContentFreshness.stale, true);
  assert.deepEqual(before.managedContentFreshness.files, ['wayfinder/frontend.md', 'openspec/config.yaml']);
  assert.match(before.warnings.join('\n'), /受管工作流内容与当前项目识别结果不一致/u);

  const preview = runUpdate({ target: root });
  assert.equal(preview.write, false);
  assert.equal(preview.actions.find((item) => item.file === 'wayfinder/frontend.md').action, 'update');
  assert.equal(preview.actions.find((item) => item.file === 'openspec/config.yaml').action, 'update');
  assert.equal(fs.readFileSync(wayfinderPath, 'utf8'), legacyWayfinder);

  const applied = runUpdate({ target: root, write: true });
  assert.equal(applied.ok, true);
  const nextWayfinder = fs.readFileSync(wayfinderPath, 'utf8');
  assert.equal([...nextWayfinder.matchAll(/frontend-ai-workflow:facts:start/gu)].length, 1);
  assert.equal([...nextWayfinder.matchAll(/frontend-ai-workflow:facts:end/gu)].length, 1);
  assert.doesNotMatch(nextWayfinder, /技术栈：未识别/u);
  assert.match(nextWayfinder, /深度项目地图（项目保留）/u);
  assert.match(nextWayfinder, /项目自定义 Wayfinder 内容/u);
  assert.match(fs.readFileSync(openspecPath, 'utf8'), /预设：vue3-vite/u);
  assert.deepEqual(checkProject(root).managedContentFreshness, { checked: true, stale: false, files: [] });
});

test('深度刷新同步已有 OpenSpec 项目事实并保持重复执行稳定', (t) => {
  const root = createVueFixture(t);
  runBootstrap({ target: root, write: true });
  const openspecPath = path.join(root, 'openspec/config.yaml');
  fs.writeFileSync(openspecPath, fs.readFileSync(openspecPath, 'utf8').replace('预设：vue3-vite', '预设：generic-frontend'), 'utf8');

  const preview = runBootstrap({ target: root, deep: true });
  assert.equal(preview.actions.find((item) => item.file === 'openspec/config.yaml').action, 'update');
  assert.match(fs.readFileSync(openspecPath, 'utf8'), /预设：generic-frontend/u);

  const applied = runBootstrap({ target: root, deep: true, write: true });
  assert.equal(applied.ok, true);
  assert.match(fs.readFileSync(openspecPath, 'utf8'), /预设：vue3-vite/u);
  const repeated = runBootstrap({ target: root, deep: true, write: true });
  assert.equal(repeated.actions.find((item) => item.file === 'AGENTS.md').action, 'unchanged');
  assert.equal(repeated.actions.find((item) => item.file === 'openspec/config.yaml').action, 'unchanged');
  const repeatedWayfinder = fs.readFileSync(path.join(root, 'wayfinder/frontend.md'), 'utf8');
  assert.equal([...repeatedWayfinder.matchAll(/frontend-ai-workflow:facts:start/gu)].length, 1);
  assert.equal([...repeatedWayfinder.matchAll(/frontend-ai-workflow:facts:end/gu)].length, 1);
  assert.equal(runUpdate({ target: root, write: true }).actions.find((item) => item.file === 'wayfinder/frontend.md').action, 'unchanged');
});

test('已有无受管标记的 AGENTS.md 会被保留', (t) => {
  const root = createVueFixture(t);
  const agentsPath = path.join(root, 'AGENTS.md');
  fs.writeFileSync(agentsPath, '# Existing Rules\n');

  const result = runBootstrap({ target: root, write: true });
  const action = result.actions.find((item) => item.file === 'AGENTS.md');
  assert.equal(action.action, 'skip');
  assert.equal(fs.readFileSync(agentsPath, 'utf8'), '# Existing Rules\n');
});

// 最小运行时 fixture 复现根包、生产依赖、许可证和入口，专门用于验证漂移分支。
function createRuntimeIntegrityFixture(t) {
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

test('插件内置规划运行时可独立执行', () => {
  const runtime = inspectBundledOpenSpec();
  const result = runOpenSpecSync(['--version']);

  assert.equal(runtime.available, true);
  assert.equal(runtime.version, BUNDLED_OPENSPEC_VERSION);
  assert.equal(result.status, 0);
  assert.equal(result.source, 'bundled');
  assert.equal(result.stdout.trim(), BUNDLED_OPENSPEC_VERSION);
  const runtimeManifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'runtime', 'openspec', 'package.json'), 'utf8'));
  assert.equal(BUNDLED_OPENSPEC_VERSION, '1.9.0');
  assert.equal(runtimeManifest.version, BUNDLED_OPENSPEC_VERSION);
  assert.equal(runtimeManifest.bin.openspec, './bin/openspec.js');
  assert.equal(Object.hasOwn(runtimeManifest.dependencies, 'posthog-node'), false);
  assert.equal(fs.existsSync(path.join(pluginRoot, 'runtime', 'openspec', 'LICENSE')), true);
  for (const dependency of Object.keys(runtimeManifest.dependencies)) {
    assert.equal(fs.existsSync(path.join(pluginRoot, 'runtime', 'openspec', 'node_modules', dependency)), true, dependency);
  }
  const wrapper = fs.readFileSync(path.join(pluginRoot, 'scripts', 'openspec-cli.mjs'), 'utf8');
  assert.match(wrapper, /OPENSPEC_NO_UPDATE_CHECK: '1'/);
  assert.match(wrapper, /OPENSPEC_TELEMETRY: '0'/);
});

test('内置 OpenSpec 完整性清单可重复计算且不包含环境路径', () => {
  const first = buildRuntimeIntegrityManifest();
  const second = buildRuntimeIntegrityManifest();
  const content = formatRuntimeIntegrityManifest(first);
  const managed = fs.readFileSync(path.join(pluginRoot, 'runtime', 'openspec-integrity.json'), 'utf8');

  assert.deepEqual(first, second);
  assert.equal(content, managed);
  assert.equal(first.runtime.version, BUNDLED_OPENSPEC_VERSION);
  assert.equal(first.runtime.entrypoint, 'bin/openspec.js');
  assert.ok(first.packages.length > 50);
  assert.equal(first.packages[0].path, '.');
  assert.ok(first.packages.every((item) => /^[a-f0-9]{64}$/u.test(item.treeSha256)));
  assert.ok(first.packages.every((item) => item.license && item.fileCount > 0));
  assert.doesNotMatch(content, new RegExp(process.cwd().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(content, /generatedAt|createdAt/);
  assert.equal(verifyRuntimeIntegrity().ok, true);
});

test('运行时完整性默认只读并阻止内容与包集合漂移', (t) => {
  const { runtimeRoot, integrityPath } = createRuntimeIntegrityFixture(t);
  const missing = verifyRuntimeIntegrity({ runtimeRoot, integrityPath });
  assert.equal(missing.ok, false);
  assert.equal(fs.existsSync(integrityPath), false);

  const written = writeRuntimeIntegrity({ runtimeRoot, integrityPath });
  const baseline = fs.readFileSync(integrityPath, 'utf8');
  assert.equal(written.packages, 2);
  assert.equal(verifyRuntimeIntegrity({ runtimeRoot, integrityPath }).ok, true);

  writeFixtureFile(runtimeRoot, 'node_modules/.bin/openspec', '可重建的命令链接替身\n');
  assert.equal(verifyRuntimeIntegrity({ runtimeRoot, integrityPath }).ok, true);
  writeRuntimeIntegrity({ runtimeRoot, integrityPath });
  assert.equal(fs.readFileSync(integrityPath, 'utf8'), baseline);

  writeFixtureFile(runtimeRoot, 'node_modules/fixture-dependency/index.js', "export default 'changed';\n");
  const changed = verifyRuntimeIntegrity({ runtimeRoot, integrityPath });
  assert.equal(changed.ok, false);
  assert.match(changed.errors.join('\n'), /fixture-dependency/);

  writeRuntimeIntegrity({ runtimeRoot, integrityPath });
  writeFixtureFile(runtimeRoot, 'node_modules/extra-package/package.json', '{"name":"extra-package","version":"1.0.0","license":"MIT"}\n');
  writeFixtureFile(runtimeRoot, 'node_modules/extra-package/index.js', "export default 'extra';\n");
  const added = verifyRuntimeIntegrity({ runtimeRoot, integrityPath });
  assert.equal(added.ok, false);
  assert.match(added.errors.join('\n'), /新增未登记包：node_modules\/extra-package/);
});

test('健康检查使用插件内置规划运行时', (t) => {
  const root = createVueFixture(t);
  runBootstrap({ target: root, write: true });

  const result = checkProject(root);
  assert.equal(result.ok, true);
  assert.equal(result.version, '0.15.0');
  assert.equal(result.layout, 'wayfinder');
  assert.equal(result.errors.length, 0);
  assert.equal(result.planningEngine.available, true);
  assert.equal(result.planningEngine.source, 'bundled');
  assert.equal(result.planningEngine.version, BUNDLED_OPENSPEC_VERSION);
});

test('范围清单完整记账且结果稳定', (t) => {
  const root = createVueFixture(t);
  const limits = { maxFileBytes: 128, maxTotalBytes: 4096 };
  const first = collectProjectScope(root, limits);
  const second = collectProjectScope(root, limits);

  assert.equal(first.version, PROJECT_SCOPE_VERSION);
  assert.deepEqual(first, second);
  assert.ok(first.includedFiles.some((file) => file.path === 'src/router/index.js'));
  assert.ok(first.includedFiles.some((file) => file.path === 'src/request/http.js'));
  assert.ok(first.excludedFiles.some((file) => file.path === 'node_modules' && file.kind === 'directory'));
  assert.ok(first.excludedFiles.some((file) => file.path === 'docs/oversized.md' && file.reason.startsWith('超过单文件限制')));
  assert.throws(() => collectProjectScope(path.parse(root).root), /拒绝在高风险目录扫描/);
});

test('微信小程序文本源码进入安全范围并参与稳定指纹', (t) => {
  const root = createVueFixture(t);
  assert.equal(spawnSync('git', ['init', '-q', root], { encoding: 'utf8' }).status, 0);
  writeFixtureFile(root, '.gitignore', 'ignored/\n');
  writeFixtureFile(root, 'pages/home/index.wxml', '<view>{{message}}</view>\n');
  writeFixtureFile(root, 'pages/home/spacing.wxml', [
    '<view class="valid" bindtap="ok"></view>',
    '<view class="broken"bindtap="broken"></view>',
    '<!-- <view class="single-comment"bindtap="ignored"></view> -->',
    '<view class="before"bindtap="before"></view><!-- <view class="inline-comment"bindtap="ignored"></view> --><view class="after"bindtap="after"></view>',
    '<!--',
    '<view class="multi-comment"bindtap="ignored"></view>',
    '-->',
    '<!-- <view class="unclosed-comment"bindtap="ignored"></view>',
  ].join('\n'));
  writeFixtureFile(root, 'pages/home/index.wxss', '.page { color: #333; }\n');
  writeFixtureFile(root, 'pages/home/format.wxs', 'module.exports = {};\n');
  writeFixtureFile(root, 'ignored/hidden.wxml', '<view class="ignored"bindtap="ignored"></view>\n');
  writeFixtureFile(root, 'pages/home/binary.wxs', `\u0000binary\n`);

  const first = collectProjectScope(root);
  assert.equal(first.version, '2.2.0');
  for (const file of ['pages/home/index.wxml', 'pages/home/index.wxss', 'pages/home/format.wxs']) {
    assert.ok(first.includedFiles.some((item) => item.path === file), file);
  }
  assert.ok(first.excludedFiles.some((item) => item.path === 'ignored/hidden.wxml' && /Git 忽略/u.test(item.reason)));
  assert.ok(first.excludedFiles.some((item) => item.path === 'pages/home/binary.wxs' && /空字节/u.test(item.reason)));
  assert.equal(first.validationEvidence.contentRead.executed, true);
  assert.equal(first.validationEvidence.contentHash.status, 'performed');
  assert.equal(first.validationEvidence.syntaxParse.executed, false);
  assert.equal(first.validationEvidence.platformCompile.status, 'not-run');
  assert.equal(first.validationEvidence.lint.executed, false);
  assert.equal(first.validationEvidence.test.executed, false);
  assert.deepEqual(first.observations.map(({ code, path: file, line }) => ({ code, file, line })), [
    { code: 'wxml-attribute-spacing', file: 'pages/home/spacing.wxml', line: 2 },
    { code: 'wxml-attribute-spacing', file: 'pages/home/spacing.wxml', line: 4 },
    { code: 'wxml-attribute-spacing', file: 'pages/home/spacing.wxml', line: 4 },
  ]);
  assert.equal(first.summary.observations, 3);

  writeFixtureFile(root, 'pages/home/index.wxml', '<view>{{changed}}</view>\n');
  assert.notEqual(collectProjectScope(root).fingerprint, first.fingerprint);
});

test('健康检查公开验证边界并非阻断报告 WXML 静态观察', (t) => {
  const root = createVueFixture(t);
  writeFixtureFile(root, 'pages/home/index.wxml', '<view class="page"bindtap="open"></view>\n');
  runBootstrap({ target: root, deep: true, write: true });

  const observed = checkProject(root);
  assert.equal(observed.ok, true);
  assert.equal(observed.deepAnalysis.freshness.stale, false);
  assert.equal(observed.deepAnalysis.validationEvidence.syntaxParse.status, 'not-run');
  assert.equal(observed.deepAnalysis.validationEvidence.platformCompile.executed, false);
  assert.deepEqual(observed.deepAnalysis.observations.map(({ code, path: file, line }) => ({ code, file, line })), [{
    code: 'wxml-attribute-spacing',
    file: 'pages/home/index.wxml',
    line: 1,
  }]);
  assert.match(observed.warnings.join('\n'), /静态发现 1 处 WXML 属性之间可能缺少空白/u);
  assert.match(observed.warnings.join('\n'), /未执行 WXML 语法解析或平台编译/u);

  writeFixtureFile(root, 'pages/home/index.wxml', '<view class="page" bindtap="open"></view>\n');
  const corrected = checkProject(root);
  assert.deepEqual(corrected.deepAnalysis.observations, []);
  assert.doesNotMatch(corrected.warnings.join('\n'), /静态发现.*WXML 属性/u);
});

test('深度初始化写入 Wayfinder 且保留 AI 项目地图', (t) => {
  const root = createVueFixture(t);
  const preview = runBootstrap({ target: root, deep: true });

  assert.equal(preview.ok, true);
  assert.equal(preview.write, false);
  assert.ok(preview.scope);
  assert.equal(preview.actions.some((item) => item.file === 'wayfinder/frontend.md'), true);
  assert.equal(preview.actions.some((item) => item.file === '.ai-workflow.yaml'), false);

  const applied = runBootstrap({ target: root, deep: true, write: true });
  const frontendPath = path.join(root, 'wayfinder', 'frontend.md');
  assert.equal(applied.ok, true);
  assert.match(fs.readFileSync(frontendPath, 'utf8'), /frontend-ai-workflow:meta:start/);
  assert.match(fs.readFileSync(frontendPath, 'utf8'), /frontend-ai-workflow:scope:start/);
  assert.match(fs.readFileSync(frontendPath, 'utf8'), /frontend-ai-workflow:analysis:start/);
  assert.match(fs.readFileSync(frontendPath, 'utf8'), /analysisStatus: "pending"/);
  assert.match(fs.readFileSync(frontendPath, 'utf8'), /analysisCoveredFiles: 0/);
  assert.equal(fs.existsSync(path.join(root, '.ai-workflow.yaml')), false);
  assert.equal(fs.existsSync(path.join(root, 'docs', 'ai-context', 'frontend.md')), false);
  // 常规升级不能意外将已完成深度扫描的项目降级为浅层工作流。
  runUpdate({ target: root, write: true });
  assert.match(fs.readFileSync(frontendPath, 'utf8'), /deepAnalysis: true/);

  const customized = fs.readFileSync(frontendPath, 'utf8').replace('## 深度项目地图（待生成）', '## 深度项目地图（人工补充）');
  fs.writeFileSync(frontendPath, customized, 'utf8');
  const refreshed = runUpdate({ target: root, deep: true, write: true });
  assert.equal(refreshed.ok, true);
  const refreshedContent = fs.readFileSync(frontendPath, 'utf8');
  assert.match(refreshedContent, /人工补充/);
  assert.match(refreshedContent, /analysisStatus: "pending"/);
  assert.match(refreshedContent, /analysisCoveredFiles: 0/);

  const checked = checkProject(root);
  assert.equal(checked.ok, true);
  assert.equal(checked.deepAnalysis.enabled, true);
  assert.equal(checked.deepAnalysis.scopeVersion, PROJECT_SCOPE_VERSION);
  assert.equal(checked.deepAnalysis.analysis.status, 'pending');
  assert.match(checked.warnings.join('\n'), /项目地图仍待生成/u);
});

test('深度项目地图完成态要求全量覆盖、结构证据，并会在刷新后安全失效', (t) => {
  const root = createVueFixture(t);
  runBootstrap({ target: root, deep: true, write: true });
  const frontendPath = path.join(root, 'wayfinder', 'frontend.md');
  const completed = completeWayfinderAnalysis(fs.readFileSync(frontendPath, 'utf8'));
  fs.writeFileSync(frontendPath, completed, 'utf8');

  const checked = checkProject(root);
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.deepAnalysis.analysis, {
    status: 'complete',
    coveredFiles: Number(completed.match(/scopeIncludedFiles: (\d+)/u)?.[1]),
    totalFiles: Number(completed.match(/scopeIncludedFiles: (\d+)/u)?.[1]),
    updatedAt: '2026-08-05T00:00:00.000Z',
    complete: true,
  });

  fs.writeFileSync(frontendPath, completed.replace(/- 技术栈：[^\n]+/u, '- 技术栈：未识别。'), 'utf8');
  const upgraded = runUpdate({ target: root, write: true });
  assert.equal(upgraded.ok, true);
  const preserved = fs.readFileSync(frontendPath, 'utf8');
  assert.match(preserved, /analysisStatus: "complete"/);
  assert.match(preserved, /analysisUpdatedAt: "2026-08-05T00:00:00.000Z"/);
  assert.match(preserved, /资料请求经/);
  assert.doesNotMatch(preserved, /技术栈：未识别/u);

  fs.writeFileSync(
    frontendPath,
    completed
      .replace('### 项目运行与交付边界', '### 项目自定义启动边界')
      .replace('### 功能与依赖链路', '### 页面调用关系'),
    'utf8',
  );
  assert.equal(checkProject(root).ok, true);

  fs.writeFileSync(
    frontendPath,
    completed
      .replace('analysisStatus: "complete"', 'analysisStatus: "partial"')
      .replace(/analysisCoveredFiles: \d+/u, 'analysisCoveredFiles: 1'),
    'utf8',
  );
  const partial = checkProject(root);
  assert.equal(partial.ok, true);
  assert.equal(partial.deepAnalysis.analysis.complete, false);
  assert.match(partial.warnings.join('\n'), /仅覆盖 1\//u);

  fs.writeFileSync(frontendPath, completed.replace(/analysisCoveredFiles: \d+/u, 'analysisCoveredFiles: 0'), 'utf8');
  const invalid = checkProject(root);
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join('\n'), /覆盖数必须等于纳入文件数/u);

  const verificationMarker = '<!-- frontend-ai-workflow:analysis-dimension:verification-risks -->';
  fs.writeFileSync(frontendPath, `${completed.replace(verificationMarker, '')}\n${verificationMarker}\n`, 'utf8');
  const incompleteStructure = checkProject(root);
  assert.equal(incompleteStructure.ok, false);
  assert.match(incompleteStructure.errors.join('\n'), /验证基线与高风险区域（标记数：0）/u);

  fs.writeFileSync(frontendPath, completed, 'utf8');
  const refreshed = runBootstrap({ target: root, deep: true, write: true });
  assert.equal(refreshed.ok, true);
  const pending = fs.readFileSync(frontendPath, 'utf8');
  assert.match(pending, /analysisStatus: "pending"/);
  assert.match(pending, /analysisCoveredFiles: 0/);
  assert.match(pending, /资料请求经/);
  assert.match(checkProject(root).warnings.join('\n'), /项目地图仍待生成/u);
});

test('深度初始化不覆盖没有受管标记的 Wayfinder', (t) => {
  const root = createVueFixture(t);
  const frontendPath = path.join(root, 'wayfinder', 'frontend.md');
  writeFixtureFile(root, 'wayfinder/frontend.md', '# 项目自定义导航\n');

  const result = runBootstrap({ target: root, deep: true, write: true });
  assert.equal(result.ok, false);
  assert.equal(result.actions.find((item) => item.file === 'wayfinder/frontend.md').action, 'conflict');
  assert.equal(fs.readFileSync(frontendPath, 'utf8'), '# 项目自定义导航\n');
});

test('旧布局必须显式迁移并保留项目事实与硬约束', (t) => {
  const root = createVueFixture(t);
  runBootstrap({ target: root, deep: true, write: true });
  const agentsPath = path.join(root, 'AGENTS.md');
  fs.writeFileSync(agentsPath, fs.readFileSync(agentsPath, 'utf8').replace(
    '完成深度扫描后，AI 在本区块写入 4–8 条项目专属的高影响硬约束。每条均须简洁、可执行，并附源码证据路径；只记录已确认的请求边界、鉴权/安全状态、路由或构建边界、验证基线等“不可随意破坏”的事实，不把推断和待确认项写成约束。',
    '- **请求边界**：页面不得绕过 `src/serve` 直接调用请求层。',
  ));
  writeLegacyWorkflow(root);

  const legacy = checkProject(root);
  assert.equal(legacy.ok, true);
  assert.equal(legacy.layout, 'legacy');
  assert.equal(legacy.migrationRequired, true);
  const preview = runWayfinderMigration({ target: root });
  assert.equal(preview.ok, true);
  assert.equal(fs.existsSync(path.join(root, 'wayfinder', 'frontend.md')), false);
  assert.equal(preview.actions.some((item) => item.file === 'docs/ai-context/frontend.md' && item.action === 'delete'), true);

  const updated = runUpdate({ target: root, write: true });
  assert.equal(updated.migrationRequired, true);
  assert.equal(fs.existsSync(path.join(root, 'wayfinder', 'frontend.md')), false);
  const migrated = runWayfinderMigration({ target: root, write: true });
  assert.equal(migrated.ok, true);
  const wayfinder = fs.readFileSync(path.join(root, 'wayfinder', 'frontend.md'), 'utf8');
  assert.match(wayfinder, /项目维护者说明：迁移后必须保留。/);
  assert.match(wayfinder, /analysisStatus: "pending"/);
  assert.match(wayfinder, /analysisCoveredFiles: 0/);
  assert.match(fs.readFileSync(agentsPath, 'utf8'), /页面不得绕过/);
  assert.equal(fs.existsSync(path.join(root, 'docs', 'ai-context', 'frontend.md')), false);
  assert.equal(fs.existsSync(path.join(root, '.ai-workflow.yaml')), false);
  assert.equal(fs.existsSync(path.join(root, 'requirements', '_template.md')), false);
  assert.equal(checkProject(root).layout, 'wayfinder');
  const repeated = runWayfinderMigration({ target: root });
  assert.equal(repeated.ok, false);
  assert.equal(repeated.actions[0].reason, '目标不是可迁移的旧工作流布局');
});

test('Wayfinder 迁移保留用户自定义的旧元数据与需求模板', (t) => {
  const root = createVueFixture(t);
  runBootstrap({ target: root, deep: true, write: true });
  writeLegacyWorkflow(root, { customMetadata: 'releaseChannel: "uat"\n', requirementTemplate: '# 项目专属需求模板\n' });

  const preview = runWayfinderMigration({ target: root });
  assert.equal(preview.ok, true);
  assert.equal(preview.actions.some((item) => item.file === '.ai-workflow.yaml' && item.action === 'keep'), true);
  assert.equal(preview.actions.some((item) => item.file === 'requirements/_template.md' && item.action === 'keep'), true);
  runWayfinderMigration({ target: root, write: true });
  assert.equal(fs.existsSync(path.join(root, '.ai-workflow.yaml')), true);
  assert.equal(fs.existsSync(path.join(root, 'requirements', '_template.md')), true);
});

test('深度项目约束会被升级保留且健康检查要求有效标记', (t) => {
  const root = createVueFixture(t);
  runBootstrap({ target: root, deep: true, write: true });
  const agentsPath = path.join(root, 'AGENTS.md');
  const customized = fs.readFileSync(agentsPath, 'utf8').replace(
    '完成深度扫描后，AI 在本区块写入 4–8 条项目专属的高影响硬约束。每条均须简洁、可执行，并附源码证据路径；只记录已确认的请求边界、鉴权/安全状态、路由或构建边界、验证基线等“不可随意破坏”的事实，不把推断和待确认项写成约束。',
    '- **请求边界**：页面不得绕过 `src/serve` 直接调用请求层（证据：`src/serve/profile.js`）。',
  );
  fs.writeFileSync(agentsPath, customized, 'utf8');
  const updated = runUpdate({ target: root, write: true });
  assert.equal(updated.ok, true);
  assert.match(fs.readFileSync(agentsPath, 'utf8'), /页面不得绕过/);
  const malformed = fs.readFileSync(agentsPath, 'utf8').replace(/<!-- frontend-ai-workflow:deep-guardrails:end -->/, '');
  fs.writeFileSync(agentsPath, malformed, 'utf8');
  const checked = checkProject(root);
  assert.equal(checked.ok, false);
  assert.match(checked.errors.join('\n'), /deep-guardrails/);
});

test('深度扫描规则要求覆盖、证据与不确定性披露', () => {
  const reference = fs.readFileSync(path.join(pluginRoot, 'references', 'deep-project-analysis.md'), 'utf8');
  const skill = fs.readFileSync(path.join(pluginRoot, 'skills', 'frontend-workflow-bootstrap', 'SKILL.md'), 'utf8');
  const checkSkill = fs.readFileSync(path.join(pluginRoot, 'skills', 'frontend-workflow-check', 'SKILL.md'), 'utf8');

  assert.match(reference, /每个纳入文件分批读取/);
  assert.match(reference, /扫描报告/);
  assert.match(reference, /frontend\.md/);
  assert.match(reference, /已确认事实/);
  assert.match(reference, /待确认项/);
  assert.match(reference, /validationEvidence/);
  assert.match(reference, /不得写“没有解析错误”/);
  assert.match(reference, /观察数组为空.*不表示源码已经通过/u);
  assert.match(reference, /analysisStatus: complete/);
  assert.match(reference, /数据、状态与安全边界/);
  assert.match(reference, /Service Worker/);
  assert.match(reference, /Feature Flag/);
  assert.match(skill, /includedFiles/);
  assert.match(skill, /validationEvidence/);
  assert.match(skill, /do not prove syntax parsing, platform compilation, Lint or tests/);
  assert.match(skill, /never upgrade a heuristic observation/);
  assert.match(checkSkill, /deepAnalysis\.validationEvidence/);
  assert.match(checkSkill, /not as a confirmed WXML syntax or platform compilation failure/);
  assert.match(skill, /Never create `project-scan\.md`/);
  assert.match(skill, /do not describe the result as complete/);
  assert.match(skill, /analysisCoveredFiles/);
  assert.match(checkSkill, /deepAnalysis\.analysis\.status/);
});

test('需求模板仅作为插件资产按需使用', () => {
  const skill = fs.readFileSync(path.join(pluginRoot, 'skills', 'frontend-requirement-write', 'SKILL.md'), 'utf8');
  const template = path.join(pluginRoot, 'assets', 'templates', 'requirements', '_template.md');

  assert.equal(fs.existsSync(template), true);
  assert.match(skill, /when present; otherwise use/);
  assert.match(skill, /requirements\/REQ-\*\.md/);
});

test('变更验证规则优先选择当前需求影响面的测试', () => {
  const skill = fs.readFileSync(path.join(pluginRoot, 'skills', 'frontend-change', 'SKILL.md'), 'utf8');

  assert.match(skill, /affected files and chains/);
  assert.match(skill, /narrowest existing tests/);
  assert.match(skill, /matching manual checks/);
  assert.match(skill, /full project test command only/);
});

test('[TC-09] 跨平台高风险变更规则合同', () => {
  const repositoryRules = fs.readFileSync('AGENTS.md', 'utf8');
  const agentsTemplate = fs.readFileSync(path.join(pluginRoot, 'assets', 'templates', 'AGENTS.md'), 'utf8');
  const changeSkill = fs.readFileSync(path.join(pluginRoot, 'skills', 'frontend-change', 'SKILL.md'), 'utf8');
  const checklist = fs.readFileSync(path.join(pluginRoot, 'references', 'cross-platform-ci-checklist.md'), 'utf8');
  const structureValidator = fs.readFileSync(path.join(pluginRoot, 'scripts', 'validate-structure.mjs'), 'utf8');

  for (const rules of [repositoryRules, agentsTemplate]) {
    assert.match(rules, /跨平台高风险/);
    assert.match(rules, /CI.*路径.*临时目录.*子进程.*包管理器入口.*环境变量.*机器可读诊断/su);
    assert.match(rules, /code.*target.*status/su);
  }

  assert.match(changeSkill, /cross-platform-ci-checklist\.md/u);
  assert.match(changeSkill, /cross-platform risk/u);
  assert.match(changeSkill, /actual CI-matrix evidence/u);
  assert.match(checklist, /GIT_CEILING_DIRECTORIES/u);
  assert.match(checklist, /npm\.cmd/u);
  assert.match(checklist, /POSIX.*Windows/su);
  assert.match(checklist, /code.*target.*status/su);
  assert.match(checklist, /本地.*真实 CI 矩阵/su);
  assert.match(checklist, /精确提交 SHA/u);
  assert.match(structureValidator, /references\/cross-platform-ci-checklist\.md/u);
});

test('新功能测试策略保护生成基线并要求专用测试决策', () => {
  const guidelines = fs.readFileSync(path.join(pluginRoot, 'references', 'requirement-guidelines.md'), 'utf8');
  const requirementSkill = fs.readFileSync(path.join(pluginRoot, 'skills', 'frontend-requirement-write', 'SKILL.md'), 'utf8');
  const changeSkill = fs.readFileSync(path.join(pluginRoot, 'skills', 'frontend-change', 'SKILL.md'), 'utf8');
  const agentsTemplate = fs.readFileSync(path.join(pluginRoot, 'assets', 'templates', 'AGENTS.md'), 'utf8');
  const requirementTemplate = fs.readFileSync(path.join(pluginRoot, 'assets', 'templates', 'requirements', '_template.md'), 'utf8');

  for (const content of [guidelines, agentsTemplate]) {
    assert.match(content, /\.generated\.spec\./);
    assert.match(content, /专用测试/);
  }
  for (const content of [requirementSkill, changeSkill]) {
    assert.match(content, /\.generated\.spec\./);
    assert.match(content, /feature-specific test/);
  }
  assert.match(guidelines, /新建 \/ 复用/);
  assert.match(requirementSkill, /test-file strategy/);
  assert.match(changeSkill, /before implementation/);
  assert.match(requirementTemplate, /测试文件策略：新建 \/ 复用；目标路径：；基线证据：；选择理由：/);
  assert.match(requirementTemplate, /## 验证记录/);
});

test('局部需求默认聚焦验证且最终交付不自动触发覆盖率', () => {
  const guidelines = fs.readFileSync(path.join(pluginRoot, 'references', 'requirement-guidelines.md'), 'utf8');
  const requirementSkill = fs.readFileSync(path.join(pluginRoot, 'skills', 'frontend-requirement-write', 'SKILL.md'), 'utf8');
  const changeSkill = fs.readFileSync(path.join(pluginRoot, 'skills', 'frontend-change', 'SKILL.md'), 'utf8');
  const agentsTemplate = fs.readFileSync(path.join(pluginRoot, 'assets', 'templates', 'AGENTS.md'), 'utf8');
  const requirementTemplate = fs.readFileSync(path.join(pluginRoot, 'assets', 'templates', 'requirements', '_template.md'), 'utf8');
  const openSpecTemplate = fs.readFileSync(path.join(pluginRoot, 'assets', 'templates', 'openspec', 'config.yaml'), 'utf8');

  assert.match(guidelines, /最终交付只是报告时机/);
  assert.match(guidelines, /局部页面、组件、表单或独立业务交互默认运行专用测试/);
  assert.match(requirementSkill, /Final delivery alone is not a full-verification reason/);
  assert.match(changeSkill, /Final delivery alone is not a full-test reason/);
  assert.doesNotMatch(changeSkill, /or during final delivery/);
  assert.match(agentsTemplate, /不因它是 coverage 或处于最终交付就自动执行全量测试/);
  assert.match(requirementTemplate, /验证范围：聚焦 \/ 全量；执行命令：；选择理由：/);
  assert.match(openSpecTemplate, /全量测试或 coverage 必须注明/);
});

test('需求决策台账阻止未确认决策和无证据验收进入任务', (t) => {
  const root = createVueFixture(t);
  const requirementPath = path.join(root, 'requirements', 'REQ-2026-001-decision-ledger.md');
  const changePath = path.join(root, 'openspec', 'changes', 'sample-change');
  const renderRequirement = (status = '已确认', assertion = '字段显示中文错误文案') => `# 决策台账示例

## 决策台账

| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 关闭弹窗行为 | ${status} | 只清理输入 | 用户描述 |

## 验收标准

- [ ] [A-01] 非法输入显示错误文案。

## 验收—证据映射

| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 |
| --- | --- | --- | --- | --- | --- |
| A-01 | 非法输入提示 | D-01 | 自动 | src/__tests__/form.spec.js | ${assertion} |
`;

  writeFixtureFile(root, 'requirements/REQ-2026-001-decision-ledger.md', renderRequirement());
  writeFixtureFile(root, 'openspec/changes/sample-change/tasks.md', '- [ ] [D-01] [A-01] 实现并验证关闭行为。\n');

  const valid = validateRequirementDecisions(requirementPath, { changePath });
  assert.equal(valid.ok, true);
  assert.equal(valid.decisions, 1);
  assert.equal(valid.acceptances, 1);

  writeFixtureFile(root, 'requirements/REQ-2026-001-decision-ledger.md', renderRequirement('待确认'));
  const pending = validateRequirementDecisions(requirementPath, { changePath });
  assert.equal(pending.ok, false);
  assert.match(pending.errors.join('\n'), /不可实施决策 D-01/);

  writeFixtureFile(root, 'requirements/REQ-2026-001-decision-ledger.md', renderRequirement('已确认', '待填写'));
  const missingEvidence = validateRequirementDecisions(requirementPath, { changePath });
  assert.equal(missingEvidence.ok, false);
  assert.match(missingEvidence.errors.join('\n'), /缺少断言结果/);

  writeFixtureFile(root, 'openspec/changes/sample-change/tasks.md', '- [ ] [D-99] [A-01] 实现未知决策。\n');
  const unknown = validateRequirementDecisions(requirementPath, { changePath });
  assert.equal(unknown.ok, false);
  assert.match(unknown.errors.join('\n'), /未知决策：D-99/);
});

test('需求模板和工作流要求使用决策台账与验收证据映射', () => {
  const template = fs.readFileSync(path.join(pluginRoot, 'assets', 'templates', 'requirements', '_template.md'), 'utf8');
  const agents = fs.readFileSync(path.join(pluginRoot, 'assets', 'templates', 'AGENTS.md'), 'utf8');
  const config = fs.readFileSync(path.join(pluginRoot, 'assets', 'templates', 'openspec', 'config.yaml'), 'utf8');
  const requirementSkill = fs.readFileSync(path.join(pluginRoot, 'skills', 'frontend-requirement-write', 'SKILL.md'), 'utf8');
  const changeSkill = fs.readFileSync(path.join(pluginRoot, 'skills', 'frontend-change', 'SKILL.md'), 'utf8');

  assert.match(template, /## 决策台账/);
  assert.match(template, /## 验收—证据映射/);
  assert.match(template, /验证记录/);
  assert.match(template, /## 交互状态矩阵/);
  assert.match(template, /初始（已有数据）/);
  assert.match(agents, /状态矩阵/);
  assert.match(config, /初始、用户操作、刷新、空态、错误态和卸载/);
  assert.match(changeSkill, /interaction-state matrix/);
  assert.match(template, /\[A-01\]/);
  assert.match(agents, /决策台账”是业务事实源/);
  assert.match(config, /已确认或项目默认的 D-\*/);
  assert.match(config, /交付构建命令/);
  assert.match(requirementSkill, /validate-requirement-decisions/);
  assert.match(changeSkill, /--change <change-root>/);
});

test('决策校验阻止拆分规格绕过需求台账', (t) => {
  const root = createVueFixture(t);
  const requirementPath = path.join(root, 'requirements', 'REQ-2026-002-spec-reference.md');
  const changePath = path.join(root, 'openspec', 'changes', 'sample-change');
  const requirement = [
    '# 规格追溯示例', '', '## 决策台账', '',
    '| ID | 决策项 | 状态 | 取值 | 来源 |', '| --- | --- | --- | --- | --- |',
    '| D-01 | 提交后的提示 | 已确认 | 显示成功提示 | 用户描述 |', '',
    '## 验收标准', '', '- [ ] [A-01] 提交成功时显示成功提示。', '',
    '## 验收—证据映射', '',
    '| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| A-01 | 成功提示 | D-01 | 自动 | src/__tests__/form.spec.js | 显示成功提示 |', '',
  ].join('\n');

  writeFixtureFile(root, 'requirements/REQ-2026-002-spec-reference.md', requirement);
  writeFixtureFile(root, 'openspec/changes/sample-change/tasks.md', '- [ ] [D-01] [A-01] 实现成功提示。\n');
  writeFixtureFile(root, 'openspec/changes/sample-change/specs/form/spec.md', '## Requirements\n\n### Requirement: 提交\n\n系统应显示提示。\n');

  const result = validateRequirementDecisions(requirementPath, { changePath });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /specs\/form\/spec.md 缺少 D-\* 决策引用/);
  assert.match(result.errors.join('\n'), /specs\/form\/spec.md 缺少 A-\* 验收引用/);
});

function renderGovernedDeliveryRequirement({
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

function writeManagedChange(root, {
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

test('安全范围排除敏感与 Git 忽略文件并生成稳定指纹', (t) => {
  const root = createVueFixture(t);
  assert.equal(spawnSync('git', ['init', '-q', root], { encoding: 'utf8' }).status, 0);
  writeFixtureFile(root, '.gitignore', '.env.local\nignored/\n');
  writeFixtureFile(root, '.env.local', 'SECRET=not-readable\n');
  writeFixtureFile(root, '.env.example', 'PUBLIC_KEY=\n');
  writeFixtureFile(root, 'credentials.json', '{"token":"not-readable"}\n');
  writeFixtureFile(root, 'ignored/local.js', 'export const ignored = true;\n');
  writeFixtureFile(root, 'docs/priority.md', '文档'.repeat(800));

  const first = collectProjectScope(root, { maxFileBytes: 8192, maxTotalBytes: 1400 });
  const second = collectProjectScope(root, { maxFileBytes: 8192, maxTotalBytes: 1400 });
  assert.deepEqual(first, second);
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/);
  assert.ok(first.includedFiles.some((file) => file.path === '.env.example'));
  assert.ok(first.includedFiles.some((file) => file.path === 'src/router/index.js'));
  assert.ok(first.excludedFiles.some((file) => file.path === '.env.local' && /敏感配置/.test(file.reason)));
  assert.ok(first.excludedFiles.some((file) => file.path === 'credentials.json' && /凭据/.test(file.reason)));
  assert.ok(first.excludedFiles.some((file) => file.path === 'ignored/local.js' && /Git 忽略/.test(file.reason)));
  assert.ok(first.excludedFiles.some((file) => file.path === 'docs/priority.md' && /总文件限制/.test(file.reason)));

  writeFixtureFile(root, 'src/router/index.js', "export const routes = [{ path: '/changed' }];\n");
  assert.notEqual(collectProjectScope(root, { maxFileBytes: 8192, maxTotalBytes: 1400 }).fingerprint, first.fingerprint);
});

test('Wayfinder 保留扫描快照并只读报告项目地图过期', (t) => {
  const root = createVueFixture(t);
  runBootstrap({ target: root, deep: true, write: true });
  const wayfinderPath = path.join(root, 'wayfinder', 'frontend.md');
  const initial = fs.readFileSync(wayfinderPath, 'utf8');
  const initialSettings = initial.match(/scopeFingerprint: "([^"]+)"/)?.[1];
  assert.match(initialSettings, /^[a-f0-9]{64}$/);
  assert.equal(checkProject(root).deepAnalysis.freshness.stale, false);

  runUpdate({ target: root, write: true });
  const upgraded = fs.readFileSync(wayfinderPath, 'utf8');
  assert.equal(upgraded.match(/scopeFingerprint: "([^"]+)"/)?.[1], initialSettings);
  assert.equal(upgraded.match(/scopeScannedAt: "([^"]+)"/)?.[1], initial.match(/scopeScannedAt: "([^"]+)"/)?.[1]);

  writeFixtureFile(root, 'src/views/Home.vue', '<template><main>Changed</main></template>\n');
  const stale = checkProject(root);
  assert.equal(stale.deepAnalysis.freshness.stale, true);
  assert.match(stale.warnings.join('\n'), /项目地图可能过期/);
  assert.equal(fs.readFileSync(wayfinderPath, 'utf8'), upgraded);
});

test('新版需求状态、变更范围、逐任务引用和持久证据形成完成前门槛', (t) => {
  const root = createVueFixture(t);
  const requirementPath = path.join(root, 'requirements', 'REQ-2026-004-governed.md');
  const changePath = path.join(root, 'openspec', 'changes', 'delivery');
  initializeGitBaseline(root);
  writeFixtureFile(root, 'openspec/changes/delivery/tasks.md', '- [x] [D-01] [A-01] 完成交付门槛。\n');
  writeFixtureFile(root, 'requirements/REQ-2026-004-governed.md', renderGovernedDeliveryRequirement());

  const ready = validateRequirementDecisions(requirementPath, { changePath, stage: 'precomplete' });
  assert.equal(ready.ok, true);
  assert.equal(ready.selectedChangeScope.name, 'delivery');

  writeFixtureFile(root, 'requirements/REQ-2026-004-governed.md', renderGovernedDeliveryRequirement({ status: '已验收' }));
  const premature = validateRequirementDecisions(requirementPath, { changePath, stage: 'precomplete' });
  assert.equal(premature.ok, false);
  assert.match(premature.errors.join('\n'), /要求需求状态为“待验证”/);

  writeFixtureFile(root, 'requirements/REQ-2026-004-governed.md', renderGovernedDeliveryRequirement());
  writeFixtureFile(root, 'openspec/changes/delivery/tasks.md', '- [x] [D-01] [A-01] 有引用任务。\n- [x] 缺少引用任务。\n');
  const untrackedTask = validateRequirementDecisions(requirementPath, { changePath, stage: 'precomplete' });
  assert.equal(untrackedTask.ok, false);
  assert.match(untrackedTask.errors.join('\n'), /任务缺少 D-\* 或 A-\* 引用/);

  writeFixtureFile(root, 'openspec/changes/delivery/tasks.md', '- [x] [D-01] [A-01] 完成交付门槛。\n');
  writeFixtureFile(root, 'requirements/REQ-2026-004-governed.md', renderGovernedDeliveryRequirement({
    evidenceLocation: 'artifacts/missing-result.json',
  }));
  const missingEvidence = validateRequirementDecisions(requirementPath, { changePath, stage: 'precomplete' });
  assert.equal(missingEvidence.ok, false);
  assert.match(missingEvidence.errors.join('\n'), /持久证据不存在/);
});

test('分层检查与完成入口阻止未完成变更并在成功后同步归档', (t) => {
  const root = createVueFixture(t);
  const requirementPath = path.join(root, 'requirements', 'REQ-2026-004-finalize.md');
  initializeGitBaseline(root);
  writeManagedChange(root, { tasks: '- [ ] [D-01] [A-01] 完成交付门槛。\n' });
  writeFixtureFile(root, 'requirements/REQ-2026-004-finalize.md', renderGovernedDeliveryRequirement({
    acceptanceChecked: false,
  }));

  const implementing = checkChange({
    target: root,
    requirement: 'requirements/REQ-2026-004-finalize.md',
    change: 'delivery',
    stage: 'implement',
  });
  assert.equal(implementing.ok, false);
  assert.equal(implementing.commandEvidence.projectCommands.executed, false);

  const blocked = finalizeChange({
    target: root,
    requirement: 'requirements/REQ-2026-004-finalize.md',
    change: 'delivery',
  });
  assert.equal(blocked.ok, false);
  assert.equal(fs.existsSync(path.join(root, 'openspec', 'changes', 'delivery')), true);

  writeFixtureFile(root, 'openspec/changes/delivery/tasks.md', '- [x] [D-01] [A-01] 完成交付门槛。\n');
  writeFixtureFile(root, 'requirements/REQ-2026-004-finalize.md', renderGovernedDeliveryRequirement());
  const projectBeforeArchive = checkProject(root);
  assert.match(projectBeforeArchive.warnings.join('\n'), /已完成但仍未归档/);

  const preview = finalizeChange({
    target: root,
    requirement: 'requirements/REQ-2026-004-finalize.md',
    change: 'delivery',
  });
  assert.equal(preview.ok, true, preview.check.errors.join('\n'));
  assert.equal(preview.write, false);
  assert.equal(fs.existsSync(path.join(root, 'openspec', 'changes', 'delivery')), true);

  const completed = finalizeChange({
    target: root,
    requirement: 'requirements/REQ-2026-004-finalize.md',
    change: 'delivery',
    write: true,
  });
  assert.equal(completed.ok, true);
  assert.equal(completed.requirementStatus, '已验收');
  assert.equal(completed.archiveRoot.source, 'nearest');
  assert.ok(Array.isArray(completed.archiveWarnings));
  assert.equal(fs.existsSync(path.join(root, 'openspec', 'changes', 'delivery')), false);
  assert.equal(fs.existsSync(path.join(root, 'openspec', 'changes', 'archive', completed.archiveResult.archivedAs)), true);
  assert.equal(fs.existsSync(path.join(root, 'openspec', 'specs', 'delivery-guard', 'spec.md')), true);
  assert.match(fs.readFileSync(requirementPath, 'utf8'), /- 状态：已验收/);
  const archivedAudit = validateRequirementDecisions(requirementPath, {
    changePath: path.join(root, 'openspec', 'changes', 'archive', completed.archiveResult.archivedAs),
    stage: 'complete',
  });
  assert.equal(archivedAudit.ok, true);
  assert.equal(archivedAudit.selectedChangeScope.name, 'delivery');
});

test('OpenSpec 1.9 动态操作输入可见但不改变完成门禁', (t) => {
  const root = createVueFixture(t);
  initializeGitBaseline(root);
  writeManagedChange(root);
  writeFixtureFile(root, 'requirements/REQ-2026-006-operations.md', renderGovernedDeliveryRequirement());

  const checked = checkChange({
    target: root,
    requirement: 'requirements/REQ-2026-006-operations.md',
    change: 'delivery',
    stage: 'precomplete',
  });
  assert.equal(checked.ok, true, checked.errors.join('\n'));
  assert.equal(checked.commandEvidence.archiveInstructions.status, 'passed');
  assert.equal(checked.archiveInstructions.root.source, 'nearest');
  assert.match(checked.archiveInstructions.context, /实现必须遵守根目录 AGENTS\.md/);
  assert.ok(checked.archiveInstructions.operationGuidance.some((item) => item.includes('归档前必须通过插件完成预览')));

  const apply = runOpenSpecSync(['instructions', 'apply', '--change', 'delivery', '--json'], { cwd: root });
  assert.equal(apply.status, 0);
  const applyInstructions = JSON.parse(apply.stdout.slice(apply.stdout.indexOf('{')));
  assert.match(applyInstructions.context, /sample-vue-app/);
  assert.ok(applyInstructions.operationGuidance.some((item) => item.includes('需求决策')));
  assert.equal(applyInstructions.root.source, 'nearest');
});

test('OpenSpec 1.9 统计缩进子任务并区分普通与严格校验', (t) => {
  const root = createVueFixture(t);
  initializeGitBaseline(root);
  writeManagedChange(root, {
    tasks: '- [x] [D-01] [A-01] 完成父任务。\n  - [ ] [D-01] [A-01] 完成缩进子任务。\n',
  });
  writeFixtureFile(root, 'requirements/REQ-2026-021-subtasks.md', renderGovernedDeliveryRequirement());

  const apply = runOpenSpecSync(['instructions', 'apply', '--change', 'delivery', '--json'], { cwd: root });
  assert.equal(apply.status, 0);
  const instructions = JSON.parse(apply.stdout.slice(apply.stdout.indexOf('{')));
  assert.deepEqual(instructions.progress, { total: 2, complete: 1, remaining: 1 });
  assert.ok(instructions.tasks.some((item) => item.description.includes('缩进子任务') && item.done === false));

  const checked = checkChange({
    target: root,
    requirement: 'requirements/REQ-2026-021-subtasks.md',
    change: 'delivery',
    stage: 'implement',
  });
  assert.equal(checked.progress.total, 2);
  assert.equal(checked.progress.remaining, 1);

  writeFixtureFile(root, 'openspec/specs/chinese-policy/spec.md', `## Purpose

定义中文规范表述在普通校验和严格发布校验之间的稳定边界，避免多语言需求被普通模式错误拒绝。

## Requirements

### Requirement: 中文规范可以进行普通校验
系统必须允许需求使用中文规范表述。

#### Scenario: 校验中文规范
- **WHEN** 需求没有使用英文规范关键词
- **THEN** 普通模式允许通过关键词指导项
`);
  const normal = runOpenSpecSync(['validate', 'chinese-policy', '--type', 'spec', '--json', '--no-interactive'], { cwd: root });
  assert.equal(normal.status, 0);
  const strict = runOpenSpecSync(['validate', 'chinese-policy', '--type', 'spec', '--strict', '--json', '--no-interactive'], { cwd: root });
  assert.notEqual(strict.status, 0);
  assert.match(`${strict.stdout}\n${strict.stderr}`, /SHALL|MUST/u);
});

test('OpenSpec 1.9 独立检查归档任务并拒绝错误根批量命令', (t) => {
  const root = createVueFixture(t);
  runBootstrap({ target: root, write: true });
  writeFixtureFile(root, 'openspec/changes/archive/2026-08-17-incomplete/tasks.md', '- [ ] 完成归档任务。\n');

  const incomplete = runOpenSpecSync(['validate', '--archived', '--json', '--no-interactive'], { cwd: root });
  assert.notEqual(incomplete.status, 0);
  assert.match(`${incomplete.stdout}\n${incomplete.stderr}`, /2026-08-17-incomplete/u);

  writeFixtureFile(root, 'openspec/changes/archive/2026-08-17-incomplete/tasks.md', '- [x] 完成归档任务。\n');
  const complete = runOpenSpecSync(['validate', '--archived', '--json', '--no-interactive'], { cwd: root });
  assert.equal(complete.status, 0, complete.stderr || complete.stdout);

  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-no-root-'));
  t.after(() => fs.rmSync(outsideRoot, { recursive: true, force: true }));
  // 建立配置边界，避免 outputs 内的临时目录向上误解析到真实仓库根目录。
  writeFixtureFile(
    outsideRoot,
    'openspec/config.yaml',
    'schema: spec-driven\nstore: missing-validation-root\n',
  );
  const outside = runOpenSpecSync(['validate', '--all', '--json', '--no-interactive'], {
    cwd: outsideRoot,
    env: { ...process.env, XDG_CONFIG_HOME: path.join(outsideRoot, '.config') },
  });
  assert.notEqual(outside.status, 0);
  const outsideDiagnostics = JSON.parse(outside.stdout);
  assert.equal(outsideDiagnostics.status?.[0]?.code, 'no_registered_stores');
  assert.equal(outsideDiagnostics.status?.[0]?.target, 'store.id');
  const configPathPattern = /openspec[\\/]config\.ya?ml/iu;
  assert.match(outsideDiagnostics.status[0].message, configPathPattern);
  assert.match(String.raw`Declared in D:\a\wayfinder\outputs\openspec\config.yaml`, configPathPattern);
});

test('OpenSpec 1.9 保留任务编号歧义诊断', (t) => {
  const root = createVueFixture(t);
  writeManagedChange(root, {
    changeName: 'ambiguous-tasks',
    tasks: '## 1. 实施\n\n- [ ] 2.1 [D-01] [A-01] 编号与分组不一致。\n',
  });

  const result = runOpenSpecSync([
    'validate',
    'ambiguous-tasks',
    '--type',
    'change',
    '--json',
    '--no-interactive',
  ], { cwd: root });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /under group 1|leading number points to group 2/iu);
});

test('OpenSpec 1.9 归档后保持 Requirements 空行和单一结尾换行', (t) => {
  const root = createVueFixture(t);
  runBootstrap({ target: root, write: true });
  writeFixtureFile(root, 'openspec/specs/format-policy/spec.md', `## Purpose

定义归档后的规格空白格式。

## Requirements

### Requirement: 规格保持稳定格式

系统 MUST 保持规格格式稳定。

#### Scenario: 同步规格

- **WHEN** 归档修改后的规格
- **THEN** 系统保留稳定空白
`);
  writeFixtureFile(root, 'openspec/changes/format-spec/.openspec.yaml', 'schema: spec-driven\ncreated: 2026-08-17\n');
  writeFixtureFile(root, 'openspec/changes/format-spec/proposal.md', `## Why

需要验证规格空白。

## What Changes

- 更新规格描述。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- \`format-policy\`：更新规格描述。

## Impact

- 仅测试规格。
`);
  writeFixtureFile(root, 'openspec/changes/format-spec/design.md', `## Context

使用真实归档流程。

## Goals / Non-Goals

**Goals:** 验证空白。

**Non-Goals:** 不改变业务。

## Decisions

- 保留格式。

## Risks / Trade-offs

- 无。
`);
  writeFixtureFile(root, 'openspec/changes/format-spec/tasks.md', '- [x] 完成格式验证。\n');
  writeFixtureFile(root, 'openspec/changes/format-spec/specs/format-policy/spec.md', `## MODIFIED Requirements

### Requirement: 规格保持稳定格式

系统 MUST 保持规格格式稳定并保留空白。

#### Scenario: 同步规格

- **WHEN** 归档修改后的规格
- **THEN** 系统保留稳定空白和单一结尾换行
`);

  const archived = runOpenSpecSync(['archive', 'format-spec', '--yes', '--json'], { cwd: root });
  assert.equal(archived.status, 0, archived.stderr || archived.stdout);
  const content = fs.readFileSync(path.join(root, 'openspec', 'specs', 'format-policy', 'spec.md'), 'utf8');
  assert.match(content, /格式。\n\n## Requirements\n\n### Requirement/u);
  assert.equal(content.endsWith('\n'), true);
  assert.equal(content.endsWith('\n\n'), false);
});

test('OpenSpec 1.9 保护任意四级场景并保持非交互归档输出有限', (t) => {
  const root = createVueFixture(t);
  runBootstrap({ target: root, write: true });
  writeFixtureFile(root, 'openspec/specs/profile/spec.md', `## Purpose

定义资料能力在多种操作场景下必须保持的稳定行为和兼容边界。

## Requirements

### Requirement: 用户可以管理资料
系统 MUST 允许用户管理资料。

#### Scenario: 查看资料
- **WHEN** 用户打开资料页
- **THEN** 系统显示资料

#### 更新资料
- **WHEN** 用户保存合法资料
- **THEN** 系统更新资料
`);
  writeFixtureFile(root, 'openspec/changes/omit-scenario/.openspec.yaml', 'schema: spec-driven\ncreated: 2026-08-12\n');
  writeFixtureFile(root, 'openspec/changes/omit-scenario/specs/profile/spec.md', `## MODIFIED Requirements

### Requirement: 用户可以管理资料
系统 MUST 允许用户管理资料并显示更新时间。

#### Scenario: 查看资料
- **WHEN** 用户打开资料页
- **THEN** 系统显示资料和更新时间
`);

  const invalid = runOpenSpecSync(['validate', 'omit-scenario', '--type', 'change', '--json', '--no-interactive'], { cwd: root });
  assert.notEqual(invalid.status, 0);
  assert.match(`${invalid.stdout}\n${invalid.stderr}`, /更新资料/u);

  const archive = runOpenSpecSync(['archive', '--json'], { cwd: root, env: { ...process.env, CI: '1' } });
  assert.equal(archive.status, 1);
  const result = JSON.parse(archive.stdout.slice(archive.stdout.indexOf('{')));
  assert.equal(result.status[0].code, 'archive_change_name_required');
  assert.match(result.status[0].fix, /archive <change-name> --json/u);

  const plainArchive = runOpenSpecSync(['archive'], {
    cwd: root,
    env: { ...process.env, CI: '1', FORCE_COLOR: '1', OPEN_SPEC_INTERACTIVE: '0' },
  });
  assert.equal(plainArchive.status, 1);
  assert.ok(`${plainArchive.stdout}${plainArchive.stderr}`.length < 4096);
  assert.doesNotMatch(`${plainArchive.stdout}${plainArchive.stderr}`, /\u001B\[[0-?]*[ -/]*[@-~]/u);
  assert.match(`${plainArchive.stdout}${plainArchive.stderr}`, /change name|变更名|archive <change-name>/iu);
});

test('OpenSpec 1.9 只在显式元数据下退役最后一项能力需求', (t) => {
  const root = createVueFixture(t);
  runBootstrap({ target: root, write: true });
  writeFixtureFile(root, 'openspec/specs/legacy-capability/spec.md', `## Purpose

定义即将退役的历史能力及其唯一剩余行为要求。

## Requirements

### Requirement: 历史能力仍可调用
系统 MUST 允许调用历史能力。

#### Scenario: 调用历史能力
- **WHEN** 用户调用历史能力
- **THEN** 系统返回历史结果
`);
  writeFixtureFile(root, 'openspec/changes/retire-legacy/.openspec.yaml', 'schema: spec-driven\ncreated: 2026-08-12\nretire_capabilities: true\n');
  writeFixtureFile(root, 'openspec/changes/retire-legacy/proposal.md', `## Why

历史能力已经退出使用，需要删除最后一项需求。

## What Changes

- 退役历史能力。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- \`legacy-capability\`：删除最后一项需求。

## Impact

- 删除历史主规格。
`);
  writeFixtureFile(root, 'openspec/changes/retire-legacy/design.md', `## Context

历史能力没有调用方。

## Goals / Non-Goals

**Goals:** 退役能力。

**Non-Goals:** 不新增替代能力。

## Decisions

- 使用显式退役元数据。

## Risks / Trade-offs

- 无。
`);
  writeFixtureFile(root, 'openspec/changes/retire-legacy/tasks.md', '- [x] 完成退役验证。\n');
  writeFixtureFile(root, 'openspec/changes/retire-legacy/specs/legacy-capability/spec.md', `## REMOVED Requirements

### Requirement: 历史能力仍可调用
**Reason**: 历史能力已经退出使用。
**Migration**: 不再调用该能力。
`);

  const archived = runOpenSpecSync(['archive', 'retire-legacy', '--yes', '--json'], { cwd: root });
  assert.equal(archived.status, 0, archived.stderr || archived.stdout);
  assert.equal(fs.existsSync(path.join(root, 'openspec', 'specs', 'legacy-capability', 'spec.md')), false);
  assert.equal(fs.existsSync(path.join(root, 'openspec', 'changes', 'retire-legacy')), false);
});

test('规划完成门禁区分合法 skipped、未完成和未知状态', (t) => {
  const root = createVueFixture(t);
  initializeGitBaseline(root);
  writeManagedChange(root, { changeName: 'tooling-update', skipSpecs: true });
  writeFixtureFile(root, 'requirements/REQ-2026-007-skip-specs.md', renderGovernedDeliveryRequirement({
    changeName: 'tooling-update',
    decisionValue: '本变更不改变可观察行为，允许 skip_specs: true',
  }));

  const authorized = checkChange({
    target: root,
    requirement: 'requirements/REQ-2026-007-skip-specs.md',
    change: 'tooling-update',
    stage: 'precomplete',
  });
  assert.equal(authorized.ok, true, authorized.errors.join('\n'));
  assert.equal(authorized.planningStatus.isPlanningComplete, true);
  assert.equal(authorized.planningArtifacts.isPlanningComplete, true);
  assert.equal(authorized.planningArtifacts.isComplete, true);
  assert.equal(authorized.planningArtifacts.skipSpecsMetadata, true);
  assert.equal(authorized.planningArtifacts.skipSpecsAuthorized, true);
  assert.equal(authorized.planningArtifacts.artifacts.find((item) => item.id === 'specs').status, 'skipped');
  assert.deepEqual(authorized.planningStatus.artifactPaths.specs.existingOutputPaths, []);

  writeFixtureFile(root, 'requirements/REQ-2026-007-skip-specs.md', renderGovernedDeliveryRequirement({
    changeName: 'tooling-update',
  }));
  const unauthorized = checkChange({
    target: root,
    requirement: 'requirements/REQ-2026-007-skip-specs.md',
    change: 'tooling-update',
    stage: 'precomplete',
  });
  assert.equal(unauthorized.ok, false);
  assert.match(unauthorized.errors.join('\n'), /skip_specs: true 缺少需求决策台账/);

  const gateErrors = [];
  validatePlanningArtifacts({
    isComplete: true,
    artifactPaths: { specs: { existingOutputPaths: [] } },
    artifacts: [
      { id: 'proposal', status: 'done' },
      { id: 'specs', status: 'skipped' },
      { id: 'tasks', status: 'unexpected' },
    ],
  }, path.join(root, 'openspec', 'changes', 'tooling-update'), path.join(root, 'requirements', 'REQ-2026-007-skip-specs.md'), gateErrors);
  assert.match(gateErrors.join('\n'), /tasks=unexpected/);

  const compatibilityChangePath = path.join(
    root,
    'openspec',
    'changes',
    'compatibility-status',
  );
  const preferredFieldErrors = [];
  const preferredField = validatePlanningArtifacts({
    isPlanningComplete: false,
    isComplete: true,
    artifacts: [{ id: 'proposal', status: 'done' }],
  }, compatibilityChangePath, path.join(root, 'requirements', 'REQ-2026-007-skip-specs.md'), preferredFieldErrors);
  assert.equal(preferredField.isPlanningComplete, false);
  assert.match(preferredFieldErrors.join('\n'), /isPlanningComplete 必须为 true/);

  const legacyFieldErrors = [];
  const legacyField = validatePlanningArtifacts({
    isComplete: true,
    artifacts: [{ id: 'proposal', status: 'done' }],
  }, compatibilityChangePath, path.join(root, 'requirements', 'REQ-2026-007-skip-specs.md'), legacyFieldErrors);
  assert.equal(legacyField.isPlanningComplete, true);
  assert.deepEqual(legacyFieldErrors, []);

  const globalRootErrors = [];
  validatePlanningRoot(root, { root: { path: '/tmp/default-store', source: 'global_default' } }, '测试根', globalRootErrors);
  assert.match(globalRootErrors.join('\n'), /未经明确选择的机器默认 Store/);

  const canonicalRootErrors = [];
  validatePlanningRoot(root, { root: { path: fs.realpathSync.native(root), source: 'nearest' } }, '规范根', canonicalRootErrors);
  assert.deepEqual(canonicalRootErrors, []);

  const incompleteRoot = createVueFixture(t);
  initializeGitBaseline(incompleteRoot);
  writeManagedChange(incompleteRoot);
  writeFixtureFile(incompleteRoot, 'requirements/REQ-2026-008-incomplete.md', renderGovernedDeliveryRequirement());
  fs.unlinkSync(path.join(incompleteRoot, 'openspec', 'changes', 'delivery', 'design.md'));
  const incomplete = checkChange({
    target: incompleteRoot,
    requirement: 'requirements/REQ-2026-008-incomplete.md',
    change: 'delivery',
    stage: 'precomplete',
  });
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.errors.join('\n'), /isPlanningComplete 必须为 true|design=ready|design=blocked/);
});

test('日期名称、数字前缀和嵌套规格使用 OpenSpec 1.9 实际路径', (t) => {
  const dateRoot = createVueFixture(t);
  initializeGitBaseline(dateRoot);
  const datedChange = '2026-07-04-date-prefix';
  writeManagedChange(dateRoot, { changeName: datedChange });
  writeFixtureFile(dateRoot, 'requirements/REQ-2026-009-date-name.md', renderGovernedDeliveryRequirement({
    changeName: datedChange,
  }));
  const dated = checkChange({
    target: dateRoot,
    requirement: 'requirements/REQ-2026-009-date-name.md',
    change: datedChange,
    stage: 'precomplete',
  });
  assert.equal(dated.ok, true, dated.errors.join('\n'));
  assert.equal(path.basename(dated.archive.targetPath), datedChange);
  assert.equal(path.basename(archiveTarget(dateRoot, datedChange)), datedChange);
  assert.match(path.basename(archiveTarget(dateRoot, '123-feature')), /^\d{4}-\d{2}-\d{2}-123-feature$/);

  const nestedRoot = createVueFixture(t);
  initializeGitBaseline(nestedRoot);
  writeManagedChange(nestedRoot, {
    changeName: 'nested-delivery',
    specPath: 'platform/delivery-guard/spec.md',
  });
  writeFixtureFile(nestedRoot, 'requirements/REQ-2026-010-nested.md', renderGovernedDeliveryRequirement({
    changeName: 'nested-delivery',
  }));
  const nestedPreview = checkChange({
    target: nestedRoot,
    requirement: 'requirements/REQ-2026-010-nested.md',
    change: 'nested-delivery',
    stage: 'precomplete',
  });
  assert.equal(nestedPreview.ok, true);
  const nestedSpecPaths = nestedPreview.planningStatus.artifactPaths.specs.existingOutputPaths
    .map((item) => item.split(path.sep).join('/'));
  assert.ok(
    nestedSpecPaths.some((item) => item.endsWith('specs/platform/delivery-guard/spec.md')),
    JSON.stringify(nestedSpecPaths),
  );
  const nestedCompleted = finalizeChange({
    target: nestedRoot,
    requirement: 'requirements/REQ-2026-010-nested.md',
    change: 'nested-delivery',
    write: true,
  });
  assert.equal(nestedCompleted.ok, true);
  assert.equal(fs.existsSync(path.join(nestedRoot, 'openspec', 'specs', 'platform', 'delivery-guard', 'spec.md')), true);
});

test('内部 OpenSpec 参考三方合并到 1.9 且保留插件硬门禁', () => {
  const referenceRoot = path.join(pluginRoot, 'references', 'openspec');
  const references = fs.readdirSync(referenceRoot)
    .filter((file) => file.endsWith('.md'))
    .map((file) => fs.readFileSync(path.join(referenceRoot, file), 'utf8'));
  assert.equal(references.length, 6);
  for (const reference of references) {
    assert.match(reference, /generatedBy: "1\.9\.0"/);
    assert.match(reference, /scripts\/(?:openspec-cli|finalize-change)\.mjs/);
    assert.match(reference, /global_default/);
    assert.doesNotMatch(reference, /Bash\(openspec:\*\)/);
  }
  const applyReference = fs.readFileSync(path.join(referenceRoot, 'apply-change.md'), 'utf8');
  const archiveReference = fs.readFileSync(path.join(referenceRoot, 'archive-change.md'), 'utf8');
  const exploreReference = fs.readFileSync(path.join(referenceRoot, 'explore.md'), 'utf8');
  const proposeReference = fs.readFileSync(path.join(referenceRoot, 'propose.md'), 'utf8');
  const syncReference = fs.readFileSync(path.join(referenceRoot, 'sync-specs.md'), 'utf8');
  const updateReference = fs.readFileSync(path.join(referenceRoot, 'update-change.md'), 'utf8');
  assert.match(applyReference, /operationGuidance/);
  assert.match(applyReference, /surface the added scope and pause/);
  assert.match(applyReference, /fully implemented/);
  assert.match(archiveReference, /User confirmation MUST NOT override a failed gate/);
  assert.match(archiveReference, /instructions archive --json/);
  assert.match(archiveReference, /isPlanningComplete=true/);
  assert.match(archiveReference, /retire_capabilities: true/);
  assert.match(exploreReference, /openspec new change "<name>"/);
  assert.match(proposeReference, /Planning boundary/);
  assert.match(proposeReference, /Set `skip_specs: true` only when the linked requirement/);
  assert.match(syncReference, /artifactPaths\.specs\.existingOutputPaths/);
  assert.match(syncReference, /retire_capabilities: true/);
  assert.match(syncReference, /validate --specs/);
  assert.match(updateReference, /isPlanningComplete/);
});
