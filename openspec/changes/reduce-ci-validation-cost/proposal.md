## Why

当前 Validate 工作流在五个平台上重复执行完整九阶段统一验证和 Vitest 临时运行时准备，只有 Playwright 平台校验、真实浏览器冒烟与平台打包需要跨平台重复。REQ-2026-034 D-01、D-02 要求进入 CI 成本优化阶段，在保留同一精确提交五平台证据的同时减少确定性重复工作，并按 D-04 禁止把此类治理改成定时任务。

## What Changes

- 按 D-02、D-03 为同一统一验证脚本增加 `all`、`shared`、`platform` 三个失败关闭的作用域；根 `npm run verify` 继续是完整九阶段入口。
- 将 CI 改为一次 Linux x64 共享验证和依赖共享成功的五平台专属矩阵；共享测试与平台测试的并集保持完整，零测试或未知作用域不得通过。
- 在平台矩阵中继续执行目标 Git LFS 资产拉取、Playwright 完整性、真实浏览器冒烟、平台插件打包和报告上传，不删除任何现有平台。
- 按 D-04 为同一工作流、同一 Git 引用启用在途运行取消；保留 push、pull request、只读权限和跨事件引用边界，不增加 schedule。
- 按 D-05、D-06 暂不增加路径忽略或缓存，以工作流合同和任务耗时记录共享验证由五次降为一次、平台验证保持五次，不承诺具体金额。
- 按 D-07、D-08 扩展现有手写测试，并通过聚焦、本地统一、Vue 3 + Vite fixture 与同一精确提交的真实五平台 CI 分层取证。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `repository-verification-gate`：将“CI 只调用一次完整统一入口”调整为“CI 复用同一验证编排的共享与平台作用域”，明确完整集合、失败依赖、五平台证据和在途运行取消合同。

## Impact

- 受影响文件：`.github/workflows/validate.yml`、`package.json`、`scripts/verify.mjs`、`scripts/test-groups.mjs`、`tests/workflow-project.test.mjs`、`tests/ui-review-platform-runtime.test.mjs`。
- 受影响系统：GitHub Actions runner 调度、Git LFS 目标平台资产、Vitest 临时运行时、Playwright 平台运行时与插件平台包报告。
- 兼容边界：根 `npm run verify`、Node.js 20.19.0、五个平台键、报告名称/路径和工作流只读权限保持兼容；不新增 npm 依赖或第三方 action。
- 风险：命中 CI、路径、临时目录、子进程、包管理器、环境变量和机器诊断；必须用稳定 scope/code/status/target 与同一精确提交五平台结果证明没有漏验。
