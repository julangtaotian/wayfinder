## Why

当前受管 Verify 会把验证成功后补写的运行说明纳入证据语义指纹，导致正常生命周期更新触发 `stale_semantic_evidence`。2026-09-10 的复验再次因此发生首轮完成失败、校验器源码回读和二次校验，需要在不降低真实语义保护的前提下稳定一次通过路径。

需求依据：D-01～D-06；验收目标：A-01～A-04。

## What Changes

- 引入可版本化的语义绑定 v2，只绑定决定“验证什么”的稳定字段，排除日期、结果、证据路径、状态和运行说明等完成事实。
- 校验器按证据记录的绑定版本复算，保留 v1 原算法兼容并拒绝未知版本。
- 保持真实 D/A/R/TC、测试目标、定位和聚焦命令变化时失败关闭，保留执行、日志、工作区和 Git 新鲜度门禁。
- 明确受管 Verify 的一次通过顺序与结构化诊断边界，正常流程不读取校验器实现。
- 增加 v2 正常闭环、真语义漂移、v1 兼容和未知版本回归。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `verification-evidence-integrity`：语义绑定按版本复算，并区分稳定验证目标与完成后运行事实。
- `frontend-test-workflow`：成功证据生成后更新结果记录应在第一次 complete 校验通过，正常结构化路径不依赖实现级诊断。

## Impact

- 代码：`verification-semantics.mjs`、`verification-evidence-validation.mjs` 及其现有入口调用。
- 工作流：`managed-test-workflow.md` 与相关公开合同测试。
- 测试：复用 `tests/verification-evidence-integrity.test.mjs`、`tests/frontend-test-workflow.test.mjs`。
- 兼容性：不新增依赖或公共入口；旧 v1 绑定保持原算法，新证据默认使用 v2。
- 跨平台：影响子进程证据、路径、outputs、机器诊断和 CI，按仓库五平台矩阵保留最终外部验证门禁。
