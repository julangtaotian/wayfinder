---
name: frontend-ui-review
description: Inspect a configured frontend page with structured interactions and deterministic DOM or image comparison, prefer the plugin-bundled Playwright adapter without target-project installation, use Browser visual inspection only for declared inconclusive fallback, and generate traceable review artifacts without editing business source. Use when the user asks for UI acceptance, complex visual review, design comparison, screenshot inspection, CI-friendly UI evidence, or a pre-fix UI audit inside a frontend repository.
---

# 前端 UI 验收

把一次真实页面检查转换为项目内可追溯的验收运行。本 Skill 只收集证据和形成结论，不修改业务源码。

## 开始前

1. 定位本 Skill 所在目录，并读取 `../../references/ui-review-workflow.md`。
2. 版本 2 配置优先使用插件根目录下的 `scripts/ui-review-runner.mjs`；`ui-review-workflow.mjs` 只用于版本 1 兼容、修复门禁或视觉兜底等细粒度操作，不要复制脚本到业务项目。
3. 读取 `.frontend-ui-review/config.json`。若文件缺失，同时参考 `../../assets/templates/ui-review/config.json` 和 `../../assets/templates/ui-review/playwright-adapter.mjs` 创建项目草案；版本 2 项目适配器必须完整复制当前模板，不得加入自定义执行逻辑，也不得给业务项目安装 Playwright。页面、设计依据、目标节点和交互步骤必须来自项目事实或用户确认，不能猜测。
4. 先执行统一入口的 `review` 预览，确认平台、结构化交互、`structure/visual` 范围、几何或图片证据、区域、掩码、阈值、兜底和预计产物。只有 `readyToWrite: true`、`capture.configured: bundled-adapter`、`capture.portable: true` 且 `platform` 非空才可进入正式验收；视觉验收不能只声明文本、显隐或值断言。
5. 若预览把既有版本 2 适配器标记为 `project-adapter`，保留原配置和适配器并停止。按共享合同列出适配器承担的假登录、接口模拟和固定数据职责，要求项目自有本地页面环境在受信适配器之外准备这些非敏感事实；没有用户对配置迁移的明确授权时，只交付迁移清单，不覆盖文件、不追加 `--write`、不自动降级到版本 1。

## 执行验收

1. 执行 `node scripts/ui-review-runner.mjs review --target <项目> --scenario <场景> --run-id <运行ID>`。预览不会创建运行目录；只有预览明确就绪后才用同一参数追加 `--write`，任何 `blocked` 或 `readyToWrite: false` 都必须先解决。
2. 统一入口只执行内容摘要与当前模板一致的 `source: bundled-adapter`，实际代码从插件受信目录加载；它按顺序运行受限动作，在状态变更与截图前等待字体、有限动画和双帧稳定，采集最终目标节点，并执行 DOM、几何、图片或混合比较；不会导入项目自定义模块、启动项目自定义命令、安装依赖、自动修改源码或提交推送。
3. `passed` 仅表示声明范围通过；`structure` 通过不得描述成视觉一致，`visual` 缺少样式、几何或图片证据时必须保持 `inconclusive`。`needs-fix` 以退出码 1 返回；`inconclusive` 以退出码 2 返回且不得写成通过；页面、平台、产物或安全冲突以退出码 3 阻塞。
4. 只有 `inconclusive`、状态返回 `fallbackRequired: true` 且当前 AI 工具确实提供视觉能力时，才能用新的运行 ID 执行 `start-review --capture browser` 兜底；不得在原运行中切换采集器。
5. 版本 1 字符串交互只作为自定义适配器说明，不会被猜测执行。老配置继续按 `capture-plan` 和细粒度命令处理，不得自动升级其状态或指纹。
6. 如果所有已声明采集方式都不可用，明确报告阻塞。不得在业务项目安装 Playwright、下载浏览器或生成虚假通过结果。

## 结论边界

- 零问题仅表示声明页面、视口、交互和节点范围内通过，不代表整个产品通过；报告需明确标注结构范围或视觉范围。
- 计算样式必须精确匹配；图片区域被掩码完全覆盖时属于证据不足，不能报告为通过。
- 确定性图片或 DOM 问题可以进入报告，但只有补齐安全源码目标、稳定锚点、允许和禁止修改范围、复验命令与断言的问题才进入 `repairCandidates`。
- 最终交付业务项目根、实际执行目标、页面环境类型、受信适配器摘要、运行 ID、有限范围结论、实际截图、标注截图、Markdown 报告和 `state.json` 路径。若使用外部代理、样式注入或固定响应复现问题，明确标记为“受控故障”，并另外报告真实源码当前态独立验收；不得用受控结果冒充真实源码修复证据。
- 不提交、不推送、不创建 PR，也不读取登录凭据。
