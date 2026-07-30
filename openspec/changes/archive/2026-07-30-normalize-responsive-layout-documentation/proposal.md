## Why

双组件库真实还原已经确认了字段占列、主操作色、操作组完整性和防越界等通用约束，但正式响应式规范没有完整吸收这些结论，画板映射还直接暴露 `copy / copy 2` 源命名。面向 AI 的规范需要使用可直接理解的 UI 规则和“尺寸｜列数｜状态/用途”名称，避免模型把源文件名误当成场景语义。（D-21；A-11）

## What Changes

- 将真实还原确认的通用 UI 调整写入 `responsive-form-layout.md`，明确字段控件占满等分列、主操作色 `#FF6014`、组件库默认主题不得覆盖规范、操作组不可拆分和零横向越界。
- 将 12 张画板的展示名称改成“原始尺寸｜列数｜状态/用途”，同尺寸画板以基础、空数据、数据等状态继续区分。
- 保留文档路径、画板数量和 12 个稳定画板 ID，不把 iframe、组件库类名、截图定位等验证实现细节写入正式规范。
- 扩展现有响应式规范契约测试，阻止 `copy` 类展示名和还原修正再次回退。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `lanhu-design-spec-contract`：要求响应式正式规范吸收真实还原确认的通用 UI 约束，并以尺寸、列数和状态/用途提供可读且唯一的画板展示名。

## Impact

- 正式规范：`outputs/lanhu-design-spec/foundations/responsive-form-layout.md`
- 聚焦测试：`tests/lanhu-ui-reconstruction.test.mjs`
- 需求与验收：`requirements/REQ-2026-003-lanhu-ui-reconstruction-validation.md`
- 不修改两套组件库页面、画板 ID、业务接口、依赖或现有文档路径。
