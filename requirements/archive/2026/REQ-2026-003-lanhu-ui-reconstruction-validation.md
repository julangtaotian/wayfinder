# REQ-2026-003：蓝湖规范补齐与 AI 还原验证

## 基本信息

- 状态：已验收
- 提出人：用户
- 负责人：Codex
- 目标版本：0.10.0
- 关联页面或模块：`outputs/lanhu-design-spec/`、蓝湖“后台规范”33 张画板、蓝湖“后台适配规范”12 张画板、AI 隔离还原样例
- 关联变更：`validate-lanhu-ui-reconstruction`、`backfill-lanhu-precision-specs`、`remove-ui-brand-prefix`、`add-responsive-form-layout-spec`、`validate-responsive-form-layout-in-ui-libraries`、`normalize-responsive-layout-documentation`、`normalize-responsive-layout-readme-index`、`correct-responsive-form-label-layout`

## 背景与目标

现有 `outputs/lanhu-design-spec/` 已按基础规范、组件、表单和选择器拆分为 29 份 Markdown，但仍存在裸 `—`、与现状矛盾的“未标注”说明、设计源本身标为“待定”的场景，以及仅凭画板像素估算的尺寸。仅列出场景名称和少量尺寸，也不足以证明 AI 能在真实研发中稳定还原界面。

本需求以蓝湖原始画板为设计事实源，整理一套面向 PC 端、技术栈无关的 UI 视觉规范。规范重点描述已知组件的结构、尺寸、颜色、字体、间距、边框、圆角、阴影、图标和必要交互状态；Element、Element Plus 或其他组件库只是可选复用手段，不能成为规范前提。AI 应根据目标项目已有技术栈选择复用组件库或自行实现，但最终视觉必须服从本规范。

可从蓝湖下载或导出的图标必须保存为本地资产并由 Markdown 引用。验证时使用一个无法访问蓝湖和原始画板的新 AI 上下文，只提供 Markdown 与其引用的本地资产，检查 AI 是否能在自选实现方式下还原组件本体及其状态。验证页自身的导航、页头、侧栏和说明性排版不属于蓝湖组件规范，不参与视觉一致性判定。

## 决策台账

| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 设计事实源 | 已确认 | 蓝湖项目“后台规范”的 33 张原始画板、蓝湖项目“后台适配规范”的 12 张原始画板及对应标注面板是颜色、尺寸、圆角、边框和布局的事实源；当前 Markdown 不是事实源，只是待验证产物。 | 用户提供的两个蓝湖项目链接及已登录页面 |
| D-02 | 裸占位符处理 | 已确认 | `—`、无原因的“未标注”和可从蓝湖确认的缺失值必须补成明确数值；确实不适用时写“无/不适用”及原因，设计源未定义时写“蓝湖未定义”，不得保留含义不明的横线。 | 用户本次要求“补齐 - 代替的内容” |
| D-03 | 来源可信度分层 | 项目默认 | 每个关键值标记为“蓝湖标注”“画板实测”“研发补充”之一；标注值原样记录，实测值保留约数和测量基准，研发补充不得冒充蓝湖事实。 | `outputs/lanhu-design-spec/README.md` 的现有来源说明及不推算规则 |
| D-04 | 场景覆盖范围 | 已确认 | 验证覆盖 31 份文档、26 份组件/表单/选择器文档及其 183 条画板场景；新增响应式表单布局作为基础规范，不伪增组件场景 ID；不以少量代表组件通过代替全量结构检查。 | 用户指出“每个组件场景都不全”并要求完整描述，本轮要求新增分辨率布局规范 |
| D-05 | 隔离还原输入 | 已确认 | 新 AI 上下文只能读取 `outputs/lanhu-design-spec/**/*.md`、Markdown 明确引用的本地图标/字体等资产和实现目标说明；禁止读取蓝湖链接、原始画板、截图、既有还原代码或本任务对话。 | 用户明确要求 Markdown 指导 AI 使用 UI 规范，并要求图标下载到本地 |
| D-06 | 必要交互边界 | 已确认 | 规范只补充能够影响 UI 的必要状态和转换，包括 Default、Hover、Focus、Active、Selected、Disabled、Loading、Empty、Error、展开/收起与值回填；组件库内部键盘实现、请求取消、接口协议和业务生命周期不作为通用视觉规范，除非蓝湖明确给出或某个可见状态必须依赖该规则。 | 用户明确要求“主要侧重规范”和“一些必要交互的 UI 样式” |
| D-07 | 蓝湖“待定”场景 | 已确认 | `Select` 的“自定义模板、筛选选项、远程搜索”保留为源设计未定事实，但文档标题不再把“待定”当作实现说明；改为“蓝湖状态：未定义”并附研发补充协议和验证边界。 | 蓝湖 `Select 选择器` 画板原文及用户要求补齐真实研发场景 |
| D-08 | 完全还原判定 | 已确认 | 只有规范结构完整、全部已知组件和场景可定位、本地资产可解析、显式视觉值一致且必要交互状态可观察时，才允许结论为“可用于 AI 还原本套 UI 规范”；不要求证明任意组件库内部实现一致，也不把验证页外壳当成设计内容。 | 用户明确规范用于告诉 AI 如何实现这套 UI 样式，而非绑定某个组件库 |
| D-09 | 视觉对比口径 | 已确认 | 以蓝湖 Web `@1x` 中的组件本体、状态样例和基础 Token 为比较对象；显式尺寸与间距容差不超过 `±2px`，显式 HEX 必须一致，图标语义/尺寸/颜色和可见文案必须一致。验证页页头、侧栏、导航、卡片容器及画板说明排版排除在验收外。 | 用户明确主要侧重已知组件规范，不要求复刻规范展示页布局 |
| D-10 | 技术栈与组件库 | 已确认 | 规范面向 PC 端且技术栈无关。AI 可以复用目标项目已有的 Element、Element Plus 或其他组件库，也可以在没有合适组件时自行实现；规范只约束最终 UI，不强制组件名、框架、属性或主题实现方式。 | 用户明确“组件库也不一定要限制 element 组件库” |
| D-11 | 组件规范内容 | 已确认 | 每个已知组件必须尽量记录组成结构、各区域尺寸、颜色、字体、间距、圆角、边框、阴影、图标、文案、初始状态和必要交互状态；画板级坐标仅在表达组件内部结构或组合关系时记录，不要求还原蓝湖规范页整体布局。 | 用户明确“按照现有能拿到的 UI 样式，包括尺寸、颜色和必要交互的 UI 样式” |
| D-12 | 图标资产 | 已确认 | 蓝湖中用于组件状态或操作的图标应优先下载/导出为本地 SVG；无法获得矢量时保存最高可用清晰度的 PNG，并在 Markdown 中记录语义、文件路径、尺寸、颜色、适用状态和允许替换边界。不得只写图标名称或依赖外部 URL。 | 用户明确要求“icon 的替换，icon 下载下来” |
| D-13 | 双组件库验收实现 | 已确认 | 本轮验收必须分别使用 Vue 3 + Element Plus、Vue 2 + Element UI 生成独立可运行的组件规范页；扩展目标是两套实现都覆盖 26 份组件类规范和 183 条场景，必须真实注册并使用对应组件库、覆盖冲突的默认主题、使用本地图标。既有 25/159 双组件库产物和此前原生页面只保留为历史证据，不得作为扩展后 A-04、A-05 的通过依据。 | 用户明确要求“分别用这两个组件库生成相应的组件做规范验收，不要用之前原生写法” |
| D-14 | Table 新增规范 | 已确认 | 将 Table 基础规范、经典表格页 Small/Medium/Large 共 4 张新增画板合并为独立 `components/table.md`，记录 21 条非重复组件场景和 3 条页面密度场景，共 24 条 `SCN-TABLE-*`；源画板重复的“自定义索引”只建立 1 条规范场景并注明重复，不伪造第二种状态。 | 用户提供 4 个新增蓝湖链接并要求按既有标准整理 |
| D-15 | Table 展示宽度与经典页面底色 | 已确认 | Table 验收示例在两列无法容纳组件显式宽度时必须退回单列，不允许内容越出场景卡片；经典 Small/Medium/Large 完整页面在普通预览中必须按卡片可用宽度等比缩小且不得产生横向滚动或裁切，A-05 证据模式保持原始逻辑像素尺寸；经典页面源图透明工作区以 `#F0F2F5` 为承载底色，并叠加源画板 `rgba(0, 0, 0, 0.16)` 工作区层，最终可见合成色约为 `#CACCCF`，不得只渲染未叠加的承载底色或把透明像素误判为黑色。 | 用户指出“宽度都超出去了；两列放不开就用一列”“经典表格大、中、小三个布局的背景色不对”，并在首轮修正后再次指出“经典布局还是有越界的情况”；源 WebP 像素核对 |
| D-16 | 经典表格页视觉结构 | 已确认 | Small/Medium/Large 必须按蓝湖页面结构还原：`200px` 侧栏及展开的“列表页/基础表格”菜单、`176px` 顶部标题说明区、分档换行的日期/姓名/状态/地址/完成进度筛选区、无纵向边框的数据表格、9 行统一示例数据、右下分页。操作列固定显示无边框、无背景的“详情 / 编辑 / 删除”三个文字操作，三者均为品牌色 `#FF6014`；不得继承组件库按钮边框、填充背景或把“删除”改为危险红。分页总数为 `6532`、当前页为 `1`，不显示跳页输入。 | 用户指出“布局和颜色还是有不对的地方，尤其是操作一栏”；蓝湖 Small/Medium/Large `@1x` 画板逐项复核 |
| D-17 | 验收精确值回写 | 已确认 | A-05 三方视觉确认过程中新增、且会影响真实组件 UI 的尺寸、间距、颜色、文案、初始状态、面板结构和图标显示值，必须同步回写到 `outputs/lanhu-design-spec/` 与 `outputs/lanhu-ai-ui-spec/` 的对应纯 Markdown。只记录经蓝湖参考确认的可见事实并标记为“画板实测”，不得写入组件库类名、证据截图定位、验证页外壳或只为测试服务的实现细节；两套目录的对应规范不得产生精确值漂移。 | 用户明确要求“验收过程中的部分精确调整回写一下纯 MD，两个文件夹里面相关的都需要回写” |
| D-18 | 交付文案去品牌化 | 已确认 | 两套规范、图标清单、验证说明、验证页面源码和重新生成的静态产物统一移除既有品牌前缀，改用“后台设计规范”“后台 UI 还原规范”“后台组件还原”等通用文案；组件名称、场景 ID、尺寸、颜色和交互规则保持不变。 | 用户明确要求相关文案全部去掉品牌名称 |
| D-19 | PC 端响应式表单列数 | 已确认 | 新建独立基础规范，完整记录“后台适配规范”12 张画板：视口 `1024px～1439px` 为 3 等分、`1440px～1919px` 为 4 等分、`≥1920px` 为 6 等分；`1200px` 与 `2560px` 仅验证同列数自动拉伸。右侧内容区使用 `16px` 外距/内边界节奏、字段列间距 `8px`，并记录 `1024 × 768` 画板中 `x=124px, y=48px, 884px × 704px, #FAFBFC, 4px` 的工作区壳层。源文案“1400 状态 4 等分”与同页 `1440` 规则及 `1440` 画板冲突，实施统一按 `1440px` 处理并在文档保留冲突说明。 | 用户提供“后台适配规范”蓝湖链接；规则总览画板文字、分辨率画板及蓝湖标注面板交叉核对 |
| D-20 | 双组件库真实项目验证 | 已确认 | 在现有 Vue 3 + Element Plus、Vue 2 + Element UI 验收工程中分别新增独立的真实后台响应式表单页；表单、输入、选择、日期和按钮必须使用对应组件库实例，不得退回原生控件或只用静态 CSS 模拟。两个页面均在 `1024 / 1200 / 1440 / 1920 / 2560px` 实际视口验证 3/3/4/6/6 列、`16px / 8px`、工作区壳层、自动拉伸、展开/收起、查询/重置操作组和零横向越界，并保留逐分辨率截图及可机器读取的布局测量结果。 | 用户明确要求“做真实项目测试，用现有的两个 UI 组件库” |
| D-21 | 响应式规范反写与画板可读命名 | 已确认 | 将双组件库真实还原中确认的通用 UI 约束反写到正式响应式 Markdown：字段控件占满等分列、主操作使用 `#FF6014` 且组件库默认主题不得覆盖规范、操作组不可拆分、页面不得横向越界；iframe、组件库类名等验证专用细节不写入通用规范。正式规范与 README 画板索引中的 12 张画板展示名称均不得继续使用 `copy / copy 2`，统一改为“原始尺寸｜列数｜状态/用途”，同尺寸同列数画板再以“基础、空数据、数据”等状态区分，同时保留稳定画板 ID。 | 用户明确要求确认还原修改是否反写，并在截图中要求 README 索引也不要使用 copy，直接使用尺寸加列数区分 |
| D-22 | 响应式字段标签方向 | 已确认 | “后台适配规范”五档表单画板中的字段均采用“左侧标签 + 右侧控件”的单行结构，标签与 32px 控件垂直居中；标签按文案实际宽度占位，右侧保留约 `12px` 的视觉间距，控件填充字段组剩余宽度。标签不得统一移到控件顶部，不得作为栅格独立列，也不得用固定标签宽度挤压短文案字段。 | 用户明确指出蓝湖标签均位于左侧；已登录蓝湖 `1024 × 768` 原画板 `@1x` 复核 |
| D-23 | 响应式规范同步到纯 AI 输入目录 | 已确认 | 将已验收的响应式表单布局规范同步为 `outputs/lanhu-ai-ui-spec/foundations/responsive-form-layout.md`，保留全部可执行尺寸、颜色、断点、列数、标签、操作组、画板映射和未定义边界；去除设计源外链、还原状态、验收环境、截图、证据和组件库验证过程。同步更新纯 AI 目录 README 的文件计数、目录树、读取顺序和基础规范入口。 | 用户明确要求“把新增的 md 文档同步到 lanhu-ai-ui-spec 文件夹里面去” |

