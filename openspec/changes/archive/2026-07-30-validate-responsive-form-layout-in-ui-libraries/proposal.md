## Why

响应式表单 Markdown 已能描述 3/4/6 列规则，但尚未证明这些规则可以在现有 Element Plus 与 Element UI 工程中使用真实组件稳定落地。需要以两套可运行项目和五档实际视口补足实现层证据，排除只靠文档静态断言、原生控件替代或浏览器越界仍未被发现的风险。

本变更实现需求决策 `D-20`，并以 `A-10` 作为验收边界。

## What Changes

- 在现有 Vue 3 + Element Plus、Vue 2 + Element UI 工程中分别增加独立响应式表单项目页。
- 两套页面均真实使用对应组件库的 Form、Input、Select、DatePicker 与 Button，并提供展开/收起、查询和重置操作。
- 按 `1024 / 1200 / 1440 / 1920 / 2560px` 实际视口验证 3/3/4/6/6 列、`16px / 8px`、工作区壳层、自动拉伸、操作组完整性和零横向越界。
- 扩展手写聚焦测试，增加两套生产构建、浏览器测量 JSON 和十张逐分辨率截图。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `lanhu-design-spec-contract`：在可执行响应式 Markdown 合同之外，增加两套真实 UI 组件库工程的实现与五档视口验收要求。

## Impact

- 影响 `outputs/lanhu-design-spec/validation-element-plus/` 和 `outputs/lanhu-design-spec/validation-element-ui/` 的页面入口、组件与局部样式。
- 影响 `tests/lanhu-ui-reconstruction.test.mjs`、响应式布局验证证据及需求验证记录。
- 不新增运行时依赖，不修改生产业务接口、权限、路由或通用设计事实。
