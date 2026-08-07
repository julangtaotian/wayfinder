## Why

现有 UI 还原验证保留大量分散证据，设计人员仍需人工识别差异，AI 或开发人员也无法从截图问题稳定定位到真实 DOM 节点。依据 REQ-2026-019 的 D-01～D-08，需要增加一个由 AI 负责判断、每项目仅交付标注截图与节点级 Markdown 的精简验收闭环。

## What Changes

- 增加确定性的 AI UI 验收产物生成器，将 AI 提供的页面、节点、坐标和视觉结论转成标注 PNG 与 Markdown。
- 强制每项目只交付 `ui-review.png` 和 `ui-review.md`，原始截图、DOM 快照与中间 JSON 留在临时目录。
- 对问题执行高置信度过滤、十条上限、稳定编号、节点定位与坐标边界校验；零问题时生成不夸大覆盖范围的通过结果。
- 使用现有 Element Plus 与 Element UI 项目分别生成一组真实验收结果，并增加聚焦合同测试与生产构建验证。

## Capabilities

### New Capabilities

- `ai-ui-review-artifacts`: 定义 AI 验收输入、标注截图、节点级 Markdown、两文件约束、过滤规则和错误边界。

### Modified Capabilities

- 无。

## Impact

- 新增 `outputs/lanhu-design-spec/validation-tools/` 下的独立生成工具。
- 新增 `outputs/lanhu-design-spec/ai-ui-review/` 下两套项目的四个最终验收文件。
- 新增 `tests/ai-ui-review.test.mjs` 聚焦测试。
- 不修改两套组件库页面行为，不新增 npm 依赖，不替换现有 183 场景历史证据。
