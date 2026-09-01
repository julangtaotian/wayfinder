// WebStorm 会将测试中的中文 Markdown 样例逐字符误报；样例用于覆盖真实中文文档场景。
//noinspection NonAsciiCharacters
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { runBootstrap } from '../plugins/frontend-ai-workflow/scripts/bootstrap-project.mjs';
import { checkProject } from '../plugins/frontend-ai-workflow/scripts/check-project.mjs';
import { runWayfinderMigration } from '../plugins/frontend-ai-workflow/scripts/migrate-wayfinder-project.mjs';
import { collectProjectScope, PROJECT_SCOPE_VERSION } from '../plugins/frontend-ai-workflow/scripts/collect-project-scope.mjs';
import {
  BUNDLED_OPENSPEC_VERSION,
  inspectBundledOpenSpec,
  runOpenSpecSync,
} from '../plugins/frontend-ai-workflow/scripts/openspec-cli.mjs';
import { runUpdate } from '../plugins/frontend-ai-workflow/scripts/update-project.mjs';
import {
  buildRuntimeIntegrityManifest,
  formatRuntimeIntegrityManifest,
  verifyRuntimeIntegrity,
  writeRuntimeIntegrity,
} from '../plugins/frontend-ai-workflow/scripts/runtime-integrity.mjs';
import { normalizeMachinePath } from '../plugins/frontend-ai-workflow/scripts/real-project-validation.mjs';
import {
  findBareDecisionAcceptanceLabels,
  validateManagedMarkdownReferenceLabels,
} from '../plugins/frontend-ai-workflow/scripts/markdown-reference-safety.mjs';
import {
  pluginRoot,
  writeFixtureFile,
  createVueFixture,
  completeWayfinderAnalysis,
  writeLegacyWorkflow,
  createRuntimeIntegrityFixture,
} from './helpers/workflow-fixtures.mjs';

function joinFixtureLines(lines) {
  return lines.join('\n');
}

test('插件内置规划运行时可独立执行', () => {
  const runtime = inspectBundledOpenSpec();
  const result = runOpenSpecSync(['--version']);

  assert.equal(runtime.available, true);
  assert.equal(runtime.version, BUNDLED_OPENSPEC_VERSION);
  assert.equal(result.status, 0);
  assert.equal(result.source, 'bundled');
  assert.equal(result.stdout.trim(), BUNDLED_OPENSPEC_VERSION);
  const runtimeManifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'runtime', 'openspec', 'package.json'), 'utf8'));
  assert.equal(BUNDLED_OPENSPEC_VERSION, '1.9.0');
  assert.equal(runtimeManifest.version, BUNDLED_OPENSPEC_VERSION);
  assert.equal(runtimeManifest.bin.openspec, './bin/openspec.js');
  assert.equal(Object.hasOwn(runtimeManifest.dependencies, 'posthog-node'), false);
  assert.equal(fs.existsSync(path.join(pluginRoot, 'runtime', 'openspec', 'LICENSE')), true);
  for (const dependency of Object.keys(runtimeManifest.dependencies)) {
    assert.equal(fs.existsSync(path.join(pluginRoot, 'runtime', 'openspec', 'node_modules', dependency)), true, dependency);
  }
  const wrapper = fs.readFileSync(path.join(pluginRoot, 'scripts', 'openspec-cli.mjs'), 'utf8');
  assert.match(wrapper, /OPENSPEC_NO_UPDATE_CHECK: '1'/);
  assert.match(wrapper, /OPENSPEC_TELEMETRY: '0'/);
});

