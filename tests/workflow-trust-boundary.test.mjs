import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runBootstrap } from '../plugins/frontend-ai-workflow/scripts/bootstrap-project.mjs';
import { finalizeChange } from '../plugins/frontend-ai-workflow/scripts/finalize-change.mjs';
import { runWayfinderMigration } from '../plugins/frontend-ai-workflow/scripts/migrate-wayfinder-project.mjs';
import {
  ProjectPathError,
  atomicWriteProjectFile,
  removeProjectFile,
  resolveSafeProjectPath,
} from '../plugins/frontend-ai-workflow/scripts/project-path-safety.mjs';
import {
  EVIDENCE_SCHEMA_VERSION,
  LEGACY_EVIDENCE_SCHEMA_VERSION,
  computeVerificationSemanticBinding,
  createEvidenceFileDescriptor,
  runVerificationEvidence,
  validateEvidenceManifest,
  validateVerificationEvidenceRecords,
} from '../plugins/frontend-ai-workflow/scripts/verification-evidence.mjs';
import { resolveSafeProjectPath as resolveUiProjectPath } from '../plugins/frontend-ai-workflow/scripts/ui-review-config.mjs';
import { writeRunState } from '../plugins/frontend-ai-workflow/scripts/ui-review-storage.mjs';
import { runUpdate } from '../plugins/frontend-ai-workflow/scripts/update-project.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureOutputRoot = path.join(repositoryRoot, 'outputs', 'workflow-trust-boundary', 'test-fixtures');

function writeFixtureFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

function createFixture(context, name = 'case') {
  fs.mkdirSync(fixtureOutputRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureOutputRoot, `${name}-`));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFixtureFile(root, 'package.json', `${JSON.stringify({
    name: `trust-${name}`,
    private: true,
    scripts: { test: 'node --test tests/*.test.mjs' },
    dependencies: { vue: '^3.5.0' },
    devDependencies: { vite: '^6.0.0', vitest: '^2.0.0' },
  }, null, 2)}\n`);
  writeFixtureFile(root, 'package-lock.json', '{}\n');
  writeFixtureFile(root, 'src/App.vue', '<template><main>安全边界</main></template>\n');
  const initialized = spawnSync('git', ['init', '-q', root], { encoding: 'utf8' });
  assert.equal(initialized.status, 0, initialized.stderr);
  return root;
}

function createDirectoryLink(target, linkPath) {
  fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
}

function captureThrown(operation) {
  let captured;
  assert.throws(() => {
    try {
      operation();
    } catch (error) {
      captured = error;
      throw error;
    }
  });
  return captured;
}

function trustRequirement(changeName = 'trust-change') {
  return `# 机器证据语义 fixture

## 基本信息

- 状态：实施中

## 决策台账

| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 证据合同 | 已确认 | 使用 schema v2 并失败关闭 | fixture |
| D-02 | 外部信任 | 已确认 | 未远程读取只记录 | fixture |

## 关联变更范围

| 变更 | 决策范围 | 验收范围 |
| --- | --- | --- |
| ${changeName} | D-01、D-02 | A-01、A-02 |

## 修订记录

| 修订 | 日期 | 影响决策 | 影响验收 | 验证与任务处理 |
| --- | --- | --- | --- | --- |
| R-01 | 2026-08-21 | D-01、D-02 | A-01、A-02 | 建立 fixture。 |

## 验证记录

| 验证ID | 验证类型 | 执行内容或环境 | 执行日期 | 结果 | 证据位置 |
| --- | --- | --- | --- | --- | --- |
| V-01 | 自动 | 执行本地聚焦测试 | 待执行 | 计划 | 待执行 |
| V-02 | 自动 | 复核 UI Review 状态 | 待执行 | 计划 | 待执行 |
| V-03 | 自动 | 记录外部 CI 引用 | 待执行 | 计划 | 待执行 |

## 验收标准

- [ ] [A-01] 本地和 UI 证据必须对应当前语义与持久产物。
- [ ] [A-02] 外部自声明不能成为可信通过。

## 验收—证据映射

| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 | 验证记录 |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 本地与 UI 完整性 | D-01 | 自动 | 待执行 | 当前语义和文件完整 | V-01、V-02 |
| A-02 | 外部信任边界 | D-02 | 自动 | 待执行 | 未远程读取只记录 | V-03 |
`;
}

