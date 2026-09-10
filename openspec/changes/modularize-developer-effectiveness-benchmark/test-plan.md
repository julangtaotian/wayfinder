# 测试方案：开发者效果基准模块化与最小静态检查

## 基本信息

- 状态：已实现
- 需求：`requirements/REQ-2026-047-developer-effectiveness-benchmark-maintainability.md`
- 变更：modularize-developer-effectiveness-benchmark
- 需求修订基线：R-01
- 默认聚焦命令：`node --test tests/developer-effectiveness-benchmark.test.mjs tests/static-check.test.mjs`

## 测试上下文

- 测试命令状态：detected
- 测试命令：`npm run test`
- 测试运行器：Node.js `node:test`，统一入口准备固定 Vitest 运行时
- 测试目录：`tests`
- Git 基线：available；提交 `82eb4e9e58cc450507c4b920730af24ab27da8af`
- 兼容说明：基准测试文件是同一功能的既有手写专用测试；静态检查是独立仓库职责，因此新建专用测试。Windows 路径在本机通过显式样本验证，真实五平台结果单独记录。

## 测试用例

### TC-01：两个基准入口兼容模块化

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-01、D-02、D-03
- 关联验收：A-01、A-02
- 关联规格：不适用；D-01 授权纯内部重构与 `skip_specs: true`
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态
- 前置条件：既有基准 TC-01～TC-08 和两份兼容入口可读取。
- 测试数据：安全预览、冻结用例、执行路线、成功/失败/恢复和输出 fixture。
- 测试替身：沿用既有 Codex 与子进程注入执行器。
- 操作：从原路径导入既有公开函数，执行完整基准专用测试并检查模块依赖与行数。
- 可观察断言：既有行为测试全部通过；原导出路径、字段和错误语义不变；主入口、execution、foundation、cases、contract 分别不超过计划上限且无回向循环导入。
- 目标测试：`tests/developer-effectiveness-benchmark.test.mjs`
- 测试定位：`[TC-01] 基准兼容入口保持单向模块边界`
- 聚焦命令：`node --test tests/developer-effectiveness-benchmark.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/modularize-developer-effectiveness-benchmark/evidence/V-01.json`

### TC-02：最小静态检查范围与诊断

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-04、D-06
- 关联验收：A-03
- 关联规格：不适用；仓库开发门禁不改变插件规格行为
- 状态矩阵：用户操作、刷新、空态、错误态
- 前置条件：可在 `outputs/` 下创建并清理独立检查 fixture。
- 测试数据：合法文件、语法错误文件、空目录、排除目录、带空格和非 ASCII 名称，以及 Windows/POSIX 相对目标样本。
- 测试替身：可注入 `spawnSync` 记录 Node 入口、参数数组与 shell 选项；真实语法错误使用当前 Node 执行。
- 操作：发现文件并分别执行成功、零发现和失败检查。
- 可观察断言：只扫描固定目录和扩展名并确定性排序；每个文件恰好检查一次；使用 `process.execPath`、参数数组和 `shell: false`；失败返回稳定 code、真实 status、正斜杠相对 target，诊断不含绝对根。
- 目标测试：`tests/static-check.test.mjs`
- 测试定位：`[TC-02] 最小静态检查保持固定范围与稳定诊断`
- 聚焦命令：`node --test tests/static-check.test.mjs`
- 关联验证：V-02
- 结果分类：通过
- 证据：`openspec/changes/modularize-developer-effectiveness-benchmark/evidence/V-02.json`

### TC-03：统一验证集成与失败停止

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-05、D-06
- 关联验收：A-04
- 关联规格：不适用；仓库验证编排不改变插件业务规格
- 状态矩阵：用户操作、错误态
- 前置条件：统一验证步骤可注入执行器，静态脚本和 package script 已存在。
- 测试数据：静态步骤成功与非零失败结果。
- 测试替身：统一验证步骤执行器，不运行外部网络或真实平台任务。
- 操作：检查步骤顺序，并模拟 static 失败。
- 可观察断言：static 位于 footprint 之前；失败时 `failedStep=static`、后续步骤未执行；package script 指向同一静态入口。
- 目标测试：`tests/static-check.test.mjs`
- 测试定位：`[TC-03] 静态检查进入统一验证并在失败时停止`
- 聚焦命令：`node --test tests/static-check.test.mjs`
- 关联验证：V-03
- 结果分类：通过
- 证据：`openspec/changes/modularize-developer-effectiveness-benchmark/evidence/V-03.json`

### TC-04：五平台 CI 外部证据分层

- 状态：计划
- 优先级：P1
- 验证类型：人工
- 测试层级：人工
- 关联决策：D-05、D-06
- 关联验收：A-04
- 关联规格：不适用；本轮不修改规格行为
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态、卸载
- 前置条件：聚焦与本地完整门禁通过并形成最终提交。
- 测试数据：最终提交 SHA、共享任务与 darwin-arm64、darwin-x64、linux-x64、linux-arm64、win32-x64 平台任务。
- 测试替身：不适用。
- 操作：人工复核最终提交对应的 GitHub Actions 运行和全部矩阵任务状态。
- 可观察断言：外部 CI 未运行前 V-04 保持计划；只有同一提交的共享任务和五个平台全部成功后才可改为通过，本机结果不替代该结论。
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-04
- 结果分类：未执行
- 证据：待最终提交后写入 `openspec/changes/modularize-developer-effectiveness-benchmark/verification.md`
