import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  EXPECTED_VALIDATE_JOBS,
  ExternalCiCollectionError,
  collectExternalCiReceipt,
  requestGithubJson,
} from '../plugins/frontend-ai-workflow/scripts/collect-external-ci-receipt.mjs';
import { readExternalCiReceipt } from '../plugins/frontend-ai-workflow/scripts/external-ci-receipt.mjs';
import {
  LocalVerificationReceiptError,
  collectLocalVerificationReceipt,
} from '../scripts/collect-local-verification-receipt.mjs';
import {
  KNOWN_SUPPORT_GAPS,
  SupportEvidenceError,
  buildSupportEvidenceMatrix,
  projectSupportEvidenceMatrix,
} from '../plugins/frontend-ai-workflow/scripts/support-evidence-matrix.mjs';

const REVISION = 'a'.repeat(40);
const RUN_ID = 123456789;

function createRoot(context, name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `delivery-evidence-${name}-`));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), '{}\n');
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts', 'verify.mjs'), 'export const fixture = true;\n');
  return root;
}

function writeProjectFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

function describeProjectFile(root, relativePath) {
  const content = fs.readFileSync(path.join(root, relativePath));
  return {
    path: relativePath,
    bytes: content.byteLength,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
  };
}

test('[TC-03] 本地统一验证回执预览与单次执行', (context) => {
  const root = createRoot(context, 'local-receipt');
  let verificationCalls = 0;
  let snapshotCalls = 0;
  const preview = collectLocalVerificationReceipt({ root, revision: REVISION }, {
    readSnapshot: () => {
      snapshotCalls += 1;
      return { revision: REVISION, status: '' };
    },
    runVerification: () => {
      verificationCalls += 1;
      return { ok: true, status: 0, scope: 'all', completed: ['tests'] };
    },
  });
  assert.equal(preview.status, 'planned');
  assert.equal(preview.write, false);
  assert.deepEqual(preview.command, ['node', 'scripts/verify.mjs']);
  assert.equal(snapshotCalls, 0);
  assert.equal(verificationCalls, 0);
  assert.equal(fs.existsSync(path.join(root, preview.output)), false);

  const times = [1_000, 1_125];
  const recorded = collectLocalVerificationReceipt({ root, revision: REVISION, write: true }, {
    readSnapshot: () => {
      snapshotCalls += 1;
      return { revision: REVISION, status: '' };
    },
    runVerification: ({ scope }) => {
      verificationCalls += 1;
      assert.equal(scope, 'all');
      return { ok: true, status: 0, scope, completed: ['static', 'tests', 'structure'] };
    },
    now: () => times.shift(),
    platform: { platform: 'win32', arch: 'x64', node: 'v20.19.0' },
  });
  assert.equal(recorded.status, 'recorded');
  assert.equal(recorded.durationMs, 125);
  assert.equal(snapshotCalls, 2);
  assert.equal(verificationCalls, 1);
  const receiptPath = path.join(root, recorded.receipt);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.kind, 'local-verification-receipt');
  assert.deepEqual(receipt.generator, { id: 'frontend-ai-workflow/local-verification-receipt', version: 1 });
  assert.deepEqual(receipt.platform, { platform: 'win32', arch: 'x64', node: 'v20.19.0' });
  assert.equal(receipt.evidence.runner.path, 'scripts/verify.mjs');
  assert.match(receipt.evidence.runner.sha256, /^[a-f0-9]{64}$/u);
  assert.equal(receipt.evidence.stepCount, 3);
  const original = fs.readFileSync(receiptPath, 'utf8');
  assert.throws(
    () => collectLocalVerificationReceipt({ root, revision: REVISION, write: true }),
    (error) => error instanceof LocalVerificationReceiptError && error.code === 'local_verification_receipt_exists',
  );
  assert.equal(fs.readFileSync(receiptPath, 'utf8'), original);
});

