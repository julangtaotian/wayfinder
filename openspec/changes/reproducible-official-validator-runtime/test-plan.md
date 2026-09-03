# 测试方案：轻量官方 Skill/Plugin 预检入口

## 基本信息

- 状态：已验证
- 需求：`requirements/REQ-2026-040-reproducible-official-validator-runtime.md`
- 变更：reproducible-official-validator-runtime
- 需求修订基线：R-03
- 默认聚焦命令：`node --test tests/official-validator-preflight.test.mjs`

## 测试上下文

- 测试命令状态：detected
- 测试命令：`npm run test`
- 测试运行器：Node.js test runner
- 测试目录：`tests`
- Git 基线：available；提交 `6423705a028d183b44c9e41f9a0c442cfb0e2dc4`；`tests/official-validator-preflight.test.mjs` 规划前不存在
- 兼容说明：自动测试使用受控替身覆盖 POSIX/Windows 路径和失败传播；真实 Creator validators 只在实际 Codex 开发环境执行，不建设额外五平台官方矩阵。

## 测试用例

### TC-01：官方预检复用缓存并执行全部目标

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-01、D-02、D-03、D-04
- 关联验收：A-01、A-02
- 关联规格：official-validator-runtime / 全部目标预检通过、首次准备依赖、有效缓存复用、预检结束后清理
- 状态矩阵：初始（已有数据）、用户操作、刷新、卸载
- 前置条件：受控 Skill/Plugin validator、Python 入口、固定依赖包样本和有界输出目录可由测试注入。
- 测试数据：多个乱序 Skill、一个插件根、冷缓存、有效暖缓存、旁路 `outputs` 文件和连续两次执行记录。
- 测试替身：最小受控 validator、依赖准备器和子进程执行器；替身只验证编排合同，不作为真实官方通过证据。
- 操作：先以冷缓存执行预检，再以同一输入重复执行；记录目标顺序、依赖准备次数、validator 身份、运行时目录和清理结果。
- 可观察断言：首次只向专属缓存准备固定依赖；第二次不重复准备；全部 Skill 按相对路径稳定排序且各执行一次，Plugin 恰好一次；输出脚本摘要和环境版本；所有出口清理临时运行时并保留缓存及其他输出。
- 目标测试：`tests/official-validator-preflight.test.mjs`
- 测试定位：`[TC-01] 官方预检复用缓存并执行全部目标`
- 聚焦命令：`node --test --test-name-pattern=TC-01 tests/official-validator-preflight.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/reproducible-official-validator-runtime/evidence/V-01.json`

### TC-02：官方预检失败关闭并保留真实诊断

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-02、D-03、D-04、D-06、D-08
- 关联验收：A-02、A-03
- 关联规格：official-validator-runtime / validator 或 Python 不可用、冷缓存依赖不可取得、validator 启动失败、Skill 或 Plugin 内容失败、Windows 与 POSIX 路径、预检结束后清理
- 状态矩阵：空态、错误态、卸载
- 前置条件：测试可注入 validator/Python 缺失、依赖准备失败、子进程启动异常和内容非零退出样本。
- 测试数据：四类失败、Skill/Plugin 目标、stdout/stderr、真实退出码、POSIX/Windows 路径和旁路输出文件。
- 测试替身：无 shell 子进程执行器、失败依赖准备器和双平台路径样本。
- 操作：逐一触发不可用、依赖不可用、启动失败和内容失败，并检查机器结果和清理状态。
- 可观察断言：分别返回 `official_validator_unavailable`、`official_validator_dependency_unavailable`、`official_validator_start_failed`、`official_validator_validation_failed`；内容失败含 `validator`、仓库相对 `target`、真实退出码、stdout 和 stderr；任何未启动都不报告通过；只清理本次临时运行时。
- 目标测试：`tests/official-validator-preflight.test.mjs`
- 测试定位：`[TC-02] 官方预检失败关闭并保留真实诊断`
- 聚焦命令：`node --test --test-name-pattern=TC-02 tests/official-validator-preflight.test.mjs`
- 关联验证：V-04
- 结果分类：通过
- 证据：`openspec/changes/reproducible-official-validator-runtime/evidence/V-04.json`

### TC-03：普通门禁、CI 和发布边界保持不变

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-05、D-07、D-08
- 关联验收：A-04、A-05
- 关联规格：official-validator-runtime / 普通验证不触发预检、生成插件发布物、预检结论保持本地边界
- 状态矩阵：初始（已有数据）、用户操作
- 前置条件：根 package scripts、现有验证编排、GitHub Actions 和插件发布目录可读。
- 测试数据：`validate`、`verify`、显式 `validate:official` 命令定义，CI 文件、插件发布文件列表和预检成功输出样本。
- 测试替身：预检成功输出使用受控脚本身份与平台字段，不调用外部环境。
- 操作：检查命令和 CI 调用关系、发布目录边界与成功文案。
- 可观察断言：只有显式命令触发官方预检；普通 `validate`、`verify` 和 CI 不包含真实 Creator validator；插件发布内容不包含缓存或外部脚本；成功文案只声明当前本地 Creator validators 预检通过。
- 目标测试：`tests/official-validator-preflight.test.mjs`
- 测试定位：`[TC-03] 普通门禁和 CI 保持不变`
- 聚焦命令：`node --test --test-name-pattern=TC-03 tests/official-validator-preflight.test.mjs`
- 关联验证：V-03
- 结果分类：通过
- 证据：`openspec/changes/reproducible-official-validator-runtime/evidence/V-03.json`

### TC-04：当前 Codex 环境真实 Creator validators 预检

- 状态：人工通过
- 优先级：P0
- 验证类型：人工
- 测试层级：人工
- 关联决策：D-01、D-02、D-03、D-06、D-07
- 关联验收：A-01、A-02、A-03、A-05
- 关联规格：official-validator-runtime / 全部目标预检通过、当前环境缺少 validator、预检结论保持本地边界
- 状态矩阵：初始（已有数据）、用户操作
- 前置条件：当前 Codex 开发环境提供 Creator validators，Python 可用，冷缓存可准备依赖或已有有效暖缓存。
- 测试数据：当前仓库全部自定义 Skill、插件根、实际 validator 摘要、Python/PyYAML 版本和运行日志。
- 测试替身：不适用。
- 操作：执行 `npm run validate:official`，核对全部目标、脚本摘要、版本、退出状态、清理结果和最终文案；随后运行仓库现有验证。
- 可观察断言：全部 Skill 各真实执行一次，Plugin 真实执行一次，任何未启动或内容失败均非零；成功只对应当前环境实际脚本；缓存和临时目录符合边界，普通仓库验证仍通过。
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-02
- 结果分类：通过
- 证据：`openspec/changes/reproducible-official-validator-runtime/verification.md`