## 关联变更范围

| 变更 | 决策范围 | 验收范围 |
| --- | --- | --- |
| add-responsive-form-layout-spec | D-19 | A-09 |
| validate-responsive-form-layout-in-ui-libraries | D-20 | A-10 |
| normalize-responsive-layout-documentation | D-21 | A-11 |
| normalize-responsive-layout-readme-index | D-21 | A-11 |
| correct-responsive-form-label-layout | D-22 | A-12 |
| sync-responsive-form-layout-ai-spec | D-23 | A-13 |

## 范围

### 包含

- 扫描全部 Markdown 中的裸 `—`、无原因的“未标注”“待定”和可能误导 AI 的模糊描述。
- 通过蓝湖标注面板或 `@1x` 原画板补齐可确认的颜色、宽高、间距、圆角、边框、字体和布局值。
- 修正已知缺失：`Input` 三种尺寸示例宽度都应明确记录为 `240px`。
- 修正颜色文档中与已填 HEX 表格相矛盾的“保持未标注”说明。
- 为 30 份文档补充一致、可机器读取的来源等级、布局约束、状态与研发补充结构。
- 为 26 份组件/表单/选择器文档逐条核对全部 183 个画板场景，避免只保留代表场景。
- 为 Table 新建独立规范，完整覆盖基础表格、复杂表格能力和 Small/Medium/Large 经典页面组合，并记录源画板重复示例。
- 修正 Table 验收页的响应式列数和经典页面透明画布合成色，重新生成受影响的参考、实际与三方对照证据。
- 按蓝湖重新校准经典表格页的侧栏、页头、筛选换行、示例数据、无纵向边框表格、操作文字链接和分页，不再使用验收工程自行编写的替代信息架构。
- 为已知组件补齐组成结构、尺寸、颜色、字体、间距、边框、圆角、阴影、图标和必要交互状态。
- 从蓝湖下载或导出组件使用的图标，保存到本地资产目录并在 Markdown 中建立可解析引用。
- 在隔离的新 AI 上下文中，仅凭 Markdown 和本地资产分别生成 Vue 3 + Element Plus、Vue 2 + Element UI 两套组件规范样例。
- 两套样例都真实使用对应组件库，覆盖与 Markdown 冲突的默认主题，并覆盖 26 个组件视图、183 条场景和本地图标。
- 对生成结果执行文档结构、组件本体静态样式、必要交互状态和组件区域视觉检查，并输出验证报告与截图证据。
- 将验收阶段已经确认、但仍只存在于双组件库实现中的可见精确值回写到两套 Markdown，并校验对应文档的一致性。
- 移除规范交付物、验证说明、验证页面及构建产物中的既有品牌前缀，统一使用通用后台规范文案。
- 在 `outputs/lanhu-design-spec/foundations/` 新建响应式表单布局规范，记录 12 张新增画板、3/4/6 列断点、`16px / 8px` 间距、工作区壳层和操作组换行边界。
- 为响应式布局文档增加聚焦契约测试，验证断点连续、无重叠、无空档，并验证 1200/2560 不是额外列数断点。
- 在现有 Element Plus 和 Element UI 工程中增加独立响应式表单真实项目页，复用对应组件库的 Form、Input、Select、DatePicker 和 Button。
- 在五档实际视口中采集两套页面的列数、列间距、工作区位置/尺寸、操作组完整性和横向越界测量，并保存十张浏览器证据图。
- 将真实还原中确认的通用 UI 调整补充到响应式布局规范，并把正式规范与 README 索引中的 12 张画板展示名称统一为“原始尺寸｜列数｜状态/用途”，不再暴露 `copy` 类源命名。
- 将响应式字段修正为“左侧标签 + 右侧控件”，把标签方向、固有宽度、约 `12px` 间距和垂直居中写回正式规范，并重新采集双组件库五档证据。
- 将已验收的响应式表单布局同步到纯 AI 输入目录，并更新该目录 README 的计数、目录树、读取顺序和入口链接。

