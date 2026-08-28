# 测试方案：CI 验证成本分层与在途任务治理

## 基本信息

- 状态：已实现
- 需求：`requirements/REQ-2026-034-ci-validation-cost-control.md`
- 变更：reduce-ci-validation-cost
- 需求修订基线：R-02
- 默认聚焦命令：`node --test tests/workflow-project.test.mjs tests/ui-review-platform-runtime.test.mjs`

## 测试上下文

- 测试命令状态：detected
- 测试命令：`npm test`
- 测试运行器：Node Test Runner
- 测试目录：`tests`
- Git 基线：available；`tests/workflow-project.test.mjs` 与 `tests/ui-review-platform-runtime.test.mjs` 均已受跟踪，前者直接覆盖统一验证阶段、临时运行时和 CI 调用合同，后者直接覆盖五平台、目标 LFS、环境变量、浏览器和打包。
- 测试文件策略：复用上述两个同功能手写专用测试；不修改 `.generated.spec.` 文件，不新建重复 CI 测试文件。
- 兼容说明：只使用 Node.js 标准库；根 `npm run verify` 保持完整九阶段；新增作用域使用当前 Node 入口且 `shell: false`；工作流继续 Node.js 20.19.0、只读权限、五个平台和原报告路径。
- 跨平台高风险：是；命中 CI、路径、临时目录、子进程、包管理器入口、环境变量和机器可读诊断，影响 macOS ARM64/x64、Linux ARM64/x64、Windows x64。确定性测试优先断言 scope/code/status/target 和任务关系，外平台路径显式使用目标路径语义，真实矩阵只接受同一精确 SHA。
- 状态矩阵覆盖：初始、用户操作、刷新、空态、错误态由 TC-01～TC-08 覆盖；卸载不适用，因为验证和 CI job 均为一次性进程，没有订阅、计时器或组件销毁生命周期。

## 测试用例

### TC-01：完整、共享与平台测试集合确定性分区

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-02、D-03、D-07
- 关联验收：A-01、A-02、A-03
- 关联规格：`仓库必须提供统一完整验证入口`
- 状态矩阵：初始（已有数据）、用户操作、空态、错误态
- 前置条件：仓库已有完整测试集合和唯一平台专属测试分组
- 测试数据：当前 21 个测试文件、UI 自动化与平台运行时两个非空平台文件、共享集合、未知分组、平台文件缺失和新增普通测试样本
- 测试替身：在 `outputs/ci-validation-cost/test-fixtures/` 建立有界测试目录，不读取真实外部 runner
- 操作：调用测试发现与分组 API，分别构建 all、shared、platform 集合
- 可观察断言：三个集合非空；平台是完整集合子集；共享与平台互斥；二者并集等于完整集合；新增普通测试自动进入共享；未知或零测试返回稳定 code 和非零状态
- 目标测试：`tests/workflow-project.test.mjs`
- 测试定位：`[TC-01] 验证作用域测试集合完整分区`
- 聚焦命令：`node --test --test-name-pattern="TC-01" tests/workflow-project.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/reduce-ci-validation-cost/evidence/V-01.json`

### TC-02：统一验证作用域、失败短路与临时运行时生命周期

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-03、D-07、D-08
- 关联验收：A-01、A-02、A-03
- 关联规格：`仓库必须提供统一完整验证入口`
- 状态矩阵：用户操作、刷新、空态、错误态
- 前置条件：可注入阶段执行、准备、清理、环境变量和报告服务
- 测试数据：all 九阶段、shared 七阶段、platform 三阶段、共享 OpenSpec 失败、平台冒烟失败、未知/缺失作用域和嵌套临时根
- 测试替身：注入确定性阶段结果，不启动真实浏览器或安装依赖
- 操作：分别执行三个作用域、重复执行、注入阶段失败并调用 CLI 参数解析
- 可观察断言：默认 all 顺序保持；scope 写入结果；失败后不执行后续阶段；真实退出码保留；all/shared 准备 Vitest、platform 不准备；三个作用域均在成功/失败后清理自己的 `outputs/verify-runtime`；无效参数失败关闭
- 目标测试：`tests/workflow-project.test.mjs`
- 测试定位：`[TC-02] 统一验证作用域与生命周期`
- 聚焦命令：`node --test --test-name-pattern="TC-02" tests/workflow-project.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/reduce-ci-validation-cost/evidence/V-01.json`

