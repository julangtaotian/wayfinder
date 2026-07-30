## Why

现有蓝湖 Markdown 规范没有定义 PC 端不同分辨率下右侧内容区每行应容纳多少个表单字段，AI 只能自行猜测断点、列数和间距，容易产生横向越界或与设计稿不一致的换行。新蓝湖项目已给出 12 张适配画板和明确规则，需要将其整理成可机器读取、可验证的基础规范。

本变更实现需求决策 `D-19`。

## What Changes

- 新建响应式表单布局 Markdown，完整映射“后台适配规范”12 张画板。
- 明确 `1024px～1439px` 三列、`1440px～1919px` 四列、`≥1920px` 六列，区分真正的列数断点与 1200/2560 自动拉伸参考画板。
- 记录右侧工作区壳层、`16px` 边界、`8px` 字段列间距、等宽列公式、操作组换行和 `<1024px` 未定义边界。
- 记录并消解源规则“1400”与同页 `1440` 规则、`1440` 画板之间的冲突。
- 更新设计规范索引和 Markdown 清单计数，增加聚焦契约测试。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `lanhu-design-spec-contract`：增加 PC 端响应式表单布局的可追溯 Markdown 契约，并将当前清单更新为 45 张源画板、30 份详细规范和 31 个 Markdown 文件。

## Impact

- 受影响文件：`outputs/lanhu-design-spec/README.md`、`outputs/lanhu-design-spec/foundations/responsive-form-layout.md`、`tests/lanhu-ui-reconstruction.test.mjs`、`openspec/specs/lanhu-design-spec-contract/spec.md`。
- 不修改生产业务代码、组件库工程、接口、依赖或历史视觉证据。
- 组件类文档仍为 26 份，组件场景仍为 183 条；新增文件属于基础布局规范，不新增 `SCN-*`。
