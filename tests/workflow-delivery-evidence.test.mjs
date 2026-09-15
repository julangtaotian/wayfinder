import assert from 'node:assert/strict';
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
  KNOWN_SUPPORT_GAPS,
  SupportEvidenceError,
  buildSupportEvidenceMatrix,
} from '../plugins/frontend-ai-workflow/scripts/support-evidence-matrix.mjs';

const REVISION = 'a'.repeat(40);
const RUN_ID = 123456789;

function createRoot(context, name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `delivery-evidence-${name}-`));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), '{}\n');
  return root;
}

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

test('[TC-02] 支持证据矩阵分层且保留未覆盖范围', () => {
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
  assert.equal(certified.status, 'certified');
  assert.equal(certified.layers.localRealProject.status, 'passed');
  assert.equal(certified.layers.fivePlatformCi.status, 'recorded');
  assert.equal(certified.layers.fivePlatformCi.trust, 'external-recorded');
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
