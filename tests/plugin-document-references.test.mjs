import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { validatePluginDocumentReferences } from '../plugins/frontend-ai-workflow/scripts/plugin-document-references.mjs';
import { writeFixtureFile } from './helpers/workflow-fixtures.mjs';

function fixture(context) {
  const outputs = path.resolve('outputs/skill-optimization/document-fixtures');
  fs.mkdirSync(outputs, { recursive: true });
  const root = fs.mkdtempSync(path.join(outputs, '文档 case-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('包内引用按源文件目录解析，支持 CRLF、空格、中文、链接标题与片段', (context) => {
  const root = fixture(context);
  writeFixtureFile(root, 'references/详细 说明.md', '说明\n');
  writeFixtureFile(root, 'references/start.md', '[详细](<详细 说明.md#内容> "说明")\r\n[encoded](详细%20说明.md)\r\n');
  writeFixtureFile(root, 'skills/demo/SKILL.md', '入口\r\n`../../references/start.md`\r\n');
  assert.deepEqual(validatePluginDocumentReferences(root), []);
  fs.unlinkSync(path.join(root, 'references/start.md'));
  assert.deepEqual(validatePluginDocumentReferences(root), [{
    code: 'plugin_document_reference_missing', target: 'skills/demo/SKILL.md',
    line: 2, reference: '../../references/start.md', status: 'failed',
  }]);
});

test('识别引用之间的失效路径与越界，不误报动态项目文件和远程 URL', (context) => {
  const root = fixture(context);
  writeFixtureFile(root, 'references/start.md', [
    '`AGENTS.md`、`test-plan.md`、`src/main.js`',
    '`../../assets/<template>.md`',
    '[远程](https://example.test/missing.md)',
    '[片段](#说明)',
    '`../../references/missing.md`',
    '[失效](missing.md)',
    '[无效编码](%ZZ.md)',
    '',
  ].join('\n'));
  assert.deepEqual(validatePluginDocumentReferences(root).map(({ code, line }) => ({ code, line })), [
    { code: 'plugin_document_reference_outside', line: 5 },
    { code: 'plugin_document_reference_missing', line: 6 },
    { code: 'plugin_document_reference_invalid', line: 7 },
  ]);
});

test('真实插件 skills 与 references 引用全部可解析', () => {
  assert.deepEqual(validatePluginDocumentReferences(path.resolve('plugins/frontend-ai-workflow')), []);
});
