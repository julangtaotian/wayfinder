# Form 默认尺寸（英文）

来源：`Form/default-en`

## 规范元数据

| 字段 | 值 |
| --- | --- |
| 文档类型 | 表单规范 |
| 蓝湖画板 | `Form/default-en` |
| 画板数量 | `1` |
| 画板场景 | `5` 条；计入全库 183 条场景 |
| 还原状态 | 蓝湖可见内容已记录；已通过双组件库隔离还原和全量三方视觉确认 |
| 来源判定 | 规范表中未特别注明的可见数值为“蓝湖标注”；带“画板实测”字样的值为“画板实测”；实现、使用、提交、布局和异步规则为“研发补充” |
| 测量基准 | 蓝湖 Web `@1x`；“画板实测约”项目按 `±2px` 容差验证 |
| 通用视觉基线 | [组件尺寸与样式基线](../foundations/component-sizing.md)；本文件显式值覆盖通用值 |
| 图标资产清单 | [组件图标资产清单](../assets/icons/manifest.md)；本文件“图标资产”章节决定具体使用与替换边界 |

## 尺寸与样式

| 项目 | 规范 |
| --- | --- |
| 控件高度 | `32px` |
| 主控件示例宽度 | 画板实测约 `392px` |
| 字号 / 行高 | `14px / 22px` |
| 标签与控件水平间距 | 画板常用 `12px` |
| 必填标记 | Danger 色 `*` |
| 典型表单标签 / 控件 | 标签区 `124px`；控件 `336px`；表单内容总宽 `460px` |
| 对齐表单标签 / 控件 | 左、右对齐标签区 `134px`；控件 `326px`；顶部对齐控件 `460px` |
| 行内字段 | Approved by 标签 / 输入 `94px / 186px`；Activity zone 标签 / 输入 `98px / 182px` |
| 行内间距 / 按钮 | 字段组间距 `24px`；Query `72px × 32px`；Reset `70px × 32px` |
| 日期时间组合 | 日期框 + `-` + 时间框，组合宽度继承当前控件宽度 |
| 多行输入 | `52px` 高 |

默认尺寸英文表单用于英文文案、较长字段标签或国际化后台页面。控件尺寸与中文默认版一致，差异主要是标签预留宽度与文案换行策略。

## 组件结构

| 区域 | 组成与顺序 | 视觉与状态 | 来源 |
| --- | --- | --- | --- |
| Form container | Vertically ordered field groups followed by actions | Use Default control height and consistent row spacing | 蓝湖标注/画板实测；未标注项按研发补充 |
| Field row | Label → control → optional help/error | English labels keep documented width, alignment and wrapping | 蓝湖标注/画板实测；未标注项按研发补充 |
| Actions | Primary + secondary button | Align with the control start edge | 蓝湖标注/画板实测；未标注项按研发补充 |

## 必要交互 UI 状态

| 状态 | 触发条件 | 可见变化 | 恢复方式 | 来源 |
| --- | --- | --- | --- | --- |
| Initial / Focus | Initial data / user enters a field | Child controls use their documented Default/Focus visuals | Blur restores the border while retaining value | 蓝湖标注/画板实测；未标注项按研发补充 |
| Error / Disabled | Validation failure / disabled field | Error border/message and disabled visual follow child specifications | Fixing/unlocking restores state | 蓝湖标注/画板实测；未标注项按研发补充 |

## 图标资产

| 图标语义 | 本地资产 | 显示尺寸 | 颜色 | 适用状态 | 替换边界 | 来源 |
| --- | --- | --- | --- | --- | --- | --- |
| Child control icons | [组件图标资产清单](../assets/icons/manifest.md) | Follow Input, Select, date/time and Upload specifications | Follow child control state | Default / Focus / Error / Disabled | The form must reuse child component assets instead of inventing form-level icons | 蓝湖下载切图/画板实测 |

## 画板场景

| 场景 ID | 场景 | 画板展示 | 说明 |
| --- | --- | --- | --- |
| `SCN-FORM-DEFAULT-EN-01` | Typical form | Activity name、zone、time、delivery、type、resources、form、Create/Cancel | 完整展示英文标签与 Input、日期/时间、Switch、Checkbox、Radio、Textarea 的组合 |
| `SCN-FORM-DEFAULT-EN-02` | Inline form | Approved by、Activity zone、Search、Reset | 用于查询和短条件筛选；按钮与输入框保持默认 `32px` |
| `SCN-FORM-DEFAULT-EN-03` | Left-aligned labels | 标签共享左边界 | 标签长度接近时便于纵向扫描，但要为最长英文标签预留宽度 |
| `SCN-FORM-DEFAULT-EN-04` | Right-aligned labels | 标签靠近控件 | 强化标签和控件的对应关系，避免长标签挤压输入区域 |
| `SCN-FORM-DEFAULT-EN-05` | Top-aligned labels | 标签位于控件上方 | 长英文标签、国际化长度不确定或窄屏时优先使用 |

## 场景精确差异

- 英文典型表单的 Activity zone 使用 Select，Activity time 使用 DatePicker + TimePicker；这与中文典型表单的三个普通 Input 不同。
- 行内表单两组标签与输入分别为 `94px + 186px`、`98px + 182px`，不得套用中文行内宽度。
- Left-aligned labels 使用 `Name`；Right-aligned labels 使用 `Activity name`，并将 `Activity type` 简化为 `Type`。
- Top-aligned labels 的蓝湖示例保留中文“顶对齐标签”作为 Checkbox 组标签，这是原画内容，不应自行翻译或删除。
- 隔离参考裁图顶部存在裁切；AI 生成完整表单时仍需输出 Activity name 标签和完整的对齐方式分段选项。

## AI 还原约束

- 必须使用组件库 Form、Input、Select、DatePicker、TimePicker、Switch、Checkbox、Radio、Textarea 和 Button，不得退化为原生控件。
- 主按钮使用 `#FF6014`；必填星号使用 `#F53F3F`；边框使用 `#DCDCDC`；placeholder 使用 `#BFBFBF`。
- 英文标签不允许省略、强制换行或挤占输入区；宽度不足时将整个字段切换为顶部对齐或单列布局。
- Select、日期、时间图标优先使用组件库内置等义图标；需要业务替换时按[组件图标资产清单](../assets/icons/manifest.md)执行。

## 布局规则

- 为英文长标签和较长操作文案预留宽度，避免强制截断。
- 英文句式、大小写和标点在同一表单内保持一致。
- 与中文默认尺寸保持相同的交互层级和校验规则，仅调整文本容纳空间。
- 标签支持左对齐、右对齐和顶部对齐；长标签优先顶部对齐，不压缩输入区。
- 画板覆盖典型表单、行内表单和多种标签对齐方式。
