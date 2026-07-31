# 隔离 UI 还原任务

你处在一个全新的隔离工作目录中。唯一设计输入是 `spec/` 下的 Markdown 和本地图标；不要读取工作目录之外的文件，不要搜索网络，不要访问蓝湖，也不要使用截图、参考画板、既有 UI 或其他项目代码。

## 目标

仅根据设计规范，在 `output/` 中生成一套可由本地静态服务器运行的 PC 端组件还原样例，用于判断 Markdown 是否足以指导 AI 还原本套 UI 样式。重点是组件本体、场景和必要状态；页面导航、页头、侧栏、说明卡片等只作为最小验证外壳，不需要也不得冒充蓝湖设计规范。

规范技术栈无关。你可以自行选择组件库或原生实现，但：

- 当前目录没有预装组件库，也不允许联网下载依赖；没有合适依赖时使用原生 HTML、CSS、JavaScript。
- 组件库只是可选复用方式，任何默认主题都必须被显式尺寸、颜色、字体、间距、边框、圆角、阴影、状态和本地图标规范覆盖。
- 不得把框架 API、组件属性名或内部异步算法当成视觉规范。

## 必须输出

1. `output/index.html`
2. `output/styles.css`
3. `output/app.js`
4. `output/manifest.json`
5. `output/isolation-run.md`

不得使用外链脚本、外链字体、外部图片、HTTP 接口或构建工具。只引用 `output/` 内的本地文件和复制到 `output/assets/icons/` 的图标。

新增 CSS、JavaScript 等代码必须遵守仓库根目录 `AGENTS.md`；禁止生成 AI 行数或工具来源统计注释，确有维护价值的说明使用中文注释。

## 清单与覆盖要求

- 从 `spec/README.md` 读取 29 张蓝湖画板映射，`manifest.json.artboards` 必须恰好有 29 项；这些是来源映射，不表示验证页外壳需要模仿蓝湖页面。
- 从 `spec/components/`、`spec/forms/`、`spec/pickers/` 的“画板场景”表读取全部 `SCN-*`，`manifest.json.scenarios` 必须恰好有 159 项且 ID 唯一。
- `manifest.json.inputPolicy` 固定为 `markdown-and-local-assets`。
- `manifest.json` 增加 `implementationStrategy`，说明选择的实现方式及原因；增加 `componentViews`，覆盖 25 份组件、表单和选择器文档。
- 每个画板对象至少包含 `id`、`title`、`sourceMarkdown`、`sourceWidth`、`sourceHeight`、`scenarioIds`。源画板尺寸没有明确给出时使用 `null`，不得猜测为设计事实。
- 辅助色 Token/色板、日期/日期时间虽然由同一 Markdown 合并，仍保留独立来源视图。
- 每个组件视图根节点包含 `data-component-view`，每个真实渲染的场景根节点包含对应 `data-scenario-id`；159 个场景不能只存在于 JSON。

## 组件还原要求

- 不要只做 Markdown 阅读器。依据每份文档的“尺寸与样式”“组件结构”“必要交互 UI 状态”“图标资产”“画板场景”真实绘制组件。
- 优先采用文档显式值；组件文件的显式值覆盖公共视觉基线；来源为“蓝湖未提供”或“研发补充”的值不得冒充蓝湖标注。
- 使用规范的品牌色、功能色、文字色、背景色、字体、行高、控件高度、间距、边框和圆角。
- 浮层必须体现与页面的边框、阴影和相对层级关系，但文档未给阴影数值时只能使用中性等效实现，并在隔离记录中说明。
- 从 `spec/assets/icons/` 复制所有本地图标到 `output/assets/icons/`，对应组件必须真实引用这些文件；不得用 Unicode、CSS 图形或第三方图标替换已经提供的本地图标。
- 蓝湖未提供独立资产的图标，可以用等效图标替换，但必须保持文档规定的语义、画布、线宽、颜色和对齐；在隔离记录中列出替换项。
- 展示文档明确的 Default、Hover、Focus、Active、Selected、Disabled、Loading、Empty、Error 等适用状态。对于仅能由用户触发的状态，可提供最小状态切换控件，但控件属于验证外壳。

## 必要交互边界

- 至少支持导航、按钮状态、输入与清空、密码显隐、Select 展开/选择/禁用/筛选及加载/空态/失败、分页、Switch、Radio、Checkbox、Collapse、InputNumber、表单校验和上传反馈。
- 验证的是可见输入、展开/收起、值、焦点、选中、禁用、加载、空态、失败及恢复状态。
- 请求频率、竞态取消、组件卸载、生产接口和组件库内部算法不属于本次视觉规范，不要把它们作为设计要求。
- 刷新后可通过 URL hash 恢复当前组件视图；禁用项不得进入可用视觉状态；弹层关闭后恢复为收起状态。

## 隔离记录

`isolation-run.md` 必须记录：

- 明确声明输入只有 `spec/**/*.md`、`spec/assets/icons/*` 和本提示词。
- 读取到的 Markdown、图标、画板、组件视图和场景数量。
- 生成文件清单及实现选择。
- 未确定的尺寸、字体、阴影、图标或布局歧义，以及采取的等效实现；不得声称看过蓝湖或参考画板。

完成前自行检查：JSON 可解析；JavaScript 语法正确；29/25/159 数量准确；159 个场景在 DOM 中真实渲染；6 个本地图标均已复制且被真实使用；输出不包含 `http://` 或 `https://`。
