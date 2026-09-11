## ADDED Requirements

### Requirement: UI Review 配置与运行产物必须分离

UI Review MUST 允许跟踪项目配置与适配器，但运行状态、截图、比较结果和失败调试内容 MUST 默认写入 `.frontend-ai-workflow/runs/ui-review/<run-id>/` 或等价受管运行目录并被忽略。命令 MUST 只清理本次 run-id，持久报告只有在 strict 证据包明确选择时才能进入单一有界包。（D-05、D-10；A-04、A-09）

#### Scenario: 正常 UI Review
- **WHEN** 调用方执行一个配置场景
- **THEN** 所有运行产物 MUST 写入本次受管 run 目录，配置和适配器保持原位且不会要求新增主题过滤规则

#### Scenario: UI Review 失败
- **WHEN** 捕获、交互或比较失败
- **THEN** 系统 MUST 保留本次有界诊断或按策略清理，不得删除其他 run、配置或项目内容

#### Scenario: 旧 runs 目录被跟踪
- **WHEN** Git 索引包含 `.frontend-ui-review/runs/` 内容
- **THEN** 统一门禁 MUST 阻断并引导使用存量迁移预览，而不是静默加入新的忽略例外

