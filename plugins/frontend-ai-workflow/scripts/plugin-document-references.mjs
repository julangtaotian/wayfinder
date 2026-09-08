import fs from 'node:fs';
import path from 'node:path';
import { findMarkdownFileReferences } from './markdown-file-references.mjs';

function collectDocuments(directory, files) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collectDocuments(target, files);
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(target);
  }
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

// 包内引用只从文档目录解析；项目根路径和模板参数不属于可静态验证的包内合同。
export function validatePluginDocumentReferences(pluginRoot) {
  const root = fs.realpathSync(pluginRoot);
  const files = [];
  for (const directory of ['skills', 'references']) collectDocuments(path.join(root, directory), files);
  const diagnostics = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    for (const reference of findMarkdownFileReferences(content)) {
      const value = reference.path;
      if (/[<>*{}$]/u.test(value) || value.startsWith('#')) continue;
      // 行内代码只有显式 ./ 或 ../ 才表示包内引用；裸文件名也可能是目标项目的产物。
      if (reference.kind === 'code' && !/^\.{1,2}\//u.test(value)) continue;
      if (reference.kind === 'code' && /\s--|\n/u.test(value)) continue;
      let code = null;
      try {
        const relative = decodeURIComponent(value.split('#', 1)[0]);
        const resolved = path.resolve(path.dirname(file), relative);
        if (path.win32.isAbsolute(relative) || !isInside(root, resolved)) {
          code = 'plugin_document_reference_outside';
        } else if (!fs.existsSync(resolved)) {
          code = 'plugin_document_reference_missing';
        } else if (!isInside(root, fs.realpathSync(resolved))) {
          code = 'plugin_document_reference_outside';
        }
      } catch {
        code = 'plugin_document_reference_invalid';
      }
      if (code) diagnostics.push({
        code,
        target: path.relative(root, file).split(path.sep).join('/'),
        line: content.slice(0, reference.index).split('\n').length,
        reference: value,
        status: 'failed',
      });
    }
  }
  return diagnostics;
}
