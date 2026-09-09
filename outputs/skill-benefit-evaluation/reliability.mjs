import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildEvidenceReferenceRewrites as beforeRewrite, postArchiveAudit as beforeAudit } from './packages/before/scripts/finalize-change-archive.mjs';
import { buildEvidenceReferenceRewrites as afterRewrite, postArchiveAudit as afterAudit } from './packages/after/scripts/finalize-change-archive.mjs';
import { extractEvidenceReferences as beforeExtract } from './packages/before/scripts/verification-evidence-foundation.mjs';
import { extractEvidenceReferences as afterExtract } from './packages/after/scripts/verification-evidence-foundation.mjs';
import { renderGovernedDeliveryRequirement, writeFixtureFile, writeManagedChange } from '../../tests/helpers/workflow-fixtures.mjs';
const root = path.resolve('outputs/skill-benefit-evaluation');
const from = 'openspec/changes/delivery/';
const to = 'openspec/changes/archive/2026-09-08-delivery/';
const migration = [
 ['行内代码', `\`${from}verification.md\``],
 ['行内代码中文空格', `\`${from}验证 结果.md\``],
 ['普通文本', `证据：${from}verification.md。`],
 ['Markdown链接', `[报告](${from}verification.md)`],
 ['Markdown标题和锚点', `[报告](${from}verification.md#结果 "说明")`],
 ['尖括号空格路径', `[报告](<${from}验证 结果.md>)`],
 ['链接引用定义', `[证据]: ${from}verification.md`],
 ['CRLF混合引用', `\`${from}a.md\`\r\n${from}b.md\r\n[报告](${from}c.md)`],
];
const preserved = [
 `https://example.test/${from}verification.md`, `[远程](https://example.test/${from}verification.md)`,
 `https://example.test/?path=${from}verification.md`, `\`https://example.test/${from}verification.md\``,
 `\`other/${from}verification.md\``, 'openspec/changes/delivery-next/verification.md', `文字${from}verification.md`,
];
const rows = [];
for(const [label, input] of migration) {
 const expected = input.replaceAll(from, to);
 const before = beforeRewrite(input, 'delivery', '2026-09-08-delivery');
 const after = afterRewrite(input, 'delivery', '2026-09-08-delivery');
 rows.push({ category: 'migration', label, input, expected, before: before.content === expected, after: after.content === expected, afterIdempotent: afterRewrite(after.content, 'delivery', '2026-09-08-delivery').rewrites.length === 0 });
}
for(const input of preserved) rows.push({ category: 'preservation', input, before: beforeRewrite(input,'delivery','2026-09-08-delivery').content === input, after: afterRewrite(input,'delivery','2026-09-08-delivery').content === input });
for(const [input, expected] of [
 ['[报告](outputs/验证%20结果.md#结果)', ['outputs/验证 结果.md']],
 ['`D:\\workspace\\proof\\summary.md`', ['D:/workspace/proof/summary.md']],
 ['`//server/share/proof.md`', ['//server/share/proof.md']],
 ['[报告](<openspec/changes/delivery/验证 结果.md#结果>)', ['openspec/changes/delivery/验证 结果.md']],
]) rows.push({ category:'extraction', input, expected, before: JSON.stringify(beforeExtract(input).paths) === JSON.stringify(expected), after: JSON.stringify(afterExtract(input).paths) === JSON.stringify(expected) });
const fixtureRoot = path.join(root, 'reliability-fixture');
fs.mkdirSync(fixtureRoot, { recursive: true });
try {
 const git = spawnSync('git',['init','-q',fixtureRoot], { encoding:'utf8', shell:false });
 if(git.status) throw Error(git.stderr);
 writeFixtureFile(fixtureRoot,'package.json','{"name":"archive-fixture","dependencies":{"vue":"^3.5.0"},"devDependencies":{"vite":"^6.0.0"}}\n');
 writeFixtureFile(fixtureRoot,'tests/existing.spec.js','export {};\n');
 writeManagedChange(fixtureRoot);
 const requirement = 'requirements/REQ-2026-001-integrity.md';
 for(const [label, evidence] of [['行内代码','`outputs/missing.md`'], ['普通文本','outputs/missing.md'], ['Markdown','[报告](outputs/missing.md)']]) {
  writeFixtureFile(fixtureRoot, requirement, renderGovernedDeliveryRequirement({ status:'已验收', testStrategy:'新建', evidenceLocation:evidence }));
  const opts = { requirementPath:path.join(fixtureRoot,requirement), changePath:path.join(fixtureRoot,'openspec/changes/delivery') };
  rows.push({category:'missing-evidence',label,before:!beforeAudit(opts).ok,after:!afterAudit(opts).ok});
 }
 writeFixtureFile(fixtureRoot,'outputs/missing.md','已恢复证据\n');
 const opts = { requirementPath:path.join(fixtureRoot,requirement), changePath:path.join(fixtureRoot,'openspec/changes/delivery') };
 rows.push({category:'restored-evidence',before:beforeAudit(opts).ok,after:afterAudit(opts).ok});
} finally { fs.rmSync(fixtureRoot,{recursive:true,force:true}); }
const summary = {};
for(const row of rows) { const s = summary[row.category] ||= {total:0,beforePassed:0,afterPassed:0}; s.total++; s.beforePassed += Number(row.before); s.afterPassed += Number(row.after); }
fs.writeFileSync(path.join(root,'reliability.json'), JSON.stringify({ rows, summary, note:'定向回归样本，不能外推真实故障概率' },null,2));
console.log(JSON.stringify(summary));
