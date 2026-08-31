import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { inspectProject } from '../plugins/frontend-ai-workflow/scripts/inspect-project.mjs';
import { runBootstrap } from '../plugins/frontend-ai-workflow/scripts/bootstrap-project.mjs';
import { checkProject } from '../plugins/frontend-ai-workflow/scripts/check-project.mjs';
import { runUpdate } from '../plugins/frontend-ai-workflow/scripts/update-project.mjs';
import { validateRequirementDecisions } from '../plugins/frontend-ai-workflow/scripts/validate-requirement-decisions.mjs';
import { previewRequirementUpgrade } from '../plugins/frontend-ai-workflow/scripts/preview-requirement-upgrade.mjs';
import { parseStructureValidationArgs } from '../plugins/frontend-ai-workflow/scripts/validate-structure.mjs';
import * as verificationRunner from '../scripts/verify.mjs';
import { buildTestCommand } from '../scripts/test-groups.mjs';
import {
  pluginRoot,
  expectedPublicSkills,
  writeFixtureFile,
  createVueFixture,
  SUPPORTED_PROJECT_MATRIX,
  expectedScriptCommand,
  createMatrixFixture,
  initializeGitBaseline,
  renderDeliveryRequirement,
  renderStateMatrixRequirement,
} from './helpers/workflow-fixtures.mjs';

const {
  buildVerificationEnvironment,
  buildVerificationSteps,
  parseVerificationArgs,
  runVerification,
} = verificationRunner;

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

  // CI、文案和结论边界等非视觉人工复核不应被强制伪造截图，但必须保留具体复核动作与持久证据。
  writeFixtureFile(root, 'artifacts/review.md', '# 人工复核记录\n');
  writeFixtureFile(root, 'requirements/REQ-2026-001-delivery.md', renderDeliveryRequirement({
    includeManual: true,
    manualEnvironment: '复核项：核对五平台任务名称、提交 SHA 与最终状态',
    manualEvidence: 'artifacts/review.md',
  }));
  const nonVisualManual = validateRequirementDecisions(requirementPath, { changePath, stage: 'complete' });
  assert.equal(nonVisualManual.ok, true, nonVisualManual.errors.join('\n'));

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

