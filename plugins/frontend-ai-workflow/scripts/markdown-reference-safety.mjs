import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_MANAGED_MARKDOWN_ROOTS = [
  { path: 'plugins/frontend-ai-workflow/assets/templates', excludedDirectories: new Set() },
  { path: 'requirements', excludedDirectories: new Set(['archive']) },
  { path: 'openspec/changes', excludedDirectories: new Set(['archive']) },
];

function collectMarkdownFiles(directory, excludedDirectories, files) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) collectMarkdownFiles(path.join(directory, entry.name), excludedDirectories, files);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(path.join(directory, entry.name));
    }
  }
}

function stripInlineCode(line) {
  let result = '';
  let index = 0;
  while (index < line.length) {
    if (line[index] !== '`') {
      result += line[index];
      index += 1;
      continue;
    }
    let delimiterLength = 1;
    while (line[index + delimiterLength] === '`') delimiterLength += 1;
    const delimiter = '`'.repeat(delimiterLength);
    const closingIndex = line.indexOf(delimiter, index + delimiterLength);
    if (closingIndex < 0) return result;
    index = closingIndex + delimiterLength;
  }
  return result;
}

// 仅识别编辑器会当作未定义引用链接的裸 D/A 标签，避免干扰代码示例与有效链接。
export function findBareDecisionAcceptanceLabels(content) {
  const findings = [];
  let fence = null;
  const lines = String(content || '').split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    const fenceMatch = line.match(/^\s*([`~])\1{2,}/u);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const visibleLine = stripInlineCode(line);
    for (const match of visibleLine.matchAll(/\[([DA]-\d{2,})\](?!\s*(?:\(|:|\[))/gu)) {
      findings.push({ label: match[1], line: index + 1 });
    }
  }
  return findings;
}

export function validateManagedMarkdownReferenceLabels(repositoryRoot, {
  managedRoots = DEFAULT_MANAGED_MARKDOWN_ROOTS,
} = {}) {
  const diagnostics = [];
  for (const managedRoot of managedRoots) {
    const files = [];
    const directory = path.join(repositoryRoot, managedRoot.path);
    collectMarkdownFiles(directory, managedRoot.excludedDirectories, files);
    for (const filePath of files) {
      const target = path.relative(repositoryRoot, filePath).split(path.sep).join('/');
      for (const finding of findBareDecisionAcceptanceLabels(fs.readFileSync(filePath, 'utf8'))) {
        diagnostics.push({
          code: 'markdown_unresolved_reference_label',
          target,
          line: finding.line,
          label: finding.label,
        });
      }
    }
  }
  return diagnostics;
}