### 不包含

- 修改蓝湖原始设计稿或把研发补充反写成蓝湖设计事实。
- 接入真实业务接口、登录、权限中心、埋点、生产发布或服务端数据。
- 把静态画板没有给出的品牌字体、业务文案或接口契约伪造为已确认事实。
- 把本轮验收使用 Element Plus、Element UI 的技术选择写回通用设计规范，或强制未来业务项目使用指定组件库。
- 复刻蓝湖规范展示页的页头、侧栏、导航、卡片容器和画板说明性排版。
- 定义与可见 UI 无关的业务接口、请求取消、缓存、持久化或组件库内部实现算法。
- 因一次 AI 还原通过就宣称所有模型、所有提示词和所有未来页面都能无条件还原。
- 改写两套验证工程中与响应式字段标签无关的组件页面、场景实现或公共主题。

## 当前行为

- 31 个 Markdown 已完成统一元数据和来源分层，其中包含 1 个索引和 30 份详细规范；Input 三档示例宽度均为 `240px`，颜色矛盾说明已修正，Select 三个源“待定”场景已改为“蓝湖状态：未定义 + 研发补充”。
- 26 份组件类规范已写入 183 个唯一 `SCN-*` 场景 ID，机器检查可以稳定复现 31/30/26/183 文档计数。
- 首次隔离验证错误地禁止组件库并要求原生 HTML/CSS/JavaScript 从零实现，同时把验证页外壳与蓝湖整张规范画板比较；该结果可作为历史基线，但不再代表本需求的最终验收口径。
- 首次生成暴露的 Radio、InputNumber、Form 和 Select 问题中，部分来自错误的实现策略，而不是视觉规范缺失；必须按 D-06、D-09、D-10 重新分类。
- 25 份组件类规范现已补充组件结构、必要交互 UI 状态、图标资产和公共视觉基线；README 已明确规范面向 PC 端且技术栈无关。
- 蓝湖可直接导出的 6 个透明 PNG 已保存为本地资产；其他嵌入栅格画板、没有独立资源的图标均记录了语义与替换边界。
- 修订后隔离 AI 已成功生成 25 个组件视图和 159 个场景锚点，但 Chrome 组件区域核对发现大量场景复用同一简化结构，并存在 Small/Large Form、日期面板、日期单元和图标显示尺寸偏差。
- A-01 至 A-06 已全部通过；需求达到“已验收”条件，关联变更已完成规范同步并归档。
- 用户指定的双组件库验收已扩展完成：Vue 3 + Element Plus、Vue 2 + Element UI 两套页面均真实使用对应组件库，覆盖 26 个组件视图、183 条场景和 6 个本地图标；原生页面仅保留为历史基线。
- 两套页面已通过独立构建、运行时识别、导航刷新和逐场景直达；183 张蓝湖 Web `@1x` 参考裁图、366 张双库实际裁图、194 张状态裁图和 183 组三方对照已经完成。自动证据门禁及人工三方视觉批准均为 `183 / 183`，待复核与自动失败均为 0。
- 蓝湖新增的 Table 基础规范和经典表格页 Small/Medium/Large 共 4 张画板已整理为独立 `components/table.md`；24 条场景均已在 Element Plus、Element UI 中以真实组件实现并完成证据绑定。`SCN-TABLE-22` 至 `24` 已按蓝湖重新校准页面结构、工作区合成色、筛选对齐、表头色、进度轨道和操作列，并重采双库证据、更新实测数据及人工批准指纹；当前 Table 为 `24 / 24` 通过。
- 高频 32px 集合已从“每类一个代表控件”修正为蓝湖画板的 18 个完整初始状态组；Button 四态、双输入/选择/日期、完整上传文件列表、完整分页、五种标签、五项标签页及 Dialog/Tooltip/Popconfirm 等均在双库中完成重采和视觉批准，当前为 `18 / 18` 通过。
- Pagination 10 条和 Progress 5 条场景已按蓝湖完整实例矩阵重新实现：Pagination 保留七种固定组合、默认/带背景/Small 共 28 行实例，Progress 保留 5/4/3/5/4 个可见实例及状态色、图标和自定义内容；双库重采后当前为 `15 / 15` 通过。
- Transfer 8 条和 Upload 5 条场景已按蓝湖可见实例矩阵重新实现：Transfer 两侧均保留完整列表，覆盖搜索、Footer、图标按钮和文字按钮组合；Upload 覆盖点击、头像、图片列表、拖拽和手动上传，保留 `500kb` 限制文案、成功状态和画板尺寸；双库重采后当前为 `13 / 13` 通过。
- Form/default-cn、Form/default-en、Form/large-cn、Form/small-cn 四组 20 条场景已按蓝湖完整重建：两套实现均使用真实 Form、Input、Select、DatePicker、TimePicker、Switch、Checkbox、Radio、Textarea 和 Button，保留中文/英文精确宽度、四种标签对齐、分组文案及 Large/Small 顶部对齐场景的 `32px` 原画例外；双库按参考裁图真实尺寸重采后当前为 `20 / 20` 通过。
- DateTimePicker 14 条和 TimePicker 3 条场景已按蓝湖完整重建：两套实现均使用真实 DatePicker、TimeSelect 和 TimePicker，保留 `216px / 328px` 触发器、单/双日历、年月日选中与范围状态、快捷项、时间滚轮和底部操作区；双库按参考裁图真实尺寸重采后当前为 `17 / 17` 通过。
- A-05 反向审查已完成：Badge、Menu、Select、Cascader、ColorPicker、DateTimePicker、TimePicker 新增的组合几何、色值、文案、初始状态、面板结构和图标显示尺寸已同步到两套纯 Markdown；V-13 至 V-16 涉及的高频组件、分页、进度、穿梭框、上传、表单和 Table 精确值也已复核。17 份相关文档均通过双目录关键值检查，其中本轮新增 7 份规范还通过正文级一致性检查，纯 AI 版未混入组件库类名、验证页外壳或证据定位。
- 两套 README、图标清单、验证说明和三套验证页面已统一改为通用后台规范文案；Element Plus、Element UI 静态产物已重新构建，交付目录与需求记录的旧品牌前缀扫描结果为零。
- 当前规范已新增 PC 端右侧内容区响应式表单布局，完整记录 12 张画板、3/4/6 列连续断点、`16px / 8px` 间距、工作区壳层、自动拉伸和操作组换行；小于 `1024px` 的未定义范围及“1400/1440”冲突均保留明确边界，AI 无需自行猜测每行字段数量。
- Vue 3 + Element Plus、Vue 2 + Element UI 两套现有工程均已新增 `?layout=responsive-form` 真实项目页；十个视口样本的列数为 3/3/4/6/6、列间距为 `8px`、横向溢出为 `0px`，展开/收起、查询、重置和刷新均已实测通过。
- 响应式正式规范已补齐字段控件满列、`#FF6014` 主操作色覆盖、操作组整体换行和禁止横向越界；正文与 README 第 34～45 行均使用同一组、同一顺序的 12 个“原始尺寸｜列数｜状态/用途”名称，稳定画板 ID、链接、断点和文档路径保持不变。
- 上一轮双库响应式页面显式使用了顶部标签，机器测量也只覆盖列数、工作区、操作组和越界，没有验证标签相对控件的方向；该结果不能证明字段内部结构符合蓝湖，本轮必须修正并重采十档证据。
- `lanhu-ai-ui-spec` 已新增第 4 份基础规范 `responsive-form-layout.md`；README 已更新为 30 份详细规范和 31 个 Markdown 文件，并提供响应式布局的读取顺序、目录树和直接入口。

## 期望行为

### 场景：补齐可确认的缺失值

- 前置条件：Markdown 中存在裸 `—`、矛盾说明或缺失样式，且蓝湖标注或原画板可以确认。
- 当：逐项核对蓝湖标注和 `@1x` 画板。
- 则：文档写入明确数值、单位和来源等级。
- 并且：同一值在尺寸表、场景表和示例说明中保持一致。
- 异常或边界：蓝湖未定义时不得推算成设计事实，必须转入“蓝湖未定义 + 研发补充”。

