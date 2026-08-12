import test from 'node:test';
import {
  assert,
  fs,
  http,
  path,
  spawnSync,
  runUiReview,
  workflowScript,
  configInput,
  createProject,
} from './fixtures.mjs';

test('统一入口完成预览、验收、同上下文复验并映射稳定退出码', async (context) => {
  let fixed = false;
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><main>${fixed ? '已修复' : '待修复'}</main>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const scenario = {
    ...configInput().scenarios[0],
    url: `http://127.0.0.1:${port}/`,
    capture: 'project-playwright',
    captureFallback: 'browser',
    projectPlaywright: {
      adapter: '.frontend-ui-review/playwright-adapter.mjs',
      resultPath: '{reviewInput}',
    },
    interactions: [],
    comparison: {
      mode: 'dom',
      dom: [{ selector: 'main', property: 'text', expected: '已修复', exact: true }],
    },
  };
  const projectRoot = createProject(context, { schemaVersion: 2, scenarios: [scenario] });
  fs.copyFileSync(
    path.resolve('plugins/frontend-ai-workflow/assets/templates/ui-review/playwright-adapter.mjs'),
    path.join(projectRoot, '.frontend-ui-review', 'playwright-adapter.mjs'),
  );

  const preview = await runUiReview({ target: projectRoot, mode: 'review', scenarioId: 'home-desktop', runId: 'runner-review' });
  assert.equal(preview.write, false);
  assert.equal(preview.readyToWrite, true);
  assert.equal(preview.exitCode, 0);
  assert.equal(preview.safety.startsProjectCommand, false);
  assert.equal(fs.existsSync(path.join(projectRoot, '.frontend-ui-review', 'runs', 'runner-review')), false);

  const review = await runUiReview({ target: projectRoot, mode: 'review', scenarioId: 'home-desktop', runId: 'runner-review', write: true });
  assert.equal(review.status, 'needs-fix');
  assert.equal(review.exitCode, 1);
  assert.equal(review.repairCandidates.length, 0);
  assert.equal(fs.existsSync(path.join(projectRoot, review.artifacts.report)), true);
  assert.equal(fs.existsSync(path.join(projectRoot, review.artifacts.annotatedScreenshot)), true);

  fs.writeFileSync(path.join(projectRoot, 'design', 'home.png'), 'design-v2');
  const mismatchedPreview = await runUiReview({
    target: projectRoot,
    mode: 'verify',
    scenarioId: 'home-desktop',
    runId: 'runner-mismatched-preview',
    baselinePath: review.artifacts.state,
  });
  assert.equal(mismatchedPreview.status, 'blocked');
  assert.equal(mismatchedPreview.exitCode, 3);
  assert.match(mismatchedPreview.error.message, /重新开始独立验收/u);
  assert.equal(fs.existsSync(path.join(projectRoot, '.frontend-ui-review', 'runs', 'runner-mismatched-preview')), false);
  fs.writeFileSync(path.join(projectRoot, 'design', 'home.png'), 'design-v1');

  fixed = true;
  const verifyPreview = await runUiReview({
    target: projectRoot,
    mode: 'verify',
    scenarioId: 'home-desktop',
    runId: 'runner-verify',
    baselinePath: review.artifacts.state,
  });
  assert.equal(verifyPreview.baseline.runId, 'runner-review');
  const verify = await runUiReview({
    target: projectRoot,
    mode: 'verify',
    scenarioId: 'home-desktop',
    runId: 'runner-verify',
    baselinePath: review.artifacts.state,
    write: true,
  });
  assert.equal(verify.status, 'passed');
  assert.equal(verify.exitCode, 0);
  assert.equal(verify.verification.resolved.length, 1);
});

