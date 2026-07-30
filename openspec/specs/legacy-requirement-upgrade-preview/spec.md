# legacy-requirement-upgrade-preview Specification

## Purpose
TBD - created by archiving change strengthen-scenario-matrix-and-legacy-preview. Update Purpose after archive.
## Requirements
### Requirement: 旧需求升级只读预览

系统 SHALL 提供一个只读命令，扫描目标项目根目录 `requirements/` 下直接匹配 `REQ-*.md` 的文件，并稳定报告每份需求的路径、状态分类、是否活跃以及是否缺少决策台账、验收—证据映射和统一状态。该命令 MUST 不创建、修改或覆盖任何需求文件。（D-03、D-04；A-03）

#### Scenario: 活跃旧需求缺少结构字段

- **WHEN** 非“已验收”或状态未知的需求缺少决策台账、验收—证据映射或统一状态
- **THEN** 报告 SHALL 将该需求列为需要关注项，并列出对应的稳定缺口字段。（D-03、D-04；A-03）

#### Scenario: 已验收需求和空目录

- **WHEN** 需求已验收或项目没有标准需求文件
- **THEN** 报告 SHALL 保留完整枚举或空数组，不将其作为写入错误。（D-03；A-03、A-04）

### Requirement: 升级工作流的预览引导

工作流升级指引 SHALL 要求先运行旧需求升级预览，并明确普通受管升级只刷新受管区块；报告的历史需求必须由维护者逐份确认和迁移，系统 MUST 不自动改写。（D-04、D-05；A-03、A-04）

#### Scenario: 维护者准备升级旧项目

- **WHEN** 用户请求升级工作流
- **THEN** 升级指引 SHALL 展示受管区块预览和旧需求缺口预览，并说明两者均不修改业务需求。（D-04、D-05；A-03、A-04）

