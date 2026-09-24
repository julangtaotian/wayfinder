import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  REPOSITORY_FOOTPRINT_BUDGETS,
  REPOSITORY_RETIREMENT_LIMITS,
  auditRepositoryFootprint,
  formatRepositoryFootprint,
} from '../plugins/frontend-ai-workflow/scripts/repository-footprint.mjs';

const repositoryRoot = path.resolve('.');

function createFixture(context) {
  const parent = path.join(repositoryRoot, '.frontend-ai-workflow', 'runs', 'repository-footprint-tests');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'case-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'requirements'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  return root;
}

function write(root, relativePath, content = 'fixture\n') {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

test('仓库体积审计返回稳定预算、计数和通过状态', (context) => {
  const root = createFixture(context);
  write(root, 'requirements/REQ-2026-001-active.md', '# 活跃需求\n\n- 状态：实施中\n');
  write(root, 'tests/feature.test.mjs', 'test();\n');
  write(root, 'plugins/frontend-ai-workflow/scripts/feature.mjs', 'export {};\n');
  write(root, 'package.json', '{"scripts":{"feature":"node plugins/frontend-ai-workflow/scripts/feature.mjs"}}\n');
  const result = auditRepositoryFootprint({
    root,
    trackedFiles: [],
  });
  assert.equal(result.ok, true);
  assert.equal(result.code, 'repository_footprint_ok');
  assert.deepEqual(result.budgets, REPOSITORY_FOOTPRINT_BUDGETS);
  assert.equal(result.counts.activeFullRequirements, 1);
  assert.equal(result.counts.trackedOutputFiles, 0);
  assert.deepEqual(result.retirementLimits, REPOSITORY_RETIREMENT_LIMITS);
  assert.equal(result.diagnostics.length, 0);
});

test('[TC-03] 当前仓库满足生命周期与体积预算', () => {
  const result = auditRepositoryFootprint({ root: repositoryRoot });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.code, 'repository_footprint_ok');
  assert.equal(result.counts.localSpecReferences, 0);
  assert.equal(result.budgets.specTotalBytes, 512 * 1024);
  assert.equal(result.retirementLimits.platformAssetFiles, 0);
});

