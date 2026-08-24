# 测试方案：动态框架与第三方依赖上下文

## 基本信息

- 状态：已验证
- 需求：`requirements/REQ-2026-029-dynamic-dependency-context.md`
- 变更：2026-08-24-add-dynamic-dependency-context
- 需求修订基线：R-01
- 默认聚焦命令：`node --test tests/dynamic-dependency-context.test.mjs`

## 测试上下文

- 测试命令状态：detected
- 测试命令：`npm test`
- 测试运行器：Node Test Runner
- 测试目录：`tests`
- Git 基线：available；基线提交 `531031cd49a8e2bd3de65cabf9d5e10611f74732`，专用目标测试在规划时不存在且未被 Git 跟踪
- 兼容说明：只使用仓库现有 Node.js 标准库与 Node Test Runner；确定性断言覆盖稳定字段、顺序和无平台路径输出，真实平台结论仍由最终提交五平台 CI 矩阵证明。

## 测试用例

### TC-01：动态直接依赖事实合同覆盖完整性、异常与稳定性

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-01、D-02、D-03、D-07、D-08、D-09、D-10、D-11、D-12
- 关联验收：A-01、A-05、A-06
- 关联规格：dynamic-dependency-context / 系统必须动态收集完整直接依赖事实；空值和非法依赖声明必须可审计；人类摘要不得损失完整机器事实；依赖采集必须保持只读和有界
- 状态矩阵：初始（已有数据）、刷新、空态、错误态
- 前置条件：隔离根 package fixture 可声明四类依赖、workspace、子包、lockfile 和 `node_modules` 哨兵，但不安装或执行任何依赖
- 测试数据：Angular、Svelte、Astro、作用域私有包、普通包、跨分组不同版本、空分组、显式非法分组、危险包名、空白/非字符串版本和超过 20 项的乱序依赖
- 测试替身：只使用隔离文件系统和真实 JSON 读取；不替换被测依赖收集与摘要逻辑，不访问网络、registry 或包管理器
- 操作：重复收集相同 package，分别改变分组、版本、对象插入顺序、workspace 子包和 `node_modules` 内容，并比较完整画像与摘要计数
- 可观察断言：全部合法直接依赖及跨分组声明可追溯；非法项返回稳定 code/status/target 并排除；空项目为真实零值；完整清单不截断；摘要遗漏数准确；重复结果稳定且不含绝对路径
- 目标测试：`tests/dynamic-dependency-context.test.mjs`
- 测试定位：`[TC-01] 动态直接依赖事实合同`
- 聚焦命令：`node --test --test-name-pattern="动态直接依赖事实合同" tests/dynamic-dependency-context.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-08-24-add-dynamic-dependency-context/evidence/V-01.json`

