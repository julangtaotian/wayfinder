import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { runPlaywrightAdapter } from '../plugins/frontend-ai-workflow/scripts/playwright-adapter-runner.mjs';
import {
  BUNDLED_PLAYWRIGHT_VERSION,
  inspectBundledPlaywright,
  smokeTestBundledPlaywright,
  verifyPlaywrightIntegrity,
} from '../plugins/frontend-ai-workflow/scripts/playwright-runtime.mjs';
import {
  completeRepairRun,
  completeReviewRun,
  completeVerifyRun,
  createCapturePlan,
  createReviewRun,
  createVerifyRun,
  evaluateRepairGate,
  loadUiReviewConfig,
  normalizeUiReviewConfig,
  resolveSafeProjectPath,
  writeRunState,
} from '../plugins/frontend-ai-workflow/scripts/ui-review-workflow.mjs';

const workflowScript = path.resolve('plugins/frontend-ai-workflow/scripts/ui-review-workflow.mjs');

function configInput(overrides = {}) {
  return {
    schemaVersion: 1,
    artifactsRoot: '.frontend-ui-review/runs',
    scenarios: [
      {
        id: 'home-desktop',
        url: 'http://127.0.0.1:5173/',
        capture: 'browser',
        viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
        design: { type: 'image', path: 'design/home.png' },
        targets: [{ selector: 'main', nodeMeaning: '页面主要内容', sourcePath: 'src/main.css' }],
        interactions: ['等待页面稳定'],
      },
    ],
    ...overrides,
  };
}

function createProject(context, overrides = {}) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-ui-review-'));
  context.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(projectRoot, 'design'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, '.frontend-ui-review'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'design', 'home.png'), 'design-v1');
  fs.writeFileSync(path.join(projectRoot, 'src', 'main.css'), 'main { color: blue; }\n');
  fs.writeFileSync(path.join(projectRoot, 'package.json'), `${JSON.stringify({ name: 'ui-adapter-fixture', private: true }, null, 2)}\n`);
  fs.writeFileSync(
    path.join(projectRoot, '.frontend-ui-review', 'config.json'),
    `${JSON.stringify(configInput(overrides), null, 2)}\n`,
  );
  return projectRoot;
}

function finding(overrides = {}) {
  return {
    id: 'UI-001',
    confidence: 'high',
    selector: 'main',
    type: '颜色',
    targetValue: '#ff6014',
    sourceTarget: {
      file: 'src/main.css',
      anchor: 'main {',
      styleSource: '页面主样式',
    },
    changeScope: '只修改 main 的 color 声明',
    forbiddenChanges: '不要修改其他选择器和业务逻辑',
    verification: {
      workingDirectory: 'src',
      commands: ['npm test'],
      page: '/',
      assertions: ['main 计算颜色为目标值'],
    },
    ...overrides,
  };
}

test('配置默认建议模式，并根据设计内容生成稳定场景指纹', (context) => {
  const projectRoot = createProject(context);
  const first = loadUiReviewConfig(projectRoot);
  const second = loadUiReviewConfig(projectRoot);
  assert.equal(first.autoFix, 'suggest');
  assert.equal(first.scenarios[0].fingerprint, second.scenarios[0].fingerprint);

  fs.writeFileSync(path.join(projectRoot, 'design', 'home.png'), 'design-v2');
  const changed = loadUiReviewConfig(projectRoot);
  assert.notEqual(first.scenarios[0].fingerprint, changed.scenarios[0].fingerprint);
});

