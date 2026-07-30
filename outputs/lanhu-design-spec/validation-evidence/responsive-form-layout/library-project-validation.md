# 双组件库响应式表单真实项目验证

## 结论

Vue 3 + Element Plus 与 Vue 2 + Element UI 两套现有工程均已新增独立响应式表单项目页，并通过五档 CSS 视口、真实组件、交互、刷新、生产构建和横向越界验证。

- 两套页面列数均为 `3 / 3 / 4 / 6 / 6`。
- 十个样本的字段列间距均为 `8px`，页面横向溢出均为 `0px`。
- 十个样本的全部可见字段均为“左侧标签 + 右侧控件”，没有顶部标签；标签与控件垂直中心差均为 `0px`，视觉间距均为 `12px`。
- “时间”标签实测宽度为 `28px`，四字标签为 `56px`；同一字段列内的控件会随标签固有宽度获得不同剩余宽度，未使用统一固定标签宽度。
- 所有样本的工作区均为 `x=124px, y=48px`，右侧和底部边界均为 `16px`，背景为 `#FAFBFC`，圆角为 `4px`。
- `1024 × 768` 下两套工作区均精确为 `884px × 704px`。
- 展开、收起、查询、重置和刷新在十个样本中全部通过；操作组没有拆分或越出工作区。
- 两套生产构建和聚焦契约测试均通过。

## 真实项目

| 工程 | 运行时 | 专用入口 | 真实组件 |
| --- | --- | --- | --- |
| Element Plus | Vue 3 + Element Plus `2.14.3` | `?layout=responsive-form` | Form、Input、Select、DatePicker、Button |
| Element UI | Vue 2 + Element UI `2.15.14` | `?layout=responsive-form` | Form、Input、Select、DatePicker、Button |

两个入口均与原有 26 个组件视图、183 条场景隔离，不修改 manifest，也不伪增组件场景。

## 测量结果

| 组件库 | CSS 视口 | 列数 | 首列宽度 | 标签宽度 | 首列控件宽度 | 标签间距 / 中心差 | 工作区尺寸 | 横向溢出 | 交互/刷新 | 截图 |
| --- | --- | ---: | ---: | --- | --- | --- | --- | ---: | --- | --- |
| Element Plus | `1024 × 768` | 3 | `267.328px` | `28 / 56px` | `227.328 / 199.328px` | `12px / 0px` | `884 × 704px` | `0px` | 通过 | [查看](./library-project-screenshots/element-plus-1024.jpg) |
| Element Plus | `1200 × 800` | 3 | `326px` | `28 / 56px` | `286 / 258px` | `12px / 0px` | `1060 × 736px` | `0px` | 通过 | [查看](./library-project-screenshots/element-plus-1200.jpg) |
| Element Plus | `1440 × 800` | 4 | `302.5px` | `28 / 56px` | `262.5 / 234.5px` | `12px / 0px` | `1300 × 736px` | `0px` | 通过 | [查看](./library-project-screenshots/element-plus-1440.jpg) |
| Element Plus | `1920 × 873` | 6 | `279px` | `28 / 56px` | `239 / 211px` | `12px / 0px` | `1780 × 809px` | `0px` | 通过 | [查看](./library-project-screenshots/element-plus-1920.jpg) |
| Element Plus | `2560 × 900` | 6 | `385.656px` | `28 / 56px` | `345.656 / 317.672px` | `12px / 0px` | `2420 × 836px` | `0px` | 通过 | [查看](./library-project-screenshots/element-plus-2560.jpg) |
| Element UI | `1024 × 768` | 3 | `267.328px` | `28 / 56px` | `227.328 / 199.328px` | `12px / 0px` | `884 × 704px` | `0px` | 通过 | [查看](./library-project-screenshots/element-ui-1024.jpg) |
| Element UI | `1200 × 800` | 3 | `326px` | `28 / 56px` | `286 / 258px` | `12px / 0px` | `1060 × 736px` | `0px` | 通过 | [查看](./library-project-screenshots/element-ui-1200.jpg) |
| Element UI | `1440 × 800` | 4 | `302.5px` | `28 / 56px` | `262.5 / 234.5px` | `12px / 0px` | `1300 × 736px` | `0px` | 通过 | [查看](./library-project-screenshots/element-ui-1440.jpg) |
| Element UI | `1920 × 873` | 6 | `279px` | `28 / 56px` | `239 / 211px` | `12px / 0px` | `1780 × 809px` | `0px` | 通过 | [查看](./library-project-screenshots/element-ui-1920.jpg) |
| Element UI | `2560 × 900` | 6 | `385.656px` | `28 / 56px` | `345.656 / 317.672px` | `12px / 0px` | `2420 × 836px` | `0px` | 通过 | [查看](./library-project-screenshots/element-ui-2560.jpg) |

`1200px` 相对 `1024px` 只拉伸三列宽度，`2560px` 相对 `1920px` 只拉伸六列宽度，没有产生额外断点。

## 2560px 验证说明

五档样本均使用 Chrome 的显式 CSS 视口覆盖后刷新真实项目页面。`2560px` 样本实际读取到 `window.innerWidth=2560`，页面重新执行媒体查询、组件渲染和几何计算；截图原始尺寸为 `2560 × 900`，不是把 `1920px` 图片放大，也没有修改媒体查询断点。

## 视觉修正

首轮真实项目截图发现 Element UI 专页继承了组件库默认蓝色主按钮。该差异已限制在响应式专页内修正为规范品牌色 `#FF6014`。

后续用户复核发现上一轮两套页面都使用顶部标签。旧测量只覆盖字段外框，无法发现字段内部结构错误；本轮已将两套页面修正为左侧标签，并把标签矩形、控件矩形、左右方向、水平间距、垂直中心差和单行状态写入每个字段样本。十张截图与 JSON 已全部重新生成，旧 V-21 只继续证明列数、工作区、操作组和越界，字段内部结构以 V-24 为准。

## 持久证据

- [机器测量 JSON](./library-project-measurements.json)
- [响应式表单设计规范](../../foundations/responsive-form-layout.md)
- 两套项目源码分别位于 `validation-element-plus/src/ResponsiveFormLayout.vue` 与 `validation-element-ui/src/ResponsiveFormLayout.vue`

本结论只证明当前响应式布局规范能够在这两套真实组件库工程中稳定还原，不代表未提供设计稿的 `<1024px` 布局或真实业务接口已经定义。
