# 测试方案：安全写入与机器证据可信度闭环

## 基本信息

- 状态：已验证
- 需求：`requirements/REQ-2026-028-workflow-trust-boundary.md`
- 变更：2026-08-24-harden-workflow-trust-boundary
- 需求修订基线：R-02
- 默认聚焦命令：`node --test tests/workflow-trust-boundary.test.mjs`

## 测试上下文

- 测试命令状态：detected
- 测试命令：`npm test`
- 测试运行器：Node Test Runner
- 测试目录：`tests`
- Git 基线：available；基线提交 `9021c58f7ac04faf2b98b71cb150ec12c51db560`，专用目标测试在规划时不存在且未被 Git 跟踪
- 兼容说明：只使用仓库现有 Node.js 标准库与 Node Test Runner；确定性样本覆盖 POSIX/Windows 路径语义，真实平台结论仍由最终提交的五平台 CI 矩阵证明。

## 测试用例

### TC-01：所有受管写入在符号链接边界失败关闭且保持正常兼容

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-01、D-02、D-03、D-10、D-11
- 关联验收：A-01、A-02、A-06
- 关联规格：safe-project-mutation / 目标项目写入必须受真实项目根约束；预览和正式写入必须使用同一安全判定；安全路径诊断必须跨平台可定位
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态
- 前置条件：隔离目标项目 fixture 可执行 bootstrap/update、Wayfinder migration、verification evidence、UI Review 与 finalize 的预览和写入入口
- 测试数据：普通目录、项目根符号链接入口、根以下目标链接、祖先链接、预览后替换链接、无受管标记冲突、重复执行、原子操作失败、POSIX/Windows 路径样本和项目外哨兵文件
- 测试替身：隔离文件系统 fixture、可控 OpenSpec 归档响应和操作失败注入；不替换被测路径判定逻辑
- 操作：对每个公开 mutation 入口先预览再显式写入，分别覆盖安全、链接、冲突、状态变化、重复执行和失败恢复分支
- 可观察断言：链接目标或祖先均返回稳定 code/status/target 且项目外哨兵不变；项目根别名规范化；dry-run 零写入；普通受管内容仅按计划修改并保持幂等；失败不覆盖原文件或原始错误
- 目标测试：`tests/workflow-trust-boundary.test.mjs`
- 测试定位：`[TC-01] 受管写入符号链接边界与兼容性`
- 聚焦命令：`node --test --test-name-pattern="受管写入符号链接边界与兼容性" tests/workflow-trust-boundary.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/evidence/V-01.json`

