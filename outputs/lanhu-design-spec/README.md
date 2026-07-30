# 后台设计规范

本目录将蓝湖项目「后台规范」的 33 张画板和「后台适配规范」的 12 张画板整理为 `1` 个索引和 `30` 份可独立查阅的详细 Markdown 规范，共 `31` 个 Markdown 文件。

这是一套面向 PC 端、技术栈无关的 UI 视觉规范。它约束组件最终呈现的结构、尺寸、颜色、字体、间距、边框、圆角、阴影、图标和必要交互状态；Element、Element Plus 或其他组件库只是可选复用方式，不是规范前提。AI 可以根据目标项目已有技术栈复用、包装或自行实现组件，但必须覆盖与本规范冲突的默认视觉。

## 阅读约定

- 同一组件的多张同名画板会合并到一个文件，避免重复维护。
- `来源`记录对应的蓝湖画板名称，便于回查视觉细节；辅助色和日期时间选择器各由两张画板合并到一份详细规范，Table 基础规范与经典表格页三档画板合并到一份详细规范，响应式表单布局由 12 张适配画板合并到一份基础规范。
- 色值以高清画板文字标注为准；画板只给出调色板名称而未给出 HEX 时，保留调色板名称。
- 尺寸以 1× 高清画板中的控件像素和尺寸示例为准；统一基线见[组件尺寸与样式](./foundations/component-sizing.md)。
- 每份详细规范包含“规范元数据”；规范表中未特别注明的可见数值为“蓝湖标注”，从 1× 画板读取的值标为“画板实测”，实现、使用、提交、布局和异步规则为“研发补充”。
- “画板实测约”项目使用 Web `@1x` 基准并按 `±2px` 容差验证，不把实测约数表述为蓝湖文字标注。
- 蓝湖没有定义的视觉或交互明确写“蓝湖未定义”；研发补充不能冒充设计事实。
- 每个组件文件均包含“组件结构”“必要交互 UI 状态”和“图标资产”，以及具体尺寸、视觉样式、场景、变体和使用规则。
- 蓝湖可直接导出的 `6` 个原始透明 PNG 已保存到 [`assets/icons/`](./assets/icons/)；其他嵌在栅格画板中的图标逐项记录“蓝湖未提供独立资产”和替换边界。

## 完整度

- 共覆盖 `45` 张蓝湖画板，整理为 `30` 份详细规范和本索引，共 `31` 个 Markdown 文件。
- 色彩规范当前共记录 `82` 个 HEX 色值格、`71` 个唯一 HEX，其中包含本次为辅助色 Token 页补采的 `21` 个文字、背景、边框及交互色值格。
- Cyan 的 Hover 与 Active 同为 `#0AA5A8`；Brand7 在截图中重复用于主题文字和链接。
- 所有组件文档都已补充尺寸与样式；通用基线为 `24px / 32px / 40px` 三档高度。
- `26` 份组件、表单和选择器文档均包含“画板场景”章节，共拆分记录 `183` 条场景、状态或组合说明；每条场景都有唯一 `SCN-*` ID。
- 响应式表单布局属于基础规范，不新增 `SCN-*`；它单独定义 `1024px～1439px` 三列、`1440px～1919px` 四列、`≥1920px` 六列，以及 `16px / 8px` 边界和间距。

## AI 使用边界

- AI 读取时以本目录 Markdown 和 Markdown 引用的本地资产为输入，不能把参考画板、既有实现或对话中的隐藏信息当作规范内容。
- AI 应先判断目标项目是否已有可复用组件库；可以使用 Element、Element Plus 或其他实现，也可以自行实现。组件库 API、DOM 和默认主题不是设计事实，最终 UI 才是验收对象。
- PC 后台右侧表单必须先读取[响应式表单布局](./foundations/responsive-form-layout.md)，不能按组件库默认栅格或模型经验猜测每行字段数。
- 验证只比较基础 Token、组件本体和必要状态区域，不要求复刻蓝湖规范展示页的页头、侧栏、导航、卡片和说明性排版。
- 显式尺寸和组件内部间距按 Web `@1x` 使用 `±2px` 容差，显式 HEX、图标语义/尺寸/颜色、可见文案和初始状态必须一致。
- 组件库内部键盘算法、请求取消、缓存、持久化和卸载策略不属于通用视觉规范；只有会影响 UI 的 Default、Hover、Focus、Active、Selected、Disabled、Loading、Empty、Error、展开/收起与值回填状态进入本规范。
- “能生成组件页面”不等于“能够稳定还原规范”。只有文档结构、本地资产、183 条场景、显式视觉值和必要状态证据全部通过，才能得出“可用于 AI 还原本套 UI 规范”。
- 当前双组件库已覆盖 `26` 个组件、`183` 条场景；全部场景均已完成双组件库实现、必要状态留证和逐场景三方视觉确认，全库 A-05 为 `183 / 183` 通过，待复核与自动失败均为 `0`。
- 基线、参考画板和差异证据见 [`validation-evidence/`](./validation-evidence/)；最终结论见后续生成的 `validation-report.md`。

## 目录