### TC-03：共享任务单次执行并阻断失败运行

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-02、D-03、D-05、D-06
- 关联验收：A-02、A-06
- 关联规格：`持续集成必须复用统一入口`
- 状态矩阵：初始（已有数据）、用户操作、错误态
- 前置条件：Validate 工作流与根 package scripts 可读
- 测试数据：shared job id、ubuntu-24.04、Node.js 20.19.0、`verify:shared`、兜底清理、platform `needs`
- 测试替身：静态读取工作流，不请求 GitHub API
- 操作：解析稳定 job、依赖和 run 字段并统计共享脚本出现次数
- 可观察断言：每次 workflow 只有一个共享 job；共享脚本只出现一次；共享 job 不拉取平台 LFS；平台 job 显式依赖 shared；共享失败时由 job 依赖阻止矩阵开始
- 目标测试：`tests/ui-review-platform-runtime.test.mjs`
- 测试定位：`[TC-03] CI 共享验证前置门禁`
- 聚焦命令：`node --test --test-name-pattern="TC-03" tests/ui-review-platform-runtime.test.mjs`
- 关联验证：V-02
- 结果分类：通过
- 证据：`openspec/changes/reduce-ci-validation-cost/evidence/V-02.json`

### TC-04：五平台专属验证、打包与报告保持完整

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-02、D-05、D-07、D-08
- 关联验收：A-03、A-05、A-06
- 关联规格：`持续集成必须复用统一入口`
- 状态矩阵：初始（已有数据）、用户操作、错误态
- 前置条件：现有平台矩阵、Playwright 元数据和平台打包入口
- 测试数据：darwin-arm64、darwin-x64、linux-x64、linux-arm64、win32-x64，目标 LFS include、UI_REVIEW_EXPECT_PLATFORM、报告名称/路径
- 测试替身：工作流静态合同与现有运行时 fixture；聚焦阶段不启动五台外部 runner
- 操作：解析矩阵并验证每个平台的平台作用域、目标资产、打包命令和报告上传配置
- 可观察断言：五个平台无删减；矩阵 `fail-fast: false`；每个平台只运行一次 `verify:platform`；LFS 双引号参数边界、环境变量、打包目标、upload-artifact v7 和报告路径保持一致
- 目标测试：`tests/ui-review-platform-runtime.test.mjs`
- 测试定位：`[TC-04] CI 五平台专属验证与产物合同`
- 聚焦命令：`node --test --test-name-pattern="TC-04" tests/ui-review-platform-runtime.test.mjs`
- 关联验证：V-02
- 结果分类：通过
- 证据：`openspec/changes/reduce-ci-validation-cost/evidence/V-02.json`

### TC-05：同一引用取消旧运行且触发边界不扩张

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：端到端
- 关联决策：D-04、D-05
- 关联验收：A-04、A-06
- 关联规格：`持续集成必须取消同一引用的过时运行`
- 状态矩阵：刷新、错误态
- 前置条件：工作流声明 concurrency；实现阶段可在同一分支连续推送更新提交
- 测试数据：`${{ github.workflow }}-${{ github.ref }}`、cancel-in-progress、push、pull_request、contents read、无 schedule/cache/paths-ignore
- 测试替身：自动部分静态读取工作流；人工部分使用真实 Actions 运行状态
- 操作：自动校验并发与触发字段；外部验证时观察同引用旧运行和最终提交运行
- 可观察断言：同引用旧等待/在途运行取消；不同引用不被静态归一化；push/PR 和只读权限保留；没有 schedule、缓存、路径忽略或新增权限；被取消运行不计为最终证据
- 目标测试：`tests/ui-review-platform-runtime.test.mjs`
- 测试定位：`[TC-05] CI 同引用在途运行治理`
- 聚焦命令：`node --test --test-name-pattern="TC-05" tests/ui-review-platform-runtime.test.mjs`
- 关联验证：V-02、V-05
- 结果分类：通过
- 证据：`openspec/changes/reduce-ci-validation-cost/evidence/V-02.json`、`openspec/changes/reduce-ci-validation-cost/verification.md`

