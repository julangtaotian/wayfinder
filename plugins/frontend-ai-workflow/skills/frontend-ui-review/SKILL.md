---
name: frontend-ui-review
description: Inspect a configured frontend page against a local design image or specification, prefer the plugin-bundled Playwright adapter without target-project installation, use Browser visual inspection only as a declared fallback, and generate traceable review artifacts without editing business source. Use when the user asks for UI acceptance, visual review, design comparison, screenshot inspection, CI-friendly UI evidence, or a pre-fix UI audit inside a frontend repository.
---

# 前端 UI 验收

把一次真实页面检查转换为项目内可追溯的验收运行。本 Skill 只收集证据和形成结论，不修改业务源码。

## 开始前

1. 定位本 Skill 所在目录，并读取 `../../references/ui-review-workflow.md`。
2. 使用插件根目录下的 `scripts/ui-review-workflow.mjs` 和 `scripts/ui-review-report.mjs`，不要复制脚本到业务项目。
3. 读取 `.frontend-ui-review/config.json`。若文件缺失，同时参考 `../../assets/templates/ui-review/config.json` 和 `../../assets/templates/ui-review/playwright-adapter.mjs` 创建项目草案；不得给业务项目安装 Playwright。页面、设计依据、目标节点和交互步骤必须来自项目事实或用户确认，不能猜测。
4. 先执行 `inspect`，再使用同一运行 ID 执行 `capture-plan`。任何配置、安全路径、设计文件或采集计划错误都必须先解决。

## 执行验收

1. 按 `capture-plan.order` 选择采集器。可移植的 `project-playwright` 是主路径：先以稳定运行 ID 执行 `start-review` 预览并写入状态，再直接执行计划返回的参数数组；不要通过 Shell 字符串重组命令。
2. `source: bundled-adapter` 时确认 `runtime.compatible` 与 `integrityOk`，项目适配器直接接收插件内置 Playwright。`source: project-command` 是旧配置兼容路径，继续执行其原参数数组。
3. 内置适配器退出成功并产生真实 PNG 与结构化节点证据后，比较本地设计依据与实际截图，补齐完整 `findings` 并移除 `analysisPending`；未完成视觉比较不能提交零问题结论，也不需要为这一步调用 Browser 操作页面。
4. Playwright 命令不可执行、平台不兼容、失败或没有产生完整证据时保留失败信息。只有计划明确声明 `browser` 兜底且当前 AI 工具提供该能力时，才能使用新的运行 ID 执行 `start-review --capture browser`，再操作真实页面、执行交互并截图；不要在原运行中静默切换采集器。
5. 老配置只允许其唯一采集器：`browser` 配置继续使用 Browser，未声明适配器或稳定命令的 `project-playwright` 标记为不可移植；不得自行增加兜底。
6. 如果计划内所有采集方式都不可用，明确报告阻塞。不得在业务项目安装 Playwright、下载浏览器或生成虚假通过结果。
7. 严格使用场景 URL、视口、DPR、目标节点和交互说明。保存实际 PNG 到状态声明的 `actualScreenshot`，同时记录真实 DOM 选择器、节点语义、组件路径、计算样式和截图坐标。
8. 将完成视觉分析的结构化检查结果写入状态声明的 `reviewInput`，然后调用报告脚本生成 `report/ui-review.png` 和 `report/ui-review.md`。FFmpeg 或中文字体不可用时停止并说明，不伪造标注产物。
9. 执行 `complete-review` 预览，确认只有高置信度问题进入状态后再加 `--write`。

## 结论边界

- 零问题仅表示声明页面、视口、交互和节点范围内通过，不代表整个产品通过。
- 发现问题时，报告必须包含安全源码目标、稳定锚点、允许和禁止修改范围、复验命令与断言；信息不完整的问题不能进入自动修复。
- 最终交付运行 ID、有限范围结论、实际截图、标注截图、Markdown 报告和 `state.json` 路径。
- 不提交、不推送、不创建 PR，也不读取登录凭据。