function trustTestPlan(changeName = 'trust-change') {
  const renderCase = (id, title, decision, acceptance, verification) => `### ${id}：${title}

- 状态：计划
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：${decision}
- 关联验收：${acceptance}
- 关联规格：fixture / ${title}
- 状态矩阵：用户操作、错误态
- 前置条件：隔离 fixture 已建立
- 测试数据：有效与篡改证据
- 测试替身：隔离文件系统
- 操作：执行并复核证据
- 可观察断言：${title}保持失败关闭
- 目标测试：\`tests/trust.test.mjs\`
- 测试定位：\`[${id}] ${title}\`
- 聚焦命令：\`node --test tests/trust.test.mjs\`
- 关联验证：${verification}
- 结果分类：未执行
- 证据：待执行
`;
  return `# 测试方案：fixture

## 基本信息

- 状态：就绪
- 需求：\`requirements/REQ-2026-001-trust.md\`
- 变更：${changeName}
- 需求修订基线：R-01
- 默认聚焦命令：\`node --test tests/trust.test.mjs\`

## 测试上下文

- 测试命令状态：detected
- 测试命令：\`npm test\`
- 测试运行器：Node Test Runner
- 测试目录：\`tests\`
- Git 基线：available
- 兼容说明：fixture

## 测试用例

${renderCase('TC-01', '本地证据完整性', 'D-01', 'A-01', 'V-01')}
${renderCase('TC-02', 'UI 证据完整性', 'D-01', 'A-01', 'V-02')}
${renderCase('TC-03', '外部信任边界', 'D-02', 'A-02', 'V-03')}
`;
}

function createEvidenceFixture(context) {
  const root = createFixture(context, 'evidence');
  const changeName = 'trust-change';
  writeFixtureFile(root, 'requirements/REQ-2026-001-trust.md', trustRequirement(changeName));
  writeFixtureFile(root, `openspec/changes/${changeName}/.openspec.yaml`, 'schema: spec-driven\ntest_plan: required\nverification_evidence: required\n');
  writeFixtureFile(root, `openspec/changes/${changeName}/test-plan.md`, trustTestPlan(changeName));
  writeFixtureFile(root, 'tests/trust.test.mjs', "// [TC-01] 本地证据完整性\nexport const covered = true;\n");
  writeFixtureFile(root, 'artifacts/result.txt', '可信附件\n');
  return {
    root,
    changeName,
    changePath: path.join(root, 'openspec', 'changes', changeName),
    requirementPath: path.join(root, 'requirements', 'REQ-2026-001-trust.md'),
  };
}

