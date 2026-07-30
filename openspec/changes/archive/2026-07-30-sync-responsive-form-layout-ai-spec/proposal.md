## Why

已验收的响应式表单布局只存在于 `lanhu-design-spec`，纯 AI 输入目录仍缺少这份基础规范。AI 仅使用 `lanhu-ai-ui-spec` 时无法读取 3/4/6 列、工作区、左侧标签和操作组规则，因此需要在不引入验证过程内容的前提下完成同步。

## What Changes

- 新增 `outputs/lanhu-ai-ui-spec/foundations/responsive-form-layout.md`，同步 D-19 至 D-22 的全部可执行 UI 规则。
- 去除设计源外链、还原状态、验收环境、截图、证据路径和组件库验证过程，只保留蓝湖事实、研发补充边界和非强制实现参考。
- 更新纯 AI README 的文件计数、读取顺序、目录树和基础规范入口。
- 扩展现有手写契约测试，检查文件完整性、README 可定位性、本地链接和纯净输入边界。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `lanhu-design-spec-contract`：纯 AI 输入目录必须包含已验收的响应式表单布局规范，并保持可执行规则完整且不携带验证过程内容。

## Impact

- 影响 `outputs/lanhu-ai-ui-spec/foundations/`、`outputs/lanhu-ai-ui-spec/README.md` 和 `tests/lanhu-ui-reconstruction.test.mjs`。
- 不修改蓝湖事实、组件场景数量、双组件库实现、验证证据或生产接口。
