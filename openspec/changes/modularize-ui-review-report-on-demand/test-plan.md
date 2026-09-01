# 测试方案：按需拆分 UI 验收报告脚本

## 基本信息

- 状态：已实现
- 需求：`requirements/REQ-2026-038-on-demand-ui-review-report-modularization.md`
- 变更：modularize-ui-review-report-on-demand
- 需求修订基线：R-03
- 默认聚焦命令：`node --test tests/ui-review-report-modularization.test.mjs`

## 测试上下文

- 测试命令状态：detected
- 测试命令：`npm run test`
- 测试运行器：Vitest（项目原生测试链）
- 测试目录：`tests`
- Git 基线：available
- 兼容说明：专用 Node.js 测试使用仓库既有 `node:test` 与断言风格；Vue 3 + Vite + Vitest fixture 仅作为项目原生测试链的证据，不将本轮报告模块描述为独立框架认证。路径门禁同时在 macOS/Linux 宿主模拟 POSIX、`D:/` 与 `D:\\` 输入；Markdown 门禁仅扫描活动资料并跳过代码示例、有效链接和归档历史。

## 测试用例

### TC-01：兼容门面的输入与报告渲染

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-02、D-03、D-04、D-06
- 关联验收：A-01、A-02
- 关联规格：ui-review-report / 纯内部模块化兼容门面
- 状态矩阵：初始（已有数据）、空态
- 前置条件：存在有效 PNG 尺寸样本与审核输入 fixture。
- 测试数据：有问题、无问题与确定性验收三类审核输入。
- 测试替身：不适用。
- 操作：从原 `ui-review-report.mjs` 导入既有公开函数，规范化输入并渲染两类 Markdown。
- 可观察断言：全部既有导出可用且保持同步；输入规范化、问题合并、无问题结论、确定性报告字段和 Markdown 转义与拆分前合同一致；兼容门面不超过 180 行。
- 目标测试：`tests/ui-review-report-modularization.test.mjs`
- 测试定位：`[TC-01] 兼容门面的输入与报告渲染`
- 聚焦命令：`node --test tests/ui-review-report-modularization.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/modularize-ui-review-report-on-demand/evidence/V-01.json`

### TC-02：受控产物、失败清理与路径边界

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-02、D-03、D-05、D-06
- 关联验收：A-03、A-04
- 关联规格：ui-review-report / 受控标注产物与跨平台安全边界
- 状态矩阵：用户操作、刷新、错误态
- 前置条件：存在受控输出根、FFmpeg 可替身执行器与可失败的图片产物样本。
- 测试数据：既有输出目录、无问题审核、FFmpeg 失败、POSIX 路径和 `D:\\workspace` Windows 路径样本。
- 测试替身：受控 FFmpeg 执行器或等价的 Node.js 子进程 fixture；不启用 shell。
- 操作：生成、重复生成并故意失败生成标注产物，随后检查输出和暂存目录。
- 可观察断言：输出只位于受控目录；成功时原子替换，失败时恢复既有结果并清理本次暂存目录；FFmpeg 使用命令与参数数组；Windows/POSIX 样本双侧规范化且稳定诊断不依赖绝对路径全文。
- 目标测试：`tests/ui-review-report-modularization.test.mjs`
- 测试定位：`[TC-02] 受控产物、失败清理与路径边界`
- 聚焦命令：`node --test tests/ui-review-report-modularization.test.mjs`
- 关联验证：V-02
- 结果分类：通过
- 证据：`openspec/changes/modularize-ui-review-report-on-demand/evidence/V-02.json`

### TC-03：相邻调用方与共享验证链

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-03、D-04、D-05、D-06、D-07、D-08
- 关联验收：A-02、A-04、A-05、A-06
- 关联规格：ui-review-report / 模块边界与共享插件链
- 状态矩阵：初始（已有数据）、用户操作、错误态、卸载
- 前置条件：专用报告模块化测试已建立，UI Review 自动化和证据完整性测试可由项目测试链发现。
- 测试数据：真实 `ui-review-runner.mjs`、`playwright-adapter-runner.mjs` 导入路径、仓库体积预算及 UI Review 长期维护规则。
- 测试替身：沿用相邻测试的项目 fixture；不新增运行时依赖。
- 操作：运行专用测试、UI Review 相邻回归、体积门禁及共享统一验证。
- 可观察断言：相邻调用方继续从兼容入口导入；所有报告模块低于相应行数预算、无循环导入和新增依赖；长期规则明确数据解析、业务判断与输出报告的路由，且不允许机械拆分或吞没异常、路径、清理、CLI 与公开 API 兼容边界；共享验证链成功且发现 `[TC-03]` 定位。
- 目标测试：`tests/ui-review-report-modularization.test.mjs`
- 测试定位：`[TC-03] 相邻调用方与共享验证链`
- 聚焦命令：`node --test tests/ui-review-report-modularization.test.mjs`
- 关联验证：V-03
- 结果分类：通过
- 证据：`openspec/changes/modularize-ui-review-report-on-demand/evidence/V-03.json`

