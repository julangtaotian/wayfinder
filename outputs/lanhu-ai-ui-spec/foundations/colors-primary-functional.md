# 主色与功能色

来源：`Color 颜色-主色功能色`

## 规范元数据

| 字段 | 值 |
| --- | --- |
| 文档类型 | 基础规范 |
| 蓝湖画板 | `Color 颜色-主色功能色` |
| 画板数量 | `1` |
| 画板场景 | 不适用：基础规范不计入组件场景总数 |
| 来源判定 | 规范表中未特别注明的可见数值为“蓝湖标注”；带“画板实测”字样的值为“画板实测”；实现、使用、提交、布局和异步规则为“研发补充” |
| 绘制基准 | 蓝湖 Web `@1x`；“画板实测约”表示按画板像素测量的近似值 |

## 适用范围

本规范定义浅色模式下的品牌色与功能反馈色。功能色应按交互状态使用，禁止只使用默认色覆盖悬浮、按下和禁用状态。

## 品牌色（Brand）

| 状态 | 建议 Token | 色值 |
| --- | --- | --- |
| 常规 | `--color-brand-default` | `#FF6014` |
| 悬浮 | `--color-brand-hover` | `#FF8548` |
| 点击 | `--color-brand-active` | `#EA4C00` |
| 特殊场景 | `--color-brand-subtle` | `#FFB28B` |
| 一般禁用 | `--color-brand-disabled` | `#FFD6BA` |
| 文字禁用 | `--color-brand-text-disabled` | `#FFE9DA` |
| 浅色背景 | `--color-brand-bg` | `#FDF4EE` |

## 错误色（Danger）

| 状态 | 建议 Token | 色值 |
| --- | --- | --- |
| 常规 | `--color-danger-default` | `#F53F3F` |
| 悬浮 | `--color-danger-hover` | `#F76560` |
| 点击 | `--color-danger-active` | `#CB2634` |
| 禁用 | `--color-danger-disabled` | `#FBACA3` |
| 特殊场景 | `--color-danger-subtle` | `#FDCDC5` |
| 浅色背景 | `--color-danger-bg` | `#FFECE8` |

## 成功色（Success）

| 状态 | 建议 Token | 色值 |
| --- | --- | --- |
| 常规 | `--color-success-default` | `#00B42A` |
| 悬浮 | `--color-success-hover` | `#23C343` |
| 点击 | `--color-success-active` | `#009A29` |
| 禁用 | `--color-success-disabled` | `#7BE188` |
| 特殊场景 | `--color-success-subtle` | `#AFF0B5` |
| 浅色背景 | `--color-success-bg` | `#E8FFEA` |

## 警告色（Warning）

| 状态 | 建议 Token | 色值       |
| --- | --- |----------|
| 常规 | `--color-warning-default` | `#E6A23C` |
| 悬浮 | `--color-warning-hover` | `#EEBE77` |
| 点击 | `--color-warning-active` | `#B88230` |
| 禁用 | `--color-warning-disabled` | `#F2D09D` |
| 特殊场景 | `--color-warning-subtle` | `#F8E3C5` |
| 浅色背景 | `--color-warning-bg` | `#FCF6EC` |

## 完成色（Over）

| 状态 | 建议 Token | 色值 |
| --- | --- | -- |
| 常规 | `--color-over-default` | `#007AFF` |
| 悬浮 | `--color-over-hover` | `#4BA1FF` |
| 点击 | `--color-over-active` | `#0E42D2` |
| 禁用 | `--color-over-disabled` | `#82BEFF` |
| 特殊场景 | `--color-over-subtle` | `#BEDDFF` |
| 浅色背景 | `--color-over-bg` | `#E8F3FF` |

## 使用规则

- 危险操作、错误校验和失败反馈使用 Danger 色组。
- 成功提交、完成反馈和正常状态提示使用 Success 色组。
- 填充控件使用“常规 / 悬浮 / 点击 / 禁用”四态；提示容器优先使用“浅色背景”搭配深色文字。
- 本文已记录画板中可辨识的全部 HEX；后续若出现蓝湖未定义色值，必须明确写“蓝湖未定义”，不得根据相邻色阶自行推算。
