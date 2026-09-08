## Why

归档引用与包内文档断链会削弱上一轮的可靠性成果；部分技能将局部理解扩大为深度分析并重复读取材料，增加执行成本。需求依据：`requirements/REQ-2026-044-skill-efficiency-and-integrity.md` D-01 至 D-05、A-01 至 A-05。

## What Changes

- 迁移三种合法文档引用，在新归档和恢复审计中拦截缺失证据，保留历史只读兼容。
- 校验技能与引用文档的实际包内相对链接，修正搬移遗留路径。
- 收窄深度分析触发、按阶段读取、聚焦产物输出；保留原有十技能及安全合同。
- 增加确定性回归和有限行为评测样例，本轮不调用额外模型。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `verifiable-change-delivery`：归档引用迁移与归档后完整性门禁。
- `ai-context-efficiency`：包内引用校验、场景相关读取与结果表达。
- `deep-context-bootstrap`：局部理解与完整地图的触发边界。

## Impact

影响插件 scripts、skills、references 和专用测试；不新增依赖，不修改运行时和平台发布配置。跨平台高风险涉及路径、诊断和 fixture，五平台证据独立于本地验证。
