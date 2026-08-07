function waitForStablePage(page) {
  return page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function waitForVisibleCount(page, selector, expected, timeout = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await page.locator(selector).count() === expected) return;
    await page.waitForTimeout(50);
  }
  throw new Error(`等待可见节点数量超时：${selector}，期望 ${expected}`);
}

async function collectNode(locator, target) {
  const count = await locator.count();
  if (count !== 1) {
    throw new Error(`目标选择器必须唯一命中一个节点：${target.selector}，实际 ${count}`);
  }

  const element = locator.first();
  const rect = await element.boundingBox();
  if (!rect) throw new Error(`目标节点当前不可见：${target.selector}`);

  const nodeText = (await element.innerText()).trim().replace(/\s+/g, ' ').slice(0, 500);
  const computedStyle = await element.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      display: style.display,
      position: style.position,
      width: style.width,
      height: style.height,
      margin: style.margin,
      padding: style.padding,
      color: style.color,
      backgroundColor: style.backgroundColor,
      border: style.border,
      boxShadow: style.boxShadow,
      font: style.font,
    };
  });

  return {
    selector: target.selector,
    componentPath: target.componentPath || target.sourcePath || target.selector,
    nodeText,
    nodeMeaning: target.nodeMeaning || '',
    rect,
    computedStyle,
  };
}

async function exerciseDialog(page) {
  const dialog = page.locator('.dialog-panel--dialog-usage-5');
  await dialog.waitFor({ state: 'visible' });
  await dialog.locator('.el-dialog__headerbtn').click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '打开复杂对话框', exact: true }).click();
  await dialog.waitFor({ state: 'visible' });
  if (await dialog.locator('.el-form-item').count() !== 8) {
    throw new Error('大型弹窗没有呈现预期的八个表单项');
  }
  await dialog.getByRole('button', { name: '取消', exact: true }).waitFor();
  await dialog.getByRole('button', { name: '确定', exact: true }).waitFor();
}

async function exerciseSelect(page) {
  const pair = page.locator('[data-scenario-id="SCN-SELECT-05"] .select-variant-pair');
  await pair.waitFor({ state: 'visible' });
  const visibleDropdowns = page.locator('.el-select-dropdown:visible');
  await waitForVisibleCount(page, '.el-select-dropdown:visible', 2);

  const firstSelect = pair.locator('.el-select').first();
  await firstSelect.locator('.el-tag__close').first().click();
  const firstDropdown = page.locator('.el-select-dropdown:visible').first();
  await firstDropdown.getByText('选项 2', { exact: true }).click();
  await firstSelect.getByText('选项 2', { exact: true }).waitFor();

  // 用户操作会按组件默认行为关闭另一组弹层，重新载入证据路由以恢复设计稿的双展开基准。
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForStablePage(page);
  await waitForVisibleCount(page, '.el-select-dropdown:visible', 2);
  if (await visibleDropdowns.count() !== 2) throw new Error('双多选场景没有恢复两个展开弹层');
}

async function exerciseCascader(page) {
  const scene = page.locator('[data-scenario-id="SCN-CASCADER-03"]');
  // Cascader 的可见弹层追加到 body，x-placement 可区分它与场景卡片内的隐藏占位节点。
  const dropdown = page.locator('.el-cascader__dropdown.cascader-evidence-indeterminate[x-placement]');
  await dropdown.waitFor({ state: 'visible' });

  const checked = dropdown.locator('.el-checkbox__input.is-checked');
  const indeterminate = dropdown.locator('.el-checkbox__input.is-indeterminate');
  const disabled = dropdown.locator('.el-cascader-node.is-disabled');
  const initialCheckedCount = await checked.count();
  const candidate = dropdown.locator('.el-cascader-menu').last().locator('.el-checkbox__input:not(.is-disabled)').last();
  await candidate.click();
  await page.waitForTimeout(100);
  if (await checked.count() === initialCheckedCount) throw new Error('级联子节点勾选后，已选数量没有变化');
  await candidate.click();
  await page.waitForTimeout(100);
  if (await checked.count() !== initialCheckedCount) throw new Error('级联子节点取消后，没有恢复初始已选数量');
  await page.mouse.move(900, 480);
  await scene.locator('input').focus();
  if (await checked.count() < 2 || await indeterminate.count() < 1 || await disabled.count() < 1) {
    throw new Error('级联弹层没有同时保留已选、半选和禁用状态');
  }
}