test('[TC-04] 本地回执失败和漂移边界', (context) => {
  const root = createRoot(context, 'local-failures');
  const output = '.frontend-ai-workflow/runs/local-validation/failure.json';
  const exists = () => fs.existsSync(path.join(root, output));

  assert.throws(
    () => collectLocalVerificationReceipt({ root, revision: REVISION, output, write: true }, {
      readSnapshot: () => ({ revision: 'b'.repeat(40), status: '' }),
    }),
    (error) => error.code === 'local_verification_revision_mismatch' && error.target === '执行前',
  );
  assert.equal(exists(), false);
  assert.throws(
    () => collectLocalVerificationReceipt({ root, revision: REVISION, output, write: true }, {
      readSnapshot: () => ({ revision: REVISION, status: ' M README.md' }),
    }),
    (error) => error.code === 'local_verification_workspace_dirty' && error.target === '执行前',
  );
  assert.equal(exists(), false);
  assert.throws(
    () => collectLocalVerificationReceipt({ root, revision: REVISION, output, write: true }, {
      readSnapshot: () => ({ revision: REVISION, status: '' }),
      runVerification: () => ({ ok: false, status: 1, scope: 'all', failedStep: 'tests', completed: [] }),
      now: () => 0,
    }),
    (error) => error.code === 'local_verification_failed' && error.target === 'tests',
  );
  assert.equal(exists(), false);

  const snapshots = [
    { revision: REVISION, status: '' },
    { revision: REVISION, status: '?? changed.txt' },
  ];
  assert.throws(
    () => collectLocalVerificationReceipt({ root, revision: REVISION, output, write: true }, {
      readSnapshot: () => snapshots.shift(),
      runVerification: () => ({ ok: true, status: 0, scope: 'all', completed: ['tests'] }),
      now: () => 0,
    }),
    (error) => error.code === 'local_verification_workspace_dirty' && error.target === '执行后',
  );
  assert.equal(exists(), false);
  assert.throws(
    () => collectLocalVerificationReceipt({ root, revision: REVISION, output: 'tracked.json' }),
    (error) => error.code === 'local_verification_receipt_outside_runtime',
  );
  assert.throws(
    () => collectLocalVerificationReceipt({ root, revision: REVISION, output: 'C:\\outside\\receipt.json' }),
    (error) => ['unsafe_project_path', 'local_verification_receipt_outside_runtime'].includes(error.code),
  );

  assert.throws(
    () => collectLocalVerificationReceipt({ root, revision: REVISION, output, write: true }, {
      readSnapshot: () => ({ revision: REVISION, status: '' }),
      runVerification: () => ({ ok: true, status: 0, scope: 'all', completed: ['tests'] }),
      now: () => 0,
      fileOperations: { rename: () => { throw new Error('rename failed'); } },
    }),
    /rename failed/u,
  );
  assert.equal(exists(), false);
  const receiptDirectory = path.dirname(path.join(root, output));
  assert.equal(fs.readdirSync(receiptDirectory).some((name) => name.endsWith('.tmp')), false);
});

function successfulRun() {
  return {
    id: RUN_ID,
    head_sha: REVISION,
    path: '.github/workflows/validate.yml@refs/heads/main',
    status: 'completed',
    conclusion: 'success',
    html_url: `https://github.com/example/workflow/actions/runs/${RUN_ID}`,
  };
}

function successfulJobs() {
  return EXPECTED_VALIDATE_JOBS.map(({ remoteName }, index) => ({
    id: index + 1,
    name: remoteName,
    status: 'completed',
    conclusion: 'success',
  }));
}

function requestFixture({ runs = [successfulRun()], jobs = successfulJobs() } = {}) {
  const calls = [];
  return {
    calls,
    requestJson: async (url, options) => {
      calls.push({ url, tokenConfigured: Boolean(options.token) });
      if (url.includes('/jobs?')) return { total_count: jobs.length, jobs };
      return { total_count: runs.length, workflow_runs: runs };
    },
  };
}

function fakeHttpsRequest({ body = '{}', statusCode = 200, timeout = false } = {}) {
  return (_url, _options, callback) => {
    const operation = new EventEmitter();
    let destroyed = false;
    operation.destroy = (error) => {
      destroyed = true;
      queueMicrotask(() => operation.emit('error', error));
    };
    operation.end = () => {
      if (timeout) {
        queueMicrotask(() => operation.emit('timeout'));
        return;
      }
      const response = new EventEmitter();
      response.statusCode = statusCode;
      callback(response);
      queueMicrotask(() => {
        response.emit('data', Buffer.from(body));
        if (!destroyed) response.emit('end');
      });
    };
    return operation;
  };
}