test('配置拒绝危险路径、重复场景、无效视口和空目标节点', (context) => {
  const projectRoot = createProject(context);
  assert.throws(
    () => normalizeUiReviewConfig(configInput({ artifactsRoot: '../runs' }), projectRoot),
    /不能包含空路径段、\. 或 \.\./u,
  );
  assert.throws(
    () => normalizeUiReviewConfig(configInput({ scenarios: [configInput().scenarios[0], configInput().scenarios[0]] }), projectRoot),
    /场景 ID 重复/u,
  );
  assert.throws(
    () => normalizeUiReviewConfig(configInput({ scenarios: [{ ...configInput().scenarios[0], viewport: { width: 100, height: 900 } }] }), projectRoot),
    /width/u,
  );
  assert.throws(
    () => normalizeUiReviewConfig(configInput({ scenarios: [{ ...configInput().scenarios[0], targets: [] }] }), projectRoot),
    /至少要包含一个目标节点/u,
  );

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-ui-review-outside-'));
  context.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(projectRoot, 'escaped'));
  assert.throws(() => resolveSafeProjectPath(projectRoot, 'escaped/run', '测试路径'), /符号链接越出/u);
});

test('验收、授权和修复状态只在完整门禁后迁移', (context) => {
  const projectRoot = createProject(context);
  const config = loadUiReviewConfig(projectRoot);
  const review = createReviewRun(config, 'home-desktop', { runId: 'build-101', now: '2026-08-06T10:00:00+08:00' });
  const completed = completeReviewRun(review, { findings: [finding()] });
  assert.equal(completed.status, 'needs-fix');
  assert.equal(evaluateRepairGate(completed, config).decision, 'suggest');
  assert.equal(evaluateRepairGate(completed, config, { explicitApproval: true }).decision, 'apply');
  assert.equal(evaluateRepairGate(completed, { ...config, autoFix: 'off' }, { explicitApproval: true }).decision, 'blocked');

  const repaired = completeRepairRun(completed, ['UI-001']);
  assert.equal(repaired.stage, 'repair');
  assert.equal(repaired.status, 'ready-to-verify');
  assert.throws(() => completeRepairRun(completed, ['UI-999']), /未知问题/u);
  assert.throws(
    () => completeReviewRun(review, { findings: [finding({ verification: { ...finding().verification, assertions: [] } })] }),
    /至少要包含一条断言/u,
  );
});

test('零问题只形成有限范围通过，低置信度和细小几何偏差不进入状态', (context) => {
  const projectRoot = createProject(context);
  const config = loadUiReviewConfig(projectRoot);
  const review = createReviewRun(config, 'home-desktop', { runId: 'build-102' });
  const completed = completeReviewRun(review, {
    findings: [
      finding({ confidence: 'medium' }),
      finding({ id: 'UI-002', type: '间距', differencePx: 1 }),
    ],
  });
  assert.equal(completed.status, 'passed');
  assert.deepEqual(completed.findings, []);
  assert.throws(
    () => completeReviewRun(review, { analysisPending: true, findings: [] }),
    /待视觉分析/u,
  );
});

test('内置 Playwright 固定版本、完整性、平台和 Chromium 启动均有效', async () => {
  const runtime = inspectBundledPlaywright();
  assert.equal(runtime.valid, true, runtime.reason);
  assert.equal(runtime.version, BUNDLED_PLAYWRIGHT_VERSION);
  assert.equal(runtime.source, 'bundled');
  assert.equal(runtime.browser, 'chromium-headless-shell');
  assert.equal(runtime.integrity.ok, true);
  assert.equal(verifyPlaywrightIntegrity().ok, true);

  const mismatch = inspectBundledPlaywright({
    platform: 'linux',
    arch: 'x64',
    verifyIntegrity: false,
    useCache: false,
  });
  assert.equal(mismatch.available, false);
  assert.match(mismatch.reason, /当前环境是 linux-x64/u);

  const smoke = await smokeTestBundledPlaywright();
  assert.equal(smoke.ok, true);
  if (runtime.available) {
    assert.equal(smoke.skipped, false);
    assert.equal(smoke.screenshotBytes > 100, true);
  } else {
    assert.equal(smoke.skipped, true);
  }
});

test('运行状态原子写入且拒绝覆盖和未知文件', (context) => {
  const projectRoot = createProject(context);
  const config = loadUiReviewConfig(projectRoot);
  const review = createReviewRun(config, 'home-desktop', { runId: 'build-103' });
  const statePath = writeRunState(projectRoot, review);
  assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).runId, 'build-103');
  assert.throws(() => writeRunState(projectRoot, review), /拒绝覆盖/u);

  fs.writeFileSync(path.join(path.dirname(statePath), 'unknown.txt'), 'user file');
  assert.throws(() => writeRunState(projectRoot, review, { allowExistingState: true }), /未知内容/u);
  assert.equal(fs.readFileSync(path.join(path.dirname(statePath), 'unknown.txt'), 'utf8'), 'user file');
});

