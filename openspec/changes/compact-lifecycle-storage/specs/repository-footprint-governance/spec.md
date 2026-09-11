## ADDED Requirements

### Requirement: 仓库必须拒绝持久运行时和退役归档结构

仓库体积门禁 MUST 以零上限拒绝受跟踪的 `.frontend-ai-workflow/runs`、`cache`、`transactions`、`.frontend-ui-review/runs`、普通 `outputs`、`requirements/archive` 和 `openspec/changes/archive` 内容，并 MUST 拒绝生命周期 schema v1/v2 混写。忽略规则不得替代 Git 索引检查。（D-01、D-10、D-16；A-01、A-04、A-06）

#### Scenario: 使用强制添加绕过忽略
- **WHEN** Git 索引包含任一运行时或退役归档路径
- **THEN** 体积门禁 MUST 返回稳定 tracked_runtime_artifact 或 retired_lifecycle_path 诊断并失败

#### Scenario: 仓库只有本地临时运行
- **WHEN** 忽略目录存在本地运行结果但 Git 索引不包含它们
- **THEN** 门禁 MUST 保持只读通过且不得遍历大体积运行内容

### Requirement: 正式规格和测试上下文增长必须可见

体积治理 MUST 报告正式规格数量、总字节、重复 requirement 标题、退役能力和测试总文件/总行数。硬安全违规 MUST 阻断；总上下文预算 SHOULD 使用显式版本化软预警，不能为当前体积静默调整，也不能用单纯数量上限阻止合理能力增长。（D-12、D-13；A-05、A-06）

#### Scenario: 新建重复 capability requirement
- **WHEN** 两个正式规格包含相同规范化 Requirement 标题且未声明替代关系
- **THEN** 门禁 MUST 返回可定位重复诊断并要求更新既有 capability 或明确迁移

#### Scenario: 测试编号存在歧义
- **WHEN** 多个测试文件把同一个裸 TC 编号作为证据定位
- **THEN** 审计 SHALL 报告歧义并提供文件和行为标题，新增严格证据不得只保存裸编号

#### Scenario: 正式规格仍依赖局部需求编号
- **WHEN** 正式规格仍包含只能由已删除需求正文解释的 D-* 或 A-* 引用
- **THEN** legacy-readonly 审计 SHALL 输出文件与引用清单，v2 门禁 MUST 阻断；系统不得猜测批量改写，需保留的长期决定必须先提升为全局 DEC 标识

#### Scenario: 总上下文超过软预算
- **WHEN** 正式规格总字节或测试总行数超过版本化预算但没有安全违规
- **THEN** 审计 SHALL 返回 warning 和实际值，不自动修改预算或阻断无关紧急修复
