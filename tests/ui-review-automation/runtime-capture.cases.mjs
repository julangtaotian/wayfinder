import test from 'node:test';
import {
  assert,
  fs,
  http,
  path,
  runPlaywrightAdapter,
  BUNDLED_PLAYWRIGHT_VERSION,
  inspectBundledPlaywright,
  loadBundledPlaywright,
  resolvePlaywrightValidationTarget,
  smokeTestBundledPlaywright,
  verifyConfiguredPlaywrightIntegrity,
  verifyPlaywrightIntegrity,
  executeStructuredInteractions,
  runUiReview,
  createCapturePlan,
  createReviewRun,
  loadUiReviewConfig,
  normalizeUiReviewConfig,
  writeRunState,
  PNG,
  configInput,
  createProject,
} from './fixtures.mjs';

test('内置 Playwright 固定版本、完整性、平台和 Chromium 启动均有效', async () => {
  const runtime = inspectBundledPlaywright();
  assert.equal(runtime.valid, true, runtime.reason);
  assert.equal(runtime.version, BUNDLED_PLAYWRIGHT_VERSION);
  assert.equal(runtime.source, 'bundled');
  assert.equal(runtime.browser, 'chromium-headless-shell');
  assert.equal(runtime.integrity.ok, true);
  assert.equal(verifyPlaywrightIntegrity().ok, true);
  assert.equal(verifyConfiguredPlaywrightIntegrity().ok, true);

  // 完整克隆继续额外检查 linux-x64；CI 单平台克隆只检查矩阵目标。
  const expectedTarget = resolvePlaywrightValidationTarget();
  const expectedPlatformRuntime = inspectBundledPlaywright({
    platform: expectedTarget.platform,
    arch: expectedTarget.arch,
    useCache: false,
  });
  assert.equal(expectedPlatformRuntime.available, true, expectedPlatformRuntime.reason);
  assert.equal(expectedPlatformRuntime.platformKey, expectedTarget.platformKey);

  const smoke = await smokeTestBundledPlaywright();
  assert.equal(smoke.ok, true);
  assert.equal(smoke.skipped, false);
  assert.equal(smoke.screenshotBytes > 100, true);
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

test('版本 2 统一入口只执行摘要匹配的受信适配器', async (context) => {
  const projectRoot = createProject(context, {
    schemaVersion: 2,
    scenarios: [{
      ...configInput().scenarios[0],
      capture: 'project-playwright',
      captureFallback: 'browser',
      projectPlaywright: {
        adapter: '.frontend-ui-review/playwright-adapter.mjs',
        resultPath: '{reviewInput}',
      },
      interactions: [],
      comparison: {
        scope: 'structure',
        mode: 'dom',
        dom: [{ selector: 'main', property: 'text', expected: '完成', exact: true }],
      },
    }],
  });
  const adapterPath = path.join(projectRoot, '.frontend-ui-review', 'playwright-adapter.mjs');
  fs.copyFileSync(
    path.resolve('plugins/frontend-ai-workflow/assets/templates/ui-review/playwright-adapter.mjs'),
    adapterPath,
  );
  const trusted = loadUiReviewConfig(projectRoot);
  const trustedPlan = createCapturePlan(trusted, 'home-desktop', { runId: 'trusted-adapter' });
  assert.equal(trustedPlan.projectPlaywright.source, 'bundled-adapter');
  assert.equal(trustedPlan.projectPlaywright.portable, inspectBundledPlaywright().available);

  fs.writeFileSync(adapterPath, `throw new Error('自定义适配器不应执行');\nexport default async function () {}\n`);
  const changed = loadUiReviewConfig(projectRoot);
  const changedPlan = createCapturePlan(changed, 'home-desktop', { runId: 'changed-adapter' });
  assert.notEqual(changed.scenarios[0].fingerprint, trusted.scenarios[0].fingerprint);
  assert.equal(changedPlan.projectPlaywright.source, 'project-adapter');
  assert.equal(changedPlan.projectPlaywright.portable, false);
  const blockedPreview = await runUiReview({
    target: projectRoot,
    mode: 'review',
    scenarioId: 'home-desktop',
    runId: 'changed-adapter-preview',
  });
  assert.equal(blockedPreview.readyToWrite, false);
  assert.equal(blockedPreview.status, 'blocked');
  assert.equal(blockedPreview.exitCode, 3);
  assert.match(blockedPreview.error.message, /项目自有本地页面环境/u);
  assert.doesNotMatch(blockedPreview.error.message, /自定义适配器不应执行/u);
  assert.equal(fs.existsSync(path.join(projectRoot, '.frontend-ui-review', 'runs', 'changed-adapter-preview')), false);
  const blocked = await runUiReview({
    target: projectRoot,
    mode: 'review',
    scenarioId: 'home-desktop',
    runId: 'changed-adapter',
    write: true,
  });
  assert.equal(blocked.status, 'blocked');
  assert.match(blocked.error.message, /受信内置适配器/u);
  assert.doesNotMatch(blocked.error.message, /自定义适配器不应执行/u);
  assert.equal(fs.existsSync(path.join(projectRoot, '.frontend-ui-review', 'runs', 'changed-adapter')), false);
});

test('默认适配器在真实 Chromium 中完成弹窗、下拉、悬停和表单综合交互', async (context) => {
  const runtime = inspectBundledPlaywright();
  assert.equal(runtime.available, true, runtime.reason);
  const html = `<!doctype html>
<html><head><style>
body{font:16px sans-serif}.tooltip{display:none}.help:hover+.tooltip{display:block}
dialog[open]{display:block}dialog:not([open]){display:none}
</style></head><body><main>
<button class="help">帮助</button><span class="tooltip">填写后保存</span>
<button data-open-dialog>编辑资料</button><p data-status>尚未保存</p>
<dialog><h2>编辑资料</h2><input name="displayName"><select name="role"><option value="viewer">访客</option><option value="editor">编辑者</option></select><label><input name="notice" type="checkbox">通知我</label><p id="summary"></p><button data-save>保存</button></dialog>
</main><script>
const dialog=document.querySelector('dialog');const name=document.querySelector('[name=displayName]');const role=document.querySelector('[name=role]');
document.querySelector('[data-open-dialog]').onclick=()=>dialog.showModal();
const render=()=>document.querySelector('#summary').textContent=name.value+' / '+role.value;
name.oninput=render;role.onchange=render;dialog.onkeydown=(event)=>{if(event.key==='Escape'){event.preventDefault();dialog.close();}};
document.querySelector('[data-save]').onclick=()=>{document.querySelector('[data-status]').textContent='已保存 '+name.value;dialog.close();};
</script></body></html>`;
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const projectRoot = createProject(context, {
    schemaVersion: 2,
    scenarios: [{
      ...configInput().scenarios[0],
      url: `http://127.0.0.1:${port}/`,
      capture: 'project-playwright',
      captureFallback: 'browser',
      projectPlaywright: {
        adapter: '.frontend-ui-review/playwright-adapter.mjs',
        resultPath: '{reviewInput}',
      },
      interactions: [
        { action: 'hover', selector: '.help' },
        { action: 'assert', assertion: 'visible', selector: '.tooltip' },
        { action: 'click', selector: '[data-open-dialog]' },
        { action: 'wait-for', selector: 'dialog', state: 'visible' },
        { action: 'fill', selector: '[name="displayName"]', value: '测试用户' },
        { action: 'select-option', selector: '[name="role"]', value: 'editor' },
        { action: 'check', selector: '[name="notice"]' },
        { action: 'uncheck', selector: '[name="notice"]' },
        { action: 'check', selector: '[name="notice"]' },
        { action: 'assert', assertion: 'text', selector: '#summary', value: '测试用户 / editor', exact: true },
        { action: 'capture', name: 'dialog-filled' },
        { action: 'press', selector: 'dialog', key: 'Escape' },
        { action: 'assert', assertion: 'hidden', selector: 'dialog' },
        { action: 'click', selector: '[data-open-dialog]' },
        { action: 'click', selector: '[data-save]' },
        { action: 'assert', assertion: 'text', selector: '[data-status]', value: '已保存 测试用户', exact: true },
      ],
      comparison: {
        mode: 'dom',
        dom: [{ selector: '[data-status]', property: 'text', expected: '已保存 测试用户', exact: true }],
      },
    }],
  });
  fs.copyFileSync(
    path.resolve('plugins/frontend-ai-workflow/assets/templates/ui-review/playwright-adapter.mjs'),
    path.join(projectRoot, '.frontend-ui-review', 'playwright-adapter.mjs'),
  );
  const config = loadUiReviewConfig(projectRoot);
  writeRunState(projectRoot, createReviewRun(config, 'home-desktop', { runId: 'complex-ui' }));
  const result = await runPlaywrightAdapter({ target: projectRoot, scenarioId: 'home-desktop', runId: 'complex-ui' });
  const reviewInput = JSON.parse(fs.readFileSync(path.join(projectRoot, result.artifacts.result), 'utf8'));
  assert.equal(reviewInput.interactions.completed, true);
  assert.equal(reviewInput.interactions.steps.length, 16);
  assert.equal(reviewInput.checkedNodes[0].nodeText.includes('已保存 测试用户'), true);
  assert.equal(fs.existsSync(path.join(projectRoot, result.artifacts.interactionScreenshots, '11-dialog-filled.png')), true);

  const playwright = await loadBundledPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<button>确定</button>');
    const failedRoot = path.join(projectRoot, '.frontend-ui-review', 'failed-interactions');
    await assert.rejects(
      () => executeStructuredInteractions({
        page,
        captureRoot: failedRoot,
        interactions: [
          { action: 'capture', name: 'before-failure', timeout: 5000 },
          { action: 'assert', assertion: 'text', selector: 'button', value: '不存在', exact: true, timeout: 5000 },
        ],
      }),
      /断言失败/u,
    );
    assert.equal(fs.existsSync(failedRoot), false);
  } finally {
    await browser.close();
  }
});

test('结构化交互等待弹窗过渡结束后再保存截图', async (context) => {
  const runtime = inspectBundledPlaywright();
  assert.equal(runtime.available, true, runtime.reason);
  const projectRoot = createProject(context);
  const playwright = await loadBundledPlaywright();
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: runtime.browserExecutable,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 200, height: 160 } });
    await page.setContent(`<!doctype html><style>
      body{margin:0;background:#fff}.panel{position:fixed;inset:0;width:100px;height:100px;background:#f00;opacity:0;transition:opacity 220ms linear}.panel.open{opacity:1}
    </style><button data-open style="position:fixed;left:120px">打开</button><div class="panel"></div><script>
      document.querySelector('[data-open]').onclick=()=>document.querySelector('.panel').classList.add('open');
    </script>`);
    const captureRoot = path.join(projectRoot, '.frontend-ui-review', 'stable-transition');
    const result = await executeStructuredInteractions({
      page,
      captureRoot,
      interactions: [
        { action: 'click', selector: '[data-open]', timeout: 5000 },
        { action: 'capture', name: 'stable-dialog', timeout: 5000 },
      ],
    });
    assert.equal(result.steps.every((step) => step.stabilized === true), true);
    const screenshot = PNG.sync.read(fs.readFileSync(path.join(captureRoot, '02-stable-dialog.png')));
    const offset = (20 * screenshot.width + 20) * 4;
    assert.equal(screenshot.data[offset] > 245, true);
    assert.equal(screenshot.data[offset + 1] < 10, true);
    assert.equal(screenshot.data[offset + 2] < 10, true);

    await page.setContent('<button class="remove" onclick="this.remove()">移除</button>');
    const removed = await executeStructuredInteractions({
      page,
      captureRoot: path.join(projectRoot, '.frontend-ui-review', 'removed-node'),
      interactions: [
        { action: 'click', selector: '.remove', timeout: 5000 },
        { action: 'wait-for', selector: '.remove', state: 'hidden', timeout: 5000 },
      ],
    });
    assert.equal(removed.steps[1].actual, 'absent');

    await page.setContent(`<main></main><script>
      setTimeout(() => {
        const node = document.createElement('button');
        node.className = 'late-node';
        node.textContent = '稍后出现';
        document.querySelector('main').append(node);
      }, 80);
    </script>`);
    const appeared = await executeStructuredInteractions({
      page,
      captureRoot: path.join(projectRoot, '.frontend-ui-review', 'async-node'),
      interactions: [
        { action: 'wait-for', selector: '.late-node', state: 'visible', timeout: 5000 },
      ],
    });
    assert.equal(appeared.steps[0].actual, 'visible');
  } finally {
    await browser.close();
  }
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