test('复验按稳定问题指纹区分关闭、未解决与新增问题', (context) => {
  const projectRoot = createProject(context);
  const config = loadUiReviewConfig(projectRoot);
  const review = createReviewRun(config, 'home-desktop', { runId: 'build-104' });
  const baseline = completeRepairRun(completeReviewRun(review, { findings: [finding()] }), ['UI-001']);

  const passedRun = createVerifyRun(config, baseline, { runId: 'build-105' });
  const passed = completeVerifyRun(passedRun, baseline, { findings: [] });
  assert.equal(passed.status, 'passed');
  assert.equal(passed.verification.resolved.length, 1);

  const failedRun = createVerifyRun(config, baseline, { runId: 'build-106' });
  const failed = completeVerifyRun(failedRun, baseline, {
    findings: [
      finding(),
      finding({ id: 'UI-002', selector: 'main .title', type: '字号', targetValue: '16px', sourceTarget: { ...finding().sourceTarget, anchor: '.title {' } }),
    ],
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.verification.remaining.length, 1);
  assert.equal(failed.verification.new.length, 1);
});

test('复验拒绝配置上下文变化，CLI 默认预览且显式写入', (context) => {
  const projectRoot = createProject(context);
  const config = loadUiReviewConfig(projectRoot);
  const baseline = completeReviewRun(
    createReviewRun(config, 'home-desktop', { runId: 'build-107' }),
    { findings: [finding()] },
  );
  const changedConfig = {
    ...config,
    scenarios: [{ ...config.scenarios[0], fingerprint: '0'.repeat(64) }],
  };
  assert.throws(() => createVerifyRun(changedConfig, baseline, { runId: 'build-108' }), /重新开始独立验收/u);

  const preview = spawnSync(
    process.execPath,
    [workflowScript, 'start-review', '--target', projectRoot, '--scenario', 'home-desktop', '--run-id', 'cli-1'],
    { encoding: 'utf8' },
  );
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).write, false);
  assert.equal(fs.existsSync(path.join(projectRoot, '.frontend-ui-review', 'runs', 'cli-1')), false);

  const written = spawnSync(
    process.execPath,
    [workflowScript, 'start-review', '--target', projectRoot, '--scenario', 'home-desktop', '--run-id', 'cli-1', '--write'],
    { encoding: 'utf8' },
  );
  assert.equal(written.status, 0, written.stderr);
  assert.equal(JSON.parse(written.stdout).write, true);
  assert.equal(fs.existsSync(path.join(projectRoot, '.frontend-ui-review', 'runs', 'cli-1', 'home-desktop', 'state.json')), true);
});

test('采集计划优先项目 Playwright，并显式提供 Browser 视觉兜底', (context) => {
  const projectRoot = createProject(context, {
    scenarios: [
      {
        ...configInput().scenarios[0],
        capture: 'project-playwright',
        captureFallback: 'browser',
        projectPlaywright: {
          command: [
            'npm',
            'run',
            'ui:review',
            '--',
            '--scenario',
            '{scenarioId}',
            '--actual',
            '{actualScreenshot}',
            '--result',
            '{reviewInput}',
          ],
          resultPath: '{reviewInput}',
        },
      },
    ],
  });
  const config = loadUiReviewConfig(projectRoot);
  const plan = createCapturePlan(config, 'home-desktop', { runId: 'portable-1' });

  assert.equal(plan.primary, 'project-playwright');
  assert.equal(plan.fallback, 'browser');
  assert.deepEqual(plan.order, ['project-playwright', 'browser']);
  assert.equal(plan.projectPlaywright.portable, true);
  assert.equal(plan.projectPlaywright.source, 'project-command');
  assert.equal(plan.projectPlaywright.runtime, null);
  assert.equal(plan.projectPlaywright.command.includes('home-desktop'), true);
  assert.equal(plan.projectPlaywright.command.includes(plan.artifacts.actualScreenshot), true);
  assert.equal(plan.projectPlaywright.resultPath, plan.artifacts.reviewInput);
  assert.deepEqual(plan.browser, { declared: true, role: 'fallback' });

  const fallbackRun = createReviewRun(config, 'home-desktop', {
    runId: 'portable-fallback',
    capture: 'browser',
  });
  assert.equal(fallbackRun.capture, 'browser');
  assert.throws(
    () => createReviewRun(config, 'home-desktop', { runId: 'portable-invalid', capture: 'other' }),
    /未在场景采集计划中声明/u,
  );
});