### 场景：AI 隔离还原已知组件规范

- 前置条件：补齐后的 Markdown 与本地图标资产通过结构检查，新 AI 上下文无法访问蓝湖、原始画板和已有实现。
- 当：模型根据 Markdown 和本地资产，分别生成 Vue 3 + Element Plus、Vue 2 + Element UI 两套可本地运行的组件规范页。
- 则：两套页面中的全部已知组件和 183 条场景均能定位到真实组件库实例，组件库差异不改变显式视觉结果。
- 并且：AI 不得因复用组件库默认主题而忽略规范中的尺寸、颜色、图标或状态覆盖。
- 异常或边界：任一实现退回原生控件、未加载对应组件库、漏场景或无法确定规范值时，必须在生成报告中列为阻断，不得用另一套实现通过替代。

### 场景：验证必要交互 UI 状态

- 前置条件：组件存在蓝湖可见或规范明确要求的 Hover、Focus、Active、Selected、Disabled、Loading、Empty、Error、展开/收起或值回填状态。
- 当：触发对应鼠标、键盘或值变化。
- 则：组件可见 UI 状态符合规范中的尺寸、颜色、边框、图标、文案和层级。
- 并且：复用组件库时允许继承其内部行为，但不能继承与规范冲突的默认视觉。
- 异常或边界：蓝湖未定义且不影响可见 UI 的内部行为不作为本规范验收项。

### 场景：形成可审计的还原结论

- 前置条件：结构、资产、组件样式、必要交互状态和组件区域视觉检查已完成。
- 当：汇总逐组件、逐场景结果。
- 则：报告明确给出“可用于 AI 还原本套 UI 规范”或“尚不足以用于稳定还原”。
- 并且：每个失败项包含文档路径、蓝湖页面、差异、来源等级和建议补充内容。
- 异常或边界：存在任一未映射组件/场景、缺失本地资产、显式视觉值不一致或必要状态未验证时，禁止给出通过结论。

### 场景：回写验收阶段确认的精确视觉值

- 前置条件：某个可见尺寸、间距、颜色、文案、初始状态、面板结构或图标显示值已经通过蓝湖参考、Element Plus 和 Element UI 三方视觉确认，但对应 Markdown 尚未记录。
- 当：反查最终验收实现、参考裁图和 A-05 证据。
- 则：在两套目录的对应组件文档中写入相同的可见规则、数值、适用场景和“画板实测”来源。
- 并且：文档不包含组件库选择器、证据截图坐标、验证页布局或其他非设计事实。
- 异常或边界：仅由组件库内部结构产生、没有蓝湖可见依据的数值不写入通用规范；蓝湖未定义项继续保留“蓝湖未定义 + 研发补充”。

### 场景：交付文案使用通用后台规范名称

- 前置条件：两套规范、验证说明、验证页面源码和构建产物中存在既有品牌前缀。
- 当：用户读取 Markdown、打开历史验证页或打开任一双组件库验证页。
- 则：标题和说明只使用“后台设计规范”“后台 UI 还原规范”“后台组件还原”等通用文案。
- 并且：重新构建后的静态产物不得继续包含旧品牌文案，规范结构、183 条场景和可见组件样式保持不变。
- 异常或边界：蓝湖链接、组件 ID、资源路径和设计事实不因文案去品牌化而变化。

### 场景：按 PC 分辨率还原右侧表单列数

- 前置条件：AI 已读取响应式表单布局规范，页面使用固定 PC 后台壳层，视口宽度不小于 `1024px`。
- 当：视口宽度落入 `1024px～1439px`、`1440px～1919px` 或 `≥1920px` 任一范围。
- 则：右侧表单字段组分别按 3、4、6 个等宽列排列，字段列间距为 `8px`，工作区保持 `16px` 边界节奏。
- 并且：`1200px` 与 `2560px` 只拉伸当前列宽；查询、重置、展开/收起作为不可拆分操作组使用下一可用位置，不得挤压、截断或横向越界。
- 异常或边界：蓝湖没有定义 `<1024px` 的 PC 布局，规范必须明确最小支持宽度或项目级降级策略，不得伪造 1/2 列蓝湖规则；源画板“1400”笔误按同页 `1440` 事实归一化。

### 场景：在两套真实组件库项目中验证响应式表单

- 前置条件：现有 Vue 3 + Element Plus、Vue 2 + Element UI 工程均可独立构建并通过专用 URL 打开响应式表单页。
- 当：分别以 `1024 / 1200 / 1440 / 1920 / 2560px` 实际浏览器视口打开页面，并在展开、收起、查询和重置后读取实际布局。
- 则：两套页面均使用对应组件库的 Form、Input、Select、DatePicker 和 Button，字段列数依次为 3/3/4/6/6，列间距为 `8px`，工作区保持 `16px` 右/下边界且没有横向越界。
- 并且：`1024 × 768` 下工作区为 `x=124px, y=48px, 884px × 704px, #FAFBFC, 4px`；操作组始终作为完整单元进入下一可用位置，展开/收起不改变当前断点列数。
- 异常或边界：任一工程未加载真实组件库、组件回退为原生控件、媒体查询命中错误、操作组被拆分或页面产生横向滚动时，本轮真实项目验证失败。

### 场景：反写真实还原调整并提供可读画板名称

- 前置条件：双组件库真实项目已确认通用视觉约束，响应式规范仍含源 `copy / copy 2` 画板名。
- 当：更新面向 AI 的正式响应式 Markdown 与 README 画板索引。
- 则：文档明确字段控件占满等分列、主操作色为 `#FF6014`、组件库默认主题不得覆盖规范、操作组不可拆分且页面不得横向越界。
- 并且：正文和 README 中的 12 张画板都使用“原始尺寸｜列数｜状态/用途”的展示名，同尺寸画板通过状态继续区分，画板 ID 与文档路径不变。
- 异常或边界：验证专用 iframe、组件库类名和截图路径不得混入通用 UI 规范。

### 场景：按蓝湖还原字段左侧标签

- 前置条件：AI 已读取响应式表单布局规范，或用户打开任一双组件库响应式表单验收页。
- 当：任一字段组包含标签和 Input、Select 或 DatePicker 控件。
- 则：标签必须位于控件左侧并与 `32px` 控件垂直居中，标签按文案实际宽度占位，标签与控件之间保持约 `12px` 间距，控件填充字段组剩余宽度。
- 并且：五档视口中的每个可见字段都必须满足 `label.right < control.left`，字段组保持单行且不改变 3/3/4/6/6 列规则。
- 异常或边界：顶部标签、标签单独占据一行、固定标签宽度导致短标签浪费空间或控件越界，均判定为还原失败。

### 场景：从纯 AI 输入目录读取响应式规范

- 前置条件：AI 只读取 `outputs/lanhu-ai-ui-spec/`，不能访问验证报告、截图、双组件库源码或蓝湖页面。
- 当：AI 需要还原 PC 后台右侧表单布局。
- 则：README 能直接定位到 `foundations/responsive-form-layout.md`，文档完整提供 3/4/6 列、`16px / 8px`、工作区壳层、左侧标签、约 `12px` 标签间距、操作组和 `<1024px` 未定义边界。
- 并且：纯 AI 文档不得包含设计源外链、还原状态、验收环境、截图、证据路径或组件库验证过程。
- 异常或边界：仅复制正文但未更新 README，或删除会影响 UI 还原的尺寸、颜色、断点和布局规则，均判定为同步失败。

## 页面与交互

- 入口与操作路径：Element Plus、Element UI 两个本地验证首页分别按“基础规范 / 组件 / 表单 / 选择器”定位到已知组件及场景；`?layout=responsive-form` 打开独立真实后台响应式表单页；验证页外壳仅用于查阅，不是设计规范的一部分。
- 字段、文案与默认值：设计文案以蓝湖为准；验证工具使用中文标签“来源、蓝湖标注、画板实测、研发补充、通过、失败、蓝湖未定义”。
- 加载态、空态、错误态、禁用态：蓝湖或规范中已有对应状态的组件必须展示可定位样例；必要状态需能通过直接操作或受控数据触发。
- 权限与角色差异：不涉及真实权限；验证页面不需要登录。
- 设计稿链接：`https://lanhuapp.com/web/#/item/project/stage?pid=649026f0-999c-4e55-9ded-a514795aa4c0&image_id=f9bbcf77-7232-4534-88b0-8439e7bf3d44`
- 本轮适配规范链接：`https://lanhuapp.com/web/#/item/project/stage?pid=1d07ef2a-1193-4517-b49e-a4aa40f1cfeb&tid=9b929b59-235d-49ce-ac03-edf38cd3241f&see=all`

## 交互状态矩阵

