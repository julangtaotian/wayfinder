import fs from 'node:fs';
import path from 'node:path';
import { ensureSafeProjectDirectory, resolveSafeProjectPath } from './project-path-safety.mjs';
import { normalizeRepositoryPath, readLifecycleConfig } from './lifecycle-contract.mjs';

export function resolveWorkflowRuntime(root = process.cwd()) {
  const config = readLifecycleConfig(root);
  const runtimeRoot = path.join(config.root, config.runtimeDirectory);
  return {
    config,
    root: runtimeRoot,
    runs: path.join(runtimeRoot, 'runs'),
    cache: path.join(runtimeRoot, 'cache'),
    transactions: path.join(runtimeRoot, 'transactions'),
  };
}

export function ensureWorkflowRuntime(root = process.cwd()) {
  const layout = resolveWorkflowRuntime(root);
  for (const [name, target] of Object.entries({ runs: layout.runs, cache: layout.cache, transactions: layout.transactions })) {
    ensureSafeProjectDirectory(layout.config.root, target, `工作流 ${name} 目录`);
  }
  return layout;
}

export function resolveRunDirectory(root, namespace, runId, { create = false } = {}) {
  const layout = create ? ensureWorkflowRuntime(root) : resolveWorkflowRuntime(root);
  const safeNamespace = normalizeRepositoryPath(namespace, '运行命名空间');
  const safeRunId = normalizeRepositoryPath(runId, '运行 ID');
  if (safeNamespace.includes('/') || safeRunId.includes('/')) throw new Error('运行命名空间和运行 ID 只能是单个安全路径段');
  const target = path.join(layout.runs, safeNamespace, safeRunId);
  if (create) ensureSafeProjectDirectory(layout.config.root, target, '工作流运行目录');
  return resolveSafeProjectPath(layout.config.root, target, '工作流运行目录', { allowAbsolute: true });
}

export function runtimePathsAreIgnored(root = process.cwd()) {
  const layout = resolveWorkflowRuntime(root);
  const ignorePath = path.join(layout.config.root, '.gitignore');
  if (!fs.existsSync(ignorePath)) return false;
  const rule = `/${layout.config.runtimeDirectory}/`;
  return fs.readFileSync(ignorePath, 'utf8').split(/\r?\n/u).some((line) => line.trim() === rule);
}