async function exerciseTable(page) {
  const tablePage = page.locator('[data-scenario-id="SCN-TABLE-23"] .classic-table-page');
  await tablePage.waitFor({ state: 'visible' });
  const nameInput = tablePage.locator('.classic-field-name input');
  await nameInput.fill('临时验收文本');
  if (await nameInput.inputValue() !== '临时验收文本') throw new Error('姓名筛选字段输入失败');
  await nameInput.fill('');

  const statusSelect = tablePage.locator('.classic-field-status .el-select');
  await statusSelect.click();
  await page.locator('.el-select-dropdown:visible').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.locator('.el-select-dropdown:visible').waitFor({ state: 'hidden' });
  await tablePage.locator('.classic-topbar').click({ position: { x: 400, y: 100 } });

  if (await tablePage.locator('.classic-data-table .el-table__body tbody tr').count() !== 9) {
    throw new Error('经典表格页没有呈现预期的九行数据');
  }
}

const interactions = [
  { key: 'complex-dialog-large', routeToken: 'SCN-DIALOG-USAGE-05', exercise: exerciseDialog },
  { key: 'complex-select-multiple', routeToken: 'SCN-SELECT-05', exercise: exerciseSelect },
  { key: 'complex-cascader-indeterminate', routeToken: 'SCN-CASCADER-03', exercise: exerciseCascader },
  { key: 'complex-table-medium', routeToken: 'SCN-TABLE-23', exercise: exerciseTable },
];

export default async function captureUiEvidence({ playwright, project, scenario, artifacts }) {
  // 运行器传入的是规范化场景事实，不包含配置中的 id，因此使用稳定路由令牌分派交互。
  const interaction = interactions.find((item) => scenario.url.includes(item.routeToken));
  if (!interaction) throw new Error(`没有为复杂验收路由实现交互：${scenario.url}`);

  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: {
        width: scenario.viewport.width,
        height: scenario.viewport.height,
      },
      deviceScaleFactor: scenario.viewport.deviceScaleFactor,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(scenario.url, { waitUntil: 'domcontentloaded' });
    await waitForStablePage(page);
    await interaction.exercise(page);
    // 等待组件入场动画与焦点样式完全稳定，避免把采集瞬态带入视觉结论。
    await page.waitForTimeout(400);
    await waitForStablePage(page);

    const checkedNodes = [];
    for (const target of scenario.targets) {
      const node = await collectNode(page.locator(target.selector), target);
      if (
        node.rect.x < 0
        || node.rect.y < 0
        || node.rect.x + node.rect.width > scenario.viewport.width
        || node.rect.y + node.rect.height > scenario.viewport.height
      ) {
        throw new Error(`目标节点必须完整位于当前视口：${target.selector}`);
      }
      checkedNodes.push(node);
    }

    await page.screenshot({ path: artifacts.actualScreenshot, type: 'png' });
    return {
      analysisPending: true,
      project: {
        name: project.name,
        runtime: `Chromium ${browser.version()}（新版插件内置 Playwright）`,
        page: scenario.url,
        designBasis: scenario.design.path,
        scope: scenario.targets.map((target) => target.nodeMeaning || target.selector),
      },
      viewport: {
        width: scenario.viewport.width,
        height: scenario.viewport.height,
        dpr: scenario.viewport.deviceScaleFactor,
        scale: 1,
      },
      interactionEvidence: {
        declared: scenario.interactions,
        executedBy: interaction.key,
        completed: true,
      },
      checkedNodes,
    };
  } finally {
    await browser.close();
  }
}
