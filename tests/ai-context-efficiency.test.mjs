import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CHECK_PROJECT_DIAGNOSTIC_PAGE_SIZE,
  CHECK_PROJECT_OBSERVATION_SAMPLE_LIMIT,
  formatProjectCheckOutput,
  queryProjectCheckDiagnostics,
  summarizeProjectCheck,
} from '../plugins/frontend-ai-workflow/scripts/check-project-output.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function diagnostic(code, target) {
  return { code, status: 'warning', target, message: `${code}:${target}` };
}

function completeResult() {
  const observations = Array.from({ length: 8 }, (_, index) => ({
    code: index < 6 ? 'wxml-attribute-spacing' : 'other-observation',
    path: `src/page-${index}.wxml`,
    line: index + 1,
  }));
  return {
    ok: true,
    root: '/workspace/project',
    layout: 'wayfinder',
    dependencyProfile: {
      schemaVersion: '1.0.0',
      totalPackages: 2,
      packages: [
        { name: 'vue', declarations: [{ group: 'dependencies', specifier: '^3.5.0' }] },
        { name: 'vite', declarations: [{ group: 'devDependencies', specifier: '^6.0.0' }] },
      ],
    },
    commands: { test: 'npm run test' },
    verificationEvidenceAudit: {
      checked: true,
      executed: false,
      requirements: 3,
      records: 4,
      counts: { legacy_markdown_evidence: 2, stale_active_evidence_path: 1 },
      diagnostics: [
        diagnostic('legacy_markdown_evidence', 'requirements/REQ-001.md#V-01'),
        diagnostic('stale_active_evidence_path', 'openspec/changes/old/verification.md'),
        diagnostic('legacy_markdown_evidence', 'requirements/REQ-002.md#V-02'),
      ],
    },
    deepAnalysis: {
      enabled: true,
      observations,
      freshness: { checked: true, stale: false },
    },
    errors: [],
    warnings: [],
  };
}

test('[TC-01] 精简检查输出保留必要事实并限制可恢复长数组', () => {
  const full = completeResult();
  const snapshot = structuredClone(full);
  const summary = summarizeProjectCheck(full);

  assert.equal(summary.schemaVersion, '1.0.0');
  assert.equal(summary.mode, 'summary');
  assert.deepEqual(summary.dependencyProfile, full.dependencyProfile, '完整直接依赖画像不得截断');
  assert.equal('diagnostics' in summary.verificationEvidenceAudit, false);
  assert.equal(summary.verificationEvidenceAudit.diagnosticsIncluded, false);
  assert.deepEqual(summary.verificationEvidenceAudit.availableCodes, [
    'legacy_markdown_evidence',
    'stale_active_evidence_path',
  ]);
  assert.equal(summary.deepAnalysis.totalObservations, 8);
  assert.equal(summary.deepAnalysis.observations.length, CHECK_PROJECT_OBSERVATION_SAMPLE_LIMIT);
  assert.equal(summary.deepAnalysis.omittedObservations, 3);
  assert.deepEqual(summary.deepAnalysis.observationCounts, {
    'other-observation': 2,
    'wxml-attribute-spacing': 6,
  });
  assert.deepEqual(full, snapshot, '格式化不得修改完整检查结果');
  assert.equal(formatProjectCheckOutput(full), full, '无显式模式必须保持完整结果兼容');
});

test('[TC-02] 历史诊断查询按稳定 code 返回有界结果', () => {
  const full = completeResult();
  const matched = queryProjectCheckDiagnostics(full, 'legacy_markdown_evidence', { limit: 1 });

  assert.equal(matched.schemaVersion, '1.0.0');
  assert.equal(matched.mode, 'diagnostics');
  assert.equal(matched.code, 'legacy_markdown_evidence');
  assert.equal(matched.count, 1);
  assert.equal(matched.totalCount, 2);
  assert.equal(matched.nextOffset, 1);
  assert.equal(matched.remainingCount, 1);
  assert.ok(matched.diagnostics.every((item) => item.code === matched.code));
  assert.deepEqual(matched.availableCodes, [
    'legacy_markdown_evidence',
    'stale_active_evidence_path',
  ]);

  const missing = formatProjectCheckOutput(full, { diagnosticCode: 'unknown_code' });
  assert.equal(missing.mode, 'diagnostics');
  assert.equal(missing.count, 0);
  assert.equal(missing.totalCount, 0);
  assert.equal(missing.limit, CHECK_PROJECT_DIAGNOSTIC_PAGE_SIZE);
  assert.equal(missing.nextOffset, null);
  assert.deepEqual(missing.diagnostics, []);
  assert.deepEqual(missing.availableCodes, matched.availableCodes);
});

test('[TC-04] Skill、仓库读取路由与版本保持一致', async () => {
  const [skill, agents, rootPackage, manifest, managedFiles, bootstrap, readme] = await Promise.all([
    readFile(path.join(PROJECT_ROOT, 'plugins/frontend-ai-workflow/skills/frontend-workflow-check/SKILL.md'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'AGENTS.md'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'package.json'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'plugins/frontend-ai-workflow/.codex-plugin/plugin.json'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'plugins/frontend-ai-workflow/references/managed-files.md'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'plugins/frontend-ai-workflow/scripts/bootstrap-project.mjs'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'README.md'), 'utf8'),
  ]);

  assert.match(skill, /check-project\.mjs[^\n]+--summary/u);
  assert.match(skill, /--diagnostic-code/u);
  assert.match(skill, /--diagnostic-offset/u);
  assert.match(agents, /## AI 读取路由/u);
  assert.match(agents, /runtime\/\*\*\/node_modules/u);
  assert.match(agents, /outputs/u);

  assert.equal(JSON.parse(rootPackage).version, '0.18.0');
  assert.match(JSON.parse(manifest).version, /^0\.18\.0\+codex\.\d{14}$/u);
  assert.match(managedFiles, /0\.18\.0/u);
  assert.match(bootstrap, /WORKFLOW_VERSION\s*=\s*'0\.18\.0'/u);
  assert.match(readme, /0\.18\.0/u);
});
