import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const VITEST_VERSION = '3.2.4';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDir, '..');

export function resolveFrontendTestRuntime(repositoryRoot = defaultRepositoryRoot) {
  const outputsRoot = path.join(repositoryRoot, 'outputs');
  const runtimeRoot = path.join(outputsRoot, 'frontend-test-runtime');
  const relativeRuntime = path.relative(outputsRoot, runtimeRoot);
  if (!relativeRuntime || relativeRuntime.startsWith('..') || path.isAbsolute(relativeRuntime)) {
    throw new Error(`验证运行时必须位于 outputs 内：${runtimeRoot}`);
  }
  return {
    outputsRoot,
    runtimeRoot,
    vitestEntry: path.join(runtimeRoot, 'node_modules', 'vitest', 'vitest.mjs'),
  };
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
    throw new Error('无法定位 npm 的 JavaScript 入口；请通过 npm run prepare:test-runtime 执行验证准备');
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
  report = (message) => console.log(message),
} = {}) {
  const root = fs.realpathSync(path.resolve(repositoryRoot));
  const { runtimeRoot, vitestEntry } = resolveFrontendTestRuntime(root);
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(path.join(runtimeRoot, 'package.json'), `${JSON.stringify({
    name: 'frontend-test-validation-runtime',
    private: true,
    version: '0.0.0',
    devDependencies: {
      vitest: VITEST_VERSION,
    },
  }, null, 2)}\n`, 'utf8');

  // 直接执行 npm 的 JavaScript 入口，避免 Windows 将 .cmd 当作可执行文件启动。
  const npm = resolveNpmInvocation({ platform, environment, nodePath, fileExists });
  const result = execute(npm.command, [
    ...npm.args,
    'install',
    '--prefix', runtimeRoot,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ], {
    cwd: root,
    env: {
      ...environment,
      npm_config_cache: path.join(runtimeRoot, '.npm-cache'),
    },
    stdio: 'inherit',
  });

  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || `Vitest 验证运行时准备失败，退出码 ${result.status ?? '未知'}`);
  }
  if (!fileExists(vitestEntry)) throw new Error(`Vitest 入口不存在：${vitestEntry}`);

  report(`Vitest ${VITEST_VERSION} 验证运行时已准备：${runtimeRoot}`);
  return { runtimeRoot, vitestEntry, version: VITEST_VERSION, npmSource: npm.source };
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    prepareFrontendTestRuntime();
  } catch (error) {
    console.error(`Vitest 验证运行时准备失败：${error.message}`);
    process.exitCode = 1;
  }
}
