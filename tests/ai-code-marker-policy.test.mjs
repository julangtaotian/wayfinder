import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// outputs 只保存验证产物，不属于需要扫描的项目源码。
const excludedDirectories = new Set(['.git', 'node_modules', 'outputs']);
const textExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.scss',
  '.sh',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.yaml',
  '.yml',
]);
const markerName = ['AI', 'code', 'start'].join('-');
const markerPattern = new RegExp(
  `^\\s*(?:(?://|#)\\s*${markerName}\\s+lines:\\d+\\s+tool:Codex\\s*`
    + `|/\\*\\s*${markerName}\\s+lines:\\d+\\s+tool:Codex\\s*\\*/\\s*`
    + `|<!--\\s*${markerName}\\s+lines:\\d+\\s+tool:Codex\\s*-->)$`,
  'u',
);

function collectTextFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectTextFiles(entryPath, files);
    } else if (entry.isFile() && textExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(entryPath);
    }
  }
  return files;
}

test('项目文件不包含 AI 行数统计注释', () => {
  const violations = [];
  for (const filePath of collectTextFiles(projectRoot)) {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (markerPattern.test(line)) {
        violations.push(`${path.relative(projectRoot, filePath)}:${index + 1}`);
      }
    });
  }
  assert.deepEqual(violations, [], `发现禁止的 AI 行数统计注释：\n${violations.join('\n')}`);
});

test('根项目规则禁止生成 AI 行数统计注释', () => {
  const rules = fs.readFileSync(path.join(projectRoot, 'AGENTS.md'), 'utf8');
  assert.ok(rules.includes(markerName), '根项目规则必须明确列出被禁止的标记名称');
  assert.match(rules, /禁止在本项目任何文件中新增/u);
  assert.match(rules, /不得写入上述计数注释/u);
});

test('旧验证材料不再要求生成 AI 行数统计注释', () => {
  const legacyDocuments = [
    'outputs/lanhu-design-spec/validation-evidence/isolation-prompt.md',
    'outputs/lanhu-design-spec/validation-evidence/isolation-run.md',
  ];
  for (const relativePath of legacyDocuments) {
    const content = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
    assert.equal(content.includes(markerName), false, `${relativePath} 仍包含过期标记要求`);
  }
});