test('[TC-01] 验证作用域测试集合完整分区', (t) => {
  const fixturesRoot = path.resolve('outputs', 'ci-validation-cost', 'test-fixtures');
  fs.mkdirSync(fixturesRoot, { recursive: true });
  const verificationRoot = fs.realpathSync(fs.mkdtempSync(path.join(fixturesRoot, 'test-groups-')));
  t.after(() => fs.rmSync(verificationRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(verificationRoot, 'tests'), { recursive: true });
  for (const name of [
    'ordinary.test.mjs',
    'new-feature.test.mjs',
    'ui-review-automation.test.mjs',
    'ui-review-platform-runtime.test.mjs',
  ]) {
    fs.writeFileSync(path.join(verificationRoot, 'tests', name), 'export {};\n');
  }

  const all = buildTestCommand({ root: verificationRoot, group: 'all' }).args.slice(1);
  const shared = buildTestCommand({ root: verificationRoot, group: 'shared' }).args.slice(1);
  const platform = buildTestCommand({ root: verificationRoot, group: 'platform' }).args.slice(1);
  assert.deepEqual(all, [
    'tests/new-feature.test.mjs',
    'tests/ordinary.test.mjs',
    'tests/ui-review-automation.test.mjs',
    'tests/ui-review-platform-runtime.test.mjs',
  ]);
  assert.deepEqual(shared, ['tests/new-feature.test.mjs', 'tests/ordinary.test.mjs']);
  assert.deepEqual(platform, [
    'tests/ui-review-automation.test.mjs',
    'tests/ui-review-platform-runtime.test.mjs',
  ]);
  assert.deepEqual([...new Set([...shared, ...platform])].sort(), all);
  assert.deepEqual(shared.filter((file) => platform.includes(file)), []);

  assert.throws(
    () => buildTestCommand({ root: verificationRoot, group: 'missing' }),
    (error) => error.code === 'unknown_test_group',
  );
  fs.rmSync(path.join(verificationRoot, 'tests', 'ui-review-automation.test.mjs'));
  assert.throws(
    () => buildTestCommand({ root: verificationRoot, group: 'platform' }),
    (error) => error.code === 'test_group_expected_file_missing' && error.group === 'platform',
  );
  fs.rmSync(path.join(verificationRoot, 'tests', 'ui-review-platform-runtime.test.mjs'));
  assert.throws(
    () => buildTestCommand({ root: verificationRoot, group: 'platform' }),
    (error) => error.code === 'test_group_empty',
  );
});

test('[TC-02] 统一验证作用域与生命周期', (t) => {
  const fixturesRoot = path.resolve('outputs', 'ci-validation-cost', 'test-fixtures');
  fs.mkdirSync(fixturesRoot, { recursive: true });
  const verificationRoot = fs.realpathSync(fs.mkdtempSync(path.join(fixturesRoot, 'verification-runner-')));
  t.after(() => fs.rmSync(verificationRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(verificationRoot, 'tests'), { recursive: true });
  for (const name of ['ordinary.test.mjs', 'ui-review-automation.test.mjs', 'ui-review-platform-runtime.test.mjs']) {
    fs.writeFileSync(path.join(verificationRoot, 'tests', name), 'export {};\n');
  }

  const allSteps = buildVerificationSteps(verificationRoot);
  assert.deepEqual(allSteps.map((step) => step.id), [
    'footprint',
    'tests',
    'structure',
    'openspec',
    'openspec-archived',
    'runtime-version',
    'runtime-integrity',
  ]);
  const sharedSteps = buildVerificationSteps(verificationRoot, { scope: 'shared' });
  assert.deepEqual(sharedSteps.map((step) => step.id), [
    'footprint',
    'tests',
    'structure',
    'openspec',
    'openspec-archived',
    'runtime-version',
    'runtime-integrity',
  ]);
  assert.deepEqual(buildVerificationSteps(verificationRoot, { scope: 'platform' }).map((step) => step.id), [
    'tests',
    'playwright-integrity',
    'playwright-smoke',
  ]);
  const allStructureArgs = allSteps.find((step) => step.id === 'structure').args;
  const sharedStructureArgs = sharedSteps.find((step) => step.id === 'structure').args;
  assert.equal(path.basename(allStructureArgs[0]), 'validate-structure.mjs');
  assert.deepEqual(allStructureArgs.slice(1), []);
  assert.equal(path.basename(sharedStructureArgs[0]), 'validate-structure.mjs');
  assert.deepEqual(sharedStructureArgs.slice(1), ['--scope', 'shared']);

  assert.deepEqual(parseVerificationArgs([]), { scope: 'all' });
  assert.deepEqual(parseVerificationArgs(['--scope', 'shared']), { scope: 'shared' });
  assert.throws(
    () => parseVerificationArgs(['--scope', 'future']),
    (error) => error.code === 'unknown_verification_scope' && error.scope === 'future' && error.status === 1,
  );
  assert.throws(
    () => parseVerificationArgs(['--scope']),
    (error) => error.code === 'verification_scope_missing' && error.status === 1,
  );
  assert.throws(
    () => parseVerificationArgs(['--unexpected']),
    (error) => error.code === 'unknown_verification_argument' && error.status === 1,
  );
  assert.deepEqual(parseStructureValidationArgs([]), { scope: 'all' });
  assert.deepEqual(parseStructureValidationArgs(['--scope', 'shared']), { scope: 'shared' });
  assert.throws(
    () => parseStructureValidationArgs(['--scope', 'platform']),
    (error) => error.code === 'unknown_structure_validation_scope' && error.scope === 'platform' && error.status === 1,
  );
  assert.throws(
    () => parseStructureValidationArgs(['--scope']),
    (error) => error.code === 'structure_validation_scope_missing' && error.status === 1,
  );

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
  assert.equal(failed.code, 'verification_step_failed');
  assert.equal(failed.scope, 'all');
  assert.equal(failed.failedStep, 'openspec');
  assert.deepEqual(failed.completed, ['footprint', 'tests', 'structure']);
  assert.deepEqual(executed, ['footprint', 'tests', 'structure', 'openspec']);
  assert.deepEqual(lifecycle, ['prepare', 'cleanup']);
  const expectedTempRoot = path.join(verificationRoot, 'outputs', 'verify-runtime', 'tmp');
  assert.ok(tempRoots.every((tempRoot) => tempRoot === expectedTempRoot));
  assert.equal(fs.existsSync(path.join(verificationRoot, 'outputs', 'verify-runtime')), false);
  assert.match(errors[0], /OpenSpec 全量严格校验/);

  const platformLifecycle = [];
  const platform = runVerification({
    repositoryRoot: verificationRoot,
    scope: 'platform',
    execute: () => ({ status: 0 }),
    environment: {},
    prepareRuntime: () => platformLifecycle.push('prepare'),
    cleanupRuntime: () => platformLifecycle.push('cleanup'),
    report: () => {},
    reportError: () => {},
  });
  assert.deepEqual(platform, {
    ok: true,
    code: 'verification_passed',
    scope: 'platform',
    completed: ['tests', 'playwright-integrity', 'playwright-smoke'],
    failedStep: null,
    status: 0,
  });
  assert.deepEqual(platformLifecycle, []);
  assert.equal(fs.existsSync(path.join(verificationRoot, 'outputs', 'verify-runtime')), false);
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
