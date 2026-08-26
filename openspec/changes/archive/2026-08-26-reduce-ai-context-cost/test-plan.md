# 测试方案：AI 上下文与仓库研发效率优化

## 基本信息

- 状态：已验证
- 需求：`requirements/REQ-2026-031-ai-context-and-repository-efficiency.md`
- 变更：2026-08-26-reduce-ai-context-cost
- 需求修订基线：R-01
- 默认聚焦命令：`node --test tests/ai-context-efficiency.test.mjs tests/cli-argument-safety.test.mjs`

## 测试上下文

- 测试命令状态：detected
- 测试命令：`npm test`
- 测试运行器：Node Test Runner
- 测试目录：`tests`
- Git 基线：available；`tests/ai-context-efficiency.test.mjs` 在规划时不存在，CLI 安全测试已受跟踪。
- 兼容说明：只新增显式 CLI 模式，无参数完整 JSON 与 `checkProject()` 保持不变；测试仅使用 Node.js 标准库和仓库内受控数据，不读取或修改业务项目。跨平台机器断言使用稳定字段与退出状态，不依赖完整中文文案或当前平台路径样式。
- 跨平台高风险：是；命中机器可读诊断与 CLI 参数。确定性测试断言 JSON 稳定字段和退出状态，真实五平台仍由最终提交 CI 证明。

## 测试用例

### TC-01：精简输出保留必要事实并限制可恢复长数组

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-02、D-03、D-09、D-11
- 关联验收：A-02、A-06
- 关联规格：ai-context-efficiency / 健康检查必须提供有界精简结果
- 状态矩阵：初始（已有数据）、刷新、空态
- 前置条件：构造的完整检查结果同时包含直接依赖画像、多个历史诊断和超过样例上限的静态观察
- 测试数据：2 个依赖、3 个历史诊断、8 个静态观察，以及无显式输出模式的兼容调用
- 测试替身：使用内存中的确定性完整结果；不读取项目文件、不执行外部命令
- 操作：分别调用 `summarizeProjectCheck()` 和无模式 `formatProjectCheckOutput()`，比较精简结果、完整输入快照和兼容返回值
- 可观察断言：完整依赖画像保持不变；历史 diagnostics 不进入 summary；观察返回 total、codeCounts、最多 5 项样例和准确 omitted；输入对象不被修改；无模式返回原完整结果
- 目标测试：`tests/ai-context-efficiency.test.mjs`
- 测试定位：`[TC-01] 精简检查输出保留必要事实并限制可恢复长数组`
- 聚焦命令：`node --test --test-name-pattern="精简检查输出保留必要事实并限制可恢复长数组" tests/ai-context-efficiency.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`tests/ai-context-efficiency.test.mjs`

### TC-02：按 code 查询只返回目标诊断

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-04、D-09、D-11
- 关联验收：A-03、A-06
- 关联规格：ai-context-efficiency / 历史诊断必须支持按稳定 code 查询
- 状态矩阵：用户操作、刷新、空态
- 前置条件：完整检查结果包含两个诊断 code，其中目标 code 有多条记录
- 测试数据：目标 code 两项、另一 code 一项、每页一项和未知 code 查询
- 测试替身：使用内存中的确定性诊断数组；不读取真实历史需求
- 操作：按目标 code 分页查询，再通过统一格式化入口查询未知 code
- 可观察断言：只返回匹配 code；count 与当前页数组一致；totalCount、nextOffset 和 remainingCount 准确；未知 code 返回零项；availableCodes 稳定排序；不包含其他诊断
- 目标测试：`tests/ai-context-efficiency.test.mjs`
- 测试定位：`[TC-02] 历史诊断查询按稳定 code 返回有界结果`
- 聚焦命令：`node --test --test-name-pattern="历史诊断查询按稳定 code 返回有界结果" tests/ai-context-efficiency.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`tests/ai-context-efficiency.test.mjs`

### TC-03：CLI 新模式兼容并安全拒绝冲突参数

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-02、D-04、D-09、D-11
- 关联验收：A-04、A-06
- 关联规格：ai-context-efficiency / 完整检查合同必须保持兼容且新模式显式互斥
- 状态矩阵：用户操作、错误态
- 前置条件：CLI 可由当前 Node.js 运行，目标 fixture 可解析且仓库外哨兵可用于证明失败参数不产生副作用
- 测试数据：合法 summary、合法 diagnostic-code、无参数完整模式、模式冲突、缺值、孤立分页参数、limit 101 和未知参数
- 测试替身：使用仓库测试创建的隔离目标与哨兵；执行真实 CLI 参数解析和检查入口
- 操作：依次运行合法与非法参数组合，解析标准输出并记录退出状态、错误输出和哨兵快照
- 可观察断言：summary 和 diagnostic-code 可解析；无参数仍是完整结果；参数冲突、缺值、孤立分页参数、越界 limit 和未知参数非零退出且不输出项目 JSON、不改变目标或哨兵
- 目标测试：`tests/cli-argument-safety.test.mjs`
- 测试定位：`健康检查精简模式和诊断查询保持参数安全`
- 聚焦命令：`node --test --test-name-pattern="健康检查精简模式和诊断查询保持参数安全" tests/cli-argument-safety.test.mjs`
- 关联验证：V-02
- 结果分类：通过
- 证据：`tests/cli-argument-safety.test.mjs`

### TC-04：Skill、仓库读取路由与版本保持一致

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-05、D-06、D-10
- 关联验收：A-05、A-07
- 关联规格：ai-context-efficiency / AI 必须采用渐进读取并避开无关大体积资产
- 状态矩阵：初始（已有数据）
- 前置条件：Skill、根 AGENTS、根 package、插件 manifest、受管文件说明、初始化脚本和 README 均存在
- 测试数据：渐进检查命令、按 code 分页参数、大目录路由关键词与 0.17.1 版本声明
- 测试替身：不适用；直接读取仓库受跟踪文件并解析 JSON
- 操作：读取七个结构文件，校验 Skill 命令、AGENTS 路由和所有发布版本声明
- 可观察断言：检查 Skill 首次调用 summary 且包含按 code/offset 查询；AGENTS 有默认和按需范围；根 package 为 0.17.1、manifest 为 0.17.1 加单一 cachebuster，其余受管版本与 README 同步
- 目标测试：`tests/ai-context-efficiency.test.mjs`
- 测试定位：`[TC-04] Skill、仓库读取路由与版本保持一致`
- 聚焦命令：`node --test --test-name-pattern="Skill、仓库读取路由与版本保持一致" tests/ai-context-efficiency.test.mjs`
- 关联验证：V-03
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-08-26-reduce-ai-context-cost/verification.md`

## 执行记录

| 用例 | 命令或方式 | 结果 | 证据 |
| --- | --- | --- | --- |
| TC-01 | `node --test tests/ai-context-efficiency.test.mjs` | 通过 | V-01；专用文件 3/3 通过 |
| TC-02 | `node --test tests/ai-context-efficiency.test.mjs` | 通过 | V-01；目标与未知 code 分页断言通过 |
| TC-03 | `node --test tests/cli-argument-safety.test.mjs` | 通过 | V-02；合法、冲突与越界参数断言通过 |
| TC-04 | 专用结构测试、9 个 Skill validator、Plugin validator | 通过 | V-03、V-05 |
