import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { buildEvidenceReferenceRewrites, finalizeChange } from '../plugins/frontend-ai-workflow/scripts/finalize-change.mjs';
import { postArchiveAudit } from '../plugins/frontend-ai-workflow/scripts/finalize-change-archive.mjs';
import { extractEvidenceReferences } from '../plugins/frontend-ai-workflow/scripts/verification-evidence-foundation.mjs';
import { validateRequirementDecisions } from '../plugins/frontend-ai-workflow/scripts/validate-requirement-decisions.mjs';
import { renderGovernedDeliveryRequirement, writeFixtureFile, writeManagedChange } from './helpers/workflow-fixtures.mjs';

const outputRoot = path.resolve('outputs/skill-optimization/archive-fixtures');

function fixture(context) {
  fs.mkdirSync(outputRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(outputRoot, '归档 case-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // 独立 Git 根隔离父仓库；成功和失败均由测试生命周期清理。
  const git = spawnSync('git', ['init', '-q', root], { encoding: 'utf8', shell: false });
  assert.equal(git.status, 0, git.stderr);
  writeFixtureFile(root, 'package.json', '{"name":"archive-fixture","dependencies":{"vue":"^3.5.0"},"devDependencies":{"vite":"^6.0.0"}}\n');
  writeFixtureFile(root, 'tests/existing.spec.js', 'export {};\n');
  writeManagedChange(root);
  const lifecyclePath = path.join(root, '.frontend-workflow.json');
  const lifecycle = JSON.parse(fs.readFileSync(lifecyclePath, 'utf8'));
  fs.writeFileSync(lifecyclePath, `${JSON.stringify({ ...lifecycle, lifecycleMode: 'legacy-readonly' }, null, 2)}\n`);
  const requirement = 'requirements/REQ-2026-001-integrity.md';
  return { root, requirement, requirementPath: path.join(root, requirement) };
}

test('三种归档引用保留格式、中文空格和 CRLF，保护 URL 与相似路径且重复执行幂等', () => {
  const source = 'openspec/changes/delivery/';
  const target = 'openspec/changes/archive/2026-09-08-delivery/';
  const changed = [
    `\`${source}验证 结果.md\``,
    `证据：${source}verification.md。`,
    `[报告](${source}verification.md#结果 "说明")`,
    `[报告](<${source}验证 结果.md>)`,
    `[证据]: ${source}verification.md`,
  ];
  const preserved = [
    `https://example.test/${source}verification.md`,
    `[远程](https://example.test/${source}verification.md)`,
    `https://example.test/?path=${source}verification.md`,
    `\`https://example.test/${source}verification.md\``,
    `\`other/${source}verification.md\``,
    'openspec/changes/delivery-next/verification.md',
    '文字openspec/changes/delivery/verification.md',
  ];
  const content = [...changed, ...preserved].join('\r\n');
  const result = buildEvidenceReferenceRewrites(content, 'delivery', '2026-09-08-delivery');
  assert.equal(result.content, [...changed.map((value) => value.replace(source, target)), ...preserved].join('\r\n'));
  const repeated = buildEvidenceReferenceRewrites(result.content, 'delivery', '2026-09-08-delivery');
  assert.deepEqual(repeated, { content: result.content, rewrites: [] });
});

test('证据读取识别 Markdown 目标及裸路径，保留 Windows 路径规范化与远程引用', () => {
  const result = extractEvidenceReferences('[报告](<openspec/changes/delivery/验证 结果.md#结果>)；outputs/test.log；`proof\\summary.md`；https://ci.example/run/1');
  assert.deepEqual(result.paths, ['openspec/changes/delivery/验证 结果.md', 'outputs/test.log', 'proof/summary.md']);
  assert.deepEqual(result.urls, ['https://ci.example/run/1']);
  const windowsPath = path.win32.join('D:\\workspace', 'proof', 'summary.md');
  assert.deepEqual(extractEvidenceReferences(`\`${windowsPath}\``).paths, ['D:/workspace/proof/summary.md']);
  assert.deepEqual(extractEvidenceReferences('`//server/share/proof.md`').paths, ['//server/share/proof.md']);
  assert.deepEqual(extractEvidenceReferences('[报告](outputs/验证%20结果.md#结果)').paths, ['outputs/验证 结果.md']);
});

test('普通历史审计保持警告，新归档审计拦截相同的缺失证据', (context) => {
  const f = fixture(context);
  const changePath = path.join(f.root, 'openspec/changes/delivery');
  writeFixtureFile(f.root, f.requirement, renderGovernedDeliveryRequirement({
    status: '已验收', testStrategy: '新建', evidenceLocation: '[报告](outputs/missing.md)',
  }));
  const historical = validateRequirementDecisions(f.requirementPath, { changePath, stage: 'complete' });
  assert.equal(historical.ok, true, historical.errors.join('\n'));
  assert.equal(historical.evidenceFiles.diagnostics.some((item) => item.code === 'evidence_file_missing'), true);
  const audit = postArchiveAudit({ requirementPath: f.requirementPath, changePath });
  assert.equal(audit.ok, false);
  assert.equal(audit.errors.some((item) => item.startsWith('evidence_file_missing：')), true);
  writeFixtureFile(f.root, 'outputs/missing.md', '已恢复的真实证据\n');
  assert.equal(postArchiveAudit({ requirementPath: f.requirementPath, changePath }).ok, true);
});

test('真实归档迁移多种引用，归档后断链部分失败且恢复不重复移动或运行命令', (context) => {
  const f = fixture(context);
  const evidence = 'openspec/changes/delivery/verification.md';
  writeFixtureFile(f.root, evidence, 'fixture 验证证据\n');
  writeFixtureFile(f.root, f.requirement, renderGovernedDeliveryRequirement({
    testStrategy: '新建', evidenceLocation: `[报告](${evidence})；${evidence}；\`${evidence}\``,
  }));
  const options = { target: f.root, requirement: f.requirement, change: 'delivery', write: true };
  const result = finalizeChange(options, {
    postArchiveAudit(input) {
      fs.rmSync(path.join(input.changePath, 'verification.md'));
      return postArchiveAudit(input);
    },
  });
  assert.equal(result.code, 'archive_partial_failure', JSON.stringify(result));
  assert.equal(result.failedStage, 'post-archive-audit');
  assert.equal(result.recovery.projectCommandsExecuted, false);
  assert.equal(fs.existsSync(path.join(f.root, 'openspec/changes/delivery')), false);
  const archivedBody = path.join(f.root, 'requirements/archive/2026', path.basename(f.requirement));
  assert.equal(fs.readFileSync(archivedBody, 'utf8').includes(evidence), false);
  fs.writeFileSync(path.join(result.archiveTarget, 'verification.md'), 'fixture 恢复证据\n');
  let engineCalls = 0;
  const services = { runOpenSpecSync() { engineCalls += 1; throw new Error('恢复不应调用归档引擎'); } };
  const recovered = finalizeChange(options, services);
  assert.equal(recovered.code, 'archive_recovered', JSON.stringify(recovered));
  const body = fs.readFileSync(archivedBody, 'utf8');
  assert.equal(finalizeChange(options, services).code, 'archive_recovered');
  assert.equal(fs.readFileSync(archivedBody, 'utf8'), body);
  assert.equal(engineCalls, 0);
  assert.deepEqual(fs.readdirSync(path.join(f.root, 'openspec/changes/archive')), [path.basename(result.archiveTarget)]);
});
