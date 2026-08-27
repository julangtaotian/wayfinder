import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { runBootstrap } from '../plugins/frontend-ai-workflow/scripts/bootstrap-project.mjs';
import { checkProject } from '../plugins/frontend-ai-workflow/scripts/check-project.mjs';
import { checkChange } from '../plugins/frontend-ai-workflow/scripts/check-change.mjs';
import { finalizeChange } from '../plugins/frontend-ai-workflow/scripts/finalize-change.mjs';
import { collectProjectScope } from '../plugins/frontend-ai-workflow/scripts/collect-project-scope.mjs';
import { runUpdate } from '../plugins/frontend-ai-workflow/scripts/update-project.mjs';
import { validateRequirementDecisions } from '../plugins/frontend-ai-workflow/scripts/validate-requirement-decisions.mjs';
import {
  pluginRoot,
  writeFixtureFile,
  createVueFixture,
  initializeGitBaseline,
  writeManagedChange,
  renderGovernedDeliveryRequirement,
} from './helpers/workflow-fixtures.mjs';

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
  assert.match(template, /\[A-01]/);
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
  assert.match(fs.readFileSync(requirementPath, 'utf8'), /requirement-archive-stub:v1/u);
  const archivedAudit = validateRequirementDecisions(completed.requirementArchive.archivePath, {
    changePath: path.join(root, 'openspec', 'changes', 'archive', completed.archiveResult.archivedAs),
    stage: 'complete',
  });
  assert.equal(archivedAudit.ok, true);
  assert.equal(archivedAudit.selectedChangeScope.name, 'delivery');
});