test('[TC-01] GitHub CI 回执采集保持精确与零状态写回', async (context) => {
  const root = createRoot(context, 'ci');
  const previewRequests = requestFixture();
  const preview = await collectExternalCiReceipt({
    root,
    repository: 'example/workflow',
    revision: REVISION,
  }, previewRequests);
  assert.equal(preview.status, 'planned');
  assert.equal(preview.write, false);
  assert.equal(preview.expectedJobs.length, 6);
  assert.equal(previewRequests.calls.length, 0);
  assert.equal(fs.existsSync(path.join(root, preview.output)), false);

  const requests = requestFixture();
  const recorded = await collectExternalCiReceipt({
    root,
    repository: 'example/workflow',
    revision: REVISION,
    write: true,
  }, { ...requests, token: 'test-token-must-not-be-persisted' });
  assert.equal(recorded.status, 'recorded');
  assert.equal(recorded.runId, RUN_ID);
  assert.equal(requests.calls.length, 2);
  assert.equal(requests.calls.every((call) => call.tokenConfigured), true);
  const content = fs.readFileSync(path.join(root, recorded.receipt), 'utf8');
  assert.equal(content.includes('test-token-must-not-be-persisted'), false);
  const parsed = readExternalCiReceipt({ root, receiptPath: recorded.receipt, baseRevision: REVISION });
  assert.equal(parsed.check.status, 'recorded');
  assert.equal(parsed.receipt.jobs.length, 6);
  await assert.rejects(
    collectExternalCiReceipt({ root, repository: 'example/workflow', revision: REVISION, write: true }, requests),
    /已存在|覆盖/u,
  );
  assert.equal(fs.readFileSync(path.join(root, recorded.receipt), 'utf8'), content);

  const ambiguous = requestFixture({ runs: [successfulRun(), { ...successfulRun(), id: RUN_ID + 1 }] });
  await assert.rejects(
    collectExternalCiReceipt({
      root,
      repository: 'example/workflow',
      revision: REVISION,
      output: '.frontend-ai-workflow/runs/ci-receipts/ambiguous.json',
      write: true,
    }, ambiguous),
    (error) => error instanceof ExternalCiCollectionError && error.code === 'external_ci_run_ambiguous',
  );
  assert.equal(fs.existsSync(path.join(root, '.frontend-ai-workflow/runs/ci-receipts/ambiguous.json')), false);

  const failedJobs = successfulJobs();
  failedJobs[3] = { ...failedJobs[3], conclusion: 'failure' };
  await assert.rejects(
    collectExternalCiReceipt({
      root,
      repository: 'example/workflow',
      revision: REVISION,
      output: '.frontend-ai-workflow/runs/ci-receipts/failed.json',
      write: true,
    }, requestFixture({ jobs: failedJobs })),
    (error) => error.code === 'external_ci_job_not_passed' && error.target === 'platform-linux-x64',
  );
  await assert.rejects(
    collectExternalCiReceipt({
      root,
      repository: 'example/workflow',
      revision: REVISION,
      output: 'tracked-receipt.json',
      write: true,
    }, requestFixture()),
    (error) => error.code === 'external_ci_receipt_outside_runtime',
  );
  await assert.rejects(
    collectExternalCiReceipt({
      root,
      repository: 'example/workflow',
      revision: REVISION,
      output: '.frontend-ai-workflow/runs/ci-receipts/wrong-repository.json',
      write: true,
    }, requestFixture({ runs: [{ ...successfulRun(), html_url: `https://github.com/other/repository/actions/runs/${RUN_ID}` }] })),
    (error) => error.code === 'external_ci_repository_mismatch',
  );
  await assert.rejects(
    requestGithubJson('https://api.github.com/example', { request: fakeHttpsRequest({ timeout: true }) }),
    (error) => error.code === 'github_request_timeout',
  );
  await assert.rejects(
    requestGithubJson('https://api.github.com/example', {
      request: fakeHttpsRequest({ body: 'x'.repeat(1024 * 1024 + 1) }),
    }),
    (error) => error.code === 'github_response_too_large',
  );
  await assert.rejects(
    requestGithubJson('https://api.github.com/example', { request: fakeHttpsRequest({ statusCode: 403 }) }),
    (error) => error.code === 'github_http_failed',
  );
});

function receipt() {
  return {
    schemaVersion: 1,
    status: 'recorded',
    revision: REVISION,
    reference: `https://github.com/example/workflow/actions/runs/${RUN_ID}`,
    jobs: EXPECTED_VALIDATE_JOBS.map(({ receiptName }) => ({ name: receiptName, status: 'passed' })),
  };
}

function sourceDescriptor(sourcePath) {
  return { path: sourcePath, bytes: 128, sha256: 'c'.repeat(64) };
}

