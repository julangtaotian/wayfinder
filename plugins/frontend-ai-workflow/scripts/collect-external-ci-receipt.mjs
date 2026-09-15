import https from 'node:https';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { readLifecycleConfig } from './lifecycle-contract.mjs';
import { atomicWriteProjectFile, resolveSafeProjectPath } from './project-path-safety.mjs';

const GITHUB_API_ORIGIN = 'https://api.github.com';
const GITHUB_WEB_HOST = 'github.com';
const DEFAULT_WORKFLOW = 'validate.yml';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/u;
const REVISION_PATTERN = /^[a-f0-9]{40}$/u;
const WORKFLOW_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/u;

export const EXPECTED_VALIDATE_JOBS = Object.freeze([
  Object.freeze({ remoteName: 'Shared validation (linux-x64)', receiptName: 'shared-linux-x64' }),
  Object.freeze({ remoteName: 'Validate (darwin-arm64)', receiptName: 'platform-darwin-arm64' }),
  Object.freeze({ remoteName: 'Validate (darwin-x64)', receiptName: 'platform-darwin-x64' }),
  Object.freeze({ remoteName: 'Validate (linux-x64)', receiptName: 'platform-linux-x64' }),
  Object.freeze({ remoteName: 'Validate (linux-arm64)', receiptName: 'platform-linux-arm64' }),
  Object.freeze({ remoteName: 'Validate (win32-x64)', receiptName: 'platform-win32-x64' }),
]);

export class ExternalCiCollectionError extends Error {
  constructor(code, message, target = null) {
    super(message);
    this.name = 'ExternalCiCollectionError';
    this.code = code;
    this.status = 'failed';
    this.target = target;
  }
}

function fail(code, message, target = null) {
  throw new ExternalCiCollectionError(code, message, target);
}

function normalizeOptions({
  root = process.cwd(), repository, revision, workflow = DEFAULT_WORKFLOW, runId = null, output = null, write = false,
} = {}) {
  const normalizedRepository = String(repository || '').trim();
  const normalizedRevision = String(revision || '').trim().toLowerCase();
  const normalizedWorkflow = String(workflow || '').trim();
  if (!REPOSITORY_PATTERN.test(normalizedRepository) || normalizedRepository.split('/').some((part) => part === '.' || part === '..')) {
    fail('invalid_github_repository', 'GitHub 仓库必须使用 owner/repository 格式', normalizedRepository || null);
  }
  if (!REVISION_PATTERN.test(normalizedRevision)) {
    fail('invalid_ci_revision', 'CI 目标 revision 必须是 40 位十六进制提交', normalizedRevision || null);
  }
  if (!WORKFLOW_PATTERN.test(normalizedWorkflow)) {
    fail('invalid_ci_workflow', 'CI workflow 必须是安全文件名或稳定标识', normalizedWorkflow || null);
  }
  const normalizedRunId = runId === null || runId === undefined ? null : Number(runId);
  if (normalizedRunId !== null && (!Number.isSafeInteger(normalizedRunId) || normalizedRunId <= 0)) {
    fail('invalid_ci_run_id', 'CI run ID 必须是正安全整数', runId);
  }
  const config = readLifecycleConfig(root);
  const defaultOutput = `${config.runtimeDirectory}/runs/ci-receipts/github-${normalizedRevision.slice(0, 12)}.json`;
  const outputPath = String(output || defaultOutput).trim().replaceAll('\\', '/').replace(/^\.\//u, '');
  const target = resolveSafeProjectPath(config.root, outputPath, 'CI 回执输出', { mustExist: false, allowDirectory: false });
  const allowedPrefix = `${config.runtimeDirectory}/runs/ci-receipts/`;
  if (!target.projectPath.startsWith(allowedPrefix)) {
    fail('external_ci_receipt_outside_runtime', `CI 回执输出必须位于 ${allowedPrefix}`, target.projectPath);
  }
  return {
    root: config.root,
    repository: normalizedRepository,
    revision: normalizedRevision,
    workflow: normalizedWorkflow,
    runId: normalizedRunId,
    output: target.projectPath,
    write: write === true,
  };
}

function requestHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'frontend-ai-workflow-ci-receipt',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function requestGithubJson(url, { token = null, request = https.request } = {}) {
  const parsed = new URL(url);
  if (parsed.origin !== GITHUB_API_ORIGIN || parsed.username || parsed.password) {
    fail('unsafe_github_api_url', 'GitHub API 请求必须使用固定 HTTPS 主机', parsed.origin);
  }
  return new Promise((resolve, reject) => {
    const operation = request(parsed, {
      method: 'GET',
      headers: requestHeaders(token),
      timeout: REQUEST_TIMEOUT_MS,
    }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE_BYTES) {
          operation.destroy(new ExternalCiCollectionError('github_response_too_large', 'GitHub API 响应超过大小上限', parsed.pathname));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new ExternalCiCollectionError('github_http_failed', `GitHub API 返回 HTTP ${response.statusCode || 'unknown'}`, parsed.pathname));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new ExternalCiCollectionError('github_invalid_json', 'GitHub API 返回了无效 JSON', parsed.pathname));
        }
      });
    });
    operation.once('timeout', () => operation.destroy(new ExternalCiCollectionError('github_request_timeout', 'GitHub API 请求超时', parsed.pathname)));
    operation.once('error', (error) => reject(error instanceof ExternalCiCollectionError
      ? error
      : new ExternalCiCollectionError('github_request_failed', 'GitHub API 请求失败', parsed.pathname)));
    operation.end();
  });
}

