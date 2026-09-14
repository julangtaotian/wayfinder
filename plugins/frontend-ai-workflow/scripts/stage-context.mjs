import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveCanonicalProjectRoot, resolveSafeProjectPath } from './project-path-safety.mjs';

const STAGES = new Set(['plan', 'implement', 'verify', 'complete']);
const MAX_FACT_TEXT_LENGTH = 500;

function truncateText(value, truncations) {
  const normalized = String(value ?? '');
  if (normalized.length <= MAX_FACT_TEXT_LENGTH) return normalized;
  truncations.count += 1;
  return normalized.slice(0, MAX_FACT_TEXT_LENGTH - 1) + '…';
}

function boundFactValue(value, limit, counts, truncations, key) {
  if (typeof value === 'string') return truncateText(value, truncations);
  if (Array.isArray(value)) {
    if (key.endsWith('.values')) {
      return value.map((item) => boundFactValue(item, limit, counts, truncations, key + '[]'));
    }
    const displayed = Math.min(value.length, limit);
    const current = counts[key] || { total: 0, displayed: 0, omitted: 0 };
    current.total += value.length;
    current.displayed += displayed;
    current.omitted += value.length - displayed;
    counts[key] = current;
    return value.slice(0, limit).map((item) => boundFactValue(item, limit, counts, truncations, key + '[]'));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .map(([name, item]) => [name, boundFactValue(item, limit, counts, truncations, key ? key + '.' + name : name)]));
  }
  return value;
}

function acceptanceCheckboxFacts(content) {
  return [...content.matchAll(/^\s*-\s*\[([ xX])\]\s*\[?(A-\d+)\]?(?:[：:\s]|$)/gmu)]
    .map((match) => ({ id: match[2], done: match[1].trim().toLowerCase() === 'x' }));
}

function section(content, title) {
  const match = new RegExp(`^##\\s+${title}\\s*$`, 'mu').exec(content);
  if (!match) return '';
  const tail = content.slice(match.index + match[0].length);
  const next = tail.search(/^##\s+/mu);
  return (next < 0 ? tail : tail.slice(0, next)).trim();
}

function tableRows(content, prefix) {
  return content.split('\n').filter((line) => new RegExp(`^\\|\\s*${prefix}-\\d+\\s*\\|`, 'u').test(line.trim())).map((line) => {
    const cells = line.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|').map((cell) => cell.trim());
    return { id: cells[0], values: cells.slice(1) };
  });
}

function taskFacts(content) {
  return [...content.matchAll(/^\s*-\s*\[([ xX])\]\s*(.+)$/gmu)].map((match) => ({ done: match[1].trim().toLowerCase() === 'x', text: match[2].trim() }));
}

function specFacts(changePath) {
  const root = path.join(changePath, 'specs');
  if (!fs.existsSync(root)) return [];
  const result = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        const content = fs.readFileSync(target, 'utf8');
        result.push({
          capability: path.relative(root, path.dirname(target)).replaceAll('\\', '/'),
          requirements: [...content.matchAll(/^### Requirement:\s*(.+)$/gmu)].map((match) => match[1].trim()),
        });
      }
    }
  }
  visit(root);
  return result.sort((left, right) => left.capability.localeCompare(right.capability));
}

export function compileStageContext({
  root = process.cwd(),
  requirement,
  change,
  stage,
  diagnostics = [],
  offset = 0,
  limit = 20,
} = {}) {
  if (!STAGES.has(stage)) throw new Error(`stage 必须是 ${[...STAGES].join('、')}`);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('offset 必须是非负整数');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('limit 必须是 1 到 100 的整数');
  const projectRoot = resolveCanonicalProjectRoot(root);
  const requirementPath = resolveSafeProjectPath(projectRoot, requirement, '需求路径', { mustExist: true, allowDirectory: false });
  const changePath = resolveSafeProjectPath(projectRoot, change, '变更路径', { mustExist: true });
  if (changePath.kind !== 'directory') throw new Error('变更路径必须是目录');
  const requirementContent = fs.readFileSync(requirementPath.absolutePath, 'utf8');
  const tasksPath = path.join(changePath.absolutePath, 'tasks.md');
  const tasks = fs.existsSync(tasksPath) ? taskFacts(fs.readFileSync(tasksPath, 'utf8')) : [];
  const decisions = tableRows(section(requirementContent, '决策台账'), 'D');
  const acceptances = tableRows(section(requirementContent, '验收—证据映射'), 'A');
  const verification = tableRows(section(requirementContent, '验证记录'), 'V');
  const specs = specFacts(changePath.absolutePath);
  const acceptanceCheckboxes = acceptanceCheckboxFacts(section(requirementContent, '验收标准'));
  const rawFacts = {
    plan: { decisions, acceptances, capabilities: specs },
    implement: { decisions, pendingTasks: tasks.filter((task) => !task.done), capabilities: specs },
    verify: { acceptances, verification, taskCounts: { total: tasks.length, remaining: tasks.filter((task) => !task.done).length } },
    complete: {
      requirementStatus: requirementContent.match(/^-\s*状态：\s*(.+)$/mu)?.[1]?.trim() || null,
      acceptanceCounts: {
        total: acceptanceCheckboxes.length,
        remaining: acceptanceCheckboxes.filter((item) => !item.done).length,
      },
      taskCounts: { total: tasks.length, remaining: tasks.filter((task) => !task.done).length },
      verification: verification.map((item) => ({ id: item.id, type: item.values[0], result: item.values[3], evidence: item.values[4] })),
      capabilities: specs.map((item) => item.capability),
    },
  }[stage];
  const factCounts = {};
  const textTruncations = { count: 0 };
  const facts = boundFactValue(rawFacts, limit, factCounts, textTruncations, '');
  const normalizedDiagnostics = diagnostics.map((item) => ({
    code: truncateText(item.code || 'unknown', textTruncations),
    status: truncateText(item.status || 'warning', textTruncations),
    target: item.target == null ? null : truncateText(String(item.target).replaceAll('\\', '/'), textTruncations),
  }));
  const page = normalizedDiagnostics.slice(offset, offset + limit);
  const nextOffset = offset + page.length < normalizedDiagnostics.length ? offset + page.length : null;
  return {
    schemaVersion: 1,
    stage,
    scope: '.',
    changeId: path.basename(changePath.absolutePath),
    facts,
    counts: {
      diagnostics: normalizedDiagnostics.length,
      facts: factCounts,
      truncatedText: textTruncations.count,
    },
    diagnostics: page,
    offset,
    limit,
    nextOffset,
    remainingCount: Math.max(0, normalizedDiagnostics.length - offset - page.length),
  };
}

function parseArgs(argv) {
  const args = { root: process.cwd(), requirement: null, change: null, stage: null, offset: 0, limit: 20 };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!['--target', '--requirement', '--change', '--stage', '--offset', '--limit'].includes(option)) throw new Error(`不支持的参数：${option}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`参数 ${option} 缺少值`);
    const key = option.slice(2);
    args[key === 'target' ? 'root' : key] = ['offset', 'limit'].includes(key) ? Number(value) : value;
    index += 1;
  }
  if (!args.requirement || !args.change || !args.stage) throw new Error('必须提供 --requirement、--change 和 --stage');
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(compileStageContext(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: 'stage_context_failed', status: 'failed', errors: [error.message] }, null, 2));
    process.exitCode = 1;
  }
}
