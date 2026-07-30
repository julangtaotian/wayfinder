# Element Plus / Element UI 双组件库验收记录

验证日期：2026-07-28

## 验收对象

| 工程 | 真实运行时 | 组件库注册 | 组件视图 | 场景 | 本地图标 |
| --- | --- | --- | ---: | ---: | ---: |
| `validation-element-plus/` | Vue `3.5.40` + Element Plus `2.14.3` | `app.use(ElementPlus)` | 26 | 183 | 6 |
| `validation-element-ui/` | Vue `2.7.16` + Element UI `2.15.14` | `Vue.use(ElementUI)` | 26 | 183 | 6 |

两套工程均把 `inputPolicy` 固定为 `markdown-and-local-assets`，`nativeBaselineAccepted` 固定为 `false`。原 `validation-ui/` 只保留历史追溯，不参与本轮 A-04、A-05 的通过率。

## 构建与静态门禁

- 两套 `npm run build` 均通过。
- Table 扩展后的聚焦测试 `44 / 44`、仓库完整测试 `69 / 69`、`npm run validate` 均通过。
- 需求实施阶段校验通过；需求完成阶段因 A-05 未勾选且状态保持“待验证”而按预期拒绝归档。
- Element Plus：Vite `5.4.14`，转换 1587 个模块。
- Element UI：Vite `5.4.14`，转换 301 个模块。
- 两套 `src/manifest.json` 均为 26 个组件视图、183 个唯一场景，全部场景能映射到组件视图。
- 两套工程均复制 6 个 PNG 到 `public/assets/icons/`，源码中真实引用本地路径。
- Vue 单文件组件内未使用原生 `input`、`button`、`select`、`textarea` 代替组件库表单组件。
- 构建仅有单包体积超过 500 kB 的非阻断提示；本验收页优先保证组件全量覆盖，暂未做按路由拆包。

## Chrome 运行时证据

| 检查项 | Element Plus | Element UI |
| --- | --- | --- |
| HTML 运行时标识 | `Vue 3.5.40`、`Element Plus 2.14.3` | `Vue 2.7.16`、`Element UI 2.15.14` |
| 导航视图 | 26 | 26 |
| 导航场景数求和 | 183 | 183 |
| 未编译的 `el-*` 标签 | 0 | 0 |
| 当前页面组件库 DOM 根节点 | 337（Select 页实测） | 258（Select 页实测） |
| Button hash 刷新恢复 | `#button` 刷新后仍为 9 场景 | `#button` 刷新后仍为 9 场景 |
| 最终构建控制台错误/警告 | 0 | 0 |

## 显式视觉值抽查

| 规范值 | Element Plus 实测 | Element UI 实测 | 结果 |
| --- | --- | --- | --- |
| 主要按钮高 `32px` | `32px` | `32px` | 通过 |
| 主要按钮品牌色 `#FF6014` | `rgb(255, 96, 20)` | `rgb(255, 96, 20)` | 通过 |
| 按钮圆角 `2px` | `2px` | `2px` | 通过 |
| Button 本地图标 `24 × 24px` | `24 × 24px` | `24 × 24px` | 通过 |
| Select `240 × 32px` | `240 × 32px` | `240 × 32px` | 通过 |
| Select 选中项文字 `#FF6014` | `rgb(255, 96, 20)` | `rgb(255, 96, 20)` | 通过 |
| Select 选中项背景 `#FDF4EE` | `rgb(253, 244, 238)` | `rgb(253, 244, 238)` | 通过 |
| Select 勾选图标 `24 × 24px` | `24 × 24px` | `24 × 24px` | 通过 |
| Small Form 控件高 `24px` | `24px` | `24px` | 通过 |
| Large Form 控件高 `40px` | `40px` | `40px` | 通过 |

## 场景与必要交互

- Button：9 个场景分别呈现填充、朴素、圆角、圆形图标、两类禁用、文字、纯图标、图标加文字；两套页面的禁用场景均有 6 个真实不可用按钮。
- Select：9 个场景分别呈现基础、禁用选项、整体禁用、可清空、多选、自定义模板、分组、筛选、远程搜索；下拉可展开并定位选中项。
- Select 远程搜索：两套页面均可在 Loading、Empty、Error、Ready 之间切换；Error 展开后显示“加载失败，请重试”。
- DateTimePicker：两套页面均为 14 个真实日期组件，并按场景映射为 `date-default`、`date-shortcut`、`week-default`、`year-default`、`month-default`、`dates-default`、`daterange-default`、`daterange-shortcut`、`monthrange-default`、`monthrange-shortcut`、`datetime-default`、`datetime-shortcut`、`datetimerange-default`、`datetimerange-shortcut`。
- 日期快捷项：两套页面展开后均可见“今天、昨天、一周前”和真实日历面板。
- 高频 32px：18 条场景分别使用 Button、Radio、分段选择、Checkbox、Input、Select、DatePicker、InputNumber、Switch、Upload、Table、Pagination、Tag、Tabs、Alert、Dialog、Tooltip、Popconfirm，不再复用同一个简化控件。
- 其他场景：Checkbox 禁用/边框、Input 密码/文本域/复合/尺寸/建议/限长、Progress 内显/品牌色/环形/自定义文案、Upload 头像/图片列表/拖拽/手动、Form 行内/左对齐/右对齐/顶部对齐、Menu 横向/Dropdown/纵向、Radio 禁用/按钮/边框、Transfer 搜索/Footer/按钮文案组合、TimePicker 固定时间/任意时间/范围均已在两套页面中定位到对应组件结构。
- Dialog：两套页面的触发按钮均能打开真实对话框，标题、内容表单和确定/取消操作可见。
- Table：两套页面均使用真实 `el-table` 覆盖 24 条新增场景，包含滚动、排序、筛选、选择、展开、树形懒加载、汇总、合并和 Small/Medium/Large 经典页面；必要状态与三方视觉证据完整。
- Table 展示宽度：普通验收页固定为单列；经典 Small/Medium/Large 使用容器宽度监听，仅在普通预览中等比缩小完整页面和占位高度。Chrome `1920 × 900` 下原 Medium/Large 越界 `62px / 542px`，修复后双库三档均为 `0px`；`1280 × 800` 窄视口复测三档也均为 `0px`。
- Table 经典底色：三张源 WebP 含透明像素，参考裁图按蓝湖详情页实际承载色 `#F0F2F5` 合成；Small、Medium、Large 的双库工作区均实测为 `rgb(240, 242, 245)`。