function assertRun(run, config) {
  if (!run || !Number.isSafeInteger(run.id) || run.id <= 0) fail('invalid_ci_run', 'GitHub Actions 运行缺少有效 ID', 'run');
  if (String(run.head_sha || '').toLowerCase() !== config.revision) {
    fail('external_ci_revision_mismatch', 'GitHub Actions 运行提交与目标 revision 不一致', String(run.head_sha || '') || 'run');
  }
  const workflowPath = String(run.path || '').split('@')[0];
  if (workflowPath !== `.github/workflows/${config.workflow}`) {
    fail('external_ci_workflow_mismatch', 'GitHub Actions 运行不属于目标 workflow', workflowPath);
  }
  if (run.status !== 'completed' || run.conclusion !== 'success') {
    fail('external_ci_run_not_passed', 'GitHub Actions 运行尚未成功完成', String(run.status || run.conclusion || 'unknown'));
  }
  let reference;
  try {
    reference = new URL(String(run.html_url || ''));
  } catch {
    fail('invalid_ci_run_reference', 'GitHub Actions 运行缺少合法 HTTPS 引用', 'html_url');
  }
  if (reference.protocol !== 'https:' || reference.hostname !== GITHUB_WEB_HOST || reference.username || reference.password) {
    fail('invalid_ci_run_reference', 'GitHub Actions 运行引用必须位于 github.com', reference.hostname || 'html_url');
  }
  const expectedPath = `/${config.repository}/actions/runs/${run.id}`.toLowerCase();
  if (reference.pathname.replace(/\/+$/u, '').toLowerCase() !== expectedPath) {
    fail('external_ci_repository_mismatch', 'GitHub Actions 运行引用与目标仓库或运行 ID 不一致', reference.pathname);
  }
  return { ...run, html_url: reference.href };
}

function selectRun(payload, config) {
  if (config.runId !== null) return assertRun(payload, config);
  if (!payload || !Array.isArray(payload.workflow_runs)) fail('invalid_ci_runs_response', 'GitHub Actions 运行列表结构无效', 'workflow_runs');
  const matching = payload.workflow_runs.filter((run) => String(run?.head_sha || '').toLowerCase() === config.revision
    && run?.status === 'completed' && run?.conclusion === 'success');
  if (matching.length === 0) fail('external_ci_run_missing', '目标提交没有唯一成功的 GitHub Actions 运行', config.revision);
  if (matching.length > 1) fail('external_ci_run_ambiguous', '目标提交存在多个成功运行，请显式提供 run ID', config.revision);
  return assertRun(matching[0], config);
}

