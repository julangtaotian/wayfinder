## ADDED Requirements

### Requirement: 完成历史必须由紧凑事件承载

完成入口 MUST 在既有任务、验收、测试计划、机器证据和严格 OpenSpec 门禁通过后，把原生归档作为临时规格同步步骤，并在生命周期事务成功时仅长期保留正式规格、紧凑事件和 strict 模式的单一有界证据包。默认模式 MUST 不保留需求正文归档、OpenSpec 归档、普通输出树或引用迁移副本。（D-01～D-05；A-01～A-04）

#### Scenario: 默认完成模式
- **WHEN** 普通需求通过全部完成门禁
- **THEN** 完成结果 MUST 包含事件、规格摘要和信任声明，并 MUST 清理活动正文、活动变更、原生临时归档和普通证据

#### Scenario: 严格完成模式
- **WHEN** 需求属于高风险、发布交付或调用方显式选择 strict
- **THEN** 系统 MAY 保留一个受 schema、路径、数量和字节预算限制的证据包，不得展开为任意文件树

#### Scenario: 外部 CI 尚未完成
- **WHEN** 本地候选通过但真实矩阵尚未运行
- **THEN** 事件 MUST 保留 external pending 或 recorded 语义，不得声明跨平台 trusted pass，也不得通过另一次仓库提交回写 CI 结果

### Requirement: 活动需求文本状态不得覆盖生命周期投影

需求正文在活动期 MUST 继续使用草稿、已确认、实施中和待验证阶段；完成后权威终态 MUST 来自生命周期事件。旧已验收存根 MAY 作为只读 v1 兼容输入，但在 v2 仓库中不得覆盖活动变更或有效事件。（D-02、D-16；A-02、A-09）

#### Scenario: 待验证需求已完成
- **WHEN** accepted 事件已经提交而事务恢复仍看到待验证正文残留
- **THEN** 状态查询 MUST 报告 accepted 与可恢复残留，不得重新实施或生成第二次完成事件

#### Scenario: 活动变更仍存在
- **WHEN** 同一 changeId 同时存在活动目录和旧 accepted 事件
- **THEN** 系统 MUST 根据 revision/reopen 关系报告 active 或冲突，不得简单沿用旧已验收状态

