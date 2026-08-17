import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VITEST_VERSION = '3.2.4';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, '..');
const outputsRoot = path.join(repositoryRoot, 'outputs');
const runtimeRoot = path.join(outputsRoot, 'frontend-test-runtime');
const relativeRuntime = path.relative(outputsRoot, runtimeRoot);

if (!relativeRuntime || relativeRuntime.startsWith('..') || path.isAbsolute(relativeRuntime)) {
  throw new Error(`验证运行时必须位于 outputs 内：${runtimeRoot}`);
}

fs.mkdirSync(runtimeRoot, { recursive: true });
fs.writeFileSync(path.join(runtimeRoot, 'package.json'), `${JSON.stringify({
  name: 'frontend-test-validation-runtime',
  private: true,
  version: '0.0.0',
  devDependencies: {
    vitest: VITEST_VERSION,
  },
}, null, 2)}\n`, 'utf8');

// npm 的依赖、锁文件与下载缓存全部限制在 outputs，避免污染项目根目录。
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, [
  'install',
  '--prefix', runtimeRoot,
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    npm_config_cache: path.join(runtimeRoot, '.npm-cache'),
  },
  stdio: 'inherit',
});

if (result.error || result.status !== 0) {
  throw new Error(result.error?.message || `Vitest 验证运行时准备失败，退出码 ${result.status ?? '未知'}`);
}

const vitestEntry = path.join(runtimeRoot, 'node_modules', 'vitest', 'vitest.mjs');
if (!fs.existsSync(vitestEntry)) throw new Error(`Vitest 入口不存在：${vitestEntry}`);

console.log(`Vitest ${VITEST_VERSION} 验证运行时已准备：${runtimeRoot}`);
