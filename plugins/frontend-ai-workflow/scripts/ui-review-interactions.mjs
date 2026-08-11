import fs from 'node:fs';
import path from 'node:path';

const ACTIONS = new Set([
  'click',
  'hover',
  'fill',
  'press',
  'select-option',
  'check',
  'uncheck',
  'wait-for',
  'assert',
  'capture',
]);
const CAPTURE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u;

function fail(message) {
  throw new Error(message);
}

function assertInside(root, candidate) {
  const relative = path.relative(root, candidate);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('交互截图路径必须位于声明的产物目录内');
  }
}

async function uniqueLocator(page, selector, stepLabel) {
  const locator = page.locator(selector);
  const count = await locator.count();
  if (count !== 1) fail(`${stepLabel}的选择器必须唯一命中一个节点：${selector}，实际 ${count}`);
  return locator.first();
}

async function executeAssertion(page, interaction, stepLabel) {
  if (interaction.assertion === 'url') {
    const actual = page.url();
    const matched = interaction.exact ? actual === interaction.value : actual.includes(interaction.value);
    if (!matched) fail(`${stepLabel} URL 断言失败：实际 ${actual}`);
    return { assertion: 'url', matched: true, actual };
  }

  const locator = await uniqueLocator(page, interaction.selector, stepLabel);
  if (interaction.assertion === 'visible' || interaction.assertion === 'hidden') {
    const visible = await locator.isVisible();
    const matched = interaction.assertion === 'visible' ? visible : !visible;
    if (!matched) fail(`${stepLabel} ${interaction.assertion} 断言失败：${interaction.selector}`);
    return { assertion: interaction.assertion, matched: true, actual: visible };
  }
  const actual = interaction.assertion === 'value'
    ? await locator.inputValue()
    : (await locator.innerText()).trim();
  const matched = interaction.exact ? actual === interaction.value : actual.includes(interaction.value);
  if (!matched) fail(`${stepLabel} ${interaction.assertion} 断言失败：实际 ${actual}`);
  return { assertion: interaction.assertion, matched: true, actual };
}

async function executeStep(page, interaction, stepLabel, capturePath) {
  if (interaction.action === 'capture') {
    await page.screenshot({ path: capturePath, type: 'png' });
    return { capture: path.basename(capturePath) };
  }
  if (interaction.action === 'assert') return executeAssertion(page, interaction, stepLabel);
  if (interaction.action === 'wait-for') {
    const locator = page.locator(interaction.selector);
    if (['hidden', 'detached'].includes(interaction.state)) {
      const count = await locator.count();
      if (count === 0) return { waitState: interaction.state, actual: 'absent' };
      if (count !== 1) fail(`${stepLabel}的选择器必须唯一命中一个节点：${interaction.selector}，实际 ${count}`);
      await locator.first().waitFor({ state: interaction.state, timeout: interaction.timeout });
    } else {
      // 可出现的节点应先进入 Playwright 自动等待，再校验最终唯一性。
      await locator.first().waitFor({ state: interaction.state, timeout: interaction.timeout });
      const count = await locator.count();
      if (count !== 1) fail(`${stepLabel}的选择器必须唯一命中一个节点：${interaction.selector}，实际 ${count}`);
    }
    return { waitState: interaction.state, actual: interaction.state };
  }
  const locator = await uniqueLocator(page, interaction.selector, stepLabel);
  const options = { timeout: interaction.timeout };
  if (interaction.action === 'click') await locator.click(options);
  else if (interaction.action === 'hover') await locator.hover(options);
  else if (interaction.action === 'fill') await locator.fill(interaction.value, options);
  else if (interaction.action === 'press') await locator.press(interaction.key, options);
  else if (interaction.action === 'select-option') await locator.selectOption(interaction.value, options);
  else if (interaction.action === 'check') await locator.check(options);
  else if (interaction.action === 'uncheck') await locator.uncheck(options);
  return {};
}

// 等待字体、有限动画和连续两帧渲染稳定，避免把过渡首帧保存为验收证据。
export async function waitForVisualStability(page, { timeout = 5000 } = {}) {
  if (!page || typeof page.evaluate !== 'function') fail('视觉稳定等待需要有效的 Playwright 页面');
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 30000) fail('视觉稳定等待超时必须是 100 到 30000 的整数');
  await page.evaluate(async (maxWait) => {
    const deadline = Date.now() + maxWait;
    const remaining = () => Math.max(0, deadline - Date.now());
    const waitUntil = async (promise, label) => {
      const available = remaining();
      if (available === 0) throw new Error(`${label}等待超时`);
      let timer;
      try {
        await Promise.race([
          promise,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${label}等待超时`)), available);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    };
    if (document.fonts?.ready) await waitUntil(document.fonts.ready, '字体');
    while (true) {
      const running = document.getAnimations().filter((animation) => {
        if (animation.playState !== 'running') return false;
        const endTime = animation.effect?.getComputedTiming?.().endTime;
        return Number.isFinite(endTime);
      });
      if (running.length === 0) break;
      await waitUntil(new Promise((resolve) => requestAnimationFrame(resolve)), '有限动画');
    }
    await waitUntil(new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))), '渲染帧');
  }, timeout);
}

// 交互产物先写入临时目录，只有全部步骤成功才一次性提交，避免失败运行留下半成品证据。
export async function executeStructuredInteractions({ page, interactions, captureRoot }) {
  if (!page || typeof page.locator !== 'function') fail('结构化交互需要有效的 Playwright 页面');
  if (!Array.isArray(interactions)) fail('结构化交互必须是数组');
  const resolvedRoot = path.resolve(captureRoot);
  const temporaryRoot = `${resolvedRoot}.tmp-${process.pid}-${Date.now()}`;
  if (fs.existsSync(resolvedRoot)) fail(`交互截图目录已存在，拒绝覆盖：${resolvedRoot}`);
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const steps = [];
  try {
    for (const [index, interaction] of interactions.entries()) {
      if (!interaction || typeof interaction !== 'object' || !ACTIONS.has(interaction.action)) {
        fail(`交互步骤 ${index + 1} 包含未规范化动作`);
      }
      const stepLabel = `交互步骤 ${index + 1}（${interaction.action}）`;
      let capturePath = null;
      if (interaction.action === 'capture') {
        if (!CAPTURE_NAME_PATTERN.test(interaction.name)) fail(`${stepLabel}截图名称不安全`);
        capturePath = path.join(temporaryRoot, `${String(index + 1).padStart(2, '0')}-${interaction.name}.png`);
        assertInside(temporaryRoot, capturePath);
      }
      if (interaction.action === 'capture') await waitForVisualStability(page, { timeout: interaction.timeout });
      const evidence = await executeStep(page, interaction, stepLabel, capturePath);
      const stateChanging = !['assert', 'capture'].includes(interaction.action);
      if (stateChanging) await waitForVisualStability(page, { timeout: interaction.timeout });
      steps.push({
        index: index + 1,
        action: interaction.action,
        selector: interaction.selector || null,
        timeout: interaction.timeout,
        valueLength: typeof interaction.value === 'string' ? interaction.value.length : null,
        stabilized: stateChanging || interaction.action === 'capture',
        ...evidence,
      });
    }
    fs.mkdirSync(path.dirname(resolvedRoot), { recursive: true });
    fs.renameSync(temporaryRoot, resolvedRoot);
    return {
      completed: true,
      steps,
      captures: steps.filter((step) => step.capture).map((step) => step.capture),
    };
  } catch (error) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}
