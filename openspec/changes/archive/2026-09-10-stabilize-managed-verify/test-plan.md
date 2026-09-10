# 测试方案：受管 Verify 一次通过与语义绑定稳定性

## 基本信息

- 状态：已验证
- 需求：`requirements/archive/2026/REQ-2026-046-managed-verify-stability.md`
- 变更：2026-09-10-stabilize-managed-verify
- 需求修订基线：R-01
- 默认聚焦命令：`node --test tests/verification-evidence-integrity.test.mjs tests/frontend-test-workflow.test.mjs`

## 测试上下文

- 测试命令状态：detected
- 测试命令：`npm run test`
- 测试运行器：Vitest（配置识别；本次两项聚焦文件使用 Node Test Runner）
- 测试目录：`tests`
- Git 基线：available；两个目标测试文件均已受版本控制，当前基线 `118e4d3ee1908bbe82972014ac6cac4296d6b793`
- 兼容说明：聚焦回归使用仓库现有 Node Test Runner；Vitest 真实 fixture 由全量验证按固定运行时执行，其他 runner 不提升为完整认证。

## 测试用例

### TC-01：受管 Verify 结果补写与语义版本兼容

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-01、D-02、D-03、D-05
- 关联验收：A-01、A-02、A-03
- 关联规格：verification-evidence-integrity / 语义绑定版本必须兼容验证结果闭环
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态
- 前置条件：严格证据 fixture 已包含已确认 D/A/R、计划 V-*、已实现 TC-* 和可执行聚焦命令
- 测试数据：v2 正常清单、v2 完成事实更新、v2 真语义修改、v1 原算法清单和未知版本清单
- 测试替身：使用临时隔离项目和注入执行器，不启动 shell、网络或外部 CI
- 操作：生成机器证据，更新完成事实并运行 complete；随后分别验证真实语义漂移、v1 兼容和未知版本
- 可观察断言：v2 完成事实补写后第一次 complete 通过；真实语义变化判旧；v1 未变有效且原字段变化判旧；未知版本稳定失败
- 目标测试：`tests/verification-evidence-integrity.test.mjs`
- 测试定位：`[TC-01] 受管 Verify 结果补写与语义版本兼容`
- 聚焦命令：`node --test --test-name-pattern="受管 Verify 结果补写与语义版本兼容" tests/verification-evidence-integrity.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-09-10-stabilize-managed-verify/evidence/V-01.json`

### TC-02：受管 Verify 一次通过公开合同

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-04、D-06
- 关联验收：A-04
- 关联规格：frontend-test-workflow / 受管 Verify 必须提供一次通过的结果记录路径
- 状态矩阵：初始（已有数据）、用户操作、空态、错误态
- 前置条件：受管测试工作流参考文件和公开测试入口存在
- 测试数据：正常一次闭环顺序、可更新完成事实、不可更新稳定语义、已知与未知诊断边界
- 测试替身：不适用
- 操作：读取公开工作流合同并检查所需阶段、边界和禁止项
- 可观察断言：合同明确单次证据执行和单次 complete；已知结构化结果不读取校验器实现，未知故障才允许最小诊断
- 目标测试：`tests/frontend-test-workflow.test.mjs`
- 测试定位：`[TC-02] 受管 Verify 一次通过公开合同`
- 聚焦命令：`node --test --test-name-pattern="受管 Verify 一次通过公开合同" tests/frontend-test-workflow.test.mjs`
- 关联验证：V-02
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-09-10-stabilize-managed-verify/evidence/V-02.json`