function writeManifest(fixture, evidenceId, manifest) {
  return writeFixtureFile(
    fixture.root,
    `openspec/changes/${fixture.changeName}/evidence/${evidenceId}.json`,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

test('[TC-01] 受管写入符号链接边界与兼容性', async (context) => {
  await context.test('普通目标、项目根别名和原子失败保持兼容', () => {
    const root = createFixture(context, 'safe-write');
    const alias = path.join(path.dirname(root), `${path.basename(root)}-alias`);
    createDirectoryLink(root, alias);
    context.after(() => fs.rmSync(alias, { recursive: true, force: true }));

    const preview = runBootstrap({ target: alias });
    assert.equal(preview.ok, true);
    assert.equal(preview.write, false);
    assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false);

    const written = runBootstrap({ target: alias, write: true });
    assert.equal(written.ok, true);
    assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), true);
    const repeated = runBootstrap({ target: alias, write: true });
    assert.equal(repeated.ok, true);
    assert.equal(repeated.actions.every((item) => !['create', 'update'].includes(item.action)), true);

    const protectedPath = writeFixtureFile(root, 'proof/original.txt', '原始内容\n');
    assert.throws(
      () => atomicWriteProjectFile(root, 'proof/original.txt', '替换内容\n', {
        operations: { rename: () => { throw new Error('rename-fixture-failed'); } },
      }),
      /rename-fixture-failed/u,
    );
    assert.equal(fs.readFileSync(protectedPath, 'utf8'), '原始内容\n');
  });

  await context.test('项目内链接在预览和写入阶段都失败关闭', async () => {
    const root = createFixture(context, 'linked-write');
    const outside = fs.mkdtempSync(path.join(fixtureOutputRoot, 'outside-'));
    context.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    writeFixtureFile(outside, 'sentinel.txt', '不可修改\n');
    createDirectoryLink(outside, path.join(root, 'wayfinder'));

    for (const write of [false, true]) {
      const result = runBootstrap({ target: root, write });
      assert.equal(result.ok, false);
      assert.equal(result.code, 'project_path_symlink');
      assert.equal(result.status, 'blocked');
      assert.equal(result.target, 'wayfinder/frontend.md');
    }
    assert.equal(fs.readFileSync(path.join(outside, 'sentinel.txt'), 'utf8'), '不可修改\n');
    assert.equal(fs.existsSync(path.join(outside, 'frontend.md')), false);

    const uiError = captureThrown(() => resolveUiProjectPath(root, 'wayfinder/state.json', 'UI 状态路径'));
    assert.equal(uiError.code, 'project_path_symlink');

    const evidenceResult = await runVerificationEvidence({
      target: root,
      change: 'missing-change',
      requirement: 'requirements/missing.md',
      evidenceId: 'V-01',
      locator: '[TC-01] fixture',
      command: [process.execPath, '-e', "console.log('[TC-01] fixture')"],
    });
    assert.equal(evidenceResult.ok, false);
    assert.equal(evidenceResult.status, 'blocked');
  });

  await context.test('升级、迁移、取证和 UI 状态入口共享同一链接边界', async () => {
    const outside = fs.mkdtempSync(path.join(fixtureOutputRoot, 'entry-outside-'));
    context.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    writeFixtureFile(outside, 'sentinel.txt', '入口哨兵\n');

    const updateRoot = createFixture(context, 'linked-update');
    createDirectoryLink(outside, path.join(updateRoot, 'wayfinder'));
    const updated = runUpdate({ target: updateRoot, write: true });
    assert.equal(updated.ok, false);
    assert.equal(updated.code, 'project_path_symlink');
    assert.equal(updated.status, 'blocked');

    const migrationRoot = createFixture(context, 'linked-migration');
    writeFixtureFile(migrationRoot, '.ai-workflow.yaml', '# frontend-ai-workflow:start\nlayout: legacy\n# frontend-ai-workflow:end\n');
    fs.mkdirSync(path.join(migrationRoot, 'docs'), { recursive: true });
    createDirectoryLink(outside, path.join(migrationRoot, 'docs', 'ai-context'));
    const migrated = runWayfinderMigration({ target: migrationRoot, write: true });
    assert.equal(migrated.ok, false);
    assert.equal(migrated.code, 'project_path_symlink');
    assert.equal(migrated.status, 'blocked');

    const evidenceFixture = createEvidenceFixture(context);
    createDirectoryLink(outside, path.join(evidenceFixture.changePath, 'evidence'));
    const evidence = await runVerificationEvidence({
      target: evidenceFixture.root,
      change: evidenceFixture.changeName,
      requirement: 'requirements/REQ-2026-001-trust.md',
      evidenceId: 'V-01',
      locator: '[TC-01] 本地证据完整性',
      command: [process.execPath, '-e', "console.log('[TC-01] 本地证据完整性')"],
    });
    assert.equal(evidence.ok, false);
    assert.equal(evidence.code, 'unsafe_evidence_path');
    assert.equal(evidence.status, 'blocked');

    const uiRoot = createFixture(context, 'linked-ui-state');
    createDirectoryLink(outside, path.join(uiRoot, '.frontend-ui-review'));
    const uiError = captureThrown(() => writeRunState(uiRoot, {
      schemaVersion: 2,
      runId: 'linked-ui',
      stage: 'review',
      status: 'collecting',
      capture: 'project-playwright',
      scenarioId: 'dashboard',
      artifacts: {
        runDirectory: '.frontend-ui-review/runs/linked-ui/dashboard',
        state: '.frontend-ui-review/runs/linked-ui/dashboard/state.json',
      },
    }));
    assert.equal(uiError.code, 'project_path_symlink');
    assert.equal(fs.readFileSync(path.join(outside, 'sentinel.txt'), 'utf8'), '入口哨兵\n');
  });

  await context.test('删除和完成预览拒绝链接表面', () => {
    const root = createFixture(context, 'linked-finalize');
    const outside = fs.mkdtempSync(path.join(fixtureOutputRoot, 'finalize-outside-'));
    context.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    writeFixtureFile(outside, 'REQ.md', '- 状态：待验证\n');
    createDirectoryLink(outside, path.join(root, 'requirements'));

    const check = {
      ok: true,
      root,
      requirementPath: path.join(root, 'requirements', 'REQ.md'),
      changePath: path.join(root, 'openspec', 'changes', 'trust-change'),
      changeName: 'trust-change',
      archive: { targetPath: path.join(root, 'openspec', 'changes', 'archive', '2026-08-21-trust-change') },
    };
    const finalized = finalizeChange({ target: root, requirement: 'requirements/REQ.md', change: 'trust-change' }, {
      checkChange: () => check,
    });
    assert.equal(finalized.ok, false);
    assert.equal(finalized.code, 'project_path_symlink');
    assert.equal(finalized.status, 'blocked');
    assert.equal(fs.readFileSync(path.join(outside, 'REQ.md'), 'utf8'), '- 状态：待验证\n');

    const error = captureThrown(() => removeProjectFile(root, 'requirements/REQ.md'));
    assert.ok(error instanceof ProjectPathError);
    assert.equal(error.code, 'project_path_symlink');
    assert.equal(fs.existsSync(path.join(outside, 'REQ.md')), true);
  });
});

