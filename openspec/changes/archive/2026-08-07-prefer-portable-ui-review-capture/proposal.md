## Why

当前 UI 验收把 Codex Browser 与项目 Playwright 视为并列的固定采集器，无法表达跨 AI 工具可执行的确定性主路径和视觉能力兜底。需要让项目已声明的 Playwright 命令成为可移植入口，同时保留 Codex Browser 等视觉能力处理主路径不可用或确定性证据不足的场景。（D-08、D-09，A-01、A-06）

## What Changes

- 为场景增加可选兜底采集器和项目 Playwright 命令合同，并保持既有单采集器配置兼容。（D-08、D-09，A-02、A-06）
- 提供机器可读采集计划，使其他 AI 工具与 CI 可以直接取得命令参数、结果路径、采集顺序和可移植性结论。（D-07、D-09，A-01、A-06）
- 允许开始验收时显式记录实际选中的采集器；复验必须复用基线采集器，禁止静默切换。（D-06、D-09，A-04）
- 更新 UI 验收、修复和复验 Skill：优先确定性主路径，只在已声明且可用时启用视觉兜底。
- 更新模板、共享合同、README、专用测试和插件发布缓存。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `plugin-ui-review-automation`：将项目 Playwright 调整为跨 AI 工具主路径，增加视觉兜底、机器可读采集计划和实际采集器一致性要求。

## Impact

- 受影响代码：`ui-review-workflow.mjs`、三个 UI Skill、共享参考、配置模板、README、结构校验与专用测试。
- 配置保持 `schemaVersion: 1`；既有 `capture: "browser"` 或 `capture: "project-playwright"` 配置不改变行为。
- 不新增运行时依赖，不自动安装 Playwright 或浏览器，不绑定特定 AI 工具或 CI 平台。
