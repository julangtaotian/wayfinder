# wayfinder-workspace Specification

## Purpose
TBD - created by archiving change consolidate-wayfinder-workspace. Update Purpose after archive.

## Requirements

### Requirement: 普通初始化明确标示识别基线边界

普通初始化生成的 Wayfinder SHALL 保留未来深度刷新所需的受管区块，并 SHALL 用人类可读文案明确当前只生成可追溯识别基线、深度项目地图尚未启用，不得用裸 `false` 和零值让维护者误以为扫描失败或分析已经完成。

#### Scenario: 普通初始化创建 Wayfinder

- **WHEN** 用户在未请求项目理解或完整项目地图时执行普通初始化
- **THEN** Wayfinder 元数据保留 `deepAnalysis: false`
- **AND** 深度扫描范围明确显示“未启用（普通初始化仅生成可追溯的识别基线）”，分析区块继续保持待生成状态

### Requirement: 新项目使用精简的 Wayfinder 布局
系统 SHALL 在普通初始化的首次写入中只创建 `AGENTS.md`、`openspec/config.yaml` 和 `wayfinder/frontend.md` 三项工作流产物。系统 SHALL 不创建 `.ai-workflow.yaml`、`requirements/_template.md` 或旧 `docs/ai-context/frontend.md`。

#### Scenario: 初始化新的前端项目
- **WHEN** 用户对未初始化的受支持前端项目确认执行普通初始化
- **THEN** 系统 SHALL 创建三项 Wayfinder 布局产物，且创建计划中不得出现旧元数据、旧前端上下文或需求模板。

### Requirement: Wayfinder 合并元数据与项目导航
系统 SHALL 在 `wayfinder/frontend.md` 中提供互不重叠且各自恰好成对的 `meta`、`facts`、`scope` 与 `analysis` 受管区块。`meta` SHALL 保存工作流版本、项目识别结果、深度状态与范围统计；`facts` SHALL 保存与同次项目识别一致的人类可读项目概览、平台验证边界和目录职责；`scope` SHALL 保存机器范围摘要；`analysis` SHALL 保存 AI 项目地图。（D-02、D-03、D-07；A-01）

#### Scenario: 深度初始化 Wayfinder
- **WHEN** 用户确认对新项目执行深度初始化
- **THEN** 系统 SHALL 在 Wayfinder 的 `meta`、`facts` 和 `scope` 区块写入同次识别与真实范围元数据，并预留 `analysis` 区块，而不得创建独立工作流 YAML 或额外扫描文档

#### Scenario: 升级没有 facts 标记的既有 Wayfinder
- **WHEN** 合法既有 Wayfinder 包含稳定的项目概览和目录职责标题但尚无 `facts` 受管标记
- **THEN** 系统 SHALL 将该标题区间安全替换为新的 `facts` 区块，且 SHALL NOT 重复旧内容或修改 `scope`、`analysis` 和标记外项目内容

### Requirement: AGENTS 作为 Wayfinder 的自动发现入口
系统 SHALL 保持 `AGENTS.md` 位于项目根目录，并在深度模式下要求后续 AI 在架构、接口、权限、路由、风险或测试判断前先读取 `wayfinder/frontend.md` 的范围与项目地图。AGENTS 的项目专属 `deep-guardrails` 区块 SHALL 在升级时被保留。

#### Scenario: 深度扫描后的后续需求处理
- **WHEN** 后续 AI 在已完成深度扫描的 Wayfinder 项目中处理需求
- **THEN** 它 SHALL 先读取 `wayfinder/frontend.md`，再依据其中的事实、推断与待确认项分析影响范围，并保留 AGENTS 中已有的项目专属约束。

### Requirement: 需求模板按需使用
系统 SHALL 将需求模板作为插件资产维护。需求编写流程 SHALL 优先使用已存在的 `requirements/_template.md`，在其不存在时使用内置模板，并只在创建实际 `requirements/REQ-*.md` 时创建需求目录。

#### Scenario: 未初始化需求目录时编写需求
- **WHEN** 项目不存在 `requirements/_template.md` 且用户要求创建正式需求
- **THEN** 系统 SHALL 以插件内置模板生成 `requirements/REQ-*.md`，且不得先创建孤立的模板文件。

### Requirement: 三个工作流文件必须同步受管项目事实
系统 SHALL 在显式升级中使用当前项目识别结果刷新 AGENTS、Wayfinder 受管事实和 OpenSpec 配置。三份上下文 SHALL 同步同一次动态直接依赖画像的总数、可读摘要、截断状态和完整事实边界，并 SHALL 将 preset、终端画像和平台画像描述为有限兼容或安全信号。深度初始化 SHALL 同步已有三个受管文件，且所有写入仍 SHALL 要求显式确认。（D-03、D-04、D-06、D-08、D-11；A-02～A-05）

#### Scenario: 深度刷新已有项目
- **WHEN** 已初始化项目的受管文件仍包含旧预设、技术栈、依赖摘要、命令状态或目录职责，且用户执行深度刷新预览
- **THEN** 预览 SHALL 将三个文件列为准确的 update 或 unchanged 动作，并 SHALL NOT 修改目标项目

#### Scenario: 确认刷新并重复执行
- **WHEN** 用户显式写入深度刷新并在相同项目快照上再次执行
- **THEN** 三个文件 SHALL 使用一致项目事实，重复深度刷新 MAY 更新扫描时间和范围元数据但 SHALL NOT 重复 facts，普通升级在事实不变时 SHALL 返回 unchanged，未受管同名文件仍 SHALL 保持 conflict

#### Scenario: 动态依赖超过摘要上限
- **WHEN** 完整直接依赖数量超过受管上下文展示上限
- **THEN** 三份受管上下文 SHALL 显示一致的总数、展示数和遗漏数，并 SHALL 指示 AI 读取完整机器画像或根 package 后再总结
- **AND** 受管上下文 SHALL NOT 将截断摘要描述为完整技术栈

### Requirement: 项目检查必须报告受管内容漂移
系统 SHALL 只读比较当前项目识别结果与可升级受管内容，返回稳定的受管内容新鲜度结果；存在差异时 SHALL 列出具体文件并给出非阻断刷新警告，不得把预览差异描述为已修复。（D-04、D-07；A-02）

#### Scenario: 受管内容与当前项目事实不一致
- **WHEN** AGENTS、Wayfinder 或 OpenSpec 受管内容仍使用旧项目事实
- **THEN** 检查结果 SHALL 标记受管内容 stale、列出实际漂移文件并返回刷新警告，且 SHALL NOT 写入任何文件

#### Scenario: 受管内容已同步
- **WHEN** 三个受管文件与当前项目事实一致
- **THEN** 检查结果 SHALL 返回空漂移列表且 SHALL NOT 产生受管内容过期警告
