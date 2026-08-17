import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, '..');
const outputsRoot = path.join(repositoryRoot, 'outputs');
const runtimeRoot = path.join(outputsRoot, 'frontend-test-runtime');
const relativeRuntime = path.relative(outputsRoot, runtimeRoot);

if (!relativeRuntime || relativeRuntime.startsWith('..') || path.isAbsolute(relativeRuntime)) {
  throw new Error(`验证运行时必须位于 outputs 内：${runtimeRoot}`);
}

// 只删除可重建的 Vitest 验证运行时，不影响 outputs 中的持久证据。
fs.rmSync(runtimeRoot, { recursive: true, force: true });
console.log(`Vitest 验证运行时已清理：${runtimeRoot}`);
