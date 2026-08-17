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

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    cleanupFrontendTestRuntime();
  } catch (error) {
    console.error(`Vitest 验证运行时清理失败：${error.message}`);
    process.exitCode = 1;
  }
}