function standardLocalValidation() {
  const completed = ['static', 'footprint', 'lifecycle', 'tests', 'structure', 'openspec', 'runtime-version', 'runtime-integrity'];
  return {
    schemaVersion: 1,
    kind: 'local-verification-receipt',
    generator: { id: 'frontend-ai-workflow/local-verification-receipt', version: 1 },
    status: 'passed',
    revision: REVISION,
    code: 'verification_passed',
    scope: 'all',
    platform: { platform: 'darwin', arch: 'arm64', node: 'v20.19.0' },
    durationMs: 1234,
    completed,
    evidence: { runner: sourceDescriptor('scripts/verify.mjs'), stepCount: completed.length },
  };
}

function standardRealProjectEvidence() {
  return {
    schemaVersion: 1,
    kind: 'real-project-support-evidence',
    generator: { id: 'frontend-ai-workflow/real-project-support-evidence', version: 1 },
    status: 'passed',
    revision: REVISION,
    runId: 'support-run-001',
    combinations: [{
      id: 'vue3-vite-vitest-npm',
      status: 'passed',
      code: 'certified_test_run_passed',
      projectIds: ['P1'],
      projects: [{ id: 'P1', commit: 'b'.repeat(40) }],
    }],
    source: {
      files: [
        sourceDescriptor('.frontend-ai-workflow/runs/real-project-validation/local-matrix.json'),
        sourceDescriptor('.frontend-ai-workflow/runs/real-project-validation/support-run-001/inspection/results.json'),
        sourceDescriptor('.frontend-ai-workflow/runs/real-project-validation/support-run-001/native-test/results.json'),
      ],
    },
  };
}

test('[TC-07] 三层标准证据同 revision 聚合', (context) => {
  const projected = buildSupportEvidenceMatrix({
    revision: REVISION,
    realProjectEvidence: standardRealProjectEvidence(),
    localValidation: standardLocalValidation(),
    externalCiReceipt: receipt(),
  });
  const certified = projected.combinations.find((item) => item.id === 'vue3-vite-vitest-npm');
  assert.equal(certified.status, 'certified');
  assert.equal(certified.layers.localRealProject.status, 'passed');
  assert.equal(certified.layers.localRealProject.trust, 'generated');
  assert.equal(certified.layers.localValidation.trust, 'generated');
  assert.equal(certified.layers.fivePlatformCi.status, 'recorded');
  assert.equal(certified.layers.fivePlatformCi.trust, 'external-recorded');
  assert.deepEqual(projected.evidenceSummary.realProjects.projectIds, ['P1']);
  assert.equal(projected.combinations.find((item) => item.id === 'react-vite-npm').status, 'limited');

  const badLocal = standardLocalValidation();
  badLocal.completed = badLocal.completed.filter((step) => step !== 'tests');
  badLocal.evidence.stepCount = badLocal.completed.length;
  assert.throws(() => buildSupportEvidenceMatrix({
    revision: REVISION,
    localValidation: badLocal,
  }), (error) => error instanceof SupportEvidenceError && error.code === 'invalid_standard_local_validation');
  const badProject = standardRealProjectEvidence();
  badProject.source.files[0].sha256 = 'invalid';
  assert.throws(() => buildSupportEvidenceMatrix({
    revision: REVISION,
    realProjectEvidence: badProject,
  }), (error) => error.code === 'invalid_standard_real_project_evidence');
  assert.throws(() => buildSupportEvidenceMatrix({
    revision: 'b'.repeat(40),
    realProjectEvidence: standardRealProjectEvidence(),
  }), (error) => error.code === 'invalid_real_project_evidence');

  const root = createRoot(context, 'matrix-source');
  const sourcePaths = [
    '.frontend-ai-workflow/runs/real-project-validation/local-matrix.json',
    '.frontend-ai-workflow/runs/real-project-validation/support-run-001/inspection/results.json',
    '.frontend-ai-workflow/runs/real-project-validation/support-run-001/native-test/results.json',
  ];
  sourcePaths.forEach((sourcePath, index) => writeProjectFile(root, sourcePath, `source-${index}\n`));
  const fileRealEvidence = standardRealProjectEvidence();
  fileRealEvidence.source.files = sourcePaths.map((sourcePath) => describeProjectFile(root, sourcePath));
  const fileLocalValidation = standardLocalValidation();
  fileLocalValidation.evidence.runner = describeProjectFile(root, 'scripts/verify.mjs');
  const realEvidencePath = '.frontend-ai-workflow/runs/support-evidence/real-project.json';
  const localEvidencePath = '.frontend-ai-workflow/runs/local-validation/local.json';
  writeProjectFile(root, realEvidencePath, `${JSON.stringify(fileRealEvidence)}\n`);
  writeProjectFile(root, localEvidencePath, `${JSON.stringify(fileLocalValidation)}\n`);
  const fileProjection = projectSupportEvidenceMatrix({
    root,
    revision: REVISION,
    realProjectEvidencePath: realEvidencePath,
    localValidationPath: localEvidencePath,
  });
  assert.equal(fileProjection.evidenceSummary.realProjects.certifying, true);
  fs.appendFileSync(path.join(root, sourcePaths[1]), 'tampered\n', 'utf8');
  assert.throws(() => projectSupportEvidenceMatrix({
    root,
    revision: REVISION,
    realProjectEvidencePath: realEvidencePath,
    localValidationPath: localEvidencePath,
  }), (error) => error.code === 'support_evidence_source_mismatch' && error.target === sourcePaths[1]);
});

