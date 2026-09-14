# legacy-requirement-upgrade-preview Specification

## Purpose
TBD - created by archiving change strengthen-scenario-matrix-and-legacy-preview. Update Purpose after archive.

## Requirements

### Requirement: 旧需求升级只读预览

系统 SHALL 提供一个只读命令，扫描目标项目根目录 `requirements/` 下直接匹配 `REQ-*.md` 的文件，并稳定报告每份需求的路径、状态分类、是否活跃以及是否缺少决策台账、验收—证据映射和统一状态。该命令 MUST 不创建、修改或覆盖任何需求文件。

#### Scenario: 活跃旧需求缺少结构字段

- **WHEN** 非“已验收”或状态未知的需求缺少决策台账、验收—证据映射或统一状态
- **THEN** 报告 SHALL 将该需求列为需要关注项，并列出对应的稳定缺口字段。

#### Scenario: 已验收需求和空目录

- **WHEN** 需求已验收或项目没有标准需求文件
- **THEN** 报告 SHALL 保留完整枚举或空数组，不将其作为写入错误。

### Requirement: 升级工作流的预览引导

工作流升级指引 SHALL 要求先运行旧需求升级预览，并明确普通受管升级只刷新受管区块；报告的历史需求必须由维护者逐份确认和迁移，系统 MUST 不自动改写。

#### Scenario: 维护者准备升级旧项目

- **WHEN** 用户请求升级工作流
- **THEN** 升级指引 SHALL 展示受管区块预览和旧需求缺口预览，并说明两者均不修改业务需求。

### Requirement: v2 日常检查不得展开已退役需求入口

当仓库声明 lifecycle schema v2 时，旧需求升级预览和其他日常检查 MUST 只处理当前活动需求，不得依赖旧集中索引、已验收根存根或需求正文归档。legacy-readonly 仓库 MAY 继续只读识别旧结构以支持迁移预览。

#### Scenario: v2 仓库执行旧需求预览

- **WHEN** 根需求目录只包含活动需求且历史已转为生命周期事件
- **THEN** 预览只报告活动需求缺口，不尝试读取已删除的索引、存根或归档正文

#### Scenario: legacy-readonly 仓库准备迁移

- **WHEN** 仓库仍存在旧索引、存根和归档正文
- **THEN** 预览保持只读兼容，生命周期迁移器把旧索引和已验收存根纳入精确候选而非活动引用
