import fs from 'node:fs';
import path from 'node:path';

export const WAYFINDER_PATH = 'wayfinder/frontend.md';
export const RETIRED_WORKFLOW_PATHS = [
  '.ai-workflow.yaml',
  'docs/ai-context/frontend.md',
  'requirements/_template.md',
];
export const WAYFINDER_BLOCKS = ['meta', 'scope', 'analysis'];

export function markerPatterns(kind, block = null) {
  const marker = block ? `frontend-ai-workflow:${block}` : 'frontend-ai-workflow';
  if (kind === 'html') {
    return {
      start: new RegExp(`<!-- ${marker}:start[^\\n]*-->`, 'g'),
      end: new RegExp(`<!-- ${marker}:end -->`, 'g'),
    };
  }
  return {
    start: new RegExp(`^# ${marker}:start[^\\n]*$`, 'gm'),
    end: new RegExp(`^# ${marker}:end$`, 'gm'),
  };
}

export function findManagedRange(content, kind, block = null) {
  const patterns = markerPatterns(kind, block);
  const starts = [...content.matchAll(patterns.start)];
  const ends = [...content.matchAll(patterns.end)];
  if (starts.length !== 1 || ends.length !== 1) {
    throw new Error(`受管标记数量异常：start=${starts.length}, end=${ends.length}`);
  }
  const start = starts[0].index;
  const end = ends[0].index + ends[0][0].length;
  if (start >= ends[0].index) throw new Error('受管标记顺序异常');
  return { start, end };
}

export function managedBlock(content, kind, block = null) {
  const range = findManagedRange(content, kind, block);
  return content.slice(range.start, range.end);
}

function parseValue(value) {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^(["'])(.*)\1$/);
  return quoted ? quoted[2] : trimmed;
}

// 将机器字段限制在独立受管区块，避免解析或覆盖维护者的 Markdown 正文。
export function readManagedSettings(content, kind, block = null) {
  const body = managedBlock(content, kind, block)
    .replace(markerPatterns(kind, block).start, '')
    .replace(markerPatterns(kind, block).end, '');
  const settings = {};
  for (const line of body.split('\n')) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*?)\s*$/);
    if (match) settings[match[1]] = parseValue(match[2]);
  }
  return settings;
}

export function readSettingsFile(file, kind, block = null) {
  if (!fs.existsSync(file)) return null;
  return readManagedSettings(fs.readFileSync(file, 'utf8'), kind, block);
}

export function readWayfinderSettings(root) {
  return readSettingsFile(path.join(root, WAYFINDER_PATH), 'html', 'meta');
}

export function detectWorkflowLayout(root) {
  if (detectRetiredWorkflowPaths(root).length) return 'retired';
  if (fs.existsSync(path.join(root, WAYFINDER_PATH))) return 'wayfinder';
  return 'none';
}

// 当前版本只识别退役路径的存在，不读取或解释旧格式内容。
export function detectRetiredWorkflowPaths(root) {
  return RETIRED_WORKFLOW_PATHS.filter((relativePath) => fs.existsSync(path.join(root, relativePath)));
}

export function hasManagedBlocks(content, kind, blocks) {
  try {
    for (const block of blocks) findManagedRange(content, kind, block);
    return true;
  } catch {
    return false;
  }
}