test('内置 OpenSpec 完整性清单可重复计算且不包含环境路径', () => {
  const first = buildRuntimeIntegrityManifest();
  const second = buildRuntimeIntegrityManifest();
  const content = formatRuntimeIntegrityManifest(first);
  const managed = fs.readFileSync(path.join(pluginRoot, 'runtime', 'openspec-integrity.json'), 'utf8');

  assert.deepEqual(first, second);
  assert.equal(content, managed);
  assert.equal(first.runtime.version, BUNDLED_OPENSPEC_VERSION);
  assert.equal(first.runtime.entrypoint, 'bin/openspec.js');
  assert.ok(first.packages.length > 50);
  assert.equal(first.packages[0].path, '.');
  assert.ok(first.packages.every((item) => /^[a-f0-9]{64}$/u.test(item.treeSha256)));
  assert.ok(first.packages.every((item) => item.license && item.fileCount > 0));
  assert.doesNotMatch(content, new RegExp(process.cwd().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(content, /generatedAt|createdAt/);
  assert.equal(verifyRuntimeIntegrity().ok, true);
});

test('运行时完整性默认只读并阻止内容与包集合漂移', (t) => {
  const { runtimeRoot, integrityPath } = createRuntimeIntegrityFixture(t);
  const missing = verifyRuntimeIntegrity({ runtimeRoot, integrityPath });
  assert.equal(missing.ok, false);
  assert.equal(fs.existsSync(integrityPath), false);

  const written = writeRuntimeIntegrity({ runtimeRoot, integrityPath });
  const baseline = fs.readFileSync(integrityPath, 'utf8');
  assert.equal(written.packages, 2);
  assert.equal(verifyRuntimeIntegrity({ runtimeRoot, integrityPath }).ok, true);

  writeFixtureFile(runtimeRoot, 'node_modules/.bin/openspec', '可重建的命令链接替身\n');
  assert.equal(verifyRuntimeIntegrity({ runtimeRoot, integrityPath }).ok, true);
  writeRuntimeIntegrity({ runtimeRoot, integrityPath });
  assert.equal(fs.readFileSync(integrityPath, 'utf8'), baseline);

  writeFixtureFile(runtimeRoot, 'node_modules/fixture-dependency/index.js', "export default 'changed';\n");
  const changed = verifyRuntimeIntegrity({ runtimeRoot, integrityPath });
  assert.equal(changed.ok, false);
  assert.match(changed.errors.join('\n'), /fixture-dependency/);

  writeRuntimeIntegrity({ runtimeRoot, integrityPath });
  writeFixtureFile(runtimeRoot, 'node_modules/extra-package/package.json', '{"name":"extra-package","version":"1.0.0","license":"MIT"}\n');
  writeFixtureFile(runtimeRoot, 'node_modules/extra-package/index.js', "export default 'extra';\n");
  const added = verifyRuntimeIntegrity({ runtimeRoot, integrityPath });
  assert.equal(added.ok, false);
  assert.match(added.errors.join('\n'), /新增未登记包：node_modules\/extra-package/);
});

test('健康检查使用插件内置规划运行时', (t) => {
  const root = createVueFixture(t);
  runBootstrap({ target: root, write: true });

  const result = checkProject(root);
  assert.equal(result.ok, true);
  assert.equal(result.version, '0.18.0');
  assert.equal(result.layout, 'wayfinder');
  assert.equal(result.errors.length, 0);
  assert.equal(result.planningEngine.available, true);
  assert.equal(result.planningEngine.source, 'bundled');
  assert.equal(result.planningEngine.version, BUNDLED_OPENSPEC_VERSION);
});

test('范围清单完整记账且结果稳定', (t) => {
  const root = createVueFixture(t);
  const limits = { maxFileBytes: 128, maxTotalBytes: 4096 };
  const first = collectProjectScope(root, limits);
  const second = collectProjectScope(root, limits);

  assert.equal(first.version, PROJECT_SCOPE_VERSION);
  assert.deepEqual(first, second);
  assert.ok(first.includedFiles.some((file) => file.path === 'src/router/index.js'));
  assert.ok(first.includedFiles.some((file) => file.path === 'src/request/http.js'));
  assert.ok(first.excludedFiles.some((file) => file.path === 'node_modules' && file.kind === 'directory'));
  assert.ok(first.excludedFiles.some((file) => file.path === 'docs/oversized.md' && file.reason.startsWith('超过单文件限制')));
  assert.throws(() => collectProjectScope(path.parse(root).root), /拒绝在高风险目录扫描/);
});

test('微信小程序文本源码进入安全范围并参与稳定指纹', (t) => {
  const root = createVueFixture(t);
  assert.equal(spawnSync('git', ['init', '-q', root], { encoding: 'utf8' }).status, 0);
  writeFixtureFile(root, '.gitignore', 'ignored/\n');
  writeFixtureFile(root, 'pages/home/index.wxml', joinFixtureLines(['<view>{{message}}</view>', '']));
  writeFixtureFile(root, 'pages/home/spacing.wxml', joinFixtureLines([
    '<view class="valid" bindtap="ok"></view>',
    '<view class="broken"bindtap="broken"></view>',
    '<!-- <view class="single-comment"bindtap="ignored"></view> -->',
    '<view class="before"bindtap="before"></view><!-- <view class="inline-comment"bindtap="ignored"></view> --><view class="after"bindtap="after"></view>',
    '<!--',
    '<view class="multi-comment"bindtap="ignored"></view>',
    '-->',
    '<!-- <view class="unclosed-comment"bindtap="ignored"></view>',
    '',
  ]));
  writeFixtureFile(root, 'pages/home/index.wxss', '.page { color: #333; }\n');
  writeFixtureFile(root, 'pages/home/format.wxs', 'module.exports = {};\n');
  writeFixtureFile(root, 'ignored/hidden.wxml', joinFixtureLines(['<view class="ignored"bindtap="ignored"></view>', '']));
  writeFixtureFile(root, 'pages/home/binary.wxs', `\u0000binary\n`);

  const first = collectProjectScope(root);
  assert.equal(first.version, '2.2.0');
  for (const file of ['pages/home/index.wxml', 'pages/home/index.wxss', 'pages/home/format.wxs']) {
    assert.ok(first.includedFiles.some((item) => item.path === file), file);
  }
  assert.ok(first.excludedFiles.some((item) => item.path === 'ignored/hidden.wxml' && /Git 忽略/u.test(item.reason)));
  assert.ok(first.excludedFiles.some((item) => item.path === 'pages/home/binary.wxs' && /空字节/u.test(item.reason)));
  assert.equal(first.validationEvidence.contentRead.executed, true);
  assert.equal(first.validationEvidence.contentHash.status, 'performed');
  assert.equal(first.validationEvidence.syntaxParse.executed, false);
  assert.equal(first.validationEvidence.platformCompile.status, 'not-run');
  assert.equal(first.validationEvidence.lint.executed, false);
  assert.equal(first.validationEvidence.test.executed, false);
  assert.deepEqual(first.observations.map(({ code, path: file, line }) => ({ code, file, line })), [
    { code: 'wxml-attribute-spacing', file: 'pages/home/spacing.wxml', line: 2 },
    { code: 'wxml-attribute-spacing', file: 'pages/home/spacing.wxml', line: 4 },
    { code: 'wxml-attribute-spacing', file: 'pages/home/spacing.wxml', line: 4 },
  ]);
  assert.equal(first.summary.observations, 3);

  writeFixtureFile(root, 'pages/home/index.wxml', joinFixtureLines(['<view>{{changed}}</view>', '']));
  assert.notEqual(collectProjectScope(root).fingerprint, first.fingerprint);
});

test('健康检查公开验证边界并非阻断报告 WXML 静态观察', (t) => {
  const root = createVueFixture(t);
  writeFixtureFile(root, 'pages/home/index.wxml', joinFixtureLines(['<view class="page"bindtap="open"></view>', '']));
  runBootstrap({ target: root, deep: true, write: true });

  const observed = checkProject(root);
  assert.equal(observed.ok, true);
  assert.equal(observed.deepAnalysis.freshness.stale, false);
  assert.equal(observed.deepAnalysis.validationEvidence.syntaxParse.status, 'not-run');
  assert.equal(observed.deepAnalysis.validationEvidence.platformCompile.executed, false);
  assert.deepEqual(observed.deepAnalysis.observations.map(({ code, path: file, line }) => ({ code, file, line })), [{
    code: 'wxml-attribute-spacing',
    file: 'pages/home/index.wxml',
    line: 1,
  }]);
  assert.match(observed.warnings.join('\n'), /静态发现 1 处 WXML 属性之间可能缺少空白/u);
  assert.match(observed.warnings.join('\n'), /未执行 WXML 语法解析或平台编译/u);

  writeFixtureFile(root, 'pages/home/index.wxml', joinFixtureLines(['<view class="page" bindtap="open"></view>', '']));
  const corrected = checkProject(root);
  assert.deepEqual(corrected.deepAnalysis.observations, []);
  assert.doesNotMatch(corrected.warnings.join('\n'), /静态发现.*WXML 属性/u);
});

test('深度初始化写入 Wayfinder 且保留 AI 项目地图', (t) => {
  const root = createVueFixture(t);
  const preview = runBootstrap({ target: root, deep: true });

  assert.equal(preview.ok, true);
  assert.equal(preview.write, false);
  assert.ok(preview.scope);
  assert.equal(preview.actions.some((item) => item.file === 'wayfinder/frontend.md'), true);
  assert.equal(preview.actions.some((item) => item.file === '.ai-workflow.yaml'), false);

  const applied = runBootstrap({ target: root, deep: true, write: true });
  const frontendPath = path.join(root, 'wayfinder', 'frontend.md');
  assert.equal(applied.ok, true);
  assert.match(fs.readFileSync(frontendPath, 'utf8'), /frontend-ai-workflow:meta:start/);
  assert.match(fs.readFileSync(frontendPath, 'utf8'), /frontend-ai-workflow:scope:start/);
  assert.match(fs.readFileSync(frontendPath, 'utf8'), /frontend-ai-workflow:analysis:start/);
  assert.match(fs.readFileSync(frontendPath, 'utf8'), /analysisStatus: "pending"/);
  assert.match(fs.readFileSync(frontendPath, 'utf8'), /analysisCoveredFiles: 0/);
  assert.equal(fs.existsSync(path.join(root, '.ai-workflow.yaml')), false);
  assert.equal(fs.existsSync(path.join(root, 'docs', 'ai-context', 'frontend.md')), false);
  // 常规升级不能意外将已完成深度扫描的项目降级为浅层工作流。
  runUpdate({ target: root, write: true });
  assert.match(fs.readFileSync(frontendPath, 'utf8'), /deepAnalysis: true/);

  const customized = fs.readFileSync(frontendPath, 'utf8').replace('## 深度项目地图（待生成）', '## 深度项目地图（人工补充）');
  fs.writeFileSync(frontendPath, customized, 'utf8');
  const refreshed = runUpdate({ target: root, deep: true, write: true });
  assert.equal(refreshed.ok, true);
  const refreshedContent = fs.readFileSync(frontendPath, 'utf8');
  assert.match(refreshedContent, /人工补充/);
  assert.match(refreshedContent, /analysisStatus: "pending"/);
  assert.match(refreshedContent, /analysisCoveredFiles: 0/);

  const checked = checkProject(root);
  assert.equal(checked.ok, true);
  assert.equal(checked.deepAnalysis.enabled, true);
  assert.equal(checked.deepAnalysis.scopeVersion, PROJECT_SCOPE_VERSION);
  assert.equal(checked.deepAnalysis.analysis.status, 'pending');
  assert.match(checked.warnings.join('\n'), /项目地图仍待生成/u);
});

test('深度项目地图完成态要求全量覆盖、结构证据，并会在刷新后安全失效', (t) => {
  const root = createVueFixture(t);
  runBootstrap({ target: root, deep: true, write: true });
  const frontendPath = path.join(root, 'wayfinder', 'frontend.md');
  const completed = completeWayfinderAnalysis(fs.readFileSync(frontendPath, 'utf8'));
  fs.writeFileSync(frontendPath, completed, 'utf8');

  const checked = checkProject(root);
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.deepAnalysis.analysis, {
    status: 'complete',
    coveredFiles: Number(completed.match(/scopeIncludedFiles: (\d+)/u)?.[1]),
    totalFiles: Number(completed.match(/scopeIncludedFiles: (\d+)/u)?.[1]),
    updatedAt: '2026-08-05T00:00:00.000Z',
    complete: true,
  });

  fs.writeFileSync(frontendPath, completed.replace(/- 技术栈：[^\n]+/u, '- 技术栈：未识别。'), 'utf8');
  const upgraded = runUpdate({ target: root, write: true });
  assert.equal(upgraded.ok, true);
  const preserved = fs.readFileSync(frontendPath, 'utf8');
  assert.match(preserved, /analysisStatus: "complete"/);
  assert.match(preserved, /analysisUpdatedAt: "2026-08-05T00:00:00.000Z"/);
  assert.match(preserved, /资料请求经/);
  assert.doesNotMatch(preserved, /技术栈：未识别/u);

  fs.writeFileSync(
    frontendPath,
    completed
      .replace('### 项目运行与交付边界', '### 项目自定义启动边界')
      .replace('### 功能与依赖链路', '### 页面调用关系'),
    'utf8',
  );
  assert.equal(checkProject(root).ok, true);

  fs.writeFileSync(
    frontendPath,
    completed
      .replace('analysisStatus: "complete"', 'analysisStatus: "partial"')
      .replace(/analysisCoveredFiles: \d+/u, 'analysisCoveredFiles: 1'),
    'utf8',
  );
  const partial = checkProject(root);
  assert.equal(partial.ok, true);
  assert.equal(partial.deepAnalysis.analysis.complete, false);
  assert.match(partial.warnings.join('\n'), /仅覆盖 1\//u);

  fs.writeFileSync(frontendPath, completed.replace(/analysisCoveredFiles: \d+/u, 'analysisCoveredFiles: 0'), 'utf8');
  const invalid = checkProject(root);
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join('\n'), /覆盖数必须等于纳入文件数/u);

  const verificationMarker = '<!-- frontend-ai-workflow:analysis-dimension:verification-risks -->';
  fs.writeFileSync(frontendPath, `${completed.replace(verificationMarker, '')}\n${verificationMarker}\n`, 'utf8');
  const incompleteStructure = checkProject(root);
  assert.equal(incompleteStructure.ok, false);
  assert.match(incompleteStructure.errors.join('\n'), /验证基线与高风险区域（标记数：0）/u);

  fs.writeFileSync(frontendPath, completed, 'utf8');
  const refreshed = runBootstrap({ target: root, deep: true, write: true });
  assert.equal(refreshed.ok, true);
  const pending = fs.readFileSync(frontendPath, 'utf8');
  assert.match(pending, /analysisStatus: "pending"/);
  assert.match(pending, /analysisCoveredFiles: 0/);
  assert.match(pending, /资料请求经/);
  assert.match(checkProject(root).warnings.join('\n'), /项目地图仍待生成/u);
});

test('深度初始化不覆盖没有受管标记的 Wayfinder', (t) => {
  const root = createVueFixture(t);
  const frontendPath = path.join(root, 'wayfinder', 'frontend.md');
  writeFixtureFile(root, 'wayfinder/frontend.md', '# 项目自定义导航\n');

  const result = runBootstrap({ target: root, deep: true, write: true });
  assert.equal(result.ok, false);
  assert.equal(result.actions.find((item) => item.file === 'wayfinder/frontend.md').action, 'conflict');
  assert.equal(fs.readFileSync(frontendPath, 'utf8'), '# 项目自定义导航\n');
});

test('旧布局必须显式迁移并保留项目事实与硬约束', (t) => {
  const root = createVueFixture(t);
  runBootstrap({ target: root, deep: true, write: true });
  const agentsPath = path.join(root, 'AGENTS.md');
  fs.writeFileSync(agentsPath, fs.readFileSync(agentsPath, 'utf8').replace(
    '完成深度扫描后，AI 在本区块写入 4–8 条项目专属的高影响硬约束。每条均须简洁、可执行，并附源码证据路径；只记录已确认的请求边界、鉴权/安全状态、路由或构建边界、验证基线等“不可随意破坏”的事实，不把推断和待确认项写成约束。',
    '- **请求边界**：页面不得绕过 `src/serve` 直接调用请求层。',
  ));
  writeLegacyWorkflow(root);

  const legacy = checkProject(root);
  assert.equal(legacy.ok, true);
  assert.equal(legacy.layout, 'legacy');
  assert.equal(legacy.migrationRequired, true);
  const preview = runWayfinderMigration({ target: root });
  assert.equal(preview.ok, true);
  assert.equal(fs.existsSync(path.join(root, 'wayfinder', 'frontend.md')), false);
  assert.equal(preview.actions.some((item) => item.file === 'docs/ai-context/frontend.md' && item.action === 'delete'), true);

  const updated = runUpdate({ target: root, write: true });
  assert.equal(updated.migrationRequired, true);
  assert.equal(fs.existsSync(path.join(root, 'wayfinder', 'frontend.md')), false);
  const migrated = runWayfinderMigration({ target: root, write: true });
  assert.equal(migrated.ok, true);
  const wayfinder = fs.readFileSync(path.join(root, 'wayfinder', 'frontend.md'), 'utf8');
  assert.match(wayfinder, /项目维护者说明：迁移后必须保留。/);
  assert.match(wayfinder, /analysisStatus: "pending"/);
  assert.match(wayfinder, /analysisCoveredFiles: 0/);
  assert.match(fs.readFileSync(agentsPath, 'utf8'), /页面不得绕过/);
  assert.equal(fs.existsSync(path.join(root, 'docs', 'ai-context', 'frontend.md')), false);
  assert.equal(fs.existsSync(path.join(root, '.ai-workflow.yaml')), false);
  assert.equal(fs.existsSync(path.join(root, 'requirements', '_template.md')), false);
  assert.equal(checkProject(root).layout, 'wayfinder');
  const repeated = runWayfinderMigration({ target: root });
  assert.equal(repeated.ok, false);
  assert.equal(repeated.actions[0].reason, '目标不是可迁移的旧工作流布局');
});

test('Wayfinder 迁移保留用户自定义的旧元数据与需求模板', (t) => {
  const root = createVueFixture(t);
  runBootstrap({ target: root, deep: true, write: true });
  writeLegacyWorkflow(root, { customMetadata: 'releaseChannel: "uat"\n', requirementTemplate: '# 项目专属需求模板\n' });

  const preview = runWayfinderMigration({ target: root });
  assert.equal(preview.ok, true);
  assert.equal(preview.actions.some((item) => item.file === '.ai-workflow.yaml' && item.action === 'keep'), true);
  assert.equal(preview.actions.some((item) => item.file === 'requirements/_template.md' && item.action === 'keep'), true);
  runWayfinderMigration({ target: root, write: true });
  assert.equal(fs.existsSync(path.join(root, '.ai-workflow.yaml')), true);
  assert.equal(fs.existsSync(path.join(root, 'requirements', '_template.md')), true);
});

test('深度项目约束会被升级保留且健康检查要求有效标记', (t) => {
  const root = createVueFixture(t);
  runBootstrap({ target: root, deep: true, write: true });
  const agentsPath = path.join(root, 'AGENTS.md');
  const customized = fs.readFileSync(agentsPath, 'utf8').replace(
    '完成深度扫描后，AI 在本区块写入 4–8 条项目专属的高影响硬约束。每条均须简洁、可执行，并附源码证据路径；只记录已确认的请求边界、鉴权/安全状态、路由或构建边界、验证基线等“不可随意破坏”的事实，不把推断和待确认项写成约束。',
    '- **请求边界**：页面不得绕过 `src/serve` 直接调用请求层（证据：`src/serve/profile.js`）。',
  );
  fs.writeFileSync(agentsPath, customized, 'utf8');
  const updated = runUpdate({ target: root, write: true });
  assert.equal(updated.ok, true);
  assert.match(fs.readFileSync(agentsPath, 'utf8'), /页面不得绕过/);
  const malformed = fs.readFileSync(agentsPath, 'utf8').replace(/<!-- frontend-ai-workflow:deep-guardrails:end -->/, '');
  fs.writeFileSync(agentsPath, malformed, 'utf8');
  const checked = checkProject(root);
  assert.equal(checked.ok, false);
  assert.match(checked.errors.join('\n'), /deep-guardrails/);
});

test('深度扫描规则要求覆盖、证据与不确定性披露', () => {
  const reference = fs.readFileSync(path.join(pluginRoot, 'references', 'deep-project-analysis.md'), 'utf8');
  const skill = fs.readFileSync(path.join(pluginRoot, 'skills', 'frontend-workflow-bootstrap', 'SKILL.md'), 'utf8');
  const checkSkill = fs.readFileSync(path.join(pluginRoot, 'skills', 'frontend-workflow-check', 'SKILL.md'), 'utf8');

  assert.match(reference, /每个纳入文件分批读取/);
  assert.match(reference, /扫描报告/);
  assert.match(reference, /frontend\.md/);
  assert.match(reference, /已确认事实/);
  assert.match(reference, /待确认项/);
  assert.match(reference, /validationEvidence/);
  assert.match(reference, /不得写“没有解析错误”/);
  assert.match(reference, /观察数组为空.*不表示源码已经通过/u);
  assert.match(reference, /analysisStatus: complete/);
  assert.match(reference, /数据、状态与安全边界/);
  assert.match(reference, /Service Worker/);
  assert.match(reference, /Feature Flag/);
  assert.match(skill, /includedFiles/);
  assert.match(skill, /validationEvidence/);
  assert.match(skill, /do not prove syntax parsing, platform compilation, Lint or tests/);
  assert.match(skill, /never upgrade a heuristic observation/);
  assert.match(checkSkill, /deepAnalysis\.validationEvidence/);
  assert.match(checkSkill, /not as a confirmed WXML syntax or platform compilation failure/);
  assert.match(skill, /Never create `project-scan\.md`/);
  assert.match(skill, /do not describe the result as complete/);
  assert.match(skill, /analysisCoveredFiles/);
  assert.match(checkSkill, /deepAnalysis\.analysis\.status/);
});

test('需求模板仅作为插件资产按需使用', () => {
  const skill = fs.readFileSync(path.join(pluginRoot, 'skills', 'frontend-requirement-write', 'SKILL.md'), 'utf8');
  const template = path.join(pluginRoot, 'assets', 'templates', 'requirements', '_template.md');

  assert.equal(fs.existsSync(template), true);
  assert.match(skill, /when present; otherwise use/);
  assert.match(skill, /requirements\/REQ-\*\.md/);
});

test('变更验证规则优先选择当前需求影响面的测试', () => {
  const skill = fs.readFileSync(path.join(pluginRoot, 'skills', 'frontend-change', 'SKILL.md'), 'utf8');

  assert.match(skill, /affected files and chains/);
  assert.match(skill, /narrowest existing tests/);
  assert.match(skill, /matching manual checks/);
  assert.match(skill, /full project test command only/);
});

test('[TC-10] 跨平台高风险变更规则合同', () => {
  const repositoryRules = fs.readFileSync('AGENTS.md', 'utf8');
  const agentsTemplate = fs.readFileSync(path.join(pluginRoot, 'assets', 'templates', 'AGENTS.md'), 'utf8');
  const changeSkill = fs.readFileSync(path.join(pluginRoot, 'skills', 'frontend-change', 'SKILL.md'), 'utf8');
  const checklist = fs.readFileSync(path.join(pluginRoot, 'references', 'cross-platform-ci-checklist.md'), 'utf8');
  const structureValidator = fs.readFileSync(path.join(pluginRoot, 'scripts', 'validate-structure.mjs'), 'utf8');

  assert.match(repositoryRules, /跨平台高风险/u);
  assert.match(repositoryRules, /cross-platform-ci-checklist\.md/u);
  assert.match(repositoryRules, /CI.*路径.*临时目录.*子进程.*包管理器入口.*环境变量.*机器可读诊断/su);
  assert.match(repositoryRules, /code.*target.*status/su);
  assert.match(repositoryRules, /聚焦测试.*本地统一验证.*真实五平台 CI/su);

  for (const rules of [agentsTemplate]) {
    assert.match(rules, /跨平台高风险/);
    assert.match(rules, /CI.*路径.*临时目录.*子进程.*包管理器入口.*环境变量.*机器可读诊断/su);
    assert.match(rules, /code.*target.*status/su);
    assert.match(rules, /Git.*子进程.*cwd.*realpath.*path\.join/su);
    assert.match(rules, /实际值和期望值.*同一规范化函数/su);
    assert.match(rules, /禁止直接比较原始字符串/u);
    assert.match(rules, /process\.platform/u);
    assert.match(rules, /path\.win32.*path\.posix/su);
    assert.match(rules, /D:\/\.\.\..*D:\\\\.\.\./su);
  }

  assert.match(changeSkill, /cross-platform-ci-checklist\.md/u);
  assert.match(changeSkill, /cross-platform risk/u);
  assert.match(changeSkill, /actual CI-matrix evidence/u);
  assert.match(checklist, /GIT_CEILING_DIRECTORIES/u);
  assert.match(checklist, /npm\.cmd/u);
  assert.match(checklist, /POSIX.*Windows/su);
  assert.match(checklist, /实际值和期望值.*同一个规范化函数/su);
  assert.match(checklist, /一侧规范化、一侧保留原值/u);
  assert.match(checklist, /path\.win32.*path\.posix/su);
  assert.match(checklist, /D:\/workspace.*D:\\\\workspace/su);
  assert.match(checklist, /code.*target.*status/su);
  assert.match(checklist, /本地.*真实 CI 矩阵/su);
  assert.match(checklist, /精确提交 SHA/u);
  assert.match(structureValidator, /references\/cross-platform-ci-checklist\.md/u);

  const gitWindowsPath = 'D:/workspace/project';
  const nodeWindowsPath = path.win32.join('D:\\', 'workspace', 'project');
  assert.equal(normalizeMachinePath(gitWindowsPath), normalizeMachinePath(nodeWindowsPath));
  assert.equal(path.win32.normalize('D:/workspace/project'), path.win32.normalize(nodeWindowsPath));
  assert.equal(path.posix.normalize('/workspace/./project'), '/workspace/project');
});

test('[TC-07] 活动 Markdown 禁止裸 D/A 引用标签', () => {
  const content = [
    '裸标签 [D-01] 和 [A-01] 必须被定位。',
    '反引号代码 `[D-02]` 不应被定位。',
    '[A-02](https://example.test/acceptance) 与 [D-03]: https://example.test/decision 是有效链接。',
    '[A-03][decision-reference] 是有效的引用链接形式。',
    '```md',
    '[D-04] 位于代码块中。',
    '```',
  ].join('\n');
  assert.deepEqual(findBareDecisionAcceptanceLabels(content), [
    { label: 'D-01', line: 1 },
    { label: 'A-01', line: 1 },
  ]);

  const repositoryRoot = path.resolve(pluginRoot, '..', '..');
  assert.deepEqual(validateManagedMarkdownReferenceLabels(repositoryRoot), []);
});
