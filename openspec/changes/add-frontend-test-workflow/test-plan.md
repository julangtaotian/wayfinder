# 测试方案：前端测试用例工作流

## 基本信息

- 状态：已实现
- 需求：`requirements/REQ-2026-025-frontend-test-workflow.md`
- 变更：add-frontend-test-workflow
- 需求修订基线：R-06
- 默认聚焦命令：`node --test tests/frontend-test-workflow.test.mjs`

## 测试上下文

- 测试命令状态：detected
- 测试命令：`npm test`
- 测试运行器：Node Test Runner；Vue fixture 使用 Vitest
- 测试目录：`tests`
- Git 基线：available；目标专用测试在实施前不存在且未被 Git 跟踪
- 兼容说明：首版只认证 Vue 3 + Vite + Vitest 闭环；其他 runner 仅按项目文件证据有限支持。

## 测试用例

### TC-01：只读识别项目测试上下文

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-01、D-03、D-08、D-12
- 关联验收：A-01、A-05、A-07
- 关联规格：frontend-test-workflow / 用户只要求分析覆盖
- 状态矩阵：初始（已有数据）
- 前置条件：安全 fixture 已声明 package.json、测试脚本、runner 配置、手写测试和生成基线
- 测试数据：Vue 3、Vite、Vitest 以及两类测试文件路径
- 测试替身：临时目录中的项目文件与 Git 可选基线
- 操作：运行只读测试上下文检查两次并比较关键文件内容
- 可观察断言：稳定返回 detected 命令、认证边界和测试分类，且不写入 fixture
- 目标测试：`tests/frontend-test-workflow.test.mjs`
- 测试定位：`[TC-01] 测试上下文只读识别`
- 聚焦命令：`node --test --test-name-pattern="测试上下文只读识别" tests/frontend-test-workflow.test.mjs`
- 关联验证：V-01、V-02
- 结果分类：通过
- 证据：`openspec/changes/add-frontend-test-workflow/verification.md`

### TC-02：三阶段方案合同阻断非法事实和状态

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-04、D-05、D-06、D-10
- 关联验收：A-02、A-03、A-08
- 关联规格：frontend-test-workflow / 规划方案包含非法输入、需求修订晚于方案基线、完成时仍有未验证用例
- 状态矩阵：错误态
- 前置条件：fixture 需求、活动变更和结构化 test-plan.md 已建立
- 测试数据：重复 TC、未知引用、危险路径、生成测试目标、缺失命令、R 基线和完成证据
- 测试替身：临时需求与变更目录
- 操作：分别调用 plan、implement 和 complete 校验
- 可观察断言：合法方案通过，非法输入返回稳定中文诊断且不修改任何文件
- 目标测试：`tests/frontend-test-workflow.test.mjs`
- 测试定位：`[TC-02] 三阶段测试方案校验`
- 聚焦命令：`node --test --test-name-pattern="plan 阶段|implement 阶段|complete 阶段" tests/frontend-test-workflow.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/add-frontend-test-workflow/verification.md`

### TC-03：项目原生测试实现保持专用定位和幂等

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-05、D-07、D-08、D-12、D-14
- 关联验收：A-04、A-05、A-07、A-10
- 关联规格：frontend-test-workflow / 项目没有同功能专用测试、Vue Vitest fixture 完成闭环
- 状态矩阵：用户操作
- 前置条件：已运行 `npm run prepare:test-runtime`，Vitest 只位于 `outputs/frontend-test-runtime/`，根目录不存在验证专用 Vitest，fixture 没有同功能专用测试
- 测试数据：带 TC-03 稳定标题的加法行为测试
- 测试替身：仓库测试创建的隔离 fixture，不注入插件运行时
- 操作：按方案生成一次专用测试，再以同一 TC 重复执行形成与实现步骤
- 可观察断言：只生成一个专用测试和一个 TC 定位，项目原生聚焦命令真实发现并通过该测试
- 目标测试：`tests/frontend-test-workflow.test.mjs`
- 测试定位：`[TC-03] Vue Vitest fixture`
- 聚焦命令：`node --test --test-name-pattern="Vue Vitest fixture" tests/frontend-test-workflow.test.mjs`
- 关联验证：V-02
- 结果分类：通过
- 证据：`openspec/changes/add-frontend-test-workflow/verification.md`

### TC-04：显式测试方案门禁保持历史兼容

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-02、D-06、D-09、D-10
- 关联验收：A-03、A-06、A-08、A-10
- 关联规格：feature-test-file-strategy / 需求修订必须使测试方案失效；verifiable-change-delivery / 显式测试方案必须进入完成门禁
- 状态矩阵：刷新
- 前置条件：分别建立声明和未声明 test_plan 的两个活动变更 fixture
- 测试数据：通过、缺失、过期与未验证方案状态
- 测试替身：内置 OpenSpec fixture 与临时变更目录
- 操作：运行实施检查和完成前检查
- 可观察断言：只对 required 变更运行对应阶段校验，失败不归档，历史变更结果保持不变
- 目标测试：`tests/frontend-test-workflow.test.mjs`
- 测试定位：`[TC-04] 测试方案完成门禁与历史兼容`
- 聚焦命令：`node --test --test-name-pattern="门禁|历史兼容" tests/frontend-test-workflow.test.mjs`
- 关联验证：V-01、V-03、V-05
- 结果分类：通过
- 证据：`openspec/changes/add-frontend-test-workflow/verification.md`

