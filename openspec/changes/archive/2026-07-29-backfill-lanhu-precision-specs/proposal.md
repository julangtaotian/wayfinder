## Why

最终 A-05 验收已经通过 183 条场景，但反向审查发现部分经蓝湖确认的精确视觉参数仍只存在于双组件库验收实现或证据中。若不回写到纯 Markdown，新 AI 在无法查看蓝湖和现有实现时仍可能在复杂浮层、组合间距和初始状态上产生视觉漂移。

本变更执行需求决策 `D-17`，并以 `A-07` 作为双目录同步验收边界。

## What Changes

- 反查最终验收实现、参考裁图和 A-05 证据，区分可见设计事实与验证页/组件库实现细节。
- 将受影响组件的精确尺寸、间距、颜色、文案、初始状态、面板结构和图标显示值同步写入 `lanhu-design-spec` 与 `lanhu-ai-ui-spec`。
- 为跨目录精确值一致性增加聚焦契约断言，避免后续只更新其中一套文档。
- 更新需求验证记录和最终结论，明确文档独立还原能力及仍然存在的边界。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `lanhu-design-spec-contract`：增加“验收确认的可见精确值必须回写到两套纯 Markdown，且不得混入组件库或验证页实现细节”的契约。

## Impact

- 修改 `outputs/lanhu-design-spec/` 与 `outputs/lanhu-ai-ui-spec/` 中对应的组件、表单或选择器 Markdown。
- 复用并扩展 `tests/lanhu-ui-reconstruction.test.mjs` 的手写专用文档契约测试。
- 更新 `requirements/REQ-2026-003-lanhu-ui-reconstruction-validation.md` 和本变更规划资料。
- 不修改蓝湖原稿、双组件库运行时代码、插件运行时、生产组件或业务接口。
