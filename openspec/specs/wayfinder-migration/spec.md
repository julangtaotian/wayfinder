# wayfinder-migration Specification

## Purpose
TBD - created by archiving change consolidate-wayfinder-workspace. Update Purpose after archive.
## Requirements
### Requirement: Wayfinder 迁移必须先预览
系统 SHALL 提供显式 Wayfinder 迁移命令。未传入 `--write` 时，系统 SHALL 只列出新建、保留、跳过、冲突和可删除旧文件的计划，不得修改目标项目。

#### Scenario: 预览旧项目迁移
- **WHEN** 用户对包含旧 `.ai-workflow.yaml` 与 `docs/ai-context/frontend.md` 的项目运行 Wayfinder 迁移但未传入 `--write`
- **THEN** 系统 SHALL 报告 Wayfinder 创建计划、旧文件处理计划和所有无法安全删除的内容，且目标项目文件保持不变。

### Requirement: 迁移完整保留项目上下文
系统 SHALL 在显式写入迁移时将旧 `frontend.md` 的范围区块、分析区块和标记外维护者内容完整写入 `wayfinder/frontend.md`。系统 SHALL 从旧元数据文件转换等价的工作流元数据，并保留 AGENTS 的项目专属约束。

#### Scenario: 迁移已完成深度扫描的项目
- **WHEN** 用户确认写入有效的旧深度工作流
- **THEN** 系统 SHALL 创建有效的 Wayfinder 文档、更新 AGENTS 的导航链接并保留 `deep-guardrails` 内容，迁移后的健康检查 SHALL 识别该项目为 Wayfinder 布局。

### Requirement: 迁移不得静默删除用户内容
系统 SHALL 仅删除已完整迁移的旧 `docs/ai-context/frontend.md`、完全受管且无额外字段的 `.ai-workflow.yaml`，以及与内置模板完全一致的 `requirements/_template.md`。任何无法证明可安全删除的旧文件 SHALL 被保留并在报告中说明原因。

#### Scenario: 旧需求模板包含用户修改
- **WHEN** 旧 `requirements/_template.md` 与插件内置模板不完全相同
- **THEN** 迁移 SHALL 保留该文件，报告需要人工决定，且不得把它作为迁移失败或静默删除目标。

### Requirement: 旧布局保持可诊断
健康检查 SHALL 区分有效的 Wayfinder 布局与可迁移的旧布局。旧布局 SHALL 返回迁移提醒而非因缺少新路径直接被判定为损坏；普通升级不得自动迁移或删除旧布局文件。

#### Scenario: 更新插件后的旧项目检查
- **WHEN** 已初始化的旧布局项目使用新插件执行健康检查或普通升级
- **THEN** 系统 SHALL 报告 `legacy` 布局及 Wayfinder 迁移提示，且不得创建新布局文件或删除旧文件。