| 状态 | 覆盖决定 | 触发或前置条件 | 期望结果 | 验证方式 | 关联验收 | 不适用理由 |
| --- | --- | --- | --- | --- | --- | --- |
| 初始（已有数据） | 覆盖 | 打开任一基础 Token、响应式布局、组件、带默认值场景或双库响应式表单页 | 两套规范目录均可定位响应式表单规范；全部组件和 183 条场景可定位；两套响应式表单页可读取真实组件库版本、连续断点、列数、精确间距和字段左侧标签几何；响应式画板名称可直接识别尺寸、列数和状态 | 自动+人工 | A-02、A-03、A-09、A-10、A-11、A-12、A-13 | 不适用 |
| 用户操作 | 覆盖 | 触发规范明确的 Hover、Focus、Active、Selected、展开、收起、查询、重置、清空或禁用状态 | 可见尺寸、颜色、边框、图标、文案和层级按规范变化；响应式操作组完整且列数不变 | 自动+人工 | A-04、A-10 | 不适用 |
| 刷新 | 覆盖 | 直接刷新任一组件规范视图或双库 `?layout=responsive-form` 入口 | 组件初始状态和响应式列数可独立重建，不依赖蓝湖会话或本任务内存 | 自动+人工 | A-03、A-10 | 不适用 |
| 空态 | 覆盖 | 清空输入、提供空列表或打开无数据面板 | 展示规范已有的占位、空结果或空面板 UI | 自动+人工 | A-04 | 不适用 |
| 错误态 | 覆盖 | 触发规范已有的表单、上传或加载失败状态 | 展示规范定义的错误颜色、图标、边框和文案 | 自动+人工 | A-04、A-05 | 不适用 |
| 卸载 | 不适用 | 规范不定义组件库内部销毁、请求取消和监听器清理 | 不纳入通用视觉规范；具体项目按所用框架和组件库处理 | 不适用 | A-04 | 本需求只约束可见 UI 样式和必要状态，不约束内部生命周期算法 |

## 接口与数据

- 接口文档链接：不适用。
- 请求方法与路径：规范不定义生产接口；验证页面仅使用本地受控数据触发可见状态。
- 请求字段及空值语义：只记录展示组件状态所需的最小示例数据，不把示例数据结构升级为业务接口契约。
- 响应字段及状态码：不适用；Loading、Empty、Error 等通过本地状态直接触发。
- 鉴权、加解密或敏感信息要求：不读取或保存账号、Cookie、蓝湖登录状态和业务敏感数据；隔离 AI 不接收蓝湖访问能力。

## 兼容性与风险

- 受影响页面、公共组件、路由、权限或接口：新增/修订设计规范 Markdown、本地图标资产、两套隔离还原样例及其响应式表单真实项目入口、聚焦测试和验证证据；不修改插件运行时、权限、接口或生产业务代码。
- 历史数据与兼容策略：保留现有文件路径、Markdown 标题和画板 ID；仅更新表格中的用户可读画板展示名，原有文档链接继续有效。
- 上线与回滚注意事项：规范不得写死组件库 API；目标项目可以按已有技术栈复用组件。最大的风险是 AI 已见过画板导致验证泄漏，因此必须使用 D-05 的隔离输入。

## 测试与验证

- 测试文件策略：复用；目标路径：`tests/lanhu-ui-reconstruction.test.mjs`；基线证据：`git ls-files tests/lanhu-ui-reconstruction.test.mjs` 可确认该文件已受版本控制，且它是覆盖同一蓝湖规范、双目录精确值同步、README 索引和响应式布局契约的手写专用测试；选择理由：本轮把同一响应式规范扩展到纯 AI 输入目录，应在既有专用测试中同时断言关键规则、画板映射、README 可发现性、本地链接和纯净输入边界。
- 验证范围：聚焦；执行命令：`node --test tests/lanhu-ui-reconstruction.test.mjs`；选择理由：本轮只新增纯 Markdown 并更新其入口和同一功能测试，不修改运行时代码、双组件库页面或共享插件逻辑，无需重复执行生产构建和全量测试。
- 自动测试：保留既有 31/30/26/183 设计规范与场景检查；新增检查纯 AI 目录为 30 份详细规范和 31 个 Markdown 文件，响应式正文保留关键数值、12 张画板映射和稳定 ID，README 可直接定位，全部本地链接可解析，设计源外链及验证过程词汇为零。
- 人工检查：不新增；本轮不改变任何 UI 规则或运行页面，沿用 V-20、V-21、V-24 已通过的蓝湖和双组件库视觉证据。
- 构建与静态检查：无需重建双组件库页面；运行项目结构校验、OpenSpec 严格校验、Skill/Plugin 官方校验和 `git diff --check`。

## 验证记录