### TC-06：本地共享发布链保持完整

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：端到端
- 关联决策：D-03、D-05、D-07、D-08
- 关联验收：A-01、A-05、A-06
- 关联规格：`仓库必须提供统一完整验证入口`、`持续集成必须复用统一入口`
- 状态矩阵：初始（已有数据）、用户操作、错误态
- 前置条件：TC-01～TC-05 聚焦自动部分通过
- 测试数据：全仓测试、OpenSpec、插件/技能结构、运行时完整性、当前平台浏览器冒烟和工作区状态
- 测试替身：无；执行真实本地门禁，验证专用运行时和 fixture 位于 `outputs/`
- 操作：运行 `npm test`、`npm run validate`、`npm run verify` 与官方 Skill/Plugin validators
- 可观察断言：完整九阶段和全部门禁通过；根无验证专用 `node_modules`；本次临时目录已清理；没有新增依赖、缓存、定时任务或路径忽略
- 目标测试：`tests/workflow-project.test.mjs`
- 测试定位：`[TC-02] 统一验证作用域与生命周期`
- 聚焦命令：不适用；本用例为发布级全量验证
- 关联验证：V-03
- 结果分类：通过
- 证据：`openspec/changes/reduce-ci-validation-cost/evidence/V-03.json`

### TC-07：Vue 3 + Vite 真实 fixture 工作流兼容

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：端到端
- 关联决策：D-08
- 关联验收：A-05
- 关联规格：`仓库必须提供统一完整验证入口`
- 状态矩阵：初始（已有数据）、用户操作、刷新、错误态
- 前置条件：仓库固定 Vue 3 + Vite + Vitest fixture 与 `outputs/frontend-test-runtime/` 已按规则准备
- 测试数据：未初始化、已初始化、重复初始化、旧受管段升级和健康检查
- 测试替身：使用仓库内真实 fixture，不安装根依赖，不连接外部项目
- 操作：验证初始化预览/写入、重复执行、升级和检查
- 可观察断言：行为幂等、只替换受管段、不覆盖业务内容、测试命令真实成功，CI 作用域调整未破坏前端工作流能力
- 目标测试：`tests/frontend-test-workflow.test.mjs`
- 测试定位：`[TC-03] Vue Vitest fixture 真实发现 TC，零测试失败且重复执行不改文件`
- 聚焦命令：`node --test tests/frontend-test-workflow.test.mjs tests/workflow-project.test.mjs`
- 关联验证：V-04
- 结果分类：通过
- 证据：`openspec/changes/reduce-ci-validation-cost/evidence/V-04.json`

### TC-08：最终精确提交的共享与五平台外部证据

- 状态：计划
- 优先级：P0
- 验证类型：人工
- 测试层级：端到端
- 关联决策：D-04、D-06、D-08
- 关联验收：A-03、A-04、A-05、A-06
- 关联规格：`持续集成必须复用统一入口`、`持续集成必须取消同一引用的过时运行`
- 状态矩阵：用户操作、刷新、错误态
- 前置条件：实现提交使用 WebStorm 推送并触发 Validate；本地 V-01～V-04 已通过
- 测试数据：精确提交 SHA、Actions URL、shared 与五个平台 job 状态和可见耗时、旧同引用运行状态
- 测试替身：不适用；本地模拟不能替代真实 GitHub Actions
- 操作：复核同一运行中的共享任务、macOS ARM64/x64、Linux ARM64/x64、Windows x64 及旧在途运行
- 可观察断言：最终 SHA 的六项任务全部成功；任一平台失败时记录平台、步骤、稳定字段、根因、本地遗漏、回归定位和复跑 URL；旧同引用运行按规则取消；只报告实际次数与耗时，不推算具体金额
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-05
- 结果分类：未执行
- 证据：`openspec/changes/reduce-ci-validation-cost/verification.md`

## 执行记录

| 用例 | 命令或方式 | 结果 | 证据 |
| --- | --- | --- | --- |
| TC-01～TC-05 | 两个现有手写测试文件的聚焦 Node 回归 | 通过 | V-01、V-02；5 个用例全部通过 |
| TC-06 | `npm test`、`npm run validate`、完整九阶段统一验证与 9 个 Skill/1 个 Plugin 官方 validator | 通过 | V-03；177 个测试中 174 个通过、3 个按环境约定跳过，零失败 |
| TC-07 | Vue 3 + Vite fixture 初始化、重复、升级、检查与真实 Vitest | 通过 | V-04；共享验证 127 个测试中 124 个通过、3 个按环境约定跳过，零失败 |
| TC-08 | 计划：WebStorm 推送后的同一 SHA 共享+五平台 Actions 复核 | 计划 | V-05、`verification.md` |
