import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runBootstrap } from '../plugins/frontend-ai-workflow/scripts/bootstrap-project.mjs';
import { archiveTarget, checkChange, validatePlanningArtifacts, validatePlanningRoot } from '../plugins/frontend-ai-workflow/scripts/check-change.mjs';
import { finalizeChange } from '../plugins/frontend-ai-workflow/scripts/finalize-change.mjs';
import { runOpenSpecSync } from '../plugins/frontend-ai-workflow/scripts/openspec-cli.mjs';
import {
  pluginRoot,
  writeFixtureFile,
  createVueFixture,
  initializeGitBaseline,
  writeManagedChange,
  renderGovernedDeliveryRequirement,
} from './helpers/workflow-fixtures.mjs';

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