### TC-02：共享上下文动态消费且有限兼容信号不越界

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：端到端
- 关联决策：D-03、D-04、D-05、D-06、D-08、D-09、D-11、D-12
- 关联验收：A-02、A-03、A-04、A-05
- 关联规格：dynamic-dependency-context / 共享工作流入口必须消费同一依赖画像；deep-project-analysis / 全量记账的 AI 项目地图；wayfinder-workspace / 三个工作流文件必须同步受管项目事实；project-target-profile / 终端画像保持轻量兼容边界
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态
- 前置条件：未知框架 fixture 和 Vue/React/微信原生/跨端兼容 fixture 可执行 inspect、bootstrap、update 与 check，受管文件含标记外自定义内容
- 测试数据：未预置框架与私有包、超过摘要上限的依赖、依赖变更、unknown/mixed/conflict 画像、普通受管文件和未受管冲突文件
- 测试替身：仓库现有初始化、升级和检查入口；不模拟安装、构建、运行时使用或远程依赖说明
- 操作：执行默认预览、显式写入、重复执行、修改依赖后的检查和升级，并核对三份模板与机器画像
- 可观察断言：三份上下文总数/展示/遗漏一致且提示读取完整事实；未知包不被省略；画像字段保持兼容且被标为有限信号；预览零写入；升级只更新受管区块并保留自定义内容
- 目标测试：`tests/dynamic-dependency-context.test.mjs`
- 测试定位：`[TC-02] 共享上下文与有限兼容信号`
- 聚焦命令：`node --test --test-name-pattern="共享上下文与有限兼容信号" tests/dynamic-dependency-context.test.mjs`
- 关联验证：V-02
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-08-24-add-dynamic-dependency-context/evidence/V-02.json`

### TC-03：动态依赖上下文统一验证合同保持发布链稳定

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：端到端
- 关联决策：D-06、D-08、D-09、D-10、D-11、D-12
- 关联验收：A-04、A-05、A-06
- 关联规格：dynamic-dependency-context / 依赖采集必须保持只读和有界；project-target-profile / 终端画像保持轻量兼容边界；wayfinder-workspace / 三个工作流文件必须同步受管项目事实
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态、卸载
- 前置条件：TC-01 和 TC-02 已实现，仓库统一验证、官方 validators、插件安装结构及现有受支持项目矩阵可用
- 测试数据：完整仓库测试、结构校验、AI 标记禁入、运行时完整性、Vue/React/小程序 fixture 和 dependencyProfile 稳定字段
- 测试替身：仓库既有 fixtures 与校验脚本；真实五平台 Runner 不在本地模拟为通过
- 操作：执行统一验证链，检查专用定位、旧画像兼容、模板完整性、生产依赖边界和跨平台结构化断言
- 可观察断言：本地统一验证全部成功；没有新增生产依赖、registry、安装、依赖执行或 workspace 递归入口；机器断言不依赖绝对路径、换行或完整中文文案；本地结果不替代外部矩阵
- 目标测试：`tests/dynamic-dependency-context.test.mjs`
- 测试定位：`[TC-03] 动态依赖上下文统一验证合同`
- 聚焦命令：`npm run verify`
- 关联验证：V-03
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-08-24-add-dynamic-dependency-context/evidence/V-03.json`

### TC-04：人工复核依赖事实、兼容信号和 AI 结论边界

- 状态：人工通过
- 优先级：P1
- 验证类型：人工
- 测试层级：人工
- 关联决策：D-01、D-04、D-05、D-06、D-09、D-12
- 关联验收：A-03、A-04、A-06
- 关联规格：dynamic-dependency-context / 人类摘要不得损失完整机器事实；deep-project-analysis / 全量记账的 AI 项目地图；project-target-profile / 终端画像保持轻量兼容边界
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态
- 前置条件：需求、delta specs、三份模板、分析规则和实际初始化输出均已完成并保存到当前变更验证记录
- 测试数据：未知框架、空依赖、摘要截断、unknown/mixed/conflict 画像、已声明但无源码使用证据的依赖和本轮明确排除范围
- 测试替身：不适用；由维护者在 macOS 本地读取实际规划、模板、机器输出和验证记录
- 操作：逐项对照 D-01/D-05/D-06/D-12、机器清单、模板文案和交付结论，检查事实、推断、待确认与未覆盖边界
- 可观察断言：声明只证明根 package 事实；画像只表示有限兼容信号；未知或截断不被写成不存在；结论不宣称已安装、已使用、无漏洞、传递依赖完整、Monorepo 支持或完整兼容
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-04
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-08-24-add-dynamic-dependency-context/verification.md`

### TC-05：人工复核最终实现提交真实五平台矩阵

- 状态：人工通过
- 优先级：P0
- 验证类型：人工
- 测试层级：人工
- 关联决策：D-10、D-12
- 关联验收：A-06
- 关联规格：dynamic-dependency-context / 系统必须动态收集完整直接依赖事实；依赖采集必须保持只读和有界
- 状态矩阵：用户操作、刷新、错误态
- 前置条件：最终实现已通过 WebStorm 提交并推送，GitHub Actions 对该精确提交产生五个平台任务
- 测试数据：精确提交 SHA、运行 URL、Linux x64/ARM64、Windows x64、macOS Intel/ARM64 任务名称、尝试次数和最终状态
- 测试替身：不适用；只复核真实 GitHub Actions Runner，不用本地模拟或自声明字段替代
- 操作：逐项核对最终提交 SHA、五平台任务、失败历史与状态；失败时先记录平台、失败步骤、稳定错误字段、根因和新增回归定位
- 可观察断言：五个平台在同一精确提交上全部成功才把 V-05 记为人工通过；任一缺失、取消或失败均保持未完成
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-05
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-08-24-add-dynamic-dependency-context/verification.md`
