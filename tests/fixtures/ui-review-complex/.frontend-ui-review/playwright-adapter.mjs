export default async function captureUiEvidence({ playwright, runtime, executeInteractions, project, scenario, artifacts }) {
  if (scenario.interactionMode === 'instructions' && scenario.interactions.length > 0) {
    throw new Error('版本 1 的字符串交互仅供自定义适配器读取，插件不会猜测执行');
  }

  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: runtime.browserExecutable,
  });
  try {
    const context = await browser.newContext({
      viewport: {
        width: scenario.viewport.width,
        height: scenario.viewport.height,
      },
      deviceScaleFactor: scenario.viewport.deviceScaleFactor,
    });
    const page = await context.newPage();
    await page.goto(scenario.url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      await document.fonts?.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const interactions = scenario.interactionMode === 'structured'
      ? await executeInteractions({ page })
      : { completed: true, steps: [], captures: [] };

    const domObservations = [];
    for (const assertion of scenario.comparison?.dom || []) {
      try {
        if (assertion.property === 'url') {
          domObservations.push({ selector: assertion.selector, property: assertion.property, actual: page.url() });
          continue;
        }
        const locator = page.locator(assertion.selector);
        const count = await locator.count();
        if (count !== 1) throw new Error(`DOM 比较选择器必须唯一命中一个节点，实际 ${count}`);
        const element = locator.first();
        let actual;
        if (assertion.property === 'visible') actual = await element.isVisible();
        else if (assertion.property === 'hidden') actual = !(await element.isVisible());
        else if (assertion.property === 'text') actual = (await element.innerText()).trim();
        else if (assertion.property === 'value') actual = await element.inputValue();
        else {
          const property = assertion.property.slice('style.'.length);
          actual = await element.evaluate((node, cssProperty) => getComputedStyle(node).getPropertyValue(cssProperty), property);
        }
        domObservations.push({ selector: assertion.selector, property: assertion.property, actual });
      } catch (error) {
        domObservations.push({ selector: assertion.selector, property: assertion.property, error: error.message });
      }
    }

    const checkedNodes = [];
    for (const target of scenario.targets) {
      const locator = page.locator(target.selector);
      const count = await locator.count();
      if (count !== 1) throw new Error(`目标选择器必须唯一命中一个节点：${target.selector}，实际 ${count}`);
      const element = locator.first();
      const rect = await element.boundingBox();
      if (!rect || rect.x < 0 || rect.y < 0 || rect.x + rect.width > scenario.viewport.width || rect.y + rect.height > scenario.viewport.height) {
        throw new Error(`目标节点必须完整位于当前视口：${target.selector}`);
      }
      const nodeText = (await element.innerText()).trim().slice(0, 200);
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
          font: style.font,
        };
      });
      checkedNodes.push({
        selector: target.selector,
        componentPath: target.componentPath || target.sourcePath || target.selector,
        nodeText,
        nodeMeaning: target.nodeMeaning || '',
        rect,
        computedStyle,
      });
    }

    await page.screenshot({ path: artifacts.actualScreenshot, type: 'png' });
    return {
      analysisPending: true,
      project: {
        name: project.name,
        runtime: `Chromium ${browser.version()}（插件内置 Playwright）`,
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
      interactions,
      domObservations,
      checkedNodes,
    };
  } finally {
    await browser.close();
  }
}