test('统一入口对不确定、非内置适配器和产物冲突失败关闭', async (context) => {
  const projectRoot = createProject(context, {
    schemaVersion: 2,
    scenarios: [{
      ...configInput().scenarios[0],
      capture: 'project-playwright',
      captureFallback: 'browser',
      projectPlaywright: {
        command: ['node', 'never-run.mjs'],
        resultPath: '{reviewInput}',
      },
      interactions: [],
      comparison: {
        mode: 'dom',
        dom: [{ selector: 'main', property: 'text', expected: '完成', exact: true }],
      },
    }],
  });
  const blocked = await runUiReview({ target: projectRoot, mode: 'review', scenarioId: 'home-desktop', runId: 'blocked-command', write: true });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.exitCode, 3);
  assert.match(blocked.error.message, /不会启动项目自定义命令/u);
  assert.equal(fs.existsSync(path.join(projectRoot, 'never-run.mjs')), false);
  assert.equal(fs.existsSync(path.join(projectRoot, '.frontend-ui-review', 'runs', 'blocked-command')), false);

  const blockedPreview = await runUiReview({ target: projectRoot, mode: 'review', scenarioId: 'home-desktop', runId: 'blocked-command-preview' });
  assert.equal(blockedPreview.readyToWrite, false);
  assert.equal(blockedPreview.status, 'blocked');
  assert.equal(blockedPreview.exitCode, 3);
  assert.equal(fs.existsSync(path.join(projectRoot, '.frontend-ui-review', 'runs', 'blocked-command-preview')), false);

  const invalid = await runUiReview({ target: projectRoot, mode: 'unknown', scenarioId: 'home-desktop', runId: 'bad-mode', write: true });
  assert.equal(invalid.exitCode, 3);

  const uncertainServer = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><main>证据不完整</main>');
  });
  await new Promise((resolve) => uncertainServer.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => uncertainServer.close(resolve)));
  const { port: uncertainPort } = uncertainServer.address();
  const uncertainProject = createProject(context, {
    schemaVersion: 2,
    scenarios: [{
      ...configInput().scenarios[0],
      url: `http://127.0.0.1:${uncertainPort}/`,
      capture: 'project-playwright',
      captureFallback: 'browser',
      projectPlaywright: {
        adapter: '.frontend-ui-review/playwright-adapter.mjs',
        resultPath: '{reviewInput}',
      },
      interactions: [],
      comparison: {
        mode: 'dom',
        dom: [{ selector: '[data-missing]', property: 'text', expected: '完成', exact: true }],
      },
    }],
  });
  fs.copyFileSync(
    path.resolve('plugins/frontend-ai-workflow/assets/templates/ui-review/playwright-adapter.mjs'),
    path.join(uncertainProject, '.frontend-ui-review', 'playwright-adapter.mjs'),
  );
  const uncertain = await runUiReview({ target: uncertainProject, mode: 'review', scenarioId: 'home-desktop', runId: 'runner-inconclusive', write: true });
  assert.equal(uncertain.status, 'inconclusive');
  assert.equal(uncertain.exitCode, 2);
  assert.equal(uncertain.fallbackRequired, true);
  const conflict = await runUiReview({ target: uncertainProject, mode: 'review', scenarioId: 'home-desktop', runId: 'runner-inconclusive', write: true });
  assert.equal(conflict.status, 'blocked');
  assert.equal(conflict.exitCode, 3);
  assert.match(conflict.error.message, /拒绝覆盖/u);
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
  assert.match(reviewSkill, /ui-review-runner\.mjs review/u);
  assert.match(reviewSkill, /结构化/u);
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
  assert.match(sharedReference, /linux-x64/u);
  assert.match(reviewSkill, /bundled-adapter/u);
  assert.match(reviewSkill, /readyToWrite: true/u);
  assert.match(reviewSkill, /project-adapter/u);
  assert.match(reviewSkill, /项目自有本地页面环境/u);
  assert.match(reviewSkill, /受控故障/u);
  assert.match(reviewSkill, /inconclusive/u);
  assert.match(verifySkill, /适配器摘要/u);
  assert.match(verifySkill, /受控故障/u);
  assert.match(fixSkill, /验收环境事实/u);
  assert.match(fixSkill, /不得.*业务源码.*验收环境/u);
  assert.match(sharedReference, /0=passed.*3=blocked/u);
  assert.match(sharedReference, /readyToWrite: false/u);
  assert.match(sharedReference, /版本 2 自定义适配器不能自动降级/u);
  assert.match(sharedReference, /受控故障/u);
  assert.match(sharedReference, /不隐含提交、推送、PR/u);
  assert.match(sharedReference, /captureFallback/u);
  assert.match(sharedReference, /跨 AI 工具/u);
});