| 验证ID | 验证类型 | 执行内容或环境 | 执行日期 | 结果 | 证据位置 |
| --- | --- | --- | --- | --- | --- |
| V-01 | 自动 | 聚焦测试 `12/12`、仓库测试 `37/37`、`npm run validate`、Skill/Plugin validator 和 OpenSpec 严格校验均通过 | 2026-07-24 | 通过 | `tests/lanhu-ui-reconstruction.test.mjs`、`outputs/lanhu-design-spec/validation-report.md` |
| V-02 | 自动 | 全新 AI 上下文仅读取 29 个 Markdown 和提示词，生成并启动 29 画板、159 场景本地样例 | 2026-07-24 | 通过 | `outputs/lanhu-design-spec/validation-evidence/isolation-input.md`、`outputs/lanhu-design-spec/validation-ui/` |
| V-03 | 人工 | Google Chrome；Web `@1x`；按 29 个原始视口核对布局、颜色、文字、状态、弹层、图标和真实交互；A-04、A-05 未通过，视觉 `0/29` | 2026-07-24 | 失败 | `outputs/lanhu-design-spec/validation-evidence/interaction-check.md`、`outputs/lanhu-design-spec/validation-evidence/visual-check.md`、29 张实际截图 |
| V-04 | 自动 | 需求实施阶段通过；完成阶段因 A-01/A-04/A-05 和未完成任务按预期拒绝验收与归档 | 2026-07-24 | 阻断 | `outputs/lanhu-design-spec/validation-report.md` |
| V-05 | 人工 | 旧验证口径复核：禁止组件库、从零实现并比较整张规范画板，与 D-09、D-10 冲突；旧 `0/29` 只保留为历史基线 | 2026-07-27 | 失败 | `outputs/lanhu-design-spec/validation-evidence/visual-check.md` |
| V-06 | 自动+人工 | 全新 AI 仅读取 29 份设计 Markdown、图标清单和 6 个本地图标，生成 25 个组件视图与 159 个场景；Chrome 排除验证页外壳后核对组件尺寸、HEX、图标和必要状态；A-01、A-02、A-03、A-04、A-06 通过，A-05 失败 | 2026-07-27 | 失败 | `outputs/lanhu-design-spec/validation-evidence/isolation-input.md`、`outputs/lanhu-design-spec/validation-evidence/component-visual-check.md`、`outputs/lanhu-design-spec/validation-report.md` |
| V-07 | 自动+人工 | 分别构建并在 Chrome 中启动 Vue 3 + Element Plus、Vue 2 + Element UI 验收页；确认真实组件库运行时、25 个组件视图、159 条场景、6 个本地图标、主题覆盖、导航刷新和代表性必要交互；A-04 通过，A-05 因未完成 159 条逐场景 `@1x` 比对而未通过 | 2026-07-27 | 失败 | `outputs/lanhu-design-spec/validation-element-plus/`、`outputs/lanhu-design-spec/validation-element-ui/`、`outputs/lanhu-design-spec/validation-evidence/library-component-check.md`、`outputs/lanhu-design-spec/validation-evidence/library-component-screenshots/` |
| V-08 | 自动+人工 | 在 Chrome `1920 × 958` CSS 视口、设备像素比 2、100% 页面缩放和蓝湖 Web `@1x` 基准下完成 159 张参考裁图、两套各 159 张实际裁图、144 张必要状态裁图、159 组三方对照与逐行显式值结果；自动证据门禁 `159 / 159` 通过、自动失败 0，人工三方批准 `0 / 159`，A-05 保持待视觉复核 | 2026-07-27 | 阻断 | `outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/`、`outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix.md` |
| V-09 | 自动+人工 | 从已登录蓝湖核对 Table 基础规范与经典表格页 Small/Medium/Large 共 4 张 Web `@1x` 画板，新增 24 条唯一场景、4 张本地参考图并运行聚焦测试 `43/43` | 2026-07-28 | 通过 | `outputs/lanhu-design-spec/components/table.md`、`outputs/lanhu-design-spec/validation-evidence/reference/`、`tests/lanhu-ui-reconstruction.test.mjs` |
| V-10 | 自动+人工 | 分别用 Element Plus、Element UI 真实组件实现 Table 24 条场景，在固定环境下完成 24 张参考、48 张实际、必要状态和 24 组三方对照；Table 人工视觉批准 `24 / 24`，全库自动门禁 `183 / 183`、人工批准累计 `100 / 183`；聚焦测试 `44 / 44`、仓库测试 `69 / 69`、结构校验和两套生产构建通过 | 2026-07-28 | 通过 | `outputs/lanhu-design-spec/validation-element-plus/src/TableScenario.vue`、`outputs/lanhu-design-spec/validation-element-ui/src/TableScenario.vue`、`outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/` |
| V-11 | 自动+人工 | 重新校验 Table 普通验收页与经典页面：双库普通视图固定单列；Chrome `1920 × 900` 下 Medium/Large 原越界 `62px / 542px`，按卡片实际宽度等比缩小后 Small/Medium/Large 均为 `0px`，`1280 × 800` 窄视口复测也均为 `0px`；六张 A-05 原尺寸实际图与修复前逐字节一致，未把预览缩放带入证据；透明源图承载色保持 `#F0F2F5`。聚焦测试 `44 / 44`、双库生产构建通过；Table 保持 `24 / 24`，全库自动失败 0、人工批准 `100 / 183` | 2026-07-28 | 通过 | `outputs/lanhu-design-spec/validation-evidence/library-component-screenshots/element-plus-table-classic-responsive.png`、`outputs/lanhu-design-spec/validation-evidence/library-component-screenshots/element-ui-table-classic-responsive.png`、`outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/actual/element-plus/SCN-TABLE-22.png`、`outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/actual/element-plus/SCN-TABLE-23.png`、`outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/actual/element-plus/SCN-TABLE-24.png`、`outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/actual/element-ui/SCN-TABLE-22.png`、`outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/actual/element-ui/SCN-TABLE-23.png`、`outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/actual/element-ui/SCN-TABLE-24.png` |
| V-12 | 自动+人工 | 旧 V-10/V-11 的经典页面视觉结论经用户复核后失效；重新对照蓝湖 Small/Medium/Large 原图，双库统一为 `200px` 侧栏、`176px` 页头、分档筛选布局、9 行数据、仅横向分隔线和右下分页。工作区实测 `rgb(202, 204, 207)`；表头为 `#909399` 常规字重；操作列“详情 / 编辑 / 删除”均为 `#FF6014`、透明背景、无边框、常规字重，大号坐标分别为 `1685 / 1729 / 1773px`。六张实际图、三张对照图、实测数据和人工证据指纹已全部刷新；Table 恢复 `24 / 24`，全库自动失败 0、人工批准 `100 / 183` | 2026-07-28 | 通过 | `outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/diff/SCN-TABLE-22-comparison.png`、`outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/diff/SCN-TABLE-23-comparison.png`、`outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/diff/SCN-TABLE-24-comparison.png` |
| V-13 | 自动+人工 | 对照蓝湖高频 32px 画板重建 18 个完整状态组，修正 Button/输入/选择/上传/分页/标签等实例缺失、Element UI 品牌色和 Popconfirm 未展开问题；排除规范展示分组标题，重采 36 张实际图、8 张必要状态图和 18 组三方对照并绑定人工指纹；聚焦测试 `46 / 46` | 2026-07-28 | 通过 | `outputs/lanhu-design-spec/components/frequent-components-32.md`、`outputs/lanhu-design-spec/validation-element-plus/src/FrequentComponents32.vue`、`outputs/lanhu-design-spec/validation-element-ui/src/FrequentComponents32.vue`、`outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/diff/SCN-FREQUENT-32-18-comparison.png` |
| V-14 | 自动+人工 | 对照蓝湖 Pagination 与 Progress 画板，使用真实 `el-pagination`、`el-select`、`el-input`、`el-progress` 和 `el-button-group` 重建 15 条完整场景；修正分页完整组合、Small 14 行布局、Element UI 状态色、进度轨道、环形空态与自定义内容，重采 30 张实际图、4 张必要状态图和 15 组三方对照并绑定人工指纹；聚焦测试 `47 / 47`、双库生产构建通过 | 2026-07-28 | 通过 | `outputs/lanhu-design-spec/components/pagination.md`、`outputs/lanhu-design-spec/components/progress.md`、`outputs/lanhu-design-spec/validation-element-plus/src/PaginationProgress.vue`、`outputs/lanhu-design-spec/validation-element-ui/src/PaginationProgress.vue`、`outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/diff/SCN-PAGINATION-10-comparison.png`、`outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/diff/SCN-PROGRESS-05-comparison.png` |
| V-15 | 自动+人工 | 对照蓝湖 Transfer 与 Upload 画板，使用真实 `el-checkbox`、`el-input`、`el-button` 和 `el-upload` 重建 13 条完整场景；修正穿梭框目标侧为空、按钮方向与文案、搜索与 Footer 组合、Footer 场景高度，以及上传限制文案、文件列表、拖拽区和手动上传多余按钮；重采 26 张实际图、2 张必要状态图和 13 组三方对照并绑定人工指纹；聚焦测试 `48 / 48`、双库生产构建通过 | 2026-07-28 | 通过 | `outputs/lanhu-design-spec/components/transfer.md`、`outputs/lanhu-design-spec/components/upload.md`、`outputs/lanhu-design-spec/validation-element-plus/src/TransferUpload.vue`、`outputs/lanhu-design-spec/validation-element-ui/src/TransferUpload.vue`、`outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/diff/SCN-TRANSFER-08-comparison.png`、`outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/diff/SCN-UPLOAD-04-comparison.png` |
| V-16 | 自动+人工 | 对照蓝湖四张 Form 画板，使用真实 `el-form`、输入/选择/日期时间、开关、选择组、文本域和按钮重建 20 条完整场景；补齐中文/英文精确宽度、四种标签对齐、分组文案和顶部对齐尺寸例外，并修复 Element Plus 日期时间控件高度及证据截图视口；按参考裁图真实尺寸重采 40 张实际图、2 张必要状态图和 20 组三方对照并绑定人工指纹；聚焦测试 `49 / 49`、仓库测试 `74 / 74`、结构校验和双库生产构建通过 | 2026-07-28 | 通过 | `outputs/lanhu-design-spec/forms/form-default-cn.md`、`outputs/lanhu-design-spec/forms/form-default-en.md`、`outputs/lanhu-design-spec/forms/form-large-cn.md`、`outputs/lanhu-design-spec/forms/form-small-cn.md`、`outputs/lanhu-design-spec/validation-element-plus/src/FormScenario.vue`、`outputs/lanhu-design-spec/validation-element-ui/src/FormScenario.vue`、`outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/diff/SCN-FORM-LARGE-CN-05-comparison.png` |
| V-17 | 自动+人工 | Google Chrome `1920px × 958px` 视口、DPR 2、100% 缩放；检查项：对照蓝湖 DateTimePicker 与 TimePicker 三张画板，使用真实 `el-date-picker`、`el-time-select` 和 `el-time-picker` 重建最后 17 条场景，核对触发器、单/双面板、年月日状态、快捷项、滚轮、范围、底部操作区、图标、文案及必要状态；重采 34 张实际图、20 张必要状态图和 17 组三方对照并绑定人工指纹；聚焦测试 `49 / 49`、仓库测试 `74 / 74`、结构校验和双库生产构建通过 | 2026-07-28 | 通过 | [DateTimePicker 日期时间范围三方截图](../outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/diff/SCN-DATE-TIME-PICKER-14-comparison.png)、[TimePicker 时间范围三方截图](../outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/diff/SCN-TIME-PICKER-03-comparison.png) |
| V-18 | 自动 | 反查 A-05 最终实现和证据，将 Badge、Menu、Select、Cascader、ColorPicker、DateTimePicker、TimePicker 的可见精确值同步到两套纯 Markdown，并复核 V-13 至 V-16 的 10 份相关文档；聚焦契约检查覆盖 17 份双目录规范、7 份正文级同步、183 条唯一场景和纯 AI 版来源边界，`50 / 50` 通过 | 2026-07-29 | 通过 | `outputs/lanhu-design-spec/{components,forms,pickers}/*.md`、`outputs/lanhu-ai-ui-spec/{components,forms,pickers}/*.md`、`tests/lanhu-ui-reconstruction.test.mjs` |
| V-19 | 自动 | 两套 README、图标清单、验证说明、历史验证页和双组件库验证页均已改为通用后台规范文案；Element Plus、Element UI `npm run build` 均通过并替换旧哈希产物；交付目录与需求记录全量文本扫描为零命中，聚焦测试 `51 / 51` 通过 | 2026-07-29 | 通过 | `outputs/lanhu-design-spec/`、`outputs/lanhu-ai-ui-spec/`、`tests/lanhu-ui-reconstruction.test.mjs` |
| V-20 | 自动+人工 | 已登录 Google Chrome，视口 `1920px × 900px`；检查项：核对“后台适配规范”12/12 张画板、规则总览和 `1024 × 768` 标注面板，确认三档列数为 3/4/6、`1200px / 2560px` 仅自动拉伸、字段列间距 `8px`、边界节奏 `16px`，并实测工作区 `x=124px, y=48px, 884px × 704px, #FAFBFC, 4px`。源文案“1400”与同页 `1440` 规则及 1440 画板冲突，执行值归一为 `1440px` 并保留说明。聚焦契约测试 `52 / 52`、OpenSpec 严格校验通过 | 2026-07-30 | 通过 | outputs/lanhu-design-spec/validation-evidence/responsive-form-layout/lanhu-rule-overview.jpg |
| V-21 | 自动+人工 | Google Chrome、DPR 1、100% 缩放；视口宽度 `1024 / 1200 / 1440 / 1920 / 2560px`；检查项：分别打开 Vue 3 + Element Plus `2.14.3`、Vue 2 + Element UI `2.15.14` 真实项目页，核对真实 Form/Input/Select/DatePicker/Button、3/3/4/6/6 列、`16px / 8px`、工作区、操作组、展开/收起、查询、重置、刷新和横向越界。四档使用物理 Chrome 窗口，`2560 × 900` 使用项目内同源 iframe 独立 CSS 视口；十张截图和十个测量样本全部通过，横向溢出均为 `0px`，`1024 × 768` 工作区均为 `884 × 704px`。首轮发现的 Element UI 默认蓝色主按钮已在专页范围校正为 `#FF6014` 并重采五档截图；两套生产构建通过，聚焦测试 `54 / 54` 通过 | 2026-07-30 | 通过 | outputs/lanhu-design-spec/validation-evidence/responsive-form-layout/library-project-screenshots/element-plus-1024.jpg |
| V-22 | 自动 | 已将字段控件满列、`#FF6014` 主操作色覆盖、操作组完整换行和零横向越界写入正式响应式规范；12/12 张画板使用“原始尺寸｜列数｜状态/用途”唯一展示名，映射区 `copy` 命中为 0，原 12 个画板 ID 逐项保持不变，且文档未混入组件库名称、iframe 或截图路径；聚焦测试 `54 / 54`、需求实施校验、OpenSpec 严格校验和 `git diff --check` 通过 | 2026-07-30 | 通过 | `outputs/lanhu-design-spec/foundations/responsive-form-layout.md`、`tests/lanhu-ui-reconstruction.test.mjs` |
| V-23 | 自动 | README 第 34～45 行已改为正文对应的 12 个“原始尺寸｜列数｜状态/用途”名称，原行号和链接保持不变；契约测试逐项比较两处名称数组，确认数量为 12、集合与顺序一致且 README 响应式索引区 `copy` 命中为 0；聚焦测试 `54 / 54`、需求实施校验、OpenSpec 严格校验和 `git diff --check` 通过 | 2026-07-30 | 通过 | `outputs/lanhu-design-spec/README.md`、`outputs/lanhu-design-spec/foundations/responsive-form-layout.md`、`tests/lanhu-ui-reconstruction.test.mjs` |
| V-24 | 自动+人工 | 对照已登录蓝湖 `1024 × 768` 原画板修正两套真实项目的字段标签方向，并在 Google Chrome、DPR `1` 下完成 `1024 / 1200 / 1440 / 1920 / 2560px` 十个视口样本检查。所有样本均为 3/3/4/6/6 列、零横向越界；逐字段标签宽度为 `28px / 56px`，标签与控件间距为 `12px`，垂直中心偏差为 `0px`，标签均位于控件左侧且保持单行，控件随字段剩余宽度变化。展开/收起、查询、重置和刷新均通过；十张截图和机器测量已刷新。聚焦测试 `54/54`、仓库测试 `91/91`、两套生产构建、`npm run validate`、OpenSpec 严格校验 `20/20`、5 个 Skill 官方校验和 Plugin 官方校验均通过。 | 2026-07-30 | 通过 | `outputs/lanhu-design-spec/foundations/responsive-form-layout.md`、`outputs/lanhu-design-spec/validation-evidence/responsive-form-layout/library-project-validation.md`、`library-project-measurements.json`、`library-project-screenshots/element-plus-1024.jpg`、`library-project-screenshots/element-ui-1024.jpg`、两套 `ResponsiveFormLayout.vue`、`tests/lanhu-ui-reconstruction.test.mjs` (截图: outputs/lanhu-design-spec/validation-evidence/responsive-form-layout/library-project-screenshots/element-plus-1024.jpg) |
| V-25 | 自动 | 已新增纯 AI 响应式 Markdown 并更新 README；自动检查确认纯 AI 目录包含 30 份详细规范和 31 个 Markdown 文件，关键断点、尺寸、颜色、左侧标签、12 张画板映射及稳定 ID 与正式版一致，本地链接全部可解析，设计源外链及验证过程词汇为零。聚焦测试 `55/55`、`npm run validate`、OpenSpec 严格校验 `20/20`、5 个 Skill 官方校验、Plugin 官方校验和 `git diff --check` 均通过。 | 2026-07-30 | 通过 | `outputs/lanhu-ai-ui-spec/foundations/responsive-form-layout.md`、`outputs/lanhu-ai-ui-spec/README.md`、`tests/lanhu-ui-reconstruction.test.mjs` |

