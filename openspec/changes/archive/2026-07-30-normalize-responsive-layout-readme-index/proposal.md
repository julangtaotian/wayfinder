## Why

响应式正文的 12 张画板已经使用“原始尺寸｜列数｜状态/用途”命名，但 README 第 34～45 行仍显示蓝湖源 `copy / copy 2` 名称。AI 和研发首先从 README 进入规范，目录与正文不一致会继续传播无语义名称。（D-21；A-11）

## What Changes

- 将 README 第 34～45 行改成与响应式正文相同的 12 个规范化画板名称。
- 保持现有行号、链接、画板数量、正文路径、画板 ID 和断点规则不变。
- 扩展既有响应式规范测试，直接比较正文与 README 的名称集合和顺序，并阻止索引区重新出现 `copy`。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `lanhu-design-spec-contract`：将可读画板命名要求从响应式正文扩展到 README 公共索引，要求两处名称与顺序一致。

## Impact

- 目录文案：`outputs/lanhu-design-spec/README.md`
- 正文对照：`outputs/lanhu-design-spec/foundations/responsive-form-layout.md`
- 聚焦测试：`tests/lanhu-ui-reconstruction.test.mjs`
- 需求与验收：`requirements/REQ-2026-003-lanhu-ui-reconstruction-validation.md`
- 不修改组件库页面、构建产物、画板 ID、链接或布局规则。