### TC-04：同一提交的五平台 CI 人工复核

- 状态：计划
- 优先级：P1
- 验证类型：人工
- 测试层级：人工
- 关联决策：D-05、D-07
- 关联验收：A-05
- 关联规格：ui-review-report / 跨平台共享插件链
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态、卸载
- 前置条件：本轮精确提交已推送，并已触发仓库真实五平台 CI 矩阵。
- 测试数据：提交 SHA、共享校验与 darwin-arm64、darwin-x64、linux-x64、linux-arm64、win32-x64 平台任务。
- 测试替身：不适用。
- 操作：人工查看矩阵任务状态、平台报告与失败时的稳定诊断。
- 可观察断言：共享校验与五个平台任务均成功；任一平台未成功时不把跨平台交付标记为通过。
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-04
- 结果分类：未执行
- 证据：`openspec/changes/modularize-ui-review-report-on-demand/verification.md`

### TC-05：测试方案拒绝跨平台绝对路径

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-05、D-09
- 关联验收：A-04、A-07
- 关联规格：ui-review-report / 跨平台提交前路径门禁
- 状态矩阵：错误态
- 前置条件：存在独立测试方案 fixture。
- 测试数据：POSIX `/workspace/test.mjs`、Git 风格 `D:/workspace/test.mjs`、Node 风格 `D:\\workspace\\test.mjs` 及合法项目相对路径。
- 测试替身：不适用。
- 操作：分别将路径填入测试方案的目标测试字段并执行校验。
- 可观察断言：三个绝对路径均被稳定拒绝，合法相对路径继续通过；判断不依赖当前宿主系统。
- 目标测试：`tests/frontend-test-workflow.test.mjs`
- 测试定位：`[TC-05] 测试方案拒绝跨平台绝对路径`
- 聚焦命令：`node --test tests/frontend-test-workflow.test.mjs`
- 关联验证：V-05
- 结果分类：通过
- 证据：`openspec/changes/modularize-ui-review-report-on-demand/evidence/V-05.json`

### TC-06：需求交付基线拒绝外平台路径并识别暂存新文件

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-09
- 关联验收：A-07
- 关联规格：ui-review-report / 交付基线门禁
- 状态矩阵：错误态
- 前置条件：存在 Git fixture、已跟踪基线测试和暂存的新建测试。
- 测试数据：POSIX、两种 Windows 绝对路径、`HEAD` 已跟踪文件和仅暂存文件。
- 测试替身：独立 Git fixture。
- 操作：运行需求交付校验。
- 可观察断言：外平台绝对路径被拒绝；只有 `HEAD` 已存在的文件才视为复用，本轮暂存的新文件仍可按“新建”执行。
- 目标测试：`tests/workflow-requirements.test.mjs`
- 测试定位：`[TC-06] 需求交付基线拒绝外平台路径并识别暂存新文件`
- 聚焦命令：`node --test tests/workflow-requirements.test.mjs`
- 关联验证：V-06
- 结果分类：通过
- 证据：`openspec/changes/modularize-ui-review-report-on-demand/evidence/V-06.json`

### TC-07：活动 Markdown 禁止裸 D/A 引用标签

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-09
- 关联验收：A-07
- 关联规格：ui-review-report / Markdown 提交前门禁
- 状态矩阵：错误态
- 前置条件：存在活动 Markdown、模板、代码示例、有效链接和归档路径样本。
- 测试数据：裸 `[D-01]`、裸 `[A-01]`、反引号代码、有效链接及归档历史样本。
- 测试替身：不适用。
- 操作：运行结构校验的 Markdown 门禁。
- 可观察断言：仅活动文件中的裸 D/A 标签失败并给出稳定代码、目标和行号；普通编号、代码示例、有效链接与归档路径不产生错误。
- 目标测试：`tests/workflow-context.test.mjs`
- 测试定位：`[TC-07] 活动 Markdown 禁止裸 D/A 引用标签`
- 聚焦命令：`node --test tests/workflow-context.test.mjs`
- 关联验证：V-07
- 结果分类：通过
- 证据：`openspec/changes/modularize-ui-review-report-on-demand/evidence/V-07.json`
