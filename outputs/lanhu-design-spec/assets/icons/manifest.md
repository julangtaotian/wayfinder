# 组件图标资产清单

本目录保存蓝湖「后台规范」在 2026-07-27 可直接导出的独立切图。资产通过已登录的蓝湖标注页逐画板检查并下载，均为原始透明 PNG；蓝湖本次没有为这些切图提供独立 SVG。

## 使用原则

- 本地资产是设计交付的一部分，AI 应优先使用；不得在运行时依赖蓝湖或外部 URL。
- 可以使用项目现有图标库替换，但语义、画布尺寸、可见图形尺寸、线宽、颜色、透明度、对齐和状态变化必须等效。
- PNG 自带透明画布和颜色，不应再使用 CSS `filter` 猜测变色；需要其他颜色时使用规范明确的同状态资产或等效矢量图标。
- 下表“语义”根据切图形状及对应组件场景命名；具体组件使用位置以各组件 Markdown 的“图标资产”章节为准。

## 已下载资产

| 语义 | 本地文件 | 原始尺寸 | 默认颜色/用途 | 原始切图名 | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| 品牌色勾选 | [check-24-brand.png](./check-24-brand.png) | `24px × 24px` | 品牌色；选中/当前项 | `FigmaSlicePNG9aa333d685a30e519b0b5075ae36a08b.png` | `9130ab2e74859aa54d9e6383c7c9e5dc65a8722520af919b5d7f9cbe8826defa` |
| 白色勾选 | [check-24-white.png](./check-24-white.png) | `24px × 24px` | 白色；品牌或状态色底上的选中/成功 | `FigmaSlicePNG494608d46b33ac57ce3ee66eef7901ad.png` | `baece26fb3d889811baffd08e801b15bd41d8361ddff5012d7a8b600d7b34295` |
| 白色勾选（大画布） | [check-28-white.png](./check-28-white.png) | `28px × 28px` | 白色；较大状态容器中的选中/成功 | `FigmaSlicePNG802ead02b83fda34ddaaa13cc05fac59.png` | `811e0da9410be42795805e4f699ac92bca20545811ef725bf994f7fcc3615da0` |
| 向下展开 | [chevron-down-24-neutral.png](./chevron-down-24-neutral.png) | `24px × 24px` | 中性灰；紧凑触发器或菜单展开 | `FigmaSlicePNGe21b445fe0bdf3a89b66c0ad2f2a1aa1.png` | `66dccdf9cec281a8aca4518861d0a25edf0475a31f8248a917e94e527702721c` |
| 向下展开（大画布） | [chevron-down-28-neutral.png](./chevron-down-28-neutral.png) | `28px × 28px` | 中性灰；标准触发器展开 | `FigmaSlicePNGb4b97cefa42444099a444606fce41de8.png` | `b386d8a25e4fd7bc793b97fd637920188e1141c0d1e7168f961e69122bd22b0b` |
| 隐藏内容 | [visibility-off-28-neutral.png](./visibility-off-28-neutral.png) | `28px × 28px` | 中性灰；密码不可见状态 | `FigmaSlicePNG8b110d19edbd0bdae3d4d52a8b6537e6.png` | `753cdab8d6e4837730f3df6bdaf6676a2759c5bbe272c4f49f783cedf44ed5d4` |

## 蓝湖未提供独立资产

以下图标能在 Web `@1x` 画板中看到，但逐画板资源检查没有发现可独立下载的 SVG/PNG。组件文档记录其显示尺寸、颜色和替换边界，AI 应从项目图标库选择等效图标；不得把蓝湖工具自身的界面图标当作组件资产。

| 图标语义 | 常见组件 | 替换边界 |
| --- | --- | --- |
| 搜索、清空、日期、时间 | Input、Select、Transfer、Date/Time Picker | 保持 `14px～16px` 可见图形、同色线性风格和输入框内垂直居中 |
| 关闭 | Dialog、Tag、Alert、可清空选择 | 保持 `14px～16px`、中性灰默认色及 Hover 强调色，点击热区按组件规范 |
| 上一页、下一页、上月、下月、跨年 | Pagination、Date/Time Picker | 使用方向明确的线性箭头；禁用时同步降低图标与容器强调 |
| 加号、减号 | InputNumber、Upload | 保持线宽、居中和禁用颜色；不能使用文本字符造成基线偏移 |
| 左移、右移 | Transfer、Cascader、Menu | 方向必须与数据移动/层级展开一致；可用同风格 chevron 旋转，但画布和对齐不变 |
| 上传、删除、编辑、分享、收藏、消息 | Button、Upload | 使用语义等效线性图标；纯图标按钮必须遵守按钮尺寸和 `14px～16px` 图形基线 |
| 成功、警告、异常、信息 | Progress、Upload、Collapse、Alert | 图形语义和状态色必须同时匹配，不能只用颜色区分 |
| 排序双向箭头、表头筛选 | Table | 保持 `12px～14px` 可见图形；默认中性弱色，升序/降序或已筛选方向使用 `#FF6014`，并与表头文字垂直居中 |
| 行展开、树形展开 | Table | 可复用本地 chevron 并旋转；必须保持 `12px～14px` 可见图形、旋转中心、层级缩进和展开方向一致 |
| 表格新建加号 | Table | 使用主按钮内白色线性加号，显示 `14px～16px`；不能使用普通文本字符造成线宽或基线偏移 |
