## ADDED Requirements

### Requirement: 完成汇总不得把非可信证据折叠为通过
检查、完成前校验、正式完成和项目健康汇总 MUST 只有在全部必需自动证据均为当前、完整且可信通过时报告 `passed`。任一子证据为 warning、recorded、external-recorded、inconclusive、blocked、failed、stale 或未知状态时，顶层状态 MUST 保留非通过语义，并 MUST 提供稳定的 `code`、`status`、`target`、`trust` 和 `evidenceId` 以定位来源。（D-08、D-09，A-05、A-06）

#### Scenario: 外部记录与本地通过同时存在
- **WHEN** 一个变更的本地证据通过，但任一必需自动 V-* 只有 external-recorded 外部记录
- **THEN** 顶层验证证据与交付就绪状态均不得为 passed，并定位该外部 evidenceId

#### Scenario: 子校验只返回 warning
- **WHEN** 严格合同中的必需子校验返回 warning 或兼容提示而不是可信通过
- **THEN** 活动变更完成门禁保持阻断，不把 `ok: true` 或 warning 折叠成通过

#### Scenario: 全部必需证据可信通过
- **WHEN** 每个必需自动 V-* 的 schema、语义、新鲜度、持久产物和具体 kind 合同均验证通过，且人工项也按声明完成
- **THEN** 顶层证据状态可以报告 passed，并保留逐项信任与 evidenceId 明细

#### Scenario: 历史只读项目存在兼容警告
- **WHEN** 项目健康检查扫描到未启用严格合同的历史证据并产生迁移 warning
- **THEN** 系统可继续只读审计，但 MUST 明确区分历史兼容健康与当前活动变更的严格完成通过
