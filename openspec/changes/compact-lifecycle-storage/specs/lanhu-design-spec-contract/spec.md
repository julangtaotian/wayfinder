## MODIFIED Requirements

### Requirement: 纯 AI 输入目录必须包含响应式表单布局规范

系统 MUST 将已确认的响应式表单布局规则同步到 `design/lanhu-ai-ui-spec/`，并通过规范完整性、README 可发现性和输入纯净边界检查后才允许作为正式 AI 输入。

#### Scenario: AI 从纯输入目录定位响应式规范

- **WHEN** AI 只读取 `design/lanhu-ai-ui-spec/`
- **THEN** README 必须直接链接 `foundations/responsive-form-layout.md`，并将其计入基础规范、详细规范和 Markdown 文件总数

#### Scenario: 纯 AI 文档保留全部可执行规则

- **WHEN** AI 读取纯输入版响应式表单布局
- **THEN** 文档必须完整包含 3/4/6 列断点、`16px / 8px`、工作区壳层、左侧标签、约 `12px` 标签间距、操作组、12 张画板映射和 `<1024px` 未定义边界

#### Scenario: 纯 AI 文档不携带验证过程

- **WHEN** 同步正式规范到纯 AI 输入目录
- **THEN** 目标文档不得包含蓝湖设计源外链、还原状态、验收环境、截图、证据路径或双组件库验证过程

#### Scenario: 纯 AI 文档本地引用可解析

- **WHEN** 自动检查纯 AI README 和响应式文档中的本地 Markdown 链接
- **THEN** 每个相对链接必须解析到 `lanhu-ai-ui-spec` 目录内的现有文件

### Requirement: 精简 AI 规范必须成为唯一活动蓝湖交付

系统 MUST 仅将 `design/lanhu-ai-ui-spec/` 作为当前仓库的活动蓝湖 AI 输入合同；该目录 MUST 保留可执行 Markdown、本地必要资产和可解析索引，但 MUST NOT 包含历史验证工程、组件库构建产物、原始批量截图或三方对比矩阵，也不得继续占用 `outputs/`。（D-01、D-02；A-01）

#### Scenario: AI 读取蓝湖规范

- **WHEN** AI 需要使用后台 UI 规则
- **THEN** 它 MUST 能仅通过 `design/lanhu-ai-ui-spec/` 定位规范、场景和本地引用，不读取已退役目录

#### Scenario: 仓库执行蓝湖规范检查

- **WHEN** 聚焦测试验证精简规范
- **THEN** 测试 MUST 检查 Markdown 索引、场景唯一性和本地引用，不要求历史截图或双组件库工程存在
