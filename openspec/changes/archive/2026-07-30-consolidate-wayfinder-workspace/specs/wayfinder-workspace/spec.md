## ADDED Requirements

本规格关联决策 D-01、D-02、D-04，并覆盖验收 A-01、A-03。

### Requirement: 新项目使用精简的 Wayfinder 布局
系统 SHALL 在普通初始化的首次写入中只创建 `AGENTS.md`、`openspec/config.yaml` 和 `wayfinder/frontend.md` 三项工作流产物。系统 SHALL 不创建 `.ai-workflow.yaml`、`requirements/_template.md` 或旧 `docs/ai-context/frontend.md`。

#### Scenario: 初始化新的前端项目
- **WHEN** 用户对未初始化的受支持前端项目确认执行普通初始化
- **THEN** 系统 SHALL 创建三项 Wayfinder 布局产物，且创建计划中不得出现旧元数据、旧前端上下文或需求模板。

### Requirement: Wayfinder 合并元数据与项目导航
系统 SHALL 在 `wayfinder/frontend.md` 中提供互不重叠且各自恰好成对的 `meta`、`scope` 与 `analysis` 受管区块。`meta` SHALL 保存工作流版本、项目识别结果、深度状态与范围统计；`scope` SHALL 保存机器范围摘要；`analysis` SHALL 保存 AI 项目地图。

#### Scenario: 深度初始化 Wayfinder
- **WHEN** 用户确认对新项目执行深度初始化
- **THEN** 系统 SHALL 在 Wayfinder 的 `meta` 和 `scope` 区块写入真实范围元数据，并预留 `analysis` 区块，而不得创建独立工作流 YAML 或额外扫描文档。

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