## 本轮发现并修正

1. 日期 14 场景最初按序循环类型，导致快捷项后的类型错位；已改为逐场景显式映射。
2. Element UI Select 弹层最初仍继承 `#409EFF`；已把弹层主题提升为全局覆盖，复测为 `#FF6014` 与 `#FDF4EE`。
3. Select 勾选图标最初放在输入框前缀；已移入下拉选中项，并按 `24 × 24px` 使用本地 PNG。
4. Checkbox、Input、Menu、Progress、Radio、Transfer、Upload、Form、TimePicker 等场景最初存在序号与属性错位；已按 Markdown 场景标题重新映射。
5. 高频 18 场景最初使用错误的顺序；已改为 18 种对应 Element 组件。
6. Table 普通验收页最初强制双列导致固定宽组件越出卡片，经典页面透明像素又被误判为黑色；现已改为单列展示，并按蓝湖实际画布 `#F0F2F5` 重做三档参考、实际和对照证据。
7. 首轮单列修正没有处理经典 Medium/Large 自身的 `1440px / 1920px` 固定画布，仍分别越出预览卡片 `62px / 542px`；现已让普通预览随卡片可用宽度等比缩小，并验证六张 A-05 原尺寸实际图的文件哈希完全不变。

## 截图证据

- [Element Plus Select 展开态](library-component-screenshots/element-plus-select-open.png)
- [Element UI Select 展开态](library-component-screenshots/element-ui-select-open.png)
- [Element Plus Select 错误态](library-component-screenshots/element-plus-select-error.png)
- [Element UI Select 错误态](library-component-screenshots/element-ui-select-error.png)
- [Element Plus 日期 14 场景](library-component-screenshots/element-plus-date-14-scenes.png)
- [Element UI 日期 14 场景](library-component-screenshots/element-ui-date-14-scenes.png)
- [Element Plus 日期快捷面板](library-component-screenshots/element-plus-date-shortcuts-open.png)
- [Element UI 日期快捷面板](library-component-screenshots/element-ui-date-shortcuts-open.png)
- [Element Plus 高频 18 场景](library-component-screenshots/element-plus-frequent-18-scenes.png)
- [Element UI 高频 18 场景](library-component-screenshots/element-ui-frequent-18-scenes.png)
- [Element Plus Table 单列展示](library-component-screenshots/element-plus-table-single-column.png)
- [Element UI Table 单列展示](library-component-screenshots/element-ui-table-single-column.png)
- [Element Plus 经典 Large 自适应预览](library-component-screenshots/element-plus-table-classic-responsive.png)
- [Element UI 经典 Large 自适应预览](library-component-screenshots/element-ui-table-classic-responsive.png)
- [Table Small 三方对照](a05-visual-matrix/diff/SCN-TABLE-22-comparison.png)
- [Table Medium 三方对照](a05-visual-matrix/diff/SCN-TABLE-23-comparison.png)
- [Table Large 三方对照](a05-visual-matrix/diff/SCN-TABLE-24-comparison.png)
- [Form 中文默认三方对照](a05-visual-matrix/diff/SCN-FORM-DEFAULT-CN-01-comparison.png)
- [Form 英文左对齐三方对照](a05-visual-matrix/diff/SCN-FORM-DEFAULT-EN-03-comparison.png)
- [Form Large 顶部对齐三方对照](a05-visual-matrix/diff/SCN-FORM-LARGE-CN-05-comparison.png)
- [Form Small 顶部对齐三方对照](a05-visual-matrix/diff/SCN-FORM-SMALL-CN-05-comparison.png)
- [DateTimePicker 日期范围三方对照](a05-visual-matrix/diff/SCN-DATE-TIME-PICKER-07-comparison.png)
- [DateTimePicker 日期时间范围三方对照](a05-visual-matrix/diff/SCN-DATE-TIME-PICKER-14-comparison.png)
- [TimePicker 时间范围三方对照](a05-visual-matrix/diff/SCN-TIME-PICKER-03-comparison.png)

## 结论与验收边界

- A-04：通过。两套工程都是真实组件库实现，可独立构建、启动、导航、刷新，并覆盖 26 个组件视图和 183 条场景。
- A-05：通过。已完成 183 张蓝湖参考裁图、两套各 183 张实际裁图、194 张状态裁图和 183 组三方对照；自动证据门禁及人工三方视觉批准均为 `183 / 183`，待复核与自动失败均为 0。
- Vue 2 与 Element UI 已停止维护；本套页面只用于现存项目视觉兼容验收，不应据此建议新项目采用 Vue 2。
