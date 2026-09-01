import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveFrontendTestRuntime } from './prepare-frontend-test-runtime.mjs';

const defaultRepositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function cleanupFrontendTestRuntime({
  repositoryRoot = defaultRepositoryRoot,
  report = (message) => console.log(message),
} = {}) {
  const root = fs.realpathSync(path.resolve(repositoryRoot));
  const { runtimeRoot } = resolveFrontendTestRuntime(root);
  // 只删除可重建的 Vitest 验证运行时，不影响 outputs 中的持久证据。
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  report(`Vitest 验证运行时已清理：${runtimeRoot}`);
  return { runtimeRoot };
}

export function cleanupFrontendTestCache({
  repositoryRoot = defaultRepositoryRoot,
  report = (message) => console.log(message),
} = {}) {
  const root = fs.realpathSync(path.resolve(repositoryRoot));
  const { cacheRoot } = resolveFrontendTestRuntime(root);
  // 缓存独立清理，避免常规验证回收破坏后续离线复验。
  fs.rmSync(cacheRoot, { recursive: true, force: true });
  report(`Vitest 验证缓存已清理：${cacheRoot}`);
  return { cacheRoot };
}

function parseCleanupArgs(argv = []) {
  if (argv.length === 0) return { cache: false };
  if (argv.length === 1 && argv[0] === '--cache') return { cache: true };
  const error = new Error(`不支持的验证清理参数：${argv.join(' ')}`);
  error.code = 'frontend_test_runtime_cleanup_argument_invalid';
  error.status = 1;
  throw error;
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const args = parseCleanupArgs(process.argv.slice(2));
    if (args.cache) cleanupFrontendTestCache();
    else cleanupFrontendTestRuntime();
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: error.code || 'frontend_test_runtime_cleanup_failed',
      target: error.target || null,
      status: error.status || 1,
      message: `Vitest 验证运行时清理失败：${error.message}`,
    }));
    process.exitCode = error.status || 1;
  }
}