## 验收标准

- [x] [A-01] 可由蓝湖确认的组件结构、尺寸、颜色、字体、间距、边框、圆角、阴影和缺失样式均已补齐，剩余未定义项带原因和来源等级。
- [x] [A-02] 30 份文档、26 份组件类文档和 183 条场景通过机器可读结构检查，每个已知组件能映射到组成结构、视觉值、状态或实现边界。
- [x] [A-03] 所有组件图标均有本地可解析资产或明确“不适用/蓝湖未提供”说明，Markdown 记录语义、路径、尺寸、颜色、状态和替换边界。
- [x] [A-04] 隔离的新 AI 只读取 Markdown 与其引用的本地资产，可分别用 Vue 3 + Element Plus、Vue 2 + Element UI 生成、构建、启动、定位和刷新全部组件及 183 条场景；两套页面均有对应组件库运行时证据，不得退回原生实现。
- [x] [A-05] Element Plus 与 Element UI 两套页面的组件本体和必要交互状态均通过 `@1x` 视觉核对，满足显式尺寸 `±2px`、显式 HEX、图标、文案和初始状态要求，且不把验证页外壳计入差异。
- [x] [A-06] 更新后的验证报告按 D-08、D-09、D-13、D-14 分别列出两套组件库门禁并给出可审计结论；任一实现存在阻断项时明确写“尚不足以用于稳定还原”，并列出最小规范补充清单。
- [x] [A-07] A-05 验收阶段确认的组件精确视觉值已同步写入两套纯 Markdown；相关文档包含可见尺寸、色值、文案、初始状态和图标显示边界，跨目录一致性与聚焦文档契约测试通过。
- [x] [A-08] 两套规范、验证说明、验证页面源码和重新生成的静态产物均不再包含既有品牌前缀，标题统一为通用后台规范文案，聚焦测试和双组件库生产构建通过。
- [x] [A-09] `lanhu-design-spec` 新增独立响应式表单布局规范，完整映射 12 张“后台适配规范”画板，明确 3/4/6 列、`16px / 8px`、工作区壳层、操作组、自动拉伸、`<1024px` 边界和“1400/1440”冲突处理；聚焦契约测试通过。
- [x] [A-10] Element Plus 与 Element UI 两套现有工程均新增可独立打开的真实响应式表单页，真实使用对应组件库 Form/Input/Select/DatePicker/Button；五档实际视口的列数为 3/3/4/6/6，`1024 × 768` 工作区精确值、`16px / 8px`、操作组、展开/收起、刷新和零横向越界均通过机器测量与截图复核，两套生产构建和聚焦测试通过。
- [x] [A-11] 响应式正式 Markdown 已包含真实还原确认的通用 UI 修正；正文与 README 索引中的 12 张画板展示名全部采用“原始尺寸｜列数｜状态/用途”，两处名称和顺序一致且不含 `copy / copy 2`，稳定画板 ID 与文档路径保持不变。
- [x] [A-12] 响应式正式 Markdown 与两套真实项目均明确采用“左侧标签 + 右侧控件”；十个视口样本逐字段满足标签在控件左侧、与 `32px` 控件垂直居中、约 `12px` 间距、控件填充剩余宽度，并保持 3/3/4/6/6 列和零横向越界；十张截图、机器测量、两套生产构建和聚焦测试全部通过。
- [x] [A-13] `lanhu-ai-ui-spec/foundations/responsive-form-layout.md` 已包含已验收响应式规范的全部可执行规则，README 已更新为 4 份基础规范、30 份详细规范和 31 个 Markdown 文件并提供直接入口；纯 AI 文档不含设计源外链、还原状态、验收环境、截图、证据路径或组件库验证过程，聚焦契约测试通过。

