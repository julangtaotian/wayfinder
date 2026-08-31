## MODIFIED Requirements

### Requirement: 健康检查必须提供有界精简结果

系统 SHALL 在显式 `--summary` 模式下返回版本化、机器可读的精简结果。结果 SHALL 保留完整根直接依赖画像、命令及其执行证据、平台画像、工作流布局、规划引擎、活动变更、错误和警告；当目标是插件仓库时，结果还 SHALL 保留 `repositoryKind`、插件仓库整体状态、marketplace 相对路径、插件总数、按状态计数和有界插件样例。历史验证审计 SHALL 保留 requirements、records 和 counts 但省略 diagnostics 全集；静态观察 SHALL 返回总数、按 code 计数、最多 5 项稳定样例和遗漏数。新增字段 SHALL 是可选扩展，既有 `layout`、`schemaVersion`、完整根直接依赖画像和现有 summary 字段保持兼容。（D-02、D-03、D-05；A-01、A-02）

#### Scenario: 项目包含大量历史诊断

- **WHEN** 调用方显式运行健康检查 summary
- **THEN** 结果 SHALL 使用稳定 schema 和 `mode=summary`，并 SHALL NOT 展开历史 diagnostics 全集
- **AND** counts、完整依赖画像和当前健康状态 SHALL 保持可用

#### Scenario: 项目包含大量静态观察

- **WHEN** 深度分析返回超过 5 项静态观察
- **THEN** summary SHALL 返回总数、按 code 计数、前 5 项样例和准确遗漏数
- **AND** 完整检查仍 SHALL 保留全部观察

#### Scenario: 插件 marketplace 包含大量本地条目

- **WHEN** 已识别插件仓库的本地插件条目超过 summary 的固定样例上限
- **THEN** summary SHALL 返回准确的插件总数、显示数、遗漏数和按状态计数
- **AND** summary SHALL 仅返回稳定排序的有界样例，完整检查仍 SHALL 保留全部插件事实

