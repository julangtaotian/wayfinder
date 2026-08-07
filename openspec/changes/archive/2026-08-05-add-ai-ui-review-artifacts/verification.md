# AI UI 验收标注产物验证记录

## 自动测试

- `node --test tests/ai-ui-review.test.mjs`：`5 / 5` 通过。
- `node --test tests/ai-ui-review.test.mjs tests/ai-code-marker-policy.test.mjs`：`8 / 8` 通过。
- `npm run verify`：`120 / 120` 自动测试通过；插件与技能结构通过；OpenSpec 严格校验 `22 / 22`；内置 OpenSpec `1.7.0` 与 76 个运行时包完整性通过。
- 官方验证器：5 个自定义 Skill 均有效，Plugin validation 通过。验证器缺少的 PyYAML 仅临时安装于 `/private/tmp`，未加入项目依赖。

## 两套生产构建

- Element Plus：Vite 构建通过，转换 `1603` 个模块；存在既有大包体提示和上游 `#__PURE__` 注释提示，没有构建失败。
- Element UI：Vite 构建通过，转换 `317` 个模块；存在既有大包体提示，没有构建失败。

## 真实浏览器 AI 验收

- 环境：Codex 内置 Chromium 浏览器，CSS 视口 `1440 × 900`，DPR `1`，页面缩放 `100%`。
- 页面：两套项目的 `Button / SCN-BUTTON-01 / Default` 场景。
- 实际节点：`[data-scenario-id="SCN-BUTTON-01"] .demo-row > .el-button`，两套页面各命中 6 个真实按钮。
- 实测共同值：高度 `32px`、字号 `14px`、水平内边距 `16px`、圆角 `2px`、主按钮背景与边框 `rgb(255, 96, 20)`。
- AI 发现：两套页面的 6 个按钮计算行高均为 `14px`，而 `components/button.md` 明确要求 `22px`；差异 `8px`，置信度高。
- 产物：两套结果各自仅有 `ui-review.png` 与 `ui-review.md`，截图 `UI-001` 红框、节点坐标和 Markdown 问题编号一致。
- 有限结论：AI 验收工具闭环通过；两套页面在本次场景均为“需修改 1 项”，不代表其他页面、状态或视口已完成本轮 AI 验收。

## 静态检查

- `git diff --check` 通过。
- AI 代码标记策略测试通过，新增代码没有引入禁用的行数统计标记。
