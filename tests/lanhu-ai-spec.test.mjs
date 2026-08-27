import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const specRoot = path.resolve('outputs/lanhu-ai-ui-spec');

function markdownFiles(root) {
  const results = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.name.endsWith('.md')) results.push(target);
    }
  };
  visit(root);
  return results.sort();
}

test('蓝湖 AI 规范是唯一、轻量且自包含的正式输入', () => {
  assert.equal(fs.existsSync(path.resolve('outputs/lanhu-design-spec')), false);
  assert.equal(fs.existsSync(path.join(specRoot, 'README.md')), true);
  const files = markdownFiles(specRoot);
  assert.equal(files.length > 1, true);
  const combined = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(combined, /lanhu-design-spec/u);
  assert.doesNotMatch(combined, /截图差异|验收过程|临时验证|playwright-report/iu);

  const scenarioIds = files.flatMap((file) => {
    const content = fs.readFileSync(file, 'utf8');
    const marker = '## 画板场景';
    const start = content.indexOf(marker);
    if (start < 0) return [];
    const remainder = content.slice(start + marker.length);
    const nextSection = remainder.search(/\n##\s+/u);
    const section = nextSection < 0 ? remainder : remainder.slice(0, nextSection);
    return [...section.matchAll(/^\|\s*`(SCN-[A-Z0-9-]+)`\s*\|/gmu)].map((match) => match[1]);
  });
  assert.equal(scenarioIds.length > 0, true);
  assert.equal(new Set(scenarioIds).size, scenarioIds.length);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
      const reference = match[1].split('#')[0];
      if (!reference || /^(?:https?:|mailto:)/u.test(reference)) continue;
      assert.equal(fs.existsSync(path.resolve(path.dirname(file), reference)), true, `${file} 包含失效链接 ${reference}`);
    }
  }
});
