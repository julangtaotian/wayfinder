// AI-code-start lines:126 tool:Codex
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkChange } from './check-change.mjs';
import { runOpenSpecSync } from './openspec-cli.mjs';

function parseEngineJson(output) {
  const start = String(output || '').indexOf('{');
  if (start < 0) return null;
  try {
    return JSON.parse(output.slice(start));
  } catch {
    return null;
  }
}

function acceptedRequirementContent(requirementPath) {
  const content = fs.readFileSync(requirementPath, 'utf8');
  const matches = [...content.matchAll(/^-\s*状态：\s*(.+?)\s*$/gmu)];
  if (matches.length !== 1) throw new Error(`需求状态字段数量异常：${matches.length}`);
  if (matches[0][1].trim() !== '待验证') {
    throw new Error(`完成写入前需求必须为“待验证”，当前为“${matches[0][1].trim()}”`);
  }
  return content.replace(matches[0][0], '- 状态：已验收');
}

function atomicWrite(file, content) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.finalize-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(temporary, content, 'utf8');
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

// 正常完成入口不接受跳过校验或跳过规格参数，默认仅返回动作预览。
export function finalizeChange({
  target = process.cwd(),
  requirement,
  change,
  write = false,
} = {}) {
  const check = checkChange({ target, requirement, change, stage: 'precomplete' });
  const actions = [
    { action: 'validate', target: check.changeName },
    { action: 'sync-and-archive', target: check.archive?.targetPath || null },
    { action: 'mark-requirement-accepted', target: check.requirementPath },
  ];
  if (!check.ok) return { ok: false, write, check, actions: [] };

  const nextRequirement = acceptedRequirementContent(check.requirementPath);
  if (!write) return { ok: true, write, check, actions };

  const archived = runOpenSpecSync(
    ['archive', check.changeName, '--json', '--yes'],
    { cwd: check.root, encoding: 'utf8' },
  );
  if (!archived.available || archived.status !== 0) {
    return {
      ok: false,
      write,
      check,
      actions,
      errors: [`规格同步或归档失败：${(archived.stderr || archived.stdout || archived.error?.message || '未知错误').trim()}`],
    };
  }

  const rawArchiveResult = parseEngineJson(archived.stdout);
  const archiveResult = rawArchiveResult?.archive || rawArchiveResult;
  // AI-code-start lines:2 tool:Codex
  const archiveRoot = rawArchiveResult?.root || null;
  const archiveWarnings = rawArchiveResult?.warnings || archiveResult?.warnings || [];
  try {
    atomicWrite(check.requirementPath, nextRequirement);
  } catch (error) {
    return {
      ok: false,
      write,
      check,
      actions,
      archiveResult,
      // AI-code-start lines:2 tool:Codex
      archiveRoot,
      archiveWarnings,
      errors: [`变更已归档，但需求状态更新失败：${error.message}`],
    };
  }
  return {
    ok: true,
    write,
    check,
    actions,
    archiveResult,
    // AI-code-start lines:2 tool:Codex
    archiveRoot,
    archiveWarnings,
    requirementStatus: '已验收',
  };
}

function parseArgs(argv) {
  const args = { target: process.cwd(), requirement: null, change: null, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (['--target', '--requirement', '--change'].includes(value)) {
      const key = value.slice(2);
      if (!argv[index + 1]) throw new Error(`参数 ${value} 缺少值`);
      args[key] = argv[index + 1];
      index += 1;
    } else if (value === '--write') {
      args.write = true;
    } else {
      throw new Error(`不支持的参数：${value}`);
    }
  }
  if (!args.requirement) throw new Error('必须提供 --requirement');
  if (!args.change) throw new Error('必须提供 --change');
  return args;
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const result = finalizeChange(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
