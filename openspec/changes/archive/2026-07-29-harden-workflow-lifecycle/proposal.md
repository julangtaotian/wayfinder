## Why

插件已经具备完整的前端变更流程，但项目扫描、需求修订、交付检查和归档之间仍存在可绕过或无法证明的边界。现在需要把这些文字约束收敛为确定性校验，使工作流在不覆盖项目内容的前提下真正形成安全闭环。（D-01～D-08；A-01～A-08）

## What Changes

- 深度范围收集遵守 Git 忽略规则并排除真实环境配置、凭据和密钥类文件，生成可重复的项目快照指纹。（D-01、D-02；A-01）
- Wayfinder 记录扫描时间、Git 提交、脏状态和范围指纹，健康检查只读报告项目地图是否过期。（D-02、D-08；A-02、A-07）
- 需求修订先更新决策事实源、验收和状态矩阵，再失效旧验证并修订规划；需求状态按确认、实施、待验证、已验收迁移。（D-03、D-04；A-03、A-04）
- 增加关联变更范围、逐任务引用和可持久证据校验，区分工作流接入、变更一致性和交付就绪检查。（D-05、D-07；A-05）
- 完成归档采用硬门禁：严格 OpenSpec 校验、规格同步和同步后校验全部成功后才能移动变更，未完成项不能通过确认绕过。（D-06、D-07；A-06）
- 保留旧需求、旧 Wayfinder、无 Git 基线和已有项目自定义内容的兼容读取与迁移警告。（D-08；A-07）

## Capabilities

### New Capabilities

- `secure-project-analysis`: 定义敏感文件排除、Git 忽略、稳定范围指纹、快照元数据与过期检查。（D-01、D-02；A-01、A-02）
- `governed-requirement-revision`: 定义需求优先修订、证据失效、状态迁移、变更范围和逐任务追溯规则。（D-03、D-04、D-07；A-03、A-04）
- `verifiable-change-delivery`: 定义分层检查、真实验证证据、严格规格同步和不可绕过的完成归档门禁。（D-05、D-06、D-07、D-08；A-05～A-08）

### Modified Capabilities

- 无。现有主规格只覆盖蓝湖设计交付，本次新增独立的工作流治理能力。

## Impact

- 脚本：`collect-project-scope.mjs`、`check-project.mjs`、`validate-requirement-decisions.mjs`，以及新增的变更/交付检查与完成辅助脚本。
- 模板与规则：Wayfinder、需求模板、`frontend-change`、`frontend-workflow-check`、OpenSpec 同步和归档参考。
- 文档与测试：README、结构校验、`tests/workflow.test.mjs`。
- 依赖：继续仅使用 Node.js 标准库和插件内置 OpenSpec，不增加业务项目依赖。