test('[TC-07] 平台资产、生成清单和 LFS 规则使用不可放宽的零上限', (context) => {
  const root = createFixture(context);
  const platformAsset = 'plugins/frontend-ai-workflow/runtime/playwright/platform-assets/linux-x64/browser';
  const platformManifest = 'plugins/frontend-ai-workflow/runtime/playwright/integrity/linux-x64.json';
  write(root, platformAsset, 'browser');
  write(root, platformManifest, '{}\n');
  write(
    root,
    '.gitattributes',
    'plugins/frontend-ai-workflow/runtime/playwright/platform-assets/** filter=lfs diff=lfs merge=lfs -text\n',
  );

  const result = auditRepositoryFootprint({
    root,
    trackedFiles: [platformAsset, platformManifest, '.gitattributes'],
    budgets: {
      ...REPOSITORY_FOOTPRINT_BUDGETS,
      platformAssetFiles: Number.MAX_SAFE_INTEGER,
      platformIntegrityManifests: Number.MAX_SAFE_INTEGER,
      platformLfsRules: Number.MAX_SAFE_INTEGER,
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.diagnostics.map(({ code, actual, limit }) => ({ code, actual, limit })),
    [
      { code: 'retired_platform_asset_files_present', actual: 1, limit: 0 },
      { code: 'retired_platform_integrity_manifests_present', actual: 1, limit: 0 },
      { code: 'retired_platform_lfs_rules_present', actual: 1, limit: 0 },
    ],
  );
});

test('[TC-22] 退役资产与空目录不回流', (context) => {
  const root = createFixture(context);
  write(root, 'outputs/legacy.txt');
  fs.mkdirSync(path.join(root, '.frontend-ui-review'), { recursive: true });
  write(root, '.workflow-history/evidence/event.json', '{}\n');
  write(root, '.workflow-history/2026.jsonl', '{"schemaVersion":2,"requirementId":"REQ-legacy","checks":[]}\n');
  write(root, 'tests/.DS_Store', 'junk');
  write(root, 'plugins/frontend-ai-workflow/scripts/finalize-change-archive.mjs', 'export {};\n');
  write(root, 'plugins/frontend-ai-workflow/scripts/verification-evidence.mjs', 'export {};\n');
  write(root, 'openspec/changes/demo/evidence/V-01.json', '{}\n');
  write(root, 'openspec/changes/demo/test-plan.md', '# 退役测试方案\n');
  write(root, 'package.json', '{"scripts":{"verify:receipt":"node legacy.mjs"}}\n');
  write(root, 'plugins/frontend-ai-workflow/scripts/orphan.mjs', 'export {};\n');
  fs.mkdirSync(path.join(root, 'plugins/frontend-ai-workflow/references/empty'), { recursive: true });

  const result = auditRepositoryFootprint({ root, trackedFiles: [] });
  assert.equal(result.ok, false);
  const byCode = new Map(result.diagnostics.map((item) => [`${item.code}:${item.target}`, item]));
  for (const expected of [
    'retired_path_present:outputs',
    'retired_path_present:.workflow-history/evidence',
    'empty_project_directory:.frontend-ui-review',
    'system_junk_present:tests/.DS_Store',
    'empty_managed_directory:plugins/frontend-ai-workflow/references/empty',
    'retired_source_present:plugins/frontend-ai-workflow/scripts/finalize-change-archive.mjs',
    'retired_source_present:plugins/frontend-ai-workflow/scripts/verification-evidence.mjs',
    'retired_package_script:package.json#scripts.verify:receipt',
    'retired_change_evidence:openspec/changes/demo/evidence/V-01.json',
    'retired_change_evidence:openspec/changes/demo/test-plan.md',
    'retired_lifecycle_field:.workflow-history/2026.jsonl:1:requirementId,checks',
    'unreachable_plugin_script:plugins/frontend-ai-workflow/scripts/orphan.mjs',
  ]) assert.equal(byCode.has(expected), true, expected);
});

test('[V-03] 仓库体积与统一验证治理合同：各类预算违规稳定失败', (context) => {
  const root = createFixture(context);
  write(root, 'outputs/lanhu-design-spec/legacy.png', 'legacy');
  for (let index = 0; index < 6; index += 1) {
    write(root, `requirements/REQ-2026-10${index}-active.md`, '# 活跃需求\n\n- 状态：已确认\n');
  }
  write(root, 'tests/oversized.test.mjs', 'line\n'.repeat(1001));
  write(root, 'plugins/frontend-ai-workflow/scripts/oversized.mjs', 'line\n'.repeat(801));
  const trackedFiles = Array.from({ length: 201 }, (_, index) => {
    const relativePath = `outputs/generated/${index}.txt`;
    write(root, relativePath, 'x');
    return relativePath;
  });
  trackedFiles.push('outputs/lanhu-design-spec/legacy.png');

  const result = auditRepositoryFootprint({ root, trackedFiles });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'repository_footprint_exceeded');
  const codes = result.diagnostics.map((item) => item.code);
  assert.deepEqual(codes, [...codes].sort());
  assert.equal(codes.includes('retired_path_present'), true);
  assert.equal(codes.includes('tracked_outputs_file_budget_exceeded'), true);
  assert.equal(codes.includes('active_requirement_budget_exceeded'), true);
  assert.equal(codes.includes('test_file_line_budget_exceeded'), true);
  assert.equal(codes.includes('script_file_line_budget_exceeded'), true);
  for (const diagnostic of result.diagnostics) {
    assert.equal(typeof diagnostic.target, 'string');
    assert.equal(diagnostic.status, 'failed');
    assert.equal(Number.isFinite(diagnostic.actual), true);
    assert.equal(Number.isFinite(diagnostic.budget), true);
  }
});

test('仓库体积审计按字节统计并阻断受跟踪 outputs', (context) => {
  const root = createFixture(context);
  write(root, 'requirements/archive/2026/REQ-2026-001.md', 'history\n'.repeat(2000));
  write(root, 'openspec/changes/archive/2026-08-01-old/tasks.md', 'history\n'.repeat(2000));
  write(root, 'plugins/frontend-ai-workflow/runtime/large.mjs', 'runtime\n'.repeat(2000));
  write(root, 'outputs/large.bin', 'x'.repeat(11 * 1024 * 1024));

  const result = auditRepositoryFootprint({ root, trackedFiles: ['outputs/large.bin'] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics.map((item) => item.code), [
    'retired_lifecycle_path',
    'retired_path_present',
    'tracked_outputs_byte_budget_exceeded',
    'tracked_outputs_file_budget_exceeded',
  ]);
  assert.equal(result.counts.trackedOutputBytes, 11 * 1024 * 1024);
});

test('v2 以零上限拒绝旧归档和受跟踪运行时', (context) => {
  const root = createFixture(context);
  write(root, '.frontend-workflow.json', `${JSON.stringify({
    schemaVersion: 2,
    minimumWriterVersion: '0.19.0',
    lifecycleMode: 'v2',
    eventDirectory: '.workflow-history',
    runtimeDirectory: '.frontend-ai-workflow',
    eventMaxBytes: 4096,
  })}\n`);
  const files = [
    'outputs/legacy/report.json',
    'requirements/archive/2026/REQ-2026-001.md',
    'openspec/changes/archive/2026-09-01-old/tasks.md',
    '.frontend-ai-workflow/runs/demo/log.txt',
    '.frontend-ui-review/runs/demo/report.json',
  ];
  for (const file of files) write(root, file);
  write(root, 'openspec/specs/demo/spec.md', '### Requirement: demo\n\n由 D-01 决定并以 A-01 验收。\n');
  const result = auditRepositoryFootprint({ root, trackedFiles: files });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.filter((item) => item.code === 'retired_lifecycle_path').length, 4);
  assert.equal(result.diagnostics.filter((item) => item.code === 'tracked_runtime_artifact').length, 1);
  assert.equal(result.diagnostics.some((item) => item.code === 'local_spec_reference' && item.status === 'failed'), true);
});

test('[TC-02] 测试定位按文件作用域识别真实调用', (context) => {
  const root = createFixture(context);
  write(root, 'openspec/specs/one/spec.md', '### Requirement: 重复合同\n');
  write(root, 'openspec/specs/two/spec.md', '### Requirement: 重复合同\n');
  write(root, 'tests/one.test.mjs', [
    "test('[TC-01] first', () => {});",
    'const fixture = `',
    "test('[TC-02] fixture text', () => {});",
    '`;',
    "test('[TC-02] duplicate first', () => {});",
    "it('[TC-02] duplicate second', () => {});",
    '',
  ].join('\n'));
  write(root, 'tests/two.test.mjs', "test('[TC-01] second', () => {});\n");
  const result = auditRepositoryFootprint({ root, trackedFiles: [] });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((item) => item.code === 'duplicate_spec_requirement' && item.status === 'failed'), true);
  const ambiguous = result.diagnostics.filter((item) => item.code === 'ambiguous_test_locator');
  assert.equal(REPOSITORY_FOOTPRINT_BUDGETS.rootTestFileLines, 750);
  assert.equal(result.counts.ambiguousTestLocators, 1);
  assert.equal(ambiguous.length, 1);
  assert.equal(ambiguous[0].status, 'warning');
  assert.equal(ambiguous[0].target, 'tests/one.test.mjs#TC-02');
  assert.equal(ambiguous[0].actual, 2);
  assert.deepEqual(ambiguous[0].details.map(({ file, line }) => ({ file, line })), [
    { file: 'tests/one.test.mjs', line: 5 },
    { file: 'tests/one.test.mjs', line: 6 },
  ]);
  const formatted = formatRepositoryFootprint(result, { limit: 1 });
  assert.equal(formatted.diagnostics.length, 1);
  assert.equal(formatted.diagnosticPage.remaining > 0, true);

  const current = auditRepositoryFootprint({ root: repositoryRoot, trackedFiles: [] });
  assert.equal(current.counts.ambiguousTestLocators, 0);
});