test('[V-02] 验证证据模块化兼容：机器证据语义完整性与信任聚合', async (context) => {
  const fixture = createEvidenceFixture(context);
  const locator = '[TC-01] 本地证据完整性';
  const recorded = await runVerificationEvidence({
    target: fixture.root,
    change: fixture.changeName,
    requirement: 'requirements/REQ-2026-001-trust.md',
    evidenceId: 'V-01',
    locator,
    artifacts: ['artifacts/result.txt'],
    command: [process.execPath, '-e', `console.log(${JSON.stringify(locator)})`],
    write: true,
  });
  assert.equal(recorded.ok, true, JSON.stringify(recorded));
  assert.equal(recorded.manifest.schemaVersion, EVIDENCE_SCHEMA_VERSION);
  assert.equal(recorded.manifest.semanticBinding.revision, 'R-01');
  assert.match(recorded.manifest.semanticBinding.sha256, /^[a-f0-9]{64}$/u);

  const evidencePath = path.join(fixture.changePath, 'evidence', 'V-01.json');
  const valid = validateEvidenceManifest({
    root: fixture.root,
    changePath: fixture.changePath,
    evidencePath,
    expectedId: 'V-01',
    expectedRequirement: fixture.requirementPath,
  });
  assert.equal(valid.ok, true, JSON.stringify(valid));
  assert.equal(valid.trust, 'local-captured');

  const originalRequirement = fs.readFileSync(fixture.requirementPath, 'utf8');
  fs.writeFileSync(fixture.requirementPath, `不相关说明。\n${originalRequirement}`, 'utf8');
  assert.equal(validateEvidenceManifest({
    root: fixture.root,
    changePath: fixture.changePath,
    evidencePath,
    expectedId: 'V-01',
    expectedRequirement: fixture.requirementPath,
  }).ok, true);

  fs.writeFileSync(
    fixture.requirementPath,
    originalRequirement
      .replace('- 状态：实施中', '- 状态：待验证')
      .replace('- [ ] [A-01]', '- [x] [A-01]')
      .replace('| V-01 | 自动 | 执行本地聚焦测试 | 待执行 | 计划 | 待执行 |', '| V-01 | 自动 | 执行本地聚焦测试 | 2026-08-21 | 通过 | `evidence/V-01.json` |'),
    'utf8',
  );
  assert.equal(validateEvidenceManifest({
    root: fixture.root,
    changePath: fixture.changePath,
    evidencePath,
    expectedId: 'V-01',
    expectedRequirement: fixture.requirementPath,
  }).ok, true);

  fs.writeFileSync(fixture.requirementPath, originalRequirement.replace('本地和 UI 证据必须对应当前语义与持久产物。', '本地和 UI 证据必须对应新的验收语义。'), 'utf8');
  const semanticChanged = validateEvidenceManifest({
    root: fixture.root,
    changePath: fixture.changePath,
    evidencePath,
    expectedId: 'V-01',
    expectedRequirement: fixture.requirementPath,
  });
  assert.equal(semanticChanged.ok, false);
  assert.equal(semanticChanged.code, 'stale_semantic_evidence');
  assert.equal(semanticChanged.evidenceId, 'V-01');
  fs.writeFileSync(fixture.requirementPath, originalRequirement, 'utf8');

  for (const changedRequirement of [
    originalRequirement.replace('使用 schema v2 并失败关闭', '使用新的 schema v2 失败关闭规则'),
    originalRequirement.replace('执行本地聚焦测试', '执行修改后的本地聚焦测试'),
  ]) {
    fs.writeFileSync(fixture.requirementPath, changedRequirement, 'utf8');
    const changed = validateEvidenceManifest({
      root: fixture.root,
      changePath: fixture.changePath,
      evidencePath,
      expectedId: 'V-01',
      expectedRequirement: fixture.requirementPath,
    });
    assert.equal(changed.ok, false);
    assert.equal(changed.code, 'stale_semantic_evidence');
  }
  fs.writeFileSync(fixture.requirementPath, originalRequirement, 'utf8');

  const originalTestPlan = fs.readFileSync(path.join(fixture.changePath, 'test-plan.md'), 'utf8');
  fs.writeFileSync(
    path.join(fixture.changePath, 'test-plan.md'),
    originalTestPlan.replace('本地证据完整性保持失败关闭', '本地证据完整性使用新的失败关闭断言'),
    'utf8',
  );
  const testCaseChanged = validateEvidenceManifest({
    root: fixture.root,
    changePath: fixture.changePath,
    evidencePath,
    expectedId: 'V-01',
    expectedRequirement: fixture.requirementPath,
  });
  assert.equal(testCaseChanged.ok, false);
  assert.equal(testCaseChanged.code, 'stale_semantic_evidence');
  fs.writeFileSync(path.join(fixture.changePath, 'test-plan.md'), originalTestPlan, 'utf8');

  const stdoutPath = path.join(fixture.root, recorded.manifest.logs.find((item) => item.stream === 'stdout').path);
  fs.appendFileSync(stdoutPath, '篡改\n');
  const tampered = validateEvidenceManifest({
    root: fixture.root,
    changePath: fixture.changePath,
    evidencePath,
    expectedId: 'V-01',
    expectedRequirement: fixture.requirementPath,
  });
  assert.equal(tampered.ok, false);
  assert.equal(tampered.code, 'evidence_file_size_mismatch');
  assert.equal(tampered.target, recorded.manifest.logs.find((item) => item.stream === 'stdout').path);

  const runRoot = 'outputs/ui-review/runs/review-001';
  const statePath = `${runRoot}/state.json`;
  const uiArtifacts = {
    actualScreenshot: `${runRoot}/actual.png`,
    annotatedScreenshot: `${runRoot}/annotated.png`,
    report: `${runRoot}/report/review.md`,
  };
  for (const artifactPath of Object.values(uiArtifacts)) writeFixtureFile(fixture.root, artifactPath, `artifact:${artifactPath}\n`);
  const state = {
    schemaVersion: 2,
    runId: 'review-001',
    stage: 'review',
    status: 'passed',
    scenarioId: 'dashboard',
    scenarioFingerprint: 'a'.repeat(64),
    capture: 'project-playwright',
    artifacts: { runDirectory: runRoot, state: statePath, ...uiArtifacts },
  };
  writeFixtureFile(fixture.root, statePath, `${JSON.stringify(state, null, 2)}\n`);
  const uiManifest = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    evidenceId: 'V-02',
    kind: 'ui-review',
    status: 'passed',
    requirement: 'requirements/REQ-2026-001-trust.md',
    change: fixture.changeName,
    semanticBinding: computeVerificationSemanticBinding({
      requirementPath: fixture.requirementPath,
      changePath: fixture.changePath,
      evidenceId: 'V-02',
    }),
    uiReview: {
      runId: state.runId,
      scenarioId: state.scenarioId,
      scenarioFingerprint: state.scenarioFingerprint,
      actualCapture: state.capture,
      statePath,
      state: createEvidenceFileDescriptor(fixture.root, statePath, 'UI Review 状态'),
    },
    logs: [],
    artifacts: Object.values(uiArtifacts).map((artifactPath) => createEvidenceFileDescriptor(fixture.root, artifactPath, 'UI Review 关键产物')),
  };
  const uiPath = writeManifest(fixture, 'V-02', uiManifest);
  const uiValid = validateEvidenceManifest({
    root: fixture.root,
    changePath: fixture.changePath,
    evidencePath: uiPath,
    expectedId: 'V-02',
    expectedRequirement: fixture.requirementPath,
  });
  assert.equal(uiValid.ok, true, JSON.stringify(uiValid));
  assert.equal(uiValid.trust, 'ui-review-state');

  const identityMismatch = validateEvidenceManifest({
    root: fixture.root,
    changePath: fixture.changePath,
    evidencePath: uiPath,
    expectedId: 'V-02',
    expectedRequirement: fixture.requirementPath,
    manifest: { ...uiManifest, uiReview: { ...uiManifest.uiReview, runId: 'review-999' } },
  });
  assert.equal(identityMismatch.ok, false);
  assert.equal(identityMismatch.code, 'ui_review_identity_mismatch');

  const legacyUiState = { ...state, schemaVersion: 1 };
  writeFixtureFile(fixture.root, statePath, `${JSON.stringify(legacyUiState, null, 2)}\n`);
  const legacyUi = validateEvidenceManifest({
    root: fixture.root,
    changePath: fixture.changePath,
    evidencePath: uiPath,
    expectedId: 'V-02',
    expectedRequirement: fixture.requirementPath,
    manifest: {
      ...uiManifest,
      uiReview: {
        ...uiManifest.uiReview,
        state: createEvidenceFileDescriptor(fixture.root, statePath, 'UI Review 状态'),
      },
    },
  });
  assert.equal(legacyUi.ok, false);
  assert.equal(legacyUi.code, 'legacy_ui_review_state');

  const failedState = { ...state, status: 'inconclusive' };
  writeFixtureFile(fixture.root, statePath, `${JSON.stringify(failedState, null, 2)}\n`);
  const failedUiManifest = {
    ...uiManifest,
    uiReview: {
      ...uiManifest.uiReview,
      state: createEvidenceFileDescriptor(fixture.root, statePath, 'UI Review 状态'),
    },
  };
  const uiFailed = validateEvidenceManifest({
    root: fixture.root,
    changePath: fixture.changePath,
    evidencePath: uiPath,
    expectedId: 'V-02',
    expectedRequirement: fixture.requirementPath,
    manifest: failedUiManifest,
  });
  assert.equal(uiFailed.ok, false);
  assert.equal(uiFailed.code, 'ui_review_not_passed');

  const externalManifest = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    evidenceId: 'V-03',
    kind: 'external-ci',
    status: 'passed',
    requirement: 'requirements/REQ-2026-001-trust.md',
    change: fixture.changeName,
    semanticBinding: computeVerificationSemanticBinding({
      requirementPath: fixture.requirementPath,
      changePath: fixture.changePath,
      evidenceId: 'V-03',
    }),
    logs: [],
    artifacts: [],
    external: {
      url: 'https://ci.example/runs/3',
      commit: 'b'.repeat(40),
      jobs: [{ name: 'linux-x64', status: 'passed' }],
      remotelyVerified: true,
    },
  };
  const externalPath = writeManifest(fixture, 'V-03', externalManifest);
  const external = validateEvidenceManifest({
    root: fixture.root,
    changePath: fixture.changePath,
    evidencePath: externalPath,
    expectedId: 'V-03',
    expectedRequirement: fixture.requirementPath,
  });
  assert.equal(external.ok, true);
  assert.equal(external.status, 'recorded');
  assert.equal(external.trust, 'external-recorded');

  const aggregated = validateVerificationEvidenceRecords({
    root: fixture.root,
    changePath: fixture.changePath,
    requirementPath: fixture.requirementPath,
    records: [{
      id: 'V-03',
      type: '自动',
      result: '通过',
      evidence: '`openspec/changes/trust-change/evidence/V-03.json`',
    }],
  });
  assert.equal(aggregated.ok, false);
  assert.equal(aggregated.diagnostics.some((item) => item.status === 'recorded' && item.trust === 'external-recorded'), true);
  assert.equal(aggregated.diagnostics.some((item) => item.code === 'machine_evidence_missing' && item.status === 'failed'), true);

  const legacyManifest = { ...recorded.manifest, schemaVersion: LEGACY_EVIDENCE_SCHEMA_VERSION };
  delete legacyManifest.semanticBinding;
  const strictLegacy = validateEvidenceManifest({
    root: fixture.root,
    changePath: fixture.changePath,
    evidencePath,
    expectedId: 'V-01',
    expectedRequirement: fixture.requirementPath,
    manifest: legacyManifest,
    strict: true,
  });
  assert.equal(strictLegacy.ok, false);
  assert.equal(strictLegacy.code, 'legacy_evidence_schema');
  assert.equal(strictLegacy.trust, 'legacy');
  const historicalLegacy = validateEvidenceManifest({
    root: fixture.root,
    changePath: fixture.changePath,
    evidencePath,
    expectedId: 'V-01',
    expectedRequirement: fixture.requirementPath,
    manifest: legacyManifest,
    strict: false,
  });
  assert.equal(historicalLegacy.ok, true);
  assert.equal(historicalLegacy.status, 'warning');
  assert.equal(historicalLegacy.trust, 'legacy');
});

test('[TC-03] 跨平台诊断与仓库统一验证合同', () => {
  const root = fs.realpathSync(repositoryRoot);
  const windowsAbsolute = captureThrown(() => resolveSafeProjectPath(root, 'C:\\outside\\file.txt', '跨平台样本'));
  assert.equal(windowsAbsolute.code, 'unsafe_project_path');
  assert.equal(windowsAbsolute.status, 'blocked');
  assert.equal(windowsAbsolute.target, 'C:/outside/file.txt');

  const traversal = captureThrown(() => resolveSafeProjectPath(root, '../outside.txt', '跨平台样本'));
  assert.equal(traversal.code, 'unsafe_project_path');
  assert.equal(traversal.status, 'blocked');

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts.test, 'node scripts/test-groups.mjs all');
  assert.equal(packageJson.scripts.validate, 'node plugins/frontend-ai-workflow/scripts/validate-structure.mjs');
  assert.equal(packageJson.scripts.verify, 'node scripts/verify.mjs');
});