### TC-05：公共 Skill 保持测试写入和视觉交接边界

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-01、D-03、D-07、D-09、D-11、D-13
- 关联验收：A-01、A-04、A-06、A-07、A-09
- 关联规格：frontend-test-workflow / 测试暴露产品缺陷、测试方案包含视觉场景
- 状态矩阵：卸载
- 前置条件：frontend-test Skill、规则、模板与公开清单均已发布
- 测试数据：分析、形成、实现、验证、产品缺陷和视觉场景关键词
- 测试替身：静态 Skill 合同检查
- 操作：核对意图路由、禁止项、结果类别、UI Review 交接和幂等定位文本
- 可观察断言：分析默认只读，实现只改测试，产品缺陷交回变更流程，视觉用例复用既有 UI Review
- 目标测试：`tests/frontend-test-workflow.test.mjs`
- 测试定位：`[TC-05] frontend-test Skill 合同`
- 聚焦命令：`node --test --test-name-pattern="Skill 合同" tests/frontend-test-workflow.test.mjs`
- 关联验证：V-01、V-04
- 结果分类：通过
- 证据：`openspec/changes/add-frontend-test-workflow/verification.md`

### TC-06：统一验证隔离仓库内临时 fixture 的父 Git 状态

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-14
- 关联验收：A-10
- 关联规格：frontend-test-workflow / Vue Vitest fixture 完成闭环
- 状态矩阵：错误态
- 前置条件：验证临时目录位于主仓库被忽略的 `outputs/verify-runtime/tmp`
- 测试数据：未初始化 Git 的 Vue fixture 与父仓库忽略规则
- 测试替身：统一验证注入的系统临时目录和 Git 向上发现边界
- 操作：在统一验证环境中检查 fixture Git 状态并执行项目范围扫描回归
- 可观察断言：fixture 不继承父仓库 Git，源码进入扫描范围，WXML 观察和内容指纹保持有效
- 目标测试：`tests/workflow.test.mjs`
- 测试定位：`[TC-06] 统一验证隔离父 Git`
- 聚焦命令：`node --test --test-name-pattern="统一验证隔离父 Git|范围清单完整记账|WXML 静态观察|项目地图" tests/workflow.test.mjs`
- 关联验证：V-03
- 结果分类：通过
- 证据：`openspec/changes/add-frontend-test-workflow/verification.md`

### TC-07：统一验证跨平台准备并回收 Vitest 运行时

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-14
- 关联验收：A-10
- 关联规格：frontend-test-workflow / Vue Vitest fixture 完成闭环
- 状态矩阵：刷新
- 前置条件：通过 npm 或可解析 npm JS 入口调用统一验证
- 测试数据：Windows 平台命令构造、准备成功、阶段失败与清理回调
- 测试替身：注入的文件存在检查、子进程执行器和运行时生命周期函数
- 操作：解析 Windows npm 调用并分别执行成功与失败的统一验证生命周期
- 可观察断言：不直接启动 `npm.cmd`，准备先于测试，成功和失败都清理，CI 只调用统一验证入口
- 目标测试：`tests/frontend-test-workflow.test.mjs`
- 测试定位：`[TC-07] 跨平台验证运行时`
- 聚焦命令：`node --test --test-name-pattern="跨平台验证运行时|Windows npm" tests/frontend-test-workflow.test.mjs`
- 关联验证：V-03、V-05
- 结果分类：通过
- 证据：`openspec/changes/add-frontend-test-workflow/verification.md`

### TC-08：Windows 结构化错误保持稳定断言

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-14
- 关联验收：A-10
- 关联规格：verifiable-change-delivery / 检查交付就绪
- 状态矩阵：错误态
- 前置条件：错误根 fixture 的 `openspec/config.yaml` 指向未注册 Store
- 测试数据：`no_registered_stores` 错误码与包含 POSIX 或 Windows 分隔符的配置路径
- 测试替身：插件内置 OpenSpec 1.9 运行时与隔离配置目录
- 操作：从错误根运行 `validate --all --json --no-interactive` 并解析结构化诊断
- 可观察断言：命令非零、错误码稳定为 `no_registered_stores`，诊断路径同时兼容 `/` 与 `\\`
- 目标测试：`tests/workflow.test.mjs`
- 测试定位：`OpenSpec 1.9 独立检查归档任务并拒绝错误根批量命令`
- 聚焦命令：`node --test --test-name-pattern="独立检查归档任务" tests/workflow.test.mjs`
- 关联验证：V-03、V-05
- 结果分类：通过
- 证据：`openspec/changes/add-frontend-test-workflow/verification.md`