test('内置 Playwright 适配器生成零安装采集计划并注入真实浏览器 API', async (context) => {
  const projectRoot = createProject(context, {
    scenarios: [{
      ...configInput().scenarios[0],
      interactions: [],
      capture: 'project-playwright',
      captureFallback: 'browser',
      projectPlaywright: {
        adapter: '.frontend-ui-review/playwright-adapter.mjs',
        resultPath: '{reviewInput}',
      },
    }],
  });
  fs.writeFileSync(
    path.join(projectRoot, '.frontend-ui-review', 'playwright-adapter.mjs'),
    `export default async function ({ playwright, project, scenario, artifacts }) {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: scenario.viewport.width, height: scenario.viewport.height }, deviceScaleFactor: scenario.viewport.deviceScaleFactor });
    const page = await context.newPage();
    await page.setContent('<main>fixture</main>');
    const rect = await page.locator('main').boundingBox();
    await page.screenshot({ path: artifacts.actualScreenshot });
    return {
      analysisPending: false,
      project: { name: project.name, runtime: 'bundled', page: scenario.url, designBasis: scenario.design.path, scope: ['main'] },
      viewport: { width: scenario.viewport.width, height: scenario.viewport.height, dpr: scenario.viewport.deviceScaleFactor, scale: 1 },
      checkedNodes: [{ selector: 'main', componentPath: 'src/main.css', nodeText: 'fixture', nodeMeaning: '页面主要内容', rect }],
      findings: []
    };
  } finally {
    await browser.close();
  }
}
`,
  );
  const config = loadUiReviewConfig(projectRoot);
  const plan = createCapturePlan(config, 'home-desktop', { runId: 'bundled-adapter' });
  assert.equal(plan.projectPlaywright.source, 'bundled-adapter');
  const runtime = inspectBundledPlaywright();
  assert.equal(plan.projectPlaywright.portable, runtime.available, plan.projectPlaywright.unavailableReason);
  assert.equal(plan.projectPlaywright.runtime.version, BUNDLED_PLAYWRIGHT_VERSION);
  assert.equal(plan.projectPlaywright.runtime.integrityOk, true);
  if (!runtime.available) {
    assert.equal(plan.projectPlaywright.command, null);
    assert.match(plan.projectPlaywright.unavailableReason, /当前环境/u);
    return;
  }
  assert.equal(plan.projectPlaywright.command[0], process.execPath);
  assert.match(plan.projectPlaywright.command[1], /playwright-adapter-runner\.mjs$/u);
  assert.equal(plan.projectPlaywright.command.includes('npm'), false);

  writeRunState(projectRoot, createReviewRun(config, 'home-desktop', { runId: 'bundled-adapter' }));
  const result = await runPlaywrightAdapter({ target: projectRoot, scenarioId: 'home-desktop', runId: 'bundled-adapter' });
  assert.equal(result.ok, true);
  assert.equal(result.analysisPending, false);
  assert.equal(fs.existsSync(path.join(projectRoot, plan.artifacts.actualScreenshot)), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(projectRoot, plan.artifacts.reviewInput), 'utf8')).findings.length, 0);
  const targetManifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  assert.equal(targetManifest.dependencies, undefined);
  assert.equal(targetManifest.devDependencies, undefined);
});

