## MODIFIED Requirements

### Requirement: 历史需求事实必须按生命周期渐进读取

系统 MUST 根据生命周期模式选择历史事实来源。schema v2 默认只读取当前活动需求、正式规格和 `.workflow-history/<year>.jsonl` 紧凑事件，不得依赖、生成或递归扫描需求正文归档、OpenSpec 永久归档或已验收根存根；用户指定历史变更时，系统 MUST 通过事件中的稳定 changeId、requirementId、能力和规格摘要定位当前合同，并仅在确有必要时由 Git 历史补充已删除正文。`legacy-readonly` 仓库 MAY 继续通过旧存根、索引和归档正文执行迁移预览或历史诊断，但 MUST 保持按需、有界且只读，不得把旧结构写入 schema v2。

#### Scenario: schema v2 普通健康检查

- **WHEN** schema v2 仓库包含活动需求、正式规格和紧凑生命周期事件
- **THEN** 默认检查使用这些当前事实完成状态与计数，不读取或要求已退役的需求正文归档和 OpenSpec 归档

#### Scenario: schema v2 用户指定历史变更

- **WHEN** 用户明确选择一个已完成 changeId 或 requirementId
- **THEN** 系统先读取对应紧凑事件和当前正式规格，并只在这些事实不足时定向读取 Git 历史
- **AND** 不恢复、复制或重新生成旧归档正文

#### Scenario: legacy-readonly 仓库执行迁移审计

- **WHEN** 旧仓库保留需求存根、索引或归档正文并执行迁移预览或历史诊断
- **THEN** 系统按稳定索引和有界查询只读访问必要正文，映射不唯一时返回稳定诊断
- **AND** 日常检查不把旧归档混入 schema v2 事件来源

#### Scenario: 旧归档映射缺失或不一致

- **WHEN** `legacy-readonly` 仓库的存根、索引与归档正文无法形成唯一映射
- **THEN** 系统返回稳定结构诊断并停止把该条目报告为可用历史事实

<!-- 追踪：D-02、D-03、D-04、D-06；A-01、A-03、A-05。 -->
