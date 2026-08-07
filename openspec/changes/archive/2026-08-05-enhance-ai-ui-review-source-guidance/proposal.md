## Why

现有 `ui-review.md` 能准确定位运行时 DOM，但仍要求 AI 自行推断源码文件、规则锚点和安全修改范围。为降低误改全局样式、组件库依赖或错误节点的风险，需要让同一份报告直接承载从页面问题到源码修复与复验的完整上下文。[D-04][D-09]

## What Changes

- 扩展每条验收问题的结构化输入，要求提供安全的仓库相对源码路径、稳定代码锚点、当前样式来源、精确修改内容、修改作用域和禁止修改范围。[D-04][D-05][D-09]
- 在 `ui-review.md` 中输出复验工作目录、命令、页面和断言，使 AI 可以在修改后验证实际结果。[D-09]
- 拒绝绝对路径、包含 `..` 的源码路径，以及缺少源码映射或复验断言的问题输入。[D-09][A-03]
- 更新 Element Plus 与 Element UI 的两份现有报告；继续保持每个项目只有 `ui-review.png` 和 `ui-review.md` 两个交付文件。[D-02][A-01]
- 扩展现有聚焦测试，验证新增字段、Markdown 输出与错误边界。[A-03][A-05]

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `ai-ui-review-artifacts`：问题报告从 DOM 级定位增强为可直接指导 AI 安全定位源码、准备修改并执行复验的两文件验收产物。[D-02][D-04][D-05][D-09]

## Impact

- 受影响代码：`outputs/lanhu-design-spec/validation-tools/generate-ai-ui-review.mjs`。
- 受影响测试：`tests/ai-ui-review.test.mjs`。
- 受影响产物：两个项目现有的 `ui-review.md`；对应 PNG 不变，目录文件数量不变。
- 不新增依赖，不修改两套验收项目的 UI 源码，不自动执行报告中的修复建议。
