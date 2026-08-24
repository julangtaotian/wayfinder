import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCliArgs } from './cli-arguments.mjs';
import { runBootstrap } from './bootstrap-project.mjs';
import { assertSafeProjectRoot, resolveProjectRoot } from './collect-project-scope.mjs';
import {
  ProjectPathError,
  projectPathFailure,
  resolveSafeProjectPath,
} from './project-path-safety.mjs';
import {
  LEGACY_WORKFLOW_PATH,
  WAYFINDER_PATH,
  readLegacyWorkflowSettings,
  readWayfinderSettings,
} from './workflow-layout.mjs';

// 普通升级保留既有扫描快照，只有显式 deep 才重新读取项目并刷新分析基线。
function preservedScopeSettings(target, requestedDeep) {
  if (requestedDeep) return null;
  const settings = readWayfinderSettings(target) || readLegacyWorkflowSettings(target);
  return settings?.deepAnalysis === 'true' ? settings : null;
}

export function runUpdate({ target = process.cwd(), write = false, deep = false } = {}) {
  const root = resolveProjectRoot(target);
  assertSafeProjectRoot(root);
  try {
    resolveSafeProjectPath(root, WAYFINDER_PATH, 'Wayfinder 元数据');
    resolveSafeProjectPath(root, LEGACY_WORKFLOW_PATH, '旧工作流元数据');
    const preservedSettings = preservedScopeSettings(root, deep);
    return runBootstrap({
      target: root,
      write,
      updateManaged: true,
      onlyManaged: true,
      deep,
      preservedScopeSettings: preservedSettings,
    });
  } catch (error) {
    if (!(error instanceof ProjectPathError)) throw error;
    return projectPathFailure(error, { write });
  }
}

function parseArgs(argv) {
  return parseCliArgs(argv, {
    defaults: {
      target: process.cwd(),
      write: false,
      deep: false,
    },
    valueOptions: {
      '--target': 'target',
    },
    booleanOptions: {
      '--write': 'write',
      '--deep': 'deep',
    },
  });
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const result = runUpdate(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
