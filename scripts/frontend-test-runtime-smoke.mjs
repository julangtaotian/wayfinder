import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cleanupFrontendTestRuntime } from './cleanup-frontend-test-runtime.mjs';
import { prepareFrontendTestRuntime } from './prepare-frontend-test-runtime.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDir, '..');

function smokeError(code, message, target = null) {
  const error = new Error(message);
  error.code = code;
  error.target = target;
  error.status = 1;
  return error;
}

export function runFrontendTestRuntimeSmoke({
  repositoryRoot = defaultRepositoryRoot,
  environment = process.env,
  prepareRuntime = (root) => prepareFrontendTestRuntime({
    repositoryRoot: root,
    environment,
    offline: true,
  }),
  cleanupRuntime = (root) => cleanupFrontendTestRuntime({ repositoryRoot: root }),
  execute = spawnSync,
} = {}) {
  const root = fs.realpathSync(path.resolve(repositoryRoot));
  const fixtureRoot = path.join(root, 'tests', 'fixtures', 'frontend-test-vue-vitest');
  const configPath = path.join(fixtureRoot, 'vitest.config.mjs');
  const testPath = path.join(fixtureRoot, 'tests', 'math.spec.js');
  for (const target of [configPath, testPath]) {
    if (!fs.existsSync(target)) {
      throw smokeError('frontend_test_runtime_smoke_fixture_missing', `离线 smoke fixture 缺失：${target}`, target);
    }
  }

  let prepared = false;
  try {
    const runtime = prepareRuntime(root);
    prepared = true;
    const result = execute(process.execPath, [
      runtime.vitestEntry,
      'run',
      '--config',
      configPath,
      '--configLoader',
      'runner',
      '--reporter=dot',
      '--testNamePattern',
      'TC-03',
      testPath,
    ], {
      cwd: fixtureRoot,
      env: environment,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.error || result.status !== 0) {
      throw smokeError(
        'frontend_test_runtime_smoke_failed',
        result.error?.message || result.stderr || result.stdout || `离线最小测试退出码 ${result.status ?? '未知'}`,
        testPath,
      );
    }
    return {
      ok: true,
      code: 'frontend_test_runtime_smoke_passed',
      offline: true,
      test: 'TC-03',
      status: 0,
    };
  } finally {
    if (prepared) cleanupRuntime(root);
  }
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    if (process.argv.length > 2) throw smokeError('frontend_test_runtime_smoke_argument_invalid', `不支持的参数：${process.argv[2]}`);
    const result = runFrontendTestRuntimeSmoke();
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: error.code || 'frontend_test_runtime_smoke_failed',
      target: error.target || null,
      status: error.status || 1,
      message: error.message,
    }));
    process.exitCode = error.status || 1;
  }
}
