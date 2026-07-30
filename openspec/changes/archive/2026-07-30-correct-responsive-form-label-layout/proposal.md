## Why

上一轮响应式表单验收只验证了列数、间距、工作区和越界，两套真实项目却把字段标签放在控件顶部，与蓝湖五档画板中的左侧标签结构不一致。该漏检会让 AI 从示例和不完整规范中学习错误的字段内部布局，必须修正规范、实现和验收证据。

## What Changes

- 依据 `D-22` 将响应式字段明确为“左侧标签 + 右侧控件”的单行结构，标签按文案实际宽度占位、与 32px 控件垂直居中并保留约 `12px` 间距。
- 修正 Vue 3 + Element Plus、Vue 2 + Element UI 两套真实项目页，禁止继续使用顶部标签，同时保持 3/3/4/6/6 列、操作组、交互和零横向越界。
- 扩展浏览器测量，逐字段记录标签与控件矩形、方向、间距和垂直对齐结果。
- 重采两套项目的五档截图，更新验证报告、机器测量 JSON 和专用契约测试。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `lanhu-design-spec-contract`：增加 `D-22 / A-12` 的响应式字段左侧标签结构与双库五档几何验收要求。

## Impact

- 正式规范：`outputs/lanhu-design-spec/foundations/responsive-form-layout.md`
- 双库实现：两套 `validation-*/src/ResponsiveFormLayout.vue` 及重新生成的生产构建产物
- 验收证据：`outputs/lanhu-design-spec/validation-evidence/responsive-form-layout/`
- 自动化：`tests/lanhu-ui-reconstruction.test.mjs`
- 不修改组件清单、183 条场景、断点、业务接口、权限或其他组件页面。
