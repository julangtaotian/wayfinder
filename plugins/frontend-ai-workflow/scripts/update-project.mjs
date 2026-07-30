import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runBootstrap } from './bootstrap-project.mjs';
// AI-code-start lines:4 tool:Codex
import {
  readLegacyWorkflowSettings,
  readWayfinderSettings,
} from './workflow-layout.mjs';

// AI-code-start lines:7 tool:Codex
// 普通升级保留既有扫描快照，只有显式 deep 才重新读取项目并刷新分析基线。
function preservedScopeSettings(target, requestedDeep) {
  if (requestedDeep) return null;
  const settings = readWayfinderSettings(target) || readLegacyWorkflowSettings(target);
  return settings?.deepAnalysis === 'true' ? settings : null;
}

export function runUpdate({ target = process.cwd(), write = false, deep = false } = {}) {
  // AI-code-start lines:1 tool:Codex
  const preservedSettings = preservedScopeSettings(target, deep);
  return runBootstrap({
    target,
    write,
    updateManaged: true,
    onlyManaged: true,
    deep,
    preservedScopeSettings: preservedSettings,
  });
}

function parseArgs(argv) {
  const args = { target: process.cwd(), write: false, deep: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--target') {
      args.target = argv[index + 1];
      index += 1;
    } else if (argv[index] === '--write') {
      args.write = true;
    // AI-code-start lines:2 tool:Codex
    } else if (argv[index] === '--deep') {
      args.deep = true;
    }
  }
  return args;
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