test('老配置保持单采集器行为，未声明命令的 Playwright 计划标记为不可移植', (context) => {
  const browserProject = createProject(context);
  const browserConfig = loadUiReviewConfig(browserProject);
  const browserPlan = createCapturePlan(browserConfig, 'home-desktop', { runId: 'legacy-browser' });
  assert.deepEqual(browserPlan.order, ['browser']);
  assert.equal(browserPlan.fallback, null);
  assert.equal(createReviewRun(browserConfig, 'home-desktop', { runId: 'legacy-run' }).capture, 'browser');

  const playwrightProject = createProject(context, {
    scenarios: [{ ...configInput().scenarios[0], capture: 'project-playwright' }],
  });
  const playwrightConfig = loadUiReviewConfig(playwrightProject);
  const playwrightPlan = createCapturePlan(playwrightConfig, 'home-desktop', { runId: 'legacy-playwright' });
  assert.deepEqual(playwrightPlan.order, ['project-playwright']);
  assert.equal(playwrightPlan.projectPlaywright.portable, false);
  assert.equal(playwrightPlan.browser.declared, false);
});

test('采集计划拒绝重复兜底、非法命令、越界结果和未知占位符', (context) => {
  const projectRoot = createProject(context);
  const baseScenario = configInput().scenarios[0];
  assert.throws(
    () => normalizeUiReviewConfig(configInput({
      scenarios: [{ ...baseScenario, captureFallback: 'browser' }],
    }), projectRoot),
    /不能与主采集器相同/u,
  );
  assert.throws(
    () => normalizeUiReviewConfig(configInput({
      scenarios: [{
        ...baseScenario,
        capture: 'project-playwright',
        projectPlaywright: { command: [], resultPath: 'result.json' },
      }],
    }), projectRoot),
    /至少要包含一个命令参数/u,
  );
  assert.throws(
    () => normalizeUiReviewConfig(configInput({
      scenarios: [{
        ...baseScenario,
        capture: 'project-playwright',
        projectPlaywright: { command: ['npm', 'test'], resultPath: '../result.json' },
      }],
    }), projectRoot),
    /不能包含空路径段、\. 或 \.\./u,
  );
  assert.throws(
    () => normalizeUiReviewConfig(configInput({
      scenarios: [{
        ...baseScenario,
        capture: 'project-playwright',
        projectPlaywright: { command: ['npm', '{unknown}'], resultPath: 'result.json' },
      }],
    }), projectRoot),
    /不支持的占位符/u,
  );
  fs.writeFileSync(path.join(projectRoot, '.frontend-ui-review', 'adapter.mjs'), 'export default async function () {}\n');
  assert.throws(
    () => normalizeUiReviewConfig(configInput({
      scenarios: [{
        ...baseScenario,
        capture: 'project-playwright',
        projectPlaywright: {
          adapter: '.frontend-ui-review/adapter.mjs',
          command: ['npm', 'test'],
          resultPath: 'result.json',
        },
      }],
    }), projectRoot),
    /不能同时声明/u,
  );
  assert.throws(
    () => normalizeUiReviewConfig(configInput({
      scenarios: [{
        ...baseScenario,
        capture: 'project-playwright',
        projectPlaywright: {
          adapter: '.frontend-ui-review/missing.mjs',
          resultPath: 'result.json',
        },
      }],
    }), projectRoot),
    /不存在/u,
  );
});

test('复验继承首次实际采集器，并拒绝采集器切换', (context) => {
  const projectRoot = createProject(context, {
    scenarios: [{
      ...configInput().scenarios[0],
      capture: 'project-playwright',
      captureFallback: 'browser',
    }],
  });
  const config = loadUiReviewConfig(projectRoot);
  const review = createReviewRun(config, 'home-desktop', {
    runId: 'fallback-review',
    capture: 'browser',
  });
  const baseline = completeRepairRun(completeReviewRun(review, { findings: [finding()] }), ['UI-001']);
  const verify = createVerifyRun(config, baseline, { runId: 'fallback-verify' });
  assert.equal(verify.capture, 'browser');
  assert.throws(
    () => completeVerifyRun({ ...verify, capture: 'project-playwright' }, baseline, { findings: [] }),
    /复验运行与基线运行不匹配/u,
  );

  const changedConfig = {
    ...config,
    scenarios: [{
      ...config.scenarios[0],
      capturePlan: {
        ...config.scenarios[0].capturePlan,
        fallback: null,
        order: ['project-playwright'],
      },
    }],
  };
  assert.throws(
    () => createVerifyRun(changedConfig, baseline, { runId: 'fallback-removed' }),
    /重新开始独立验收/u,
  );
});