test('[TC-04] 仓库体积与统一验证治理合同保持一致', () => {
  const packageManifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const pluginManifest = JSON.parse(fs.readFileSync(
    path.join(repositoryRoot, 'plugins', 'frontend-ai-workflow', '.codex-plugin', 'plugin.json'),
    'utf8',
  ));
  const verifyScript = fs.readFileSync(path.join(repositoryRoot, 'scripts', 'verify.mjs'), 'utf8');
  const repositoryRules = fs.readFileSync(path.join(repositoryRoot, 'AGENTS.md'), 'utf8');
  const readme = fs.readFileSync(path.join(repositoryRoot, 'README.md'), 'utf8');

  assert.equal(packageManifest.version, '0.19.0');
  assert.match(pluginManifest.version, /^0\.19\.0\+codex\.\d{14}$/u);
  assert.match(verifyScript, /id:\s*'footprint'/u);
  assert.match(repositoryRules, /不再依赖定期人工瘦身/u);
  assert.match(repositoryRules, /默认验证不产生长期受跟踪输出/u);
  assert.match(readme, /需要改变体积预算、运行时版本或公共合同，必须先建立 Complex 变更和可复现回归依据/u);
});

test('[V-03] 核心入口职责边界：公开导出、依赖方向与行数预算稳定', async () => {
  const entryContracts = {
    'finalize-change.mjs': ['finalizeChange'],
    'check-change.mjs': [
      'archiveTarget',
      'checkChange',
      'readTemporaryVerificationSummary',
      'verificationSummaryTarget',
    ],
  };
  const scriptsRoot = path.join(repositoryRoot, 'plugins', 'frontend-ai-workflow', 'scripts');

  for (const [fileName, expectedExports] of Object.entries(entryContracts)) {
    const absolutePath = path.join(scriptsRoot, fileName);
    const lineCount = fs.readFileSync(absolutePath, 'utf8').split(/\r?\n/u).length;
    assert.equal(lineCount <= 600, true, `${fileName} 超过 600 行入口预算`);
    const module = await import(pathToFileURL(absolutePath).href);
    assert.deepEqual(Object.keys(module).sort(), [...expectedExports].sort(), `${fileName} 公开导出发生漂移`);
  }

  const packageManifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.deepEqual(packageManifest.dependencies || {}, {});
  assert.deepEqual(packageManifest.devDependencies || {}, {});
});
