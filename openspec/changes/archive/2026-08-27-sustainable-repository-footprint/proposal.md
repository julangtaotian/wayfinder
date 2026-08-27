## Why

上一轮已经限制 AI 默认读取大目录，但仓库仍把五平台 LFS 资产、蓝湖历史验收工程、完整已验收需求和超大综合测试放在日常工作树中。继续依赖人工定期清理无法阻止再次膨胀，需要把资产退役、需求归档和体积预算纳入正常完成与验证生命周期。（D-01、D-03、D-06、D-09；A-01、A-02、A-03、A-04、A-07）

## What Changes

- 退役 `outputs/lanhu-design-spec/` 的历史验证工程、图片证据和仓库专用 UI Review 原型，保留并验证精简 `outputs/lanhu-ai-ui-spec/`。（D-01、D-02；A-01）
- 将完整已验收需求迁入年度历史目录，在根目录保留轻量存根和稳定索引；完成流程以后自动执行同一动作，历史正文仅在显式审计时读取。（D-03、D-04、D-05；A-02、A-07）
- 新增版本化仓库体积审计，约束受跟踪 outputs、退役路径、活跃完整需求和日常大文件，并接入统一验证。（D-06；A-03、A-07）
- 拆分超大综合测试与核心脚本，增加仓库治理、工作流核心和平台运行时聚焦入口，同时保持公开导出和 CLI 兼容。（D-07、D-08；A-05、A-06）
- Git LFS 继续作为五平台规范源；轻量开发克隆和 CI 矩阵按目标平台拉取资产，缺失文件或 LFS 指针失败关闭。（D-09、D-10、D-11、D-13；A-04、A-08）
- 同步版本到 0.18.0，并把预算调整和资产例外纳入正式规划，不再依赖定期人工瘦身。（D-06、D-12；A-07、A-08）

## Capabilities

### New Capabilities

- `repository-footprint-governance`: 定义仓库体积预算、稳定诊断、退役路径防回归和预算变更治理合同。（D-06、D-08；A-03、A-06、A-07）

### Modified Capabilities

- `ai-context-efficiency`: 默认读取进一步区分活跃需求、轻量存根和按需历史正文。（D-03、D-05；A-02、A-07）
- `verifiable-change-delivery`: 完成与恢复流程在归档审计通过后自动分层需求正文、写入存根并刷新索引。（D-03、D-04；A-02、A-07）
- `repository-verification-gate`: 统一验证增加体积门禁和稳定聚焦入口，并保持发布级完整验证。（D-06、D-08；A-03、A-06、A-08）
- `repository-hygiene`: 持久 outputs 改为受预算管理，Git LFS 支持按目标平台检出且规范源继续受保护。（D-01、D-06、D-09、D-10；A-01、A-03、A-04）
- `lanhu-design-spec-contract`: 从双目录与仓库内完整验收工程收敛为单一精简 AI 规范，移除依赖历史截图和双组件库工程的活动合同。（D-01、D-02；A-01）

## Impact

- 需求与完成链：`requirements/`、`finalize-change.mjs`、需求预览与历史证据审计、相关生命周期测试。
- 仓库治理：新增体积审计脚本和专用测试，修改 `verify.mjs`、`package.json`、AGENTS、README 与结构校验。
- 蓝湖资产：删除 `outputs/lanhu-design-spec/` 及直接依赖测试，保留 `outputs/lanhu-ai-ui-spec/` 并建立小型合同测试。
- 模块组织：拆分 `workflow.test.mjs`、`verification-evidence.mjs` 和 `real-project-validation.mjs`，保持现有导出及 CLI 参数。
- 跨平台发布：修改 `.github/workflows/validate.yml` 的 Git LFS 准备链和平台运行时回归；影响 Linux x64/ARM64、Windows x64、macOS Intel/ARM64。
- 本变更不新增 npm 依赖、不重写 Git 历史、不删除远端 LFS 规范源，也不假设新的外部制品服务。
