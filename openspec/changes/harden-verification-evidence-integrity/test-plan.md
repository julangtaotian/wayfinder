# 测试方案：验证证据完整性与归档可追溯性

## 基本信息

- 状态：已实现
- 需求：`requirements/REQ-2026-026-verification-evidence-integrity.md`
- 变更：harden-verification-evidence-integrity
- 需求修订基线：R-04
- 默认聚焦命令：`node --test tests/verification-evidence-integrity.test.mjs`

## 测试上下文

- 测试命令状态：detected
- 测试命令：`npm test`
- 测试运行器：Node Test Runner
- 测试目录：`tests`
- Git 基线：available；目标专用测试在规划时不存在且未被 Git 跟踪
- 兼容说明：生产脚本仅使用 Node.js 标准库；路径与子进程覆盖 POSIX 和 Windows 确定性样本，真实平台结论仍以仓库 CI 矩阵为准。

## 测试用例

### TC-01：受控执行只为真实发现的测试生成通过证据

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-02、D-03、D-05、D-13
- 关联验收：A-01、A-02、A-08
- 关联规格：verification-evidence-integrity / 本地自动验证必须由受控入口形成机器证据
- 状态矩阵：用户操作、空态、错误态
- 前置条件：隔离项目 fixture、活动变更、V-01 和可执行 Node 测试命令已建立
- 测试数据：退出码 0 且定位命中、退出码 0 但零命中、非零退出、默认预览和已有 passed 证据
- 测试替身：注入的安全子进程、时钟和 outputs 子目录
- 操作：分别预览与显式执行各类命令，并检查日志、清单、退出状态和重复写入
- 可观察断言：预览零写入；只有退出码 0 且定位命中大于零生成 passed；失败结果不覆盖既有 passed；日志不离开 outputs
- 目标测试：`tests/verification-evidence-integrity.test.mjs`
- 测试定位：`[TC-01] 受控执行与零测试证据保护`
- 聚焦命令：`node --test --test-name-pattern="受控执行与零测试证据保护" tests/verification-evidence-integrity.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/harden-verification-evidence-integrity/evidence/V-01.json`

### TC-02：证据 schema 路径和工作区新鲜度失败关闭

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-04、D-07、D-09、D-13
- 关联验收：A-02、A-03、A-08
- 关联规格：verification-evidence-integrity / 机器证据必须安全、版本化且可判旧
- 状态矩阵：初始（已有数据）、刷新、错误态
- 前置条件：fixture 中存在合法 evidence JSON、业务实现、测试、package、需求和生命周期文档
- 测试数据：未知版本、ID 不一致、绝对/父级/符号链接路径、多路径、实现变化、测试变化和仅生命周期文档变化
- 测试替身：隔离文件系统 fixture 和固定摘要输入
- 操作：逐项解析并在文件变化前后重新计算 schema、路径与工作区指纹
- 可观察断言：危险或未知证据返回稳定字段；实现/测试/package 变化使证据过期；需求状态/evidence/outputs/归档前缀变化不自我失效
- 目标测试：`tests/verification-evidence-integrity.test.mjs`
- 测试定位：`[TC-02] 证据安全与工作区新鲜度`
- 聚焦命令：`node --test --test-name-pattern="证据安全与工作区新鲜度" tests/verification-evidence-integrity.test.mjs`
- 关联验证：V-01、V-02
- 结果分类：通过
- 证据：`openspec/changes/harden-verification-evidence-integrity/evidence/V-02.json`

### TC-03：新合同门禁沿 TC V JSON 严格校验且不重跑

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-05、D-06、D-07、D-08、D-09
- 关联验收：A-02、A-03、A-06、A-09
- 关联规格：verification-evidence-integrity / 新合同必须沿 TC V 与机器证据完成闭环；历史与外部证据必须保持显式信任边界
- 状态矩阵：初始（已有数据）、空态、错误态
- 前置条件：分别建立 required 新变更、未声明合同的历史变更、自动/人工/视觉/external-ci V-* 与测试方案
- 测试数据：Markdown-only、合法 JSON、缺失/损坏/过期 JSON、多个路径和未远程复查 CI 引用
- 测试替身：注入项目命令执行器以确认调用次数为零
- 操作：运行需求 plan/precomplete/complete、测试方案 complete 与 check-change
- 可观察断言：新合同缺证据失败、历史保持警告、类型不冒充、多个路径逐项检查，所有完成校验都不执行项目命令
- 目标测试：`tests/verification-evidence-integrity.test.mjs`
- 测试定位：`[TC-03] 证据完成门禁与历史兼容`
- 聚焦命令：`node --test --test-name-pattern="证据完成门禁与历史兼容" tests/verification-evidence-integrity.test.mjs`
- 关联验证：V-07
- 结果分类：通过
- 证据：`openspec/changes/harden-verification-evidence-integrity/evidence/V-07.json`

