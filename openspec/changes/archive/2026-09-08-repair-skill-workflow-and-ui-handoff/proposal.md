## Why

REQ-2026-043 的 D-01 至 D-04 已获用户批准：修正技能执行冲突，并补齐默认 UI 比较到源码修复的接续。

## What Changes

- 根据意图选择阶段和需求模式，验证与完成分离，按需读取细则（A-01）。
- 新增候选上下文预览、写入和失效检查，保留原始发现并复用原基线（A-02）。
- 补领域回归并独立记录本地与五平台证据，控制额外模型开销（A-03、A-04）。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `fast-change-routing`：意图优先与连续授权、验证阶段边界。
- `plugin-ui-review-automation`：默认发现到受控修复候选的安全接续。

## Impact

涉及 skills、OpenSpec/UI 参考、UI 工作流 CLI、候选上下文领域模块和测试。不新增依赖，不修改固定运行时；跨平台路径与诊断需回归。对应需求：requirements/REQ-2026-043-skill-workflow-repair.md。
