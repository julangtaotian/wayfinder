## Why

完整的 `frontend-change` 擅长治理需求、规划、实现和归档，但把明确局部修改的快速规则嵌入其中，会让简单任务加载过多流程，也会改变原能力的默认状态机。需要一个真正独立、可按描述选择的快速 Skill，在保持验证与授权边界的同时缩短“已决定结果的小改动”从请求到交付的路径。（D-01～D-06；A-01～A-04）

## What Changes

- 新增 `frontend-fast-change` Skill 及隐式选择元数据，只处理结果已决定、影响可界定、可聚焦验证且没有匹配活动变更的局部前端修改。（D-01、D-02；A-01）
- 使用实质风险而非目录名、文件数或行数分流；允许沿同一局部调用链修改必要文件。（D-02、D-03；A-02、A-03）
- 发现活动变更、未决产品决定、不可界定影响、共享契约或工程风险时，停止扩张并携带已有事实与安全工作，只交接一次给 `frontend-change`。（D-03、D-04；A-02）
- 恢复并保护 `frontend-change` 原有公开描述、Plan/Revise/Implement/Complete 生命周期和完成门禁。（D-06；A-04）
- 用简洁公共路由、公开 Skill 清单和专用测试同步新能力，避免复制整份快速规则。（D-07；A-05）

## Capabilities

### New Capabilities

- `fast-change-routing`: 定义独立快速 Skill 的选择、最小准入、局部执行、聚焦验证、实质风险交接和完整能力兼容合同。

### Modified Capabilities

无。

## Impact

- 新增 `plugins/frontend-ai-workflow/skills/frontend-fast-change/`；恢复 `plugins/frontend-ai-workflow/skills/frontend-change/SKILL.md` 原合同。（D-01、D-06；A-01、A-04）
- 同步受管 `AGENTS.md` 模板、需求边界说明、README、公开 Skill fixture 和 `tests/fast-change-routing.test.mjs`。（D-07；A-05）
- 不修改 OpenSpec 运行时、需求/完成校验器、依赖、CI 或外部授权。（D-05、D-06；A-03～A-05）
- 已有需求和活动变更保持优先，业务项目只有显式升级受管区块后才获得新的路由提示。（D-03、D-06；A-02、A-04）