### TC-04：归档预览迁移审计和部分失败可恢复

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-10、D-11
- 关联验收：A-04、A-05、A-06
- 关联规格：verifiable-change-delivery / 完成入口必须迁移证据引用并执行归档后审计；归档引用迁移必须幂等且可恢复
- 状态矩阵：用户操作、刷新、错误态
- 前置条件：隔离 OpenSpec fixture 已通过 precomplete，需求引用活动变更下的 Markdown 与多个 JSON 证据
- 测试数据：正常归档、无关 URL/其他变更、重复执行、需求 rename 失败和归档后证据缺失
- 测试替身：注入 OpenSpec 归档结果、原子写入器和 complete 审计器
- 操作：运行完成预览、正式归档、重复恢复和两个部分失败分支
- 可观察断言：预览零写入；正式引用使用实际 archivedAs；重复无双日期；失败返回 archiveTarget、rewrites、failedStage 且不报告完整成功
- 目标测试：`tests/verification-evidence-integrity.test.mjs`
- 测试定位：`[TC-04] 归档引用迁移与恢复`
- 聚焦命令：`node --test --test-name-pattern="归档引用迁移与恢复" tests/verification-evidence-integrity.test.mjs`
- 关联验证：V-03
- 结果分类：通过
- 证据：`openspec/changes/harden-verification-evidence-integrity/evidence/V-03.json`

### TC-05：UI Review 报告与状态共享运行身份

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-12
- 关联验收：A-07
- 关联规格：plugin-ui-review-automation / UI Review Markdown 必须可独立识别运行与证据
- 状态矩阵：初始（已有数据）、刷新、错误态
- 前置条件：首次验收和复验的完成状态、截图与报告目标已建立
- 测试数据：runId、scenarioFingerprint、project-playwright capture、空/有效 baselineRunId、statePath、evidence 摘要和缺失身份字段
- 测试替身：纯报告 context 与 Markdown 渲染器
- 操作：渲染首次和复验报告并与状态 JSON 字段逐项比较，再删除必需字段重试
- 可观察断言：报告能独立定位运行、基线、采集器、状态和证据；缺少身份失败关闭；机器事实仍来自状态 JSON
- 目标测试：`tests/verification-evidence-integrity.test.mjs`
- 测试定位：`[TC-05] UI 报告运行身份一致性`
- 聚焦命令：`node --test --test-name-pattern="UI 报告运行身份一致性" tests/verification-evidence-integrity.test.mjs`
- 关联验证：V-04
- 结果分类：通过
- 证据：`openspec/changes/harden-verification-evidence-integrity/evidence/V-04.json`

### TC-06：跨平台子进程、CI action 与三层证据保持边界

- 状态：已实现
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-06、D-13、D-14
- 关联验收：A-08、A-09
- 关联规格：verification-evidence-integrity / 证据执行与诊断必须跨平台稳定
- 状态矩阵：用户操作、刷新、错误态
- 前置条件：共享跨平台清单、仓库五平台矩阵和证据 fixture 可读
- 测试数据：POSIX/Windows 分隔符、空格/中文路径、Windows npm_execpath、缺失 npm JS 入口、outputs 清理、稳定错误字段、`actions/upload-artifact@v7` 和未完成矩阵
- 测试替身：注入 platform、process.execPath、环境、文件存在检查和 CI 证据清单
- 操作：构造各平台调用和错误，执行成功/失败清理，并分别评估聚焦、本地全量和真实矩阵状态
- 可观察断言：Windows 不直启 `.cmd`，路径诊断稳定，CI 使用 Node.js 24 的 upload-artifact v7 且保持上传合同，产物只在 outputs，清理保留原始错误，矩阵不完整不能由本地通过替代
- 目标测试：`tests/workflow.test.mjs`
- 测试定位：`[TC-06] 跨平台证据执行与发布边界`
- 聚焦命令：`node --test --test-name-pattern="统一验证固定阶段顺序、短路失败并由 CI 单一调用" tests/workflow.test.mjs`
- 关联验证：V-05、V-06
- 结果分类：未执行
- 证据：待生成