test('capture-plan CLI 输出跨工具可消费计划，start-review 显式记录兜底采集器', (context) => {
  const projectRoot = createProject(context, {
    scenarios: [{
      ...configInput().scenarios[0],
      capture: 'project-playwright',
      captureFallback: 'browser',
      projectPlaywright: {
        command: ['npm', 'run', 'ui:review', '--', '--output', '{runDirectory}'],
        resultPath: '{reviewInput}',
      },
    }],
  });
  const planResult = spawnSync(
    process.execPath,
    [workflowScript, 'capture-plan', '--target', projectRoot, '--scenario', 'home-desktop', '--run-id', 'cli-plan'],
    { encoding: 'utf8' },
  );
  assert.equal(planResult.status, 0, planResult.stderr);
  const planOutput = JSON.parse(planResult.stdout);
  assert.equal(planOutput.write, false);
  assert.equal(planOutput.plan.projectPlaywright.portable, true);
  assert.equal(planOutput.plan.projectPlaywright.command.at(-1), planOutput.plan.artifacts.runDirectory);

  const fallbackResult = spawnSync(
    process.execPath,
    [
      workflowScript,
      'start-review',
      '--target',
      projectRoot,
      '--scenario',
      'home-desktop',
      '--run-id',
      'cli-fallback',
      '--capture',
      'browser',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(fallbackResult.status, 0, fallbackResult.stderr);
  assert.equal(JSON.parse(fallbackResult.stdout).state.capture, 'browser');
});

test('三个 Skill 的职责、显式修复门禁和共享合同随插件发布', () => {
  const pluginRoot = path.resolve('plugins/frontend-ai-workflow');
  const reviewSkill = fs.readFileSync(path.join(pluginRoot, 'skills/frontend-ui-review/SKILL.md'), 'utf8');
  const fixSkill = fs.readFileSync(path.join(pluginRoot, 'skills/frontend-ui-fix/SKILL.md'), 'utf8');
  const verifySkill = fs.readFileSync(path.join(pluginRoot, 'skills/frontend-ui-verify/SKILL.md'), 'utf8');
  const fixMetadata = fs.readFileSync(path.join(pluginRoot, 'skills/frontend-ui-fix/agents/openai.yaml'), 'utf8');
  const sharedReference = fs.readFileSync(path.join(pluginRoot, 'references/ui-review-workflow.md'), 'utf8');

  assert.match(reviewSkill, /不修改业务源码/u);
  assert.match(reviewSkill, /capture-plan/u);
  assert.match(reviewSkill, /project-playwright.*主路径/u);
  assert.match(reviewSkill, /新的运行 ID.*--capture browser/u);
  assert.match(fixSkill, /repair-gate/u);
  assert.match(fixSkill, /main.*master/u);
  assert.match(fixSkill, /Playwright.*Browser.*不得扩大/u);
  assert.match(fixMetadata, /allow_implicit_invocation: false/u);
  assert.match(verifySkill, /相同.*页面.*视口/u);
  assert.match(verifySkill, /不得切换/u);
  assert.match(sharedReference, /业务项目不安装 Playwright/u);
  assert.match(sharedReference, /Playwright 1\.62\.1/u);
  assert.match(sharedReference, /darwin-arm64/u);
  assert.match(reviewSkill, /bundled-adapter/u);
  assert.match(reviewSkill, /analysisPending/u);
  assert.match(sharedReference, /不隐含提交、推送、PR/u);
  assert.match(sharedReference, /captureFallback/u);
  assert.match(sharedReference, /跨 AI 工具/u);
});
