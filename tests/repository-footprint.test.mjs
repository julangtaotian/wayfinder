import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  REPOSITORY_FOOTPRINT_BUDGETS,
  REPOSITORY_RETIREMENT_LIMITS,
  auditRepositoryFootprint,
} from '../plugins/frontend-ai-workflow/scripts/repository-footprint.mjs';

const repositoryRoot = path.resolve('.');

function createFixture(context) {
  const root = fs.mkdtempSync(path.join(repositoryRoot, 'outputs', 'repository-footprint-test-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'requirements'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(root, 'plugins', 'frontend-ai-workflow', 'scripts'), { recursive: true });
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
  write(root, 'outputs/spec/readme.md', '# spec\n');

  const result = auditRepositoryFootprint({
    root,
    trackedFiles: ['outputs/spec/readme.md'],
  });
  assert.equal(result.ok, true);
  assert.equal(result.code, 'repository_footprint_ok');
  assert.deepEqual(result.budgets, REPOSITORY_FOOTPRINT_BUDGETS);
  assert.equal(result.counts.activeFullRequirements, 1);
  assert.equal(result.counts.trackedOutputFiles, 1);
  assert.deepEqual(result.retirementLimits, REPOSITORY_RETIREMENT_LIMITS);
  assert.equal(result.diagnostics.length, 0);
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

test('仓库体积审计按字节统计受跟踪 outputs 并忽略历史正文与固定运行时', (context) => {
  const root = createFixture(context);
  write(root, 'requirements/archive/2026/REQ-2026-001.md', 'history\n'.repeat(2000));
  write(root, 'openspec/changes/archive/2026-08-01-old/tasks.md', 'history\n'.repeat(2000));
  write(root, 'plugins/frontend-ai-workflow/runtime/large.mjs', 'runtime\n'.repeat(2000));
  write(root, 'outputs/large.bin', 'x'.repeat(11 * 1024 * 1024));

  const result = auditRepositoryFootprint({ root, trackedFiles: ['outputs/large.bin'] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics.map((item) => item.code), ['tracked_outputs_byte_budget_exceeded']);
  assert.equal(result.counts.trackedOutputBytes, 11 * 1024 * 1024);
});

test('[V-03] 仓库体积与统一验证治理合同：版本、规则和门禁一致', () => {
  const packageManifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const pluginManifest = JSON.parse(fs.readFileSync(
    path.join(repositoryRoot, 'plugins', 'frontend-ai-workflow', '.codex-plugin', 'plugin.json'),
    'utf8',
  ));
  const verifyScript = fs.readFileSync(path.join(repositoryRoot, 'scripts', 'verify.mjs'), 'utf8');
  const repositoryRules = fs.readFileSync(path.join(repositoryRoot, 'AGENTS.md'), 'utf8');
  const readme = fs.readFileSync(path.join(repositoryRoot, 'README.md'), 'utf8');

  assert.equal(packageManifest.version, '0.18.0');
  assert.match(pluginManifest.version, /^0\.18\.0\+codex\.\d{14}$/u);
  assert.match(verifyScript, /id:\s*'footprint'/u);
  assert.match(repositoryRules, /不再依赖定期人工瘦身/u);
  assert.match(readme, /预算调整必须先形成正式需求和设计决策/u);
});

test('[V-03] 核心入口职责边界：公开导出、依赖方向与行数预算稳定', async () => {
  const entryContracts = {
    'finalize-change.mjs': [
      'buildEvidenceReferenceRewrites',
      'finalizeChange',
      'rewriteRequirementForArchive',
      'rewriteTestPlanForArchive',
    ],
    'validate-requirement-decisions.mjs': ['validateRequirementDecisions'],
    'verification-evidence.mjs': [
      'EVIDENCE_SCHEMA_VERSION',
      'EvidenceError',
      'LEGACY_EVIDENCE_SCHEMA_VERSION',
      'auditProjectVerificationEvidence',
      'computeVerificationSemanticBinding',
      'computeWorkspaceFingerprint',
      'createEvidenceFileDescriptor',
      'extractEvidenceReferences',
      'normalizeEvidenceCommand',
      'runVerificationEvidence',
      'stableJson',
      'validateEvidenceManifest',
      'validateVerificationEvidenceRecords',
      'verificationEvidenceRequired',
    ],
  };
  const helperOwners = {
    'finalize-change-archive.mjs': 'finalize-change.mjs',
    'requirement-decision-parser.mjs': 'validate-requirement-decisions.mjs',
    'requirement-delivery-validation.mjs': 'validate-requirement-decisions.mjs',
    'verification-evidence-validation.mjs': 'verification-evidence.mjs',
  };
  const scriptsRoot = path.join(repositoryRoot, 'plugins', 'frontend-ai-workflow', 'scripts');

  for (const [fileName, expectedExports] of Object.entries(entryContracts)) {
    const absolutePath = path.join(scriptsRoot, fileName);
    const lineCount = fs.readFileSync(absolutePath, 'utf8').split(/\r?\n/u).length;
    assert.equal(lineCount <= 600, true, `${fileName} 超过 600 行入口预算`);
    const module = await import(pathToFileURL(absolutePath).href);
    assert.deepEqual(Object.keys(module).sort(), [...expectedExports].sort(), `${fileName} 公开导出发生漂移`);
  }

  for (const [fileName, owner] of Object.entries(helperOwners)) {
    const content = fs.readFileSync(path.join(scriptsRoot, fileName), 'utf8');
    const lineCount = content.split(/\r?\n/u).length;
    assert.equal(lineCount <= REPOSITORY_FOOTPRINT_BUDGETS.pluginScriptFileLines, true, fileName);
    assert.doesNotMatch(content, new RegExp(`from ['"]\\./${owner.replace('.', '\\.')}['"]`, 'u'));
  }

  const packageManifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.deepEqual(packageManifest.dependencies || {}, {});
  assert.deepEqual(packageManifest.devDependencies || {}, {});
});
