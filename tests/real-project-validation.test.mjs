import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  RealProjectValidationError,
  classifyNativeTestResult,
  cleanupWorkspace,
  collectProjectBaseline,
  collectProjectResourceBudget,
  createValidationArtifactDescriptor,
  inspectProjectFacts,
  normalizeMachinePath,
  prepareProjectDependencies,
  prepareWorkspace,
  resolvePackageManagerInvocation,
  runLifecycleValidation,
  runRealProjectValidation,
  sanitizeCapturedOutput,
  validateMatrix,
} from '../plugins/frontend-ai-workflow/scripts/real-project-validation.mjs';
import { stagePayloadDigest } from '../plugins/frontend-ai-workflow/scripts/real-project-validation-foundation.mjs';
import {
  RealProjectSupportEvidenceError,
  matchSupportCombination,
  projectRealSupportEvidence,
} from '../plugins/frontend-ai-workflow/scripts/real-project-support-evidence.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureOutputRoot = path.join(repositoryRoot, '.frontend-ai-workflow', 'runs', 'real-project-validation', 'test-fixtures');
const localMatrixPath = path.join(repositoryRoot, '.frontend-ai-workflow', 'runs', 'real-project-validation', 'local-matrix.json');

function write(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

function runGit(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function createProject(root, name = 'project') {
  const projectRoot = path.join(root, name);
  fs.mkdirSync(projectRoot, { recursive: true });
  write(projectRoot, 'package.json', `${JSON.stringify({
    name,
    private: true,
    scripts: {
      build: 'vite build',
      test: 'node --test tests/*.test.mjs',
    },
    dependencies: { vue: '^3.5.0' },
    devDependencies: { vite: '^6.0.0' },
  }, null, 2)}\n`);
  write(projectRoot, 'package-lock.json', '{}\n');
  write(projectRoot, 'src/App.vue', '<template><main>真实项目矩阵 fixture</main></template>\n');
  write(projectRoot, 'tests/example.test.mjs', "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('fixture', () => assert.equal(1, 1));\n");
  runGit(projectRoot, ['init', '-q']);
  runGit(projectRoot, ['config', 'user.name', 'Frontend AI Workflow Test']);
  runGit(projectRoot, ['config', 'user.email', 'workflow-test@example.invalid']);
  runGit(projectRoot, ['add', '.']);
  runGit(projectRoot, ['commit', '-qm', 'fixture baseline']);
  return projectRoot;
}

function createFixture(context, name) {
  fs.mkdirSync(fixtureOutputRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureOutputRoot, `${name}-`));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = createProject(root);
  const project = {
    id: 'P1',
    root: projectRoot,
    branch: runGit(projectRoot, ['symbolic-ref', '--short', 'HEAD']),
    commit: runGit(projectRoot, ['rev-parse', 'HEAD']),
    role: 'Vue fixture',
    expected: {
      inspection: 'passed',
      lifecycle: 'passed',
      nativeTest: 'blocked',
    },
    facts: {
      preset: 'vue3-vite',
      packageManager: 'npm',
      runner: 'Node Test Runner',
      runnerCertification: 'project-evidence-only',
      testCommandStatus: 'detected',
      buildTools: ['vite'],
      workspaceDeclared: false,
      minimumNestedPackages: 0,
    },
  };
  const matrix = { schemaVersion: 1, runId: `fixture-${name}`, projects: [project] };
  const matrixPath = write(root, `.frontend-ai-workflow/runs/real-project-validation/local-matrix.json`, `${JSON.stringify(matrix, null, 2)}\n`);
  return { root, projectRoot, project, matrix, matrixPath, runRoot: path.join(root, '.frontend-ai-workflow', 'runs', 'real-project-validation', matrix.runId) };
}

function captureError(operation) {
  let captured = null;
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

function writeStagePayload(fixture, stage, results) {
  const payload = {
    schemaVersion: 1,
    runId: fixture.matrix.runId,
    stage,
    platform: { platform: 'darwin', arch: 'arm64', node: 'v20.19.0' },
    status: 'passed',
    results,
  };
  payload.contentDigest = stagePayloadDigest(payload);
  write(fixture.root, `${path.relative(fixture.root, fixture.runRoot)}/${stage}/results.json`, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

function createProjectionFixture(context, name) {
  const fixture = createFixture(context, `projection-${name}`);
  const project = fixture.matrix.projects[0];
  const projects = [
    project,
    { ...project, id: 'P2', role: 'Vue Webpack fixture' },
    { ...project, id: 'P3', role: 'WeChat fixture' },
  ];
  fixture.matrix = { ...fixture.matrix, projects };
  fs.writeFileSync(fixture.matrixPath, `${JSON.stringify(fixture.matrix, null, 2)}\n`, 'utf8');
  const inspectionResults = [
    {
      projectId: 'P1', stage: 'inspection', root: 'project:P1', commit: project.commit,
      preset: 'vue3-vite', packageManager: 'npm', buildTools: ['vite'],
      runner: { name: 'Vitest', certification: 'verified-vue3-vite-vitest' },
      status: 'passed', code: 'inspection_facts_matched', matchesExpected: true,
    },
    {
      projectId: 'P2', stage: 'inspection', root: 'project:P2', commit: project.commit,
      preset: 'vue-webpack', packageManager: 'yarn', buildTools: ['webpack'],
      runner: { name: 'Jest', certification: 'project-evidence-only' },
      status: 'passed', code: 'inspection_facts_matched', matchesExpected: true,
    },
    {
      projectId: 'P3', stage: 'inspection', root: 'project:P3', commit: project.commit,
      preset: 'wechat-native', packageManager: 'npm', buildTools: [],
      runner: { name: '未识别', certification: 'project-evidence-only' },
      status: 'passed', code: 'inspection_facts_matched', matchesExpected: true,
    },
  ];
  const nativeResults = [
    { projectId: 'P1', stage: 'native-test', status: 'passed', code: 'certified_test_run_passed', matchesExpected: true },
    { projectId: 'P2', stage: 'native-test', status: 'limited', code: 'project_evidence_test_run_passed', matchesExpected: true },
    { projectId: 'P3', stage: 'native-test', status: 'blocked', code: 'test_facility_missing', matchesExpected: true },
  ];
  const inspection = writeStagePayload(fixture, 'inspection', inspectionResults);
  const nativeTest = writeStagePayload(fixture, 'native-test', nativeResults);
  return { ...fixture, projects, inspection, nativeTest };
}

test('[TC-09] 真实项目标准结果投影与保守组合映射', (context) => {
  const fixture = createProjectionFixture(context, 'success');
  const preview = projectRealSupportEvidence({
    root: fixture.root,
    matrix: path.relative(fixture.root, fixture.matrixPath),
    revision: fixture.project.commit,
  });
  assert.equal(preview.status, 'planned');
  assert.equal(preview.write, false);
  assert.equal(preview.outputExists, false);
  assert.deepEqual(preview.combinations.map((item) => [item.id, item.status]), [
    ['vue-webpack-yarn-jest', 'limited'],
    ['vue3-vite-vitest-npm', 'passed'],
    ['wechat-native-npm-manual', 'blocked'],
  ]);
  assert.equal(preview.source.files.length, 3);
  assert.equal(preview.source.files.every((item) => !path.isAbsolute(item.path) && /^[a-f0-9]{64}$/u.test(item.sha256)), true);

  const recorded = projectRealSupportEvidence({
    root: fixture.root,
    matrix: path.relative(fixture.root, fixture.matrixPath),
    revision: fixture.project.commit,
    write: true,
  }, {
    readSnapshot: () => ({ revision: fixture.project.commit, status: '' }),
  });
  assert.equal(recorded.status, 'recorded');
  const evidenceText = fs.readFileSync(path.join(fixture.root, recorded.receipt), 'utf8');
  assert.equal(evidenceText.includes(fixture.projectRoot), false);
  const evidence = JSON.parse(evidenceText);
  assert.equal(evidence.kind, 'real-project-support-evidence');
  assert.deepEqual(evidence.combinations.find((item) => item.id === 'vue3-vite-vitest-npm').projectIds, ['P1']);
  assert.deepEqual(evidence.combinations.find((item) => item.id === 'vue-webpack-yarn-jest').projects, [
    { id: 'P2', commit: fixture.project.commit },
  ]);
});

test('[TC-10] 真实项目投影失败安全与敏感边界', (context) => {
  const digestFixture = createProjectionFixture(context, 'digest');
  const inspectionPath = path.join(digestFixture.runRoot, 'inspection', 'results.json');
  const damaged = JSON.parse(fs.readFileSync(inspectionPath, 'utf8'));
  damaged.results[0].preset = 'react-vite';
  fs.writeFileSync(inspectionPath, `${JSON.stringify(damaged, null, 2)}\n`, 'utf8');
  assert.throws(
    () => projectRealSupportEvidence({ root: digestFixture.root, matrix: path.relative(digestFixture.root, digestFixture.matrixPath), revision: digestFixture.project.commit }),
    (error) => error instanceof RealProjectSupportEvidenceError && error.code === 'support_stage_digest_mismatch',
  );

  const defectFixture = createProjectionFixture(context, 'defect');
  defectFixture.nativeTest.results[0].status = 'defect';
  defectFixture.nativeTest.results[0].matchesExpected = false;
  writeStagePayload(defectFixture, 'native-test', defectFixture.nativeTest.results);
  assert.throws(
    () => projectRealSupportEvidence({ root: defectFixture.root, matrix: path.relative(defectFixture.root, defectFixture.matrixPath), revision: defectFixture.project.commit }),
    (error) => error.code === 'support_project_defect' && error.target === 'P1',
  );

  const absoluteFixture = createProjectionFixture(context, 'absolute');
  absoluteFixture.inspection.results[0].debugPath = '/private/business/source.vue';
  writeStagePayload(absoluteFixture, 'inspection', absoluteFixture.inspection.results);
  assert.throws(
    () => projectRealSupportEvidence({ root: absoluteFixture.root, matrix: path.relative(absoluteFixture.root, absoluteFixture.matrixPath), revision: absoluteFixture.project.commit }),
    (error) => error.code === 'support_stage_absolute_path',
  );

  const duplicateFixture = createProjectionFixture(context, 'duplicate');
  duplicateFixture.nativeTest.results[2] = { ...duplicateFixture.nativeTest.results[1] };
  writeStagePayload(duplicateFixture, 'native-test', duplicateFixture.nativeTest.results);
  assert.throws(
    () => projectRealSupportEvidence({ root: duplicateFixture.root, matrix: path.relative(duplicateFixture.root, duplicateFixture.matrixPath), revision: duplicateFixture.project.commit }),
    (error) => error.code === 'support_project_duplicate' && error.target === 'P2',
  );

  const unknownFixture = createProjectionFixture(context, 'unknown');
  unknownFixture.inspection.results[0].runner = { name: 'Node Test Runner', certification: 'project-evidence-only' };
  writeStagePayload(unknownFixture, 'inspection', unknownFixture.inspection.results);
  assert.throws(
    () => projectRealSupportEvidence({ root: unknownFixture.root, matrix: path.relative(unknownFixture.root, unknownFixture.matrixPath), revision: unknownFixture.project.commit }),
    (error) => error.code === 'support_combination_unknown' && error.target === 'P1',
  );

  const duplicatedRule = {
    id: 'duplicate', preset: 'vue3-vite', buildTools: ['vite'], packageManager: 'npm',
    runner: 'Vitest', certification: 'verified-vue3-vite-vitest', certifiable: true,
  };
  assert.throws(
    () => matchSupportCombination({
      ...unknownFixture.inspection.results[0],
      runner: { name: 'Vitest', certification: 'verified-vue3-vite-vitest' },
    }, [duplicatedRule, { ...duplicatedRule }]),
    (error) => error.code === 'support_combination_ambiguous',
  );

  const missingFixture = createProjectionFixture(context, 'missing');
  fs.rmSync(path.join(missingFixture.runRoot, 'native-test', 'results.json'));
  assert.throws(
    () => projectRealSupportEvidence({ root: missingFixture.root, matrix: path.relative(missingFixture.root, missingFixture.matrixPath), revision: missingFixture.project.commit }),
    (error) => error.code === 'project_path_missing',
  );

  assert.throws(
    () => projectRealSupportEvidence({ root: unknownFixture.root, matrix: path.relative(unknownFixture.root, unknownFixture.matrixPath), revision: unknownFixture.project.commit, output: 'support.json' }),
    (error) => error.code === 'support_combination_unknown' || error.code === 'support_evidence_outside_runtime',
  );
});

test('[TC-01] 固定基线与漂移失败关闭', (context) => {
  const fixture = createFixture(context, 'baseline');
  const baseline = collectProjectBaseline(fixture.project);
  assert.equal(baseline.status, 'passed');
  assert.equal(baseline.code, 'project_baseline_matched');
  assert.equal(baseline.root, 'project:P1');
  assert.equal(JSON.stringify(baseline).includes(fixture.projectRoot), false);

  const sourcePath = path.join(fixture.projectRoot, 'src', 'App.vue');
  const sourceBefore = fs.readFileSync(sourcePath, 'utf8');
  fs.appendFileSync(sourcePath, '<!-- 漂移 -->\n', 'utf8');
  const dirty = collectProjectBaseline(fixture.project);
  assert.equal(dirty.status, 'blocked');
  assert.equal(dirty.code, 'project_workspace_dirty');
  fs.writeFileSync(sourcePath, sourceBefore, 'utf8');
  assert.equal(runGit(fixture.projectRoot, ['status', '--porcelain=v1']), '');

  const commitMismatch = collectProjectBaseline({ ...fixture.project, commit: '0'.repeat(40) });
  assert.equal(commitMismatch.status, 'blocked');
  assert.equal(commitMismatch.code, 'project_commit_mismatch');

  const duplicate = captureError(() => validateMatrix({
    ...fixture.matrix,
    projects: [fixture.project, fixture.project],
  }));
  assert.equal(duplicate instanceof RealProjectValidationError, true);
  assert.equal(duplicate.code, 'duplicate_project_id');

  const invalidStatus = captureError(() => validateMatrix({
    ...fixture.matrix,
    projects: [{ ...fixture.project, expected: { ...fixture.project.expected, lifecycle: 'defect' } }],
  }));
  assert.equal(invalidStatus.code, 'invalid_expected_status');

  const outsideMatrix = write(fixture.root, 'outside-matrix.json', `${JSON.stringify(fixture.matrix)}\n`);
  const outside = captureError(() => runRealProjectValidation({
    repositoryRoot: fixture.root,
    matrixPath: outsideMatrix,
  }));
  assert.equal(outside.code, 'unsafe_validation_path');
  assert.equal(normalizeMachinePath('folder\\child\\file'), 'folder/child/file');
  assert.equal(fs.readFileSync(sourcePath, 'utf8'), sourceBefore);

  const falsePositive = inspectProjectFacts({
    ...fixture.project,
    facts: {
      ...fixture.project.facts,
      testFileCount: 0,
      excludedTestFiles: ['tests/example.test.mjs'],
    },
  });
  assert.equal(falsePositive.status, 'defect');
  assert.equal(falsePositive.code, 'inspection_expectation_mismatch');
  assert.equal(falsePositive.issues.some((issue) => issue.field === 'testFileCount'), true);
  assert.equal(falsePositive.issues.some((issue) => issue.field === 'excludedTestFiles'), true);

  fs.mkdirSync(path.join(fixture.projectRoot, 'node_modules', 'example-dependency'), { recursive: true });
  write(fixture.projectRoot, 'node_modules/example-dependency/index.js', 'export default true;\n');
  fs.mkdirSync(fixture.runRoot, { recursive: true });
  const budget = collectProjectResourceBudget({ project: fixture.project, runRoot: fixture.runRoot });
  assert.equal(budget.status, 'passed');
  assert.equal(budget.bytes > 0, true);
  assert.equal(budget.reserveBytes > 0, true);
});

test('[TC-02] 隔离生命周期与有界清理', (context) => {
  const fixture = createFixture(context, 'isolation');
  fs.mkdirSync(fixture.runRoot, { recursive: true });
  const sourceStatus = runGit(fixture.projectRoot, ['status', '--porcelain=v1']);
  const prepared = prepareWorkspace({ project: fixture.project, runRoot: fixture.runRoot });
  assert.equal(prepared.status, 'passed');
  assert.equal(
    normalizeMachinePath(runGit(prepared.workspace, ['rev-parse', '--show-toplevel'])),
    normalizeMachinePath(prepared.workspace),
  );
  assert.equal(runGit(fixture.projectRoot, ['status', '--porcelain=v1']), sourceStatus);

  const failedCleanup = cleanupWorkspace({
    workspace: prepared.workspace,
    runRoot: fixture.runRoot,
    operations: { remove: () => { throw new Error('cleanup-fixture-failed'); } },
  });
  assert.equal(failedCleanup.status, 'blocked');
  assert.equal(failedCleanup.code, 'workspace_cleanup_failed');
  assert.equal(fs.existsSync(prepared.workspace), true);
  assert.equal(cleanupWorkspace({ workspace: prepared.workspace, runRoot: fixture.runRoot }).status, 'passed');

  const lifecycle = runLifecycleValidation({ project: fixture.project, runRoot: fixture.runRoot });
  assert.equal(lifecycle.status, 'passed', JSON.stringify(lifecycle));
  assert.equal(lifecycle.assertions.previewZeroWrite, true);
  assert.equal(lifecycle.assertions.repeatedIdempotent, true);
  assert.equal(lifecycle.assertions.customPreserved, true);
  assert.equal(lifecycle.assertions.conflictProtected, true);
  assert.equal(lifecycle.cleanup.status, 'passed');
  assert.equal(runGit(fixture.projectRoot, ['status', '--porcelain=v1']), sourceStatus);

  const outside = path.join(fixture.root, 'outside-dependency');
  const workspace = path.join(fixture.runRoot, 'dependency-workspace');
  fs.mkdirSync(path.join(fixture.projectRoot, 'node_modules'), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });
  fs.symlinkSync(outside, path.join(fixture.projectRoot, 'node_modules', 'outside-link'), process.platform === 'win32' ? 'junction' : 'dir');
  const dependencies = prepareProjectDependencies({
    sourceRoot: fixture.projectRoot,
    workspaceRoot: workspace,
    runRoot: fixture.runRoot,
  });
  assert.equal(dependencies.status, 'blocked');
  assert.equal(dependencies.code, 'dependency_symlink_outside');

  const unsafeCleanup = cleanupWorkspace({ workspace: fixture.root, runRoot: fixture.runRoot });
  assert.equal(unsafeCleanup.status, 'blocked');
  assert.equal(unsafeCleanup.code, 'unsafe_cleanup_target');
});

test('[TC-03] 结果分类与证据安全边界', (context) => {
  const fixture = createFixture(context, 'evidence');
  const passed = classifyNativeTestResult({
    processResult: { exitCode: 0, launchError: false, timedOut: false },
    discoveryCount: 2,
    certification: 'verified-vue3-vite-vitest',
  });
  assert.deepEqual(passed, { status: 'passed', code: 'certified_test_run_passed' });
  assert.equal(classifyNativeTestResult({ processResult: { exitCode: 0 }, discoveryCount: 0 }).code, 'test_zero_discovery');
  assert.equal(classifyNativeTestResult({ processResult: { exitCode: null, launchError: true }, discoveryCount: 0 }).code, 'test_process_launch_failed');
  assert.equal(classifyNativeTestResult({ processResult: { exitCode: null, timedOut: true }, discoveryCount: 0 }).code, 'test_process_timeout');
  assert.equal(classifyNativeTestResult({ processResult: { exitCode: 1 }, discoveryCount: 1 }).code, 'project_test_nonzero_exit');
  assert.equal(classifyNativeTestResult({ processResult: { exitCode: 1 }, discoveryCount: 0, zeroTestReported: true }).code, 'test_zero_discovery');
  assert.equal(classifyNativeTestResult({ processResult: { exitCode: 0 }, discoveryCount: 1, assertionMismatch: true }).status, 'defect');

  const limited = classifyNativeTestResult({
    processResult: { exitCode: 0, launchError: false, timedOut: false },
    discoveryCount: 1,
    certification: 'project-evidence-only',
  });
  assert.deepEqual(limited, { status: 'limited', code: 'project_evidence_test_run_passed' });

  const safe = sanitizeCapturedOutput('Tests  2 passed\r\n完成');
  assert.equal(safe.safe, true);
  assert.equal(safe.text.includes('\r'), false);
  const redacted = sanitizeCapturedOutput('C:/private/project/src/test.js\nC:\\private\\project\\src\\test.js', {
    redactions: [{ value: 'C:\\private\\project', replacement: 'project:P1' }],
  });
  assert.equal(redacted.text.includes('C:/private/project'), false);
  assert.equal(redacted.text.includes('C:\\private\\project'), false);
  assert.equal(redacted.text.includes('project:P1/src/test.js'), true);
  const sensitive = sanitizeCapturedOutput('Authorization: Bearer secret-value');
  assert.equal(sensitive.safe, false);
  assert.equal(sensitive.text, null);
  assert.equal(sensitive.code, 'sensitive_output_detected');

  const artifactPath = write(fixture.root, '.frontend-ai-workflow/runs/real-project-validation/proof/result.txt', '可审计结果\n');
  const descriptor = createValidationArtifactDescriptor(fixture.root, artifactPath, '测试证据');
  assert.equal(descriptor.path, '.frontend-ai-workflow/runs/real-project-validation/proof/result.txt');
  assert.equal(descriptor.size > 0, true);
  assert.match(descriptor.sha256, /^[0-9a-f]{64}$/u);
  const outsidePath = write(path.dirname(fixture.root), `${path.basename(fixture.root)}-outside.txt`, '越界\n');
  context.after(() => fs.rmSync(outsidePath, { force: true }));
  const outside = captureError(() => createValidationArtifactDescriptor(fixture.root, outsidePath, '越界证据'));
  assert.equal(outside.code, 'unsafe_artifact_path');

  const unsupported = resolvePackageManagerInvocation({
    packageManager: 'pnpm',
    workspaceRoot: fixture.projectRoot,
    scriptName: 'test',
  });
  assert.equal(unsupported.status, 'blocked');
  assert.equal(unsupported.code, 'package_manager_not_supported');
});

function realCaseOptions() {
  const focused = process.execArgv.some((item) => item.startsWith('--test-name-pattern'));
  if (focused) return {};
  return { skip: '未提供本机真实项目矩阵，常规仓库回归不读取外部业务项目' };
}

function runLocalMatrixStage(stage) {
  assert.equal(fs.existsSync(localMatrixPath), true, '缺少 .frontend-ai-workflow/runs/real-project-validation/local-matrix.json');
  const preview = runRealProjectValidation({ repositoryRoot, matrixPath: localMatrixPath, stage });
  assert.equal(preview.write, false);
  assert.equal(preview.readyToWrite, true, JSON.stringify(preview.baselines));
  const result = runRealProjectValidation({ repositoryRoot, matrixPath: localMatrixPath, stage, write: true });
  assert.equal(result.ok, true, JSON.stringify(result.summaries));
  return result;
}

test('[TC-04] 六项目基线与只读识别', realCaseOptions(), () => {
  const result = runLocalMatrixStage('inspection');
  const summary = result.summaries[0];
  assert.equal(summary.results.length, 6);
  assert.equal(summary.results.every((item) => item.matchesExpected), true);
  const p4 = summary.results.find((item) => item.projectId === 'P4');
  const p5 = summary.results.find((item) => item.projectId === 'P5');
  assert.deepEqual(p4.buildTools, ['vite', 'webpack']);
  assert.equal(p5.nestedPackages.paths.length >= 2, true);
  assert.equal(p5.workspaceDeclared, false);
});

test('[TC-05] 六项目隔离生命周期', realCaseOptions(), () => {
  const result = runLocalMatrixStage('lifecycle');
  const summary = result.summaries[0];
  assert.equal(summary.results.length, 6);
  assert.equal(summary.results.every((item) => item.sourceAfter?.status === 'passed'), true);
  assert.equal(summary.results.every((item) => item.cleanup?.status === 'passed'), true);
});

test('[TC-06] 多运行器真实执行与缺链阻断', realCaseOptions(), () => {
  const result = runLocalMatrixStage('native-test');
  const summary = result.summaries[0];
  assert.equal(summary.results.length, 6);
  assert.equal(summary.results.every((item) => item.matchesExpected), true);
  assert.equal(summary.results.find((item) => item.projectId === 'P1').status, 'passed');
  for (const projectId of ['P2', 'P4']) {
    assert.equal(summary.results.find((item) => item.projectId === projectId).status, 'limited');
  }
  assert.equal(['blocked', 'limited'].includes(summary.results.find((item) => item.projectId === 'P3').status), true);
  for (const projectId of ['P5', 'P6']) {
    assert.equal(summary.results.find((item) => item.projectId === projectId).status, 'blocked');
  }
});