function normalizeJobs(payload) {
  if (!payload || !Array.isArray(payload.jobs) || payload.jobs.length > 100
    || (payload.total_count !== undefined && payload.total_count !== payload.jobs.length)) {
    fail('invalid_ci_jobs_response', 'GitHub Actions jobs 结构无效或超过 100 项', 'jobs');
  }
  return EXPECTED_VALIDATE_JOBS.map((expected) => {
    const matching = payload.jobs.filter((job) => job?.name === expected.remoteName);
    if (matching.length !== 1) {
      fail(matching.length ? 'external_ci_job_ambiguous' : 'external_ci_job_missing', `CI 任务数量不正确：${expected.remoteName}`, expected.receiptName);
    }
    const job = matching[0];
    if (job.status !== 'completed' || job.conclusion !== 'success') {
      fail('external_ci_job_not_passed', `CI 任务尚未成功完成：${expected.remoteName}`, expected.receiptName);
    }
    return { name: expected.receiptName, status: 'passed' };
  });
}

function apiUrl(pathname, query = null) {
  const url = new URL(pathname, GITHUB_API_ORIGIN);
  if (query) for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url.href;
}

export async function collectExternalCiReceipt(options = {}, operations = {}) {
  const config = normalizeOptions(options);
  const preview = {
    ok: true,
    status: 'planned',
    code: 'external_ci_receipt_collection_plan',
    write: false,
    repository: config.repository,
    revision: config.revision,
    workflow: config.workflow,
    runId: config.runId,
    expectedJobs: EXPECTED_VALIDATE_JOBS.map((job) => job.receiptName),
    output: config.output,
    trust: 'external-recorded',
  };
  if (!config.write) return preview;
  const requestJson = operations.requestJson || requestGithubJson;
  const token = operations.token === undefined ? (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null) : operations.token;
  const repositoryPath = config.repository.split('/').map(encodeURIComponent).join('/');
  const runPayload = config.runId === null
    ? await requestJson(apiUrl(`/repos/${repositoryPath}/actions/workflows/${encodeURIComponent(config.workflow)}/runs`, {
      head_sha: config.revision, status: 'completed', per_page: '20',
    }), { token })
    : await requestJson(apiUrl(`/repos/${repositoryPath}/actions/runs/${config.runId}`), { token });
  const run = selectRun(runPayload, config);
  const jobsPayload = await requestJson(apiUrl(`/repos/${repositoryPath}/actions/runs/${run.id}/jobs`, {
    filter: 'latest', per_page: '100',
  }), { token });
  const jobs = normalizeJobs(jobsPayload);
  const receipt = {
    schemaVersion: 1,
    status: 'recorded',
    revision: config.revision,
    reference: run.html_url,
    jobs,
  };
  atomicWriteProjectFile(config.root, config.output, `${JSON.stringify(receipt, null, 2)}\n`, {
    label: 'CI 回执',
    mustNotExist: true,
    operations: operations.fileOperations || {},
  });
  return {
    ...preview,
    status: 'recorded',
    code: 'external_ci_receipt_recorded',
    write: true,
    runId: run.id,
    reference: run.html_url,
    jobs,
    receipt: config.output,
  };
}

function requiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) fail('missing_cli_value', `参数 ${option} 缺少值`, option);
  return value;
}

function parseArgs(argv) {
  const result = { root: process.cwd(), repository: null, revision: null, workflow: DEFAULT_WORKFLOW, runId: null, output: null, write: false };
  const valueOptions = new Map([
    ['--target', 'root'], ['--repository', 'repository'], ['--revision', 'revision'], ['--workflow', 'workflow'], ['--run-id', 'runId'], ['--output', 'output'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--write') result.write = true;
    else if (valueOptions.has(option)) {
      result[valueOptions.get(option)] = requiredValue(argv, index, option);
      index += 1;
    } else fail('unsupported_cli_argument', `不支持的参数：${option}`, option);
  }
  return result;
}

function publicFailure(error) {
  return {
    ok: false,
    status: error?.status || 'failed',
    code: error?.code || 'external_ci_receipt_collection_failed',
    target: error?.target || null,
    error: error?.message || String(error),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(await collectExternalCiReceipt(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(JSON.stringify(publicFailure(error), null, 2));
    process.exitCode = 1;
  }
}
