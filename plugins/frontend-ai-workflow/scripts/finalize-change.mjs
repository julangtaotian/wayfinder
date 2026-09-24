import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { checkChange } from './check-change.mjs';
import { runOpenSpecSync } from './openspec-cli.mjs';
import { ProjectPathError, projectPathFailure, resolveSafeProjectPath } from './project-path-safety.mjs';
import { finalizeLifecycleV2, recoverLifecycleV2 } from './lifecycle-finalize.mjs';

// 完成复杂变更只依赖单一 OpenSpec 身份，并保留可恢复事务与默认预览边界。
export function finalizeChange({
  target = process.cwd(),
  change,
  write = false,
  scope = '.',
} = {}, injected = {}) {
  const services = { checkChange, runOpenSpecSync, ...injected };
  let check;
  try {
    check = services.checkChange({ target, change, stage: 'precomplete' });
  } catch (error) {
    if (!(error instanceof ProjectPathError)) throw error;
    return projectPathFailure(error, { write, actions: [] });
  }
  if (!check.ok) return { ok: false, code: check.code, status: 'blocked', write, check, actions: [] };
  try {
    resolveSafeProjectPath(check.root, check.changePath, '活动变更', {
      mustExist: true,
      allowAbsolute: true,
    });
    resolveSafeProjectPath(check.root, check.archive.targetPath, '临时归档目标', { allowAbsolute: true });
  } catch (error) {
    if (!(error instanceof ProjectPathError)) throw error;
    return projectPathFailure(error, { write, actions: [] });
  }
  return finalizeLifecycleV2({ check, write, scope }, services);
}

function parseArgs(argv) {
  const args = { target: process.cwd(), change: null, write: false, recover: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (['--target', '--change', '--recover'].includes(value)) {
      if (!argv[index + 1]) throw new Error(`参数 ${value} 缺少值`);
      args[value.slice(2)] = argv[index + 1];
      index += 1;
    } else if (value === '--write') {
      args.write = true;
    } else {
      throw new Error(`不支持的参数：${value}`);
    }
  }
  if (!args.recover && !args.change) throw new Error('必须提供 --change');
  return args;
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = args.recover
      ? recoverLifecycleV2({ root: args.target, transactionId: args.recover })
      : finalizeChange(args);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