test('[TC-08] 旧输入兼容与默认效益边界', () => {
  const baseline = buildSupportEvidenceMatrix();
  assert.deepEqual(baseline.counts, { certified: 0, limited: 6, blocked: 0, uncovered: 1 });
  assert.equal(baseline.revision, null);
  assert.equal(baseline.developerEffectiveness.status, 'unmeasured');
  assert.equal(baseline.developerEffectiveness.benefitPercent, null);
  assert.deepEqual(baseline.knownGaps, KNOWN_SUPPORT_GAPS);
  assert.equal(baseline.combinations.find((item) => item.id === 'react-vite-npm').layers.fixture.status, 'declared');
  assert.equal(baseline.combinations.find((item) => item.id === 'react-vite-npm').layers.localRealProject.status, 'unavailable');
  assert.equal(baseline.combinations.find((item) => item.id === 'workspace-monorepo').status, 'uncovered');

  const projected = buildSupportEvidenceMatrix({
    revision: REVISION,
    realProjectEvidence: {
      schemaVersion: 1,
      revision: REVISION,
      combinations: [{ id: 'vue3-vite-vitest-npm', status: 'passed', code: 'certified_test_run_passed', projectId: 'P1' }],
    },
    localValidation: { schemaVersion: 1, revision: REVISION, status: 'passed', code: 'verify_passed' },
    externalCiReceipt: receipt(),
  });
  const certified = projected.combinations.find((item) => item.id === 'vue3-vite-vitest-npm');
  assert.equal(certified.status, 'limited');
  assert.equal(certified.layers.localRealProject.status, 'passed');
  assert.equal(certified.layers.localRealProject.trust, 'legacy-recorded');
  assert.equal(certified.layers.localRealProject.certifying, false);
  assert.equal(certified.layers.localValidation.trust, 'legacy-recorded');
  assert.equal(certified.layers.localValidation.certifying, false);
  assert.equal(certified.layers.fivePlatformCi.status, 'recorded');
  assert.equal(certified.layers.fivePlatformCi.trust, 'external-recorded');
  assert.equal(projected.counts.certified, 0);
  assert.equal(projected.developerEffectiveness.status, 'unmeasured');
  assert.equal(projected.developerEffectiveness.benefitPercent, null);
  assert.equal(projected.combinations.find((item) => item.id === 'react-vite-npm').status, 'limited');

  assert.throws(() => buildSupportEvidenceMatrix({
    revision: REVISION,
    realProjectEvidence: {
      schemaVersion: 1,
      revision: REVISION,
      combinations: [{ id: 'unknown-combination', status: 'passed' }],
    },
  }), (error) => error instanceof SupportEvidenceError && error.code === 'unknown_support_combination');
  assert.throws(() => buildSupportEvidenceMatrix({
    revision: 'b'.repeat(40),
    externalCiReceipt: receipt(),
  }), (error) => error.code === 'invalid_external_ci_evidence');
  const wrongJobs = receipt();
  wrongJobs.jobs[0] = { name: 'unknown-job', status: 'passed' };
  assert.throws(() => buildSupportEvidenceMatrix({
    revision: REVISION,
    externalCiReceipt: wrongJobs,
  }), (error) => error.code === 'invalid_external_ci_evidence');
});
