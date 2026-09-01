import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const VITEST_VERSION = '3.2.4';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDir, '..');
const runtimeFixtureRoot = path.join(scriptDir, 'fixtures', 'frontend-test-runtime');
const RUNTIME_INPUT_FILES = ['package.json', 'package-lock.json'];

function frontendTestRuntimeError(code, message, { target = null, status = 1 } = {}) {
  const error = new Error(message);
  error.code = code;
  error.target = target;
  error.status = status;
  return error;
}

function resolveOutputChild(outputsRoot, name, label) {
  const target = path.join(outputsRoot, name);
  const relativeTarget = path.relative(outputsRoot, target);
  if (!relativeTarget || relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
    throw frontendTestRuntimeError(
      'frontend_test_runtime_path_unsafe',
      `${label}必须位于 outputs 内：${target}`,
      { target },
    );
  }
  return target;
}

export function resolveFrontendTestRuntime(repositoryRoot = defaultRepositoryRoot) {
  const outputsRoot = path.join(repositoryRoot, 'outputs');
  const runtimeRoot = resolveOutputChild(outputsRoot, 'frontend-test-runtime', '验证运行时');
  const cacheRoot = resolveOutputChild(outputsRoot, 'frontend-test-cache', '验证缓存');
  return {
    outputsRoot,
    runtimeRoot,
    cacheRoot,
    vitestEntry: path.join(runtimeRoot, 'node_modules', 'vitest', 'vitest.mjs'),
  };
}

export function resolveFrontendTestRuntimeFixture() {
  const inputs = RUNTIME_INPUT_FILES.map((name) => path.join(runtimeFixtureRoot, name));
  const missing = inputs.find((file) => !fs.existsSync(file) || !fs.statSync(file).isFile());
  if (missing) {
    throw frontendTestRuntimeError(
      'frontend_test_runtime_fixture_missing',
      `验证运行时缺少锁定输入：${missing}`,
      { target: missing },
    );
  }
  return { root: runtimeFixtureRoot, inputs };
}

function copyRuntimeInputs(runtimeRoot) {
  const fixture = resolveFrontendTestRuntimeFixture();
  for (const input of fixture.inputs) {
    fs.copyFileSync(input, path.join(runtimeRoot, path.basename(input)));
  }
  return fixture;
}

export function resolveNpmInvocation({
  platform = process.platform,
  environment = process.env,
  nodePath = process.execPath,
  fileExists = fs.existsSync,
} = {}) {
  const injectedEntry = environment.npm_execpath ? path.resolve(environment.npm_execpath) : null;
  if (injectedEntry && fileExists(injectedEntry)) {
    return { command: nodePath, args: [injectedEntry], source: 'npm_execpath' };
  }

  if (platform === 'win32') {
    const bundledEntry = path.join(path.dirname(nodePath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (fileExists(bundledEntry)) {
      return { command: nodePath, args: [bundledEntry], source: 'node-bundled-npm' };
    }
    throw frontendTestRuntimeError(
      'frontend_test_runtime_npm_entry_missing',
      '无法定位 npm 的 JavaScript 入口；请通过 npm run prepare:test-runtime 执行验证准备',
    );
  }

  return { command: 'npm', args: [], source: 'path' };
}

export function prepareFrontendTestRuntime({
  repositoryRoot = defaultRepositoryRoot,
  execute = spawnSync,
  environment = process.env,
  platform = process.platform,
  nodePath = process.execPath,
  fileExists = fs.existsSync,
  offline = false,
  report = (message) => console.log(message),
} = {}) {
  const root = fs.realpathSync(path.resolve(repositoryRoot));
  const { runtimeRoot, cacheRoot, vitestEntry } = resolveFrontendTestRuntime(root);
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.mkdirSync(cacheRoot, { recursive: true });
  copyRuntimeInputs(runtimeRoot);

  // 直接执行 npm 的 JavaScript 入口，避免 Windows 将 .cmd 当作可执行文件启动。
  const npm = resolveNpmInvocation({ platform, environment, nodePath, fileExists });
  const result = execute(npm.command, [
    ...npm.args,
    'ci',
    '--prefix', runtimeRoot,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--prefer-offline',
    ...(offline ? ['--offline'] : []),
  ], {
    cwd: root,
    env: {
      ...environment,
      npm_config_cache: cacheRoot,
    },
    stdio: 'inherit',
  });

  if (result.error || result.status !== 0) {
    throw frontendTestRuntimeError(
      'frontend_test_runtime_prepare_failed',
      result.error?.message || `Vitest 验证运行时准备失败，退出码 ${result.status ?? '未知'}`,
      { target: runtimeRoot, status: result.status ?? 1 },
    );
  }
  if (!fileExists(vitestEntry)) {
    throw frontendTestRuntimeError(
      'frontend_test_runtime_entry_missing',
      `Vitest 入口不存在：${vitestEntry}`,
      { target: vitestEntry },
    );
  }

  report(`Vitest ${VITEST_VERSION} 验证运行时已准备：${runtimeRoot}${offline ? '（离线模式）' : ''}`);
  return {
    runtimeRoot,
    cacheRoot,
    vitestEntry,
    version: VITEST_VERSION,
    npmSource: npm.source,
    offline,
  };
}

export function parseFrontendTestRuntimeArgs(argv = []) {
  let offline = false;
  for (const value of argv) {
    if (value !== '--offline' || offline) {
      throw frontendTestRuntimeError(
        'frontend_test_runtime_argument_invalid',
        `不支持或重复的验证运行时参数：${value}`,
      );
    }
    offline = true;
  }
  return { offline };
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    prepareFrontendTestRuntime(parseFrontendTestRuntimeArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: error.code || 'frontend_test_runtime_prepare_failed',
      target: error.target || null,
      status: error.status || 1,
      message: `Vitest 验证运行时准备失败：${error.message}`,
    }));
    process.exitCode = error.status || 1;
  }
}