- [基础色彩](./foundations/)
- [组件尺寸与样式](./foundations/component-sizing.md)
- [PC 端响应式表单布局](./foundations/responsive-form-layout.md)
- [通用组件](./components/)
- [选择器](./pickers/)
- [表单规范](./forms/)

## 蓝湖画板覆盖范围

| 序号 | 蓝湖画板 | 输出文件 |
| --- | --- | --- |
| 1 | Color 颜色－主色功能色 | [主色与功能色](./foundations/colors-primary-functional.md) |
| 2 | Color 颜色－辅助色（Token） | [辅助色](./foundations/colors-assist.md) |
| 3 | Button 按钮 | [Button](./components/button.md) |
| 4 | Color 颜色－辅助色（色板） | [辅助色](./foundations/colors-assist.md) |
| 5 | 高频组件集合－32px | [高频组件集合](./components/frequent-components-32.md) |
| 6 | 对话框应用建议 | [对话框应用建议](./components/dialog-usage.md) |
| 7 | Dialog 对话框 | [Dialog](./components/dialog.md) |
| 8 | DatePicker 日期选择器 | [日期时间选择器](./pickers/date-time-picker.md) |
| 9 | ColorPicker 颜色选择器 | [ColorPicker](./components/color-picker.md) |
| 10 | Menu 菜单 | [Menu](./components/menu.md) |
| 11 | Badge 徽章 | [Badge](./components/badge.md) |
| 12 | Form / large-cn | [大尺寸中文表单](./forms/form-large-cn.md) |
| 13 | Pagination 分页 | [Pagination](./components/pagination.md) |
| 14 | Form / default-en | [默认尺寸英文表单](./forms/form-default-en.md) |
| 15 | Progress 进度条 | [Progress](./components/progress.md) |
| 16 | Select 选择器 | [Select](./components/select.md) |
| 17 | Radio 单选框 | [Radio](./components/radio.md) |
| 18 | Input 输入框 | [Input](./components/input.md) |
| 19 | Checkbox 多选框 | [Checkbox](./components/checkbox.md) |
| 20 | Form / small-cn | [小尺寸中文表单](./forms/form-small-cn.md) |
| 21 | Transfer 穿梭框 | [Transfer](./components/transfer.md) |
| 22 | Form / default-cn | [默认尺寸中文表单](./forms/form-default-cn.md) |
| 23 | Cascader 级联选择器 | [Cascader](./pickers/cascader.md) |
| 24 | Switch 开关 | [Switch](./components/switch.md) |
| 25 | Upload 上传 | [Upload](./components/upload.md) |
| 26 | Collapse 折叠面板 | [Collapse](./components/collapse.md) |
| 27 | DateTimePicker 日期时间选择器 | [日期时间选择器](./pickers/date-time-picker.md) |
| 28 | TimePicker 时间选择器 | [TimePicker](./pickers/time-picker.md) |
| 29 | InputNumber 计数器 | [InputNumber](./components/input-number.md) |
| 30 | Table 表格 | [Table](./components/table.md) |
| 31 | 经典表格页案例/中（1440 × 900） | [Table](./components/table.md) |
| 32 | 经典表格页案例/大（1920 × 1080） | [Table](./components/table.md) |
| 33 | 经典表格页案例/小（1280 × 800） | [Table](./components/table.md) |
| 34 | 后台适配规范 / `1024 × 768｜3 列｜空数据` | [响应式表单布局](./foundations/responsive-form-layout.md) |
| 35 | 后台适配规范 / `1440 × 800｜4 列｜空数据` | [响应式表单布局](./foundations/responsive-form-layout.md) |
| 36 | 后台适配规范 / `2560 × 1600｜6 列｜宽屏` | [响应式表单布局](./foundations/responsive-form-layout.md) |
| 37 | 后台适配规范 / `1440 × 800｜4 列｜基础` | [响应式表单布局](./foundations/responsive-form-layout.md) |
| 38 | 后台适配规范 / `1024 × 768｜3 列｜基础` | [响应式表单布局](./foundations/responsive-form-layout.md) |
| 39 | 后台适配规范 / `1200 × 800｜3 列｜基础` | [响应式表单布局](./foundations/responsive-form-layout.md) |
| 40 | 后台适配规范 / `1200 × 800｜3 列｜空数据` | [响应式表单布局](./foundations/responsive-form-layout.md) |
| 41 | 后台适配规范 / `1920 × 1024｜6 列｜基础` | [响应式表单布局](./foundations/responsive-form-layout.md) |
| 42 | 后台适配规范 / `2957 × 5347｜规则总览｜断点与间距` | [响应式表单布局](./foundations/responsive-form-layout.md) |
| 43 | 后台适配规范 / `1440 × 800｜4 列｜数据` | [响应式表单布局](./foundations/responsive-form-layout.md) |
| 44 | 后台适配规范 / `1024 × 768｜3 列｜数据` | [响应式表单布局](./foundations/responsive-form-layout.md) |
| 45 | 后台适配规范 / `1200 × 800｜3 列｜数据` | [响应式表单布局](./foundations/responsive-form-layout.md) |
