# 辅助色

来源：两份 `Color 颜色-辅助色` 画板。

## 规范元数据

| 字段 | 值 |
| --- | --- |
| 文档类型 | 基础规范 |
| 蓝湖画板 | 两份 `Color 颜色-辅助色` 画板。 |
| 画板数量 | `2` |
| 画板场景 | 不适用：基础规范不计入组件场景总数 |
| 来源判定 | 规范表中未特别注明的可见数值为“蓝湖标注”；带“画板实测”字样的值为“画板实测”；实现、使用、提交、布局和异步规则为“研发补充” |
| 绘制基准 | 蓝湖 Web `@1x`；“画板实测约”表示按画板像素测量的近似值 |

## 文字与图标语义色

来源画板：默认 Light 模式文字和图标色彩配置。

| Token | 用途 | 色值 |
| --- | --- | --- |
| `@text-color-primary` | 主要文字色彩 | `#000000` |
| `@text-color-secondary` | 次要文字色彩 | `#4D4D4D` |
| `@text-color-placeholder` | 占位符文字色彩 | `#999999` |
| `@text-color-disabled` | 禁用文字色彩 | `#C5C5C5` |
| `@text-colort-anti` | 反色文字 | `#FFFFFF` |
| `@text-color-brand` | 主题色文字 | `#F6661B` |
| `@text-color-link` | 链接文字 | `#F6661B` |

上述色值取自用户提供的 PNG 图像红框色块，按每个色块的中心像素采样；不包含红框、色块描边或缩放边缘像素。

## 中性色

| Token | 用途 | 色值 |
| --- | --- | --- |
| `@bg-color-page` | 默认页面底层背景 | `#F2F4F5` |
| `@bg-color-container` | 主要容器、次要层级页面背景 | `#FFFFFF` |
| `@bg-color-secondarycontainer` | 次要容器背景 | `#F3F3F3` |
| `@bg-color-secondarycontainer2` | 表头背景 | `#F5F7FB` |
| `@bg-color-component` | 组件及主容器之上组件背景 | `#E3E7ED` |
| `@component-stroke` | 默认组件分割线 | `#E3E7ED` |
| `@component-border` | 默认边框 | `#DCDCDC` |

## 中性色交互 Token

| Token | 用途 | 色值 |
| --- | --- | --- |
| `@bg-color-container-hover` | 主要容器及次要页面 Hover | `#F3F3F3` |
| `@bg-color-container-active` | 主要容器及次要页面 Click | `#E3E7ED` |
| `@bg-color-secondarycontainer-hover` | 次要容器 Hover | `#F2F4F5` |
| `@bg-color-secondarycontainer-active` | 次要容器 Click | `#DCDCDC` |
| `@bg-color-component-hover` | 组件 Hover | `#DCDCDC` |
| `@bg-color-component-active` | 组件 Active | `#C5C5C5` |
| `@bg-color-component-disabled` | 组件 Disabled | `#F2F4F5` |

## 备用黄色（Warming）

| 状态 | 色值 |
| --- | --- |
| 常规 | `#F7BA1E` |
| 悬浮 | `#F9CC45` |
| 点击 | `#CC9213` |
| 禁用 | `#FCE996` |
| 特殊场景 | `#FDF4BF` |
| 浅色背景 | `#FFFCE8` |

## 备用绿色（Success）

| 状态 | 色值 |
| --- | --- |
| 常规 | `#2BA471` |
| 悬浮 | `#56C08D` |
| 点击 | `#008858` |
| 禁用 | `#92DAB2` |
| 特殊场景 | `#C6F3D7` |
| 浅色背景 | `#E3F9E9` |

## 紫色（Purple）

| 状态 | 色值 |
| --- | --- |
| 常规 | `#722ED1` |
| 悬浮 | `#8D4EDA` |
| 点击 | `#551DB0` |
| 禁用 | `#C396ED` |
| 特殊场景 | `#DDBEF6` |
| 浅色背景 | `#F5E8FF` |

## 青色（Cyan）

| 状态 | 色值 |
| --- | --- |
| 常规 | `#0FC6C2` |
| 悬浮 | `#0AA5A8` |
| 点击 | `#0AA5A8` |
| 禁用 | `#86E8DD` |
| 特殊场景 | `#B5F4EA` |
| 浅色背景 | `#E8FFFB` |

## 洋红（Magenta）

| 状态 | 色值 |
| --- | --- |
| 常规 | `#F5319D` |
| 悬浮 | `#F754A8` |
| 点击 | `#CB1E83` |
| 禁用 | `#FB9DC7` |
| 特殊场景 | `#FDC2DB` |
| 浅色背景 | `#FFE8F1` |

## 使用规则

- 同一数据维度在一个页面内保持同一种辅助色映射。
- 辅助色与功能色分工明确：成功、警告、错误、禁用仍以功能色为准。
- 文字与背景必须成对校验对比度；不要仅依赖色相传达状态。
- 本页三个 Token 表中的 `21` 个色值均已补齐。“文字与图标语义色”取自用户提供 PNG 的色块中心像素；中性色及交互 Token 取自 1× 高清画板的色块中心区域，并使用色块内的主像素值。
- 这些 HEX 属于画板像素采样值；如果后续能从设计源文件读取到 Token 元数据，应以源 Token 为准。
