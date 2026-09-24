# wayfinder-workspace Specification

## Purpose

定义当前 schema v2 的精简项目初始化、受管升级、Wayfinder 导航、真实项目健康检查与退役状态边界，确保普通项目只获得必要且可重复维护的工作流入口，同时保护所有项目自定义内容。

## Requirements

### Requirement: 普通初始化只创建必要受管文件

系统 SHALL 在未初始化项目中只规划 `AGENTS.md`、`wayfinder/frontend.md`、`openspec/config.yaml`、`.frontend-workflow.json` 和 `.gitignore` 五个必要目标。系统 SHALL NOT 创建 `requirements/`、普通任务 OpenSpec change、旧工作流元数据或额外项目分析文档。

#### Scenario: 初始化 Vue 3 与 Vite 项目

- **WHEN** 用户预览并确认普通初始化
- **THEN** 写入计划只包含五个必要目标
- **AND** 重复执行不会覆盖项目自定义内容或产生额外目录

### Requirement: 初始化默认预览且保护项目内容

系统 SHALL 默认只返回 create、update、unchanged、skip 或 conflict 计划；只有显式 `--write` 才可写入。现有文件没有合法受管标记时 SHALL 保留原文并失败关闭，所有目标路径 SHALL 先通过安全边界校验。

#### Scenario: 同名文件由项目自行维护

- **WHEN** 目标文件已存在但没有成对受管标记
- **THEN** 系统返回 skip 或 conflict
- **AND** 文件内容保持逐字节不变

### Requirement: 升级只替换受管区块

系统 SHALL 只替换匹配的 `frontend-ai-workflow:start/end` 区块。Wayfinder SHALL 以 `meta`、`facts`、`scope` 与 `analysis` 四组区块区分机器字段、项目事实、扫描范围与项目地图；普通升级 SHALL 保留 `analysis`、深度扫描快照和所有标记外内容，只有显式深度刷新才重建范围并把地图状态重置为 pending。

#### Scenario: 项目追加自定义规则后升级

- **WHEN** 用户在受管区块外追加项目说明并执行升级
- **THEN** 系统只更新公共受管字段
- **AND** 项目说明与深度项目地图保持不变

### Requirement: Wayfinder 明确识别与分析边界

普通初始化 SHALL 记录真实项目命令、直接依赖摘要、目录导航和有限平台画像，并 SHALL 明确 `deepAnalysis: false` 只表示尚未请求完整项目地图。深度分析只有在全部纳入文件完成阅读、覆盖数一致且五个稳定维度齐全时才可标记 complete。

#### Scenario: 普通初始化生成识别基线

- **WHEN** 用户没有请求深度项目分析
- **THEN** Wayfinder 显示识别基线和 `analysisStatus: not-requested`
- **AND** 不把零覆盖解释为扫描失败或完整架构结论

### Requirement: 当前版本对退役工作流失败关闭

系统 SHALL 只按路径识别 `.ai-workflow.yaml`、`docs/ai-context/frontend.md` 和 `requirements/_template.md` 等退役状态，不得读取、解释、迁移或自动删除其内容。初始化、升级和检查 SHALL 返回稳定 `retired_workflow_state`，列出实际路径，并指导用户使用匹配的历史插件版本处理或在确认后显式删除。

#### Scenario: 旧格式内容不可解析

- **WHEN** 项目包含任意退役路径且其内容不是合法旧格式
- **THEN** 当前版本仍只返回相同的路径级失败关闭结果
- **AND** 不修改任何退役文件或创建新 Wayfinder

### Requirement: 项目检查只读报告当前健康事实

检查 SHALL 报告真实命令发现状态、Wayfinder 结构与新鲜度、内置 OpenSpec 健康、schema v2 生命周期、运行时忽略规则、活动 Complex change 和退役路径。检查 SHALL NOT 执行项目命令、审计旧证据链或修复文件。

#### Scenario: 已同步项目重复检查

- **WHEN** 五个必要目标有效且受管事实与当前项目一致
- **THEN** 检查返回空漂移列表和健康运行时状态
- **AND** 重复检查不改变工作区