### TC-02：schema v2 绑定当前语义并复核全部证据与信任等级

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-04、D-05、D-06、D-07、D-08、D-09
- 关联验收：A-03、A-04、A-05、A-06
- 关联规格：verification-evidence-integrity / 严格机器证据必须绑定当前验收语义；严格校验必须复算持久证据完整性；外部 CI 记录不得自我提升信任等级；plugin-ui-review-automation / UI Review 机器证据必须复核真实运行状态与关键产物；verifiable-change-delivery / 完成汇总不得把非可信证据折叠为通过
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态
- 前置条件：隔离活动严格变更包含 R-01、D/A/V 映射、test-plan、local-command、ui-review 与 external-ci 清单，并保留历史 v1 只读样本
- 测试数据：相关/无关/完成字段语义变化，日志与附件缺失/篡改/链接越界，UI runId/场景/指纹/采集器/status/关键产物组合，external-ci 自声明 remotelyVerified，warning/recorded/inconclusive/blocked 聚合和历史 v1
- 测试替身：固定时钟、隔离文件系统、可控需求与测试方案文本、真实 SHA-256 文件描述符；不调用网络或项目测试命令
- 操作：生成 v2 本地证据后逐项改变语义和持久文件，构造 UI 与 external-ci 清单，并通过需求、test-plan、check-change 与完成前入口重复校验
- 可观察断言：相关 D/A/V/TC 变化使证据过期，完成字段和无关说明不自失效；日志/附件/UI 状态或产物任一不一致失败；external-ci 固定 external-recorded；非可信子状态不聚合为 passed；历史 v1 只读提示而活动严格 v1 阻断
- 目标测试：`tests/workflow-trust-boundary.test.mjs`
- 测试定位：`[TC-02] 机器证据语义完整性与信任聚合`
- 聚焦命令：`node --test --test-name-pattern="机器证据语义完整性与信任聚合" tests/workflow-trust-boundary.test.mjs`
- 配套兼容回归：`tests/verification-evidence-integrity.test.mjs` 只更新既有 schema 版本和 external-ci 信任预期，不追加本变更的新测试标题。
- 关联验证：V-02
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/evidence/V-02.json`

### TC-03：统一验证保持跨平台合同和既有插件结构

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：端到端
- 关联决策：D-03、D-09、D-10、D-11、D-12
- 关联验收：A-02、A-06、A-07
- 关联规格：safe-project-mutation / 安全路径诊断必须跨平台可定位；verifiable-change-delivery / 完成汇总不得把非可信证据折叠为通过
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态、卸载
- 前置条件：TC-01 与 TC-02 已实现，插件 manifest、Skills、内置 OpenSpec、Vue 3 + Vite fixture 和仓库统一验证入口可用
- 测试数据：完整仓库测试、结构校验、官方 validators、插件安装结构、Vue fixture 初始化/重复执行/升级/检查，以及 `/`、`\\` 路径诊断样本
- 测试替身：仓库既有 fixtures 与校验脚本；真实五平台 Runner 不在本地测试中模拟为通过
- 操作：执行仓库统一验证链，并检查专用测试定位、稳定机器字段、AI 标记禁入、插件结构和既有 fixture 行为
- 可观察断言：本地统一验证全部成功；路径与机器诊断断言不依赖单一平台文案；既有 dry-run、受管升级、运行时和插件结构无回归；本地结果不替代外部矩阵
- 目标测试：`tests/workflow-trust-boundary.test.mjs`
- 测试定位：`[TC-03] 跨平台诊断与仓库统一验证合同`
- 聚焦命令：`npm run verify`
- 关联验证：V-03
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/evidence/V-03.json`

### TC-04：人工复核交付文案不夸大安全与证据信任

- 状态：人工通过
- 优先级：P1
- 验证类型：人工
- 测试层级：人工
- 关联决策：D-01、D-03、D-08、D-09、D-11、D-12
- 关联验收：A-02、A-05、A-06、A-07
- 关联规格：verifiable-change-delivery / 完成汇总不得把非可信证据折叠为通过
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态
- 前置条件：本地聚焦与统一验证结果、预览输出、阻断输出和支持范围说明均已持久化到当前变更 verification.md
- 测试数据：passed、warning、external-recorded、inconclusive、blocked、历史 v1 和符号链接阻断示例
- 测试替身：不适用；由维护者在 macOS 本地环境读取实际结构化输出和交付说明
- 操作：逐项对照 requirement、delta specs、结构化状态和最终结论，检查是否把记录、兼容提示、未复核外部状态或有限威胁模型写成通过/无漏洞
- 可观察断言：默认预览和恢复方式说明准确；所有非可信状态保留原义；结论明确本次未覆盖动态识别、远程读取、Monorepo 与非 Vitest 完整认证
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-04
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/verification.md`

### TC-05：人工复核最终实现提交真实五平台矩阵

- 状态：人工通过
- 优先级：P0
- 验证类型：人工
- 测试层级：人工
- 关联决策：D-10、D-12
- 关联验收：A-07
- 关联规格：safe-project-mutation / 安全路径诊断必须跨平台可定位；verification-evidence-integrity / 外部 CI 记录不得自我提升信任等级
- 状态矩阵：用户操作、刷新、错误态
- 前置条件：最终实现已提交并推送，GitHub Actions 对该精确提交产生 Linux x64/ARM64、Windows x64、macOS Intel/ARM64 五个平台任务
- 测试数据：精确提交 SHA、工作流运行 URL、五个平台任务名称与最终状态
- 测试替身：不适用；只复核真实 GitHub Actions Runner，不用本地模拟或手写 remotelyVerified 字段替代
- 操作：打开最终提交的 Actions 运行，逐项核对五个平台任务、提交 SHA、失败重试历史和最终结论，并把 URL 与人工判断写入 verification.md
- 可观察断言：五个平台全部成功才把 V-05 记为人工通过；任一缺失、取消或失败都保持未完成，并记录平台、根因与稳定复现条件
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-05
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/verification.md`
