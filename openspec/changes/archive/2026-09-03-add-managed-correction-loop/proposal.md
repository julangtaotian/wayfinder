## Why

活动受管变更进入验证阶段后，静态检查、审查或 CI 仍可能暴露一个只违反既有 D/A 目标的局部实现缺陷。独立快速 Skill 因存在匹配活动变更必须交接，而完整流程又没有专门的轻量返修步骤，导致同一小问题可能重复加载、修订和验证。（D-01～D-05；A-01、A-02）

## What Changes

- 在 `frontend-change` 的既有 Implement/Verify 生命周期内增加严格受限的局部修正回路，只复用唯一活动变更和已有 D/A，不创建第二份需求、变更、规格或设计。（D-01、D-02；A-01）
- 需求处于“待验证”时恢复为“实施中”，重新打开直接受影响的任务、验收和验证记录；修改后继续由原证据门禁识别其他过期证据。（D-03、D-05；A-02）
- 修正阶段只读取相关事实、修改最小调用链并执行一次聚焦验证；机器证据直接通过证据采集执行，避免相同命令重复运行。（D-04、D-05；A-02）
- 任何新 D/A、行为、范围、共享契约或实质工程边界变化都返回原 Revise；独立快速 Skill、完整生命周期和完成归档门禁保持不变。（D-06；A-03、A-04）

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `fast-change-routing`: 在保持独立快速 Skill 与完整受管生命周期分离的前提下，补充匹配活动变更内部的局部修正合同，并明确其与 Fast Path、Revise 和 Complete 的边界。（D-01～D-06；A-01～A-04）

## Impact

- 修改 `plugins/frontend-ai-workflow/skills/frontend-change/SKILL.md` 和现有 `tests/fast-change-routing.test.mjs`。（D-01、D-04、D-06；A-01～A-04）
- 同步 `fast-change-routing` delta spec；不修改 `frontend-fast-change`、公共双入口说明、运行时脚本、需求/证据校验器、CI、依赖或外部权限。（D-01、D-05、D-06；A-04）
- 实施阶段只运行专用聚焦测试；完成阶段仍按仓库规则执行全量、结构和官方 validator 门禁。（D-04、D-05；A-02、A-04）
