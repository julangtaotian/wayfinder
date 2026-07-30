## ADDED Requirements

### Requirement: 纯 AI 输入目录必须包含响应式表单布局规范

系统 MUST 根据 `D-23` 将 D-19 至 D-22 已验收的响应式表单布局规则同步到纯 AI 输入目录，并由 `A-13` 验证规范完整性、README 可发现性和输入纯净边界。

#### Scenario: AI 从纯输入目录定位响应式规范

- **WHEN** AI 只读取 `outputs/lanhu-ai-ui-spec/`
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