## 验收—证据映射

| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 | 验证记录 |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 视觉规范完整 | D-01、D-02、D-03、D-11、D-14 | 自动+人工 | `outputs/lanhu-design-spec/**/*.md`、蓝湖标注核对清单 | 裸占位符为零；已知组件结构和显式视觉值完整；未定义项有原因。 | V-01、V-09、V-17 |
| A-02 | 文档与场景结构完整 | D-03、D-04、D-06、D-11、D-14 | 自动 | `tests/lanhu-ui-reconstruction.test.mjs` | 30/26/183 计数通过，组件结构、状态和实现边界可解析。 | V-01、V-09、V-17 |
| A-03 | 本地图标资产完整 | D-05、D-11、D-12、D-14 | 自动+人工 | `outputs/lanhu-design-spec/assets/`、组件 Markdown | 资产本地存在且引用有效；语义、尺寸、颜色、状态和替换边界齐全。 | V-09、V-17 |
| A-04 | 双组件库隔离还原可运行 | D-05、D-08、D-10、D-13、D-14 | 自动+人工 | 两套隔离运行日志、生成页面、构建产物、运行时版本证据、`validation-report.md` | 两套生成过程只读 Markdown 与本地资产；真实使用对应组件库且技术栈差异不覆盖显式视觉规范。 | V-10、V-17 |
| A-05 | 双组件库组件和必要状态视觉一致 | D-06、D-09、D-11、D-12、D-13、D-14、D-15 | 自动+人工 | `outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix.md`、`outputs/lanhu-design-spec/validation-evidence/a05-visual-matrix/` | 183 条场景均有蓝湖参考裁图和两套实际裁图；两套组件区域都满足显式尺寸 `±2px`、HEX、图标、文案、初始状态及适用操作后状态要求，验证页外壳被排除。 | V-17：DateTimePicker 14/14、TimePicker 3/3 通过；全库自动证据门禁及人工三方批准均为 183/183，待复核与自动失败均为 0 |
| A-06 | 结论不夸大 | D-08、D-09、D-10、D-13、D-14 | 自动+人工 | `outputs/lanhu-design-spec/validation-report.md` | 结论同时受两套实现门禁约束，并限定在当前 30 份规范、26 个组件视图和 183 条已知场景。 | V-17 已同步全量通过结论，同时保留模型、组件库和未来页面边界 |
| A-07 | 验收精确值双目录同步 | D-03、D-09、D-11、D-17 | 自动 | `outputs/lanhu-design-spec/{components,forms,pickers}/*.md`、`outputs/lanhu-ai-ui-spec/{components,forms,pickers}/*.md`、`tests/lanhu-ui-reconstruction.test.mjs` | 17 份受影响文档的关键精确值在两套目录一致；本轮新增 7 份规范正文级同步；纯 AI 版未混入验证实现细节；聚焦测试 `50 / 50` 通过。 | V-18 |
| A-08 | 交付文案去品牌化 | D-18 | 自动 | `outputs/lanhu-design-spec/`、`outputs/lanhu-ai-ui-spec/`、`tests/lanhu-ui-reconstruction.test.mjs` | 两套规范、验证说明、三套验证页面源码及两套静态产物中的旧品牌前缀为零；通用标题存在；聚焦测试 `51 / 51` 和双库生产构建通过。 | V-19 |
| A-09 | PC 端响应式表单布局可执行 | D-19 | 自动+人工 | `outputs/lanhu-design-spec/foundations/responsive-form-layout.md`、`outputs/lanhu-design-spec/README.md`、`tests/lanhu-ui-reconstruction.test.mjs` | 12 张新增画板均可追溯；断点连续且列数为 3/4/6；精确间距和工作区壳层可机器读取；未知小于 1024px 边界未被伪造；聚焦契约测试 `52 / 52` 通过。 | V-20 |
| A-10 | 双组件库真实项目响应式验证通过 | D-20 | 自动+人工 | `outputs/lanhu-design-spec/validation-element-plus/`、`outputs/lanhu-design-spec/validation-element-ui/`、`outputs/lanhu-design-spec/validation-evidence/responsive-form-layout/library-project-validation.md`、`outputs/lanhu-design-spec/validation-evidence/responsive-form-layout/library-project-measurements.json`、`tests/lanhu-ui-reconstruction.test.mjs` | 两套页面真实加载对应组件库；十个视口样本的列数为 3/3/4/6/6、列间距为 `8px`、横向溢出为 `0px`；工作区、操作组、展开/收起、查询、重置与刷新全部通过；两套生产构建及聚焦测试 `54 / 54` 通过。 | V-21 |
| A-11 | 响应式规范反写与画板可读命名 | D-21 | 自动 | `outputs/lanhu-design-spec/README.md`、`outputs/lanhu-design-spec/foundations/responsive-form-layout.md`、`tests/lanhu-ui-reconstruction.test.mjs` | 正式规范包含字段控件满列、`#FF6014` 主操作色覆盖、操作组整体换行和零横向越界约束；正文与 README 均包含相同且同序的 12 个尺寸/列数/状态名称，两处索引区 `copy` 为零，12 个画板 ID 保持唯一。 | V-22、V-23 |
| A-12 | 响应式字段左侧标签可还原 | D-22 | 自动+人工 | `outputs/lanhu-design-spec/foundations/responsive-form-layout.md`、两套 `ResponsiveFormLayout.vue`、`outputs/lanhu-design-spec/validation-evidence/responsive-form-layout/library-project-validation.md`、`library-project-measurements.json`、十张五档截图、`tests/lanhu-ui-reconstruction.test.mjs` | 正式规范已禁止顶部标签；双库十个样本逐字段实测标签宽度 `28px / 56px`、间距 `12px`、垂直中心偏差 `0px`，标签全部位于控件左侧并保持单行，控件随剩余宽度拉伸，3/3/4/6/6 列与零横向越界均未回退。 | V-24 |
| A-13 | 响应式规范进入纯 AI 输入目录 | D-23 | 自动 | `outputs/lanhu-ai-ui-spec/foundations/responsive-form-layout.md`、`outputs/lanhu-ai-ui-spec/README.md`、`tests/lanhu-ui-reconstruction.test.mjs` | 纯 AI 目录已包含 4 份基础规范、30 份详细规范和 31 个 Markdown 文件；响应式规则及 12 张画板映射完整，README 计数、目录树和入口一致，本地链接全部可解析，验证过程内容与设计源外链为零。 | V-25 |

## 需求修订记录

| 修订ID | 日期 | 变更内容 | 影响范围 |
| --- | --- | --- | --- |
| R-01 | 2026-07-30 | 在已验收的响应式 Markdown 基础上，新增 Element Plus 与 Element UI 两套真实项目实现和五档分辨率验证，不改变 D-19 的设计事实。 | D-20、A-10、V-21、`validate-responsive-form-layout-in-ui-libraries` 全部任务 |
| R-02 | 2026-07-30 | 根据真实还原结果补充通用 UI 执行约束，并将响应式画板展示名从源 `copy` 命名改为“原始尺寸｜列数｜状态/用途”；不改变断点、画板 ID 或文档路径。 | D-21、A-11、V-22、`normalize-responsive-layout-documentation` 全部任务 |
| R-03 | 2026-07-30 | 将同一可读命名规则扩展到 README 第 34～45 行，要求目录与响应式正文名称和顺序一致；不改变画板数量、ID、链接或断点。 | D-21、A-11、V-23、`normalize-responsive-layout-readme-index` 全部任务 |
| R-04 | 2026-07-30 | 用户复核发现上一轮响应式验收漏检标签方向；新增左侧标签结构决策，明确约 `12px` 间距和垂直居中，旧 V-21 仅保留为列数、工作区、操作组与越界证据，不再证明字段内部结构，重新规划双库五档视觉和几何验收。 | D-22、A-12、V-24、`correct-responsive-form-label-layout` 全部任务 |
| R-05 | 2026-07-30 | 用户确认响应式规范无误后，要求把新增 Markdown 同步到纯 AI 输入目录；新增纯净化边界、README 入口和自动契约检查，不改变 D-19 至 D-22 已验收的 UI 规则。 | D-23、A-13、V-25、`sync-responsive-form-layout-ai-spec` 全部任务 |

## 待确认问题

- 无。通用规范的组件库选择仍由目标项目决定；本轮验收实现已由用户明确指定为 Element Plus 与 Element UI 两套。
