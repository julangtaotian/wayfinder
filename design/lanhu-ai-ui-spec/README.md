# 后台 UI 还原规范（AI 输入版）

本目录是面向 AI 和前端研发的纯设计规范输入，只描述 PC 端 UI 的结构、尺寸、颜色、字体、间距、边框、圆角、阴影、图标、文案、布局和必要交互状态。

规范不绑定框架或组件库。目标项目可以复用已有组件库、包装现有组件或自行实现，但最终可见结果必须服从本目录中的明确规则。

## 输入范围

- `1` 份入口说明，即本文件。
- `4` 份基础规范。
- `26` 份组件、表单和选择器规范。
- 共 `30` 份详细规范和本入口，即 `31` 个 Markdown 文件。
- `183` 条已知 UI 场景。
- `6` 个本地图标文件及 `1` 份图标清单。

目录内容仅由 UI 规则、场景说明和本地图标资产组成。

## AI 读取顺序

1. 先读取本文件。
2. 读取 `foundations/` 下的颜色、通用尺寸和响应式布局规范；PC 后台右侧表单必须先读取响应式表单布局。
3. 读取 `assets/icons/manifest.md`，确定图标语义和替换边界。
4. 根据目标页面读取对应的 `components/`、`forms/`、`pickers/` 文档。
5. 同一属性存在多处定义时，优先级为：目标场景明确值 > 当前组件明确值 > 基础规范。

## 实现规则

1. 所有明确 HEX、尺寸、间距、圆角、边框、字体、图标尺寸和可见文案都必须落实，不得直接沿用与规范冲突的组件库默认值。
2. “蓝湖标注”是设计给出的明确值；“画板实测”是按 Web `@1x` 画板测量的近似值；“研发补充”用于静态设计没有定义、但真实产品需要的可见状态。
3. 文档写明“蓝湖未定义”时，不得把研发补充描述成原始设计事实；应按文档给出的补充边界实现。
4. 必须覆盖文档列出的 Default、Hover、Focus、Active、Selected、Disabled、Loading、Empty、Error、展开、收起和值回填等适用状态。
5. 图标优先使用 `assets/icons/` 中的本地文件；使用项目图标库替换时，语义、显示尺寸、颜色、线宽、对齐和状态变化必须满足图标清单。
6. 只还原组件本体和业务页面需要的组合关系，不需要模仿设计规范展示页的目录、说明卡片或标注排版。
7. 容器宽度不足时应调整页面布局，不得压缩具有明确宽度的组件、裁切弹层或让内容越界。

## 目录

```text
lanhu-ai-ui-spec/
├── README.md
├── foundations/
│   ├── colors-primary-functional.md
│   ├── colors-assist.md
│   ├── component-sizing.md
│   └── responsive-form-layout.md
├── components/
│   ├── badge.md
│   ├── button.md
│   ├── checkbox.md
│   ├── collapse.md
│   ├── color-picker.md
│   ├── dialog-usage.md
│   ├── dialog.md
│   ├── frequent-components-32.md
│   ├── input-number.md
│   ├── input.md
│   ├── menu.md
│   ├── pagination.md
│   ├── progress.md
│   ├── radio.md
│   ├── select.md
│   ├── switch.md
│   ├── table.md
│   ├── transfer.md
│   └── upload.md
├── forms/
│   ├── form-default-cn.md
│   ├── form-default-en.md
│   ├── form-large-cn.md
│   └── form-small-cn.md
├── pickers/
│   ├── cascader.md
│   ├── date-time-picker.md
│   └── time-picker.md
└── assets/
    └── icons/
        ├── manifest.md
        └── *.png
```

## 基础规范

- [主色与功能色](foundations/colors-primary-functional.md)
- [辅助色与中性色](foundations/colors-assist.md)
- [组件尺寸与样式基线](foundations/component-sizing.md)
- [PC 端响应式表单布局](foundations/responsive-form-layout.md)
- [组件图标资产清单](assets/icons/manifest.md)

## 组件规范

- [Badge 标记](components/badge.md)
- [Button 按钮](components/button.md)
- [Checkbox 多选框](components/checkbox.md)
- [Collapse 折叠面板](components/collapse.md)
- [ColorPicker 颜色选择器](components/color-picker.md)
- [Dialog 应用建议](components/dialog-usage.md)
- [Dialog 对话框](components/dialog.md)
- [高频 32px 组件集合](components/frequent-components-32.md)
- [InputNumber 计数器](components/input-number.md)
- [Input 输入框](components/input.md)
- [Menu 菜单](components/menu.md)
- [Pagination 分页](components/pagination.md)
- [Progress 进度条](components/progress.md)
- [Radio 单选框](components/radio.md)
- [Select 选择器](components/select.md)
- [Switch 开关](components/switch.md)
- [Table 表格](components/table.md)
- [Transfer 穿梭框](components/transfer.md)
- [Upload 上传](components/upload.md)

## 表单与选择器

- [中文默认表单](forms/form-default-cn.md)
- [英文默认表单](forms/form-default-en.md)
- [中文大型表单](forms/form-large-cn.md)
- [中文小型表单](forms/form-small-cn.md)
- [Cascader 级联选择器](pickers/cascader.md)
- [DateTimePicker 日期时间选择器](pickers/date-time-picker.md)
- [TimePicker 时间选择器](pickers/time-picker.md)
