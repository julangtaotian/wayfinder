# 测试方案：核心脚本可维护边界

## 基本信息

- 状态：已实现
- 需求：`requirements/REQ-2026-033-maintainable-core-script-boundaries.md`
- 变更：modularize-core-workflow-scripts
- 需求修订基线：R-01
- 默认聚焦命令：`node --test tests/workflow-requirements.test.mjs tests/workflow-openspec.test.mjs tests/workflow-trust-boundary.test.mjs tests/verification-evidence-integrity.test.mjs tests/repository-footprint.test.mjs`

## 测试上下文

- 测试命令状态：detected
- 测试命令：`npm test`
- 测试运行器：Node Test Runner
- 测试目录：`tests`
- Git 基线：available；`tests/workflow-requirements.test.mjs`、`tests/workflow-openspec.test.mjs`、`tests/workflow-trust-boundary.test.mjs`、`tests/verification-evidence-integrity.test.mjs`、`tests/repository-footprint.test.mjs` 均已受跟踪并直接覆盖目标入口或预算合同。
- 兼容说明：只使用 Node.js 标准库；原公开导入路径、CLI 参数、JSON 字段、稳定 code/status/target 和退出码保持兼容；测试 fixture 继续位于 `outputs/<验证主题>/` 并隔离父 Git。
- 跨平台高风险：是；命中路径、临时目录、子进程、环境变量和机器可读诊断，影响 macOS ARM64/x64、Linux ARM64/x64、Windows x64。确定性测试使用 `path.win32` 与 POSIX 样本，真实矩阵证据只来自同一提交的 CI。

## 测试用例

### TC-01：完成归档公开入口与恢复语义保持兼容

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-02、D-03、D-06、D-07
- 关联验收：A-01、A-05
- 关联规格：不适用；D-02 授权纯重构并跳过规格
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态
- 前置条件：现有完成门禁 fixture、可注入原子写入/归档/审计服务和已归档恢复目标
- 测试数据：预览、正常写入、测试方案缺失、需求写入失败、年度引用迁移失败、单候选/多候选恢复和重复恢复
- 测试替身：注入确定性 OpenSpec 响应，不执行外部项目命令
- 操作：从原 `finalize-change.mjs` 导入并执行改写函数与 `finalizeChange`
- 可观察断言：导出名称不变；动作、归档目标、`archive_partial_failure` 阶段、恢复参数和幂等结果保持兼容
- 目标测试：`tests/workflow-requirements.test.mjs`、`tests/workflow-openspec.test.mjs`、`tests/workflow-trust-boundary.test.mjs`、`tests/verification-evidence-integrity.test.mjs`
- 测试定位：`[V-01] 完成流程与需求决策模块化兼容`
- 聚焦命令：`node --test tests/workflow-requirements.test.mjs tests/workflow-openspec.test.mjs tests/workflow-trust-boundary.test.mjs tests/verification-evidence-integrity.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/modularize-core-workflow-scripts/evidence/V-01.json`

### TC-02：需求决策四阶段解析与交付校验保持兼容

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-02、D-03、D-06、D-07
- 关联验收：A-02、A-05
- 关联规格：不适用；D-02 授权纯重构并跳过规格
- 状态矩阵：初始（已有数据）、用户操作、空态、错误态
- 前置条件：含决策、验收、状态矩阵、验证记录、关联变更、任务和测试策略的需求 fixture
- 测试数据：plan、implement、precomplete、complete，空诊断、待确认决策、过期修订、任务漏引用、证据缺失与 Windows/POSIX 路径
- 测试替身：隔离 Git fixture；不读取归档历史之外的无关内容
- 操作：从原入口调用 `validateRequirementDecisions` 并执行 CLI
- 可观察断言：相同输入的 ok、errors、warnings、阶段、计数、任务引用和退出状态兼容
- 目标测试：`tests/workflow-requirements.test.mjs`、`tests/workflow-project.test.mjs`
- 测试定位：`[V-01] 完成流程与需求决策模块化兼容`
- 聚焦命令：`node --test tests/workflow-requirements.test.mjs tests/workflow-project.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/modularize-core-workflow-scripts/evidence/V-01.json`

### TC-03：验证证据执行与清单信任边界保持兼容

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-02、D-03、D-06、D-07
- 关联验收：A-03、A-05
- 关联规格：不适用；D-02 授权纯重构并跳过规格
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态
- 前置条件：schema v1/v2、local-command、external-ci、ui-review 和文件摘要 fixture
- 测试数据：成功命令、启动失败、非零退出、零 locator、语义执行中漂移、文件越界、摘要变化、外部记录和 UI Review 身份不一致
- 测试替身：无 shell 子进程与有界 `outputs/verification-evidence-integrity/test-fixtures`
- 操作：从原入口调用命令规范化、证据执行、清单校验和记录审计 API
- 可观察断言：公开导出、日志、描述符、schema 分类、fresh/trust、code/status/target、退出码和机器证据缺失判断兼容
- 目标测试：`tests/verification-evidence-integrity.test.mjs`、`tests/workflow-trust-boundary.test.mjs`
- 测试定位：`[V-02] 验证证据模块化兼容`
- 聚焦命令：`node --test tests/verification-evidence-integrity.test.mjs tests/workflow-trust-boundary.test.mjs`
- 关联验证：V-02
- 结果分类：通过
- 证据：`openspec/changes/modularize-core-workflow-scripts/evidence/V-02.json`

### TC-04：入口与内部模块满足职责行数合同

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-03、D-04、D-05
- 关联验收：A-01、A-02、A-03、A-04
- 关联规格：不适用；D-02 授权纯重构并跳过规格
- 状态矩阵：初始（已有数据）、用户操作、错误态
- 前置条件：三个入口和新增内部模块已完成拆分
- 测试数据：入口 600/601 行边界、普通脚本 800/801 行边界、内部模块导入图和根依赖声明
- 测试替身：体积 fixture 使用小型生成文本，不制造大型临时资产
- 操作：运行体积审计与结构测试
- 可观察断言：三个入口均不超过 600 行；全部脚本不超过 800 行；原入口存在并重导出；根依赖仍为空；无内部模块反向导入入口
- 目标测试：`tests/repository-footprint.test.mjs`
- 测试定位：`[V-03] 核心入口职责边界`
- 聚焦命令：`node --test tests/repository-footprint.test.mjs && npm run footprint`
- 关联验证：V-03
- 结果分类：通过
- 证据：`openspec/changes/modularize-core-workflow-scripts/evidence/V-03.json`

### TC-05：本地共享发布链完整通过

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：端到端
- 关联决策：D-05、D-08
- 关联验收：A-04、A-05
- 关联规格：不适用；D-02 授权纯重构并跳过规格
- 状态矩阵：初始（已有数据）、用户操作、错误态
- 前置条件：TC-01～TC-04 聚焦测试通过
- 测试数据：全仓测试、OpenSpec、插件/技能结构、运行时完整性与当前平台浏览器冒烟
- 测试替身：无；执行真实本地门禁，临时运行时写入 `outputs`
- 操作：运行 `npm test`、`npm run validate`、`npm run verify` 和官方 validators
- 可观察断言：所有本地阶段通过，清理结束后不残留根依赖或临时 fixture，工作区只包含计划内变更
- 目标测试：`tests/repository-footprint.test.mjs`
- 测试定位：`统一验证通过：9 个阶段全部完成。`
- 聚焦命令：不适用；本用例为全量验证
- 关联验证：V-04
- 结果分类：通过
- 证据：`openspec/changes/modularize-core-workflow-scripts/evidence/V-04.json`

### TC-06：真实五平台矩阵分层取证

- 状态：计划
- 优先级：P0
- 验证类型：人工
- 测试层级：端到端
- 关联决策：D-07、D-08
- 关联验收：A-05
- 关联规格：不适用；D-02 授权纯重构并跳过规格
- 状态矩阵：用户操作、错误态
- 前置条件：实现提交已通过 WebStorm 推送并触发现有 Validate 工作流
- 测试数据：精确提交 SHA、五个平台任务、统一验证和五份平台报告
- 测试替身：不适用；本地模拟不能替代
- 操作：复核 macOS ARM64/x64、Linux ARM64/x64、Windows x64 的同一运行
- 可观察断言：五项全部成功才把 V-05 更新为通过；任一失败记录平台、步骤、稳定字段、根因、本地遗漏和新增回归定位
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-05
- 结果分类：未执行
- 证据：待提交后记录 GitHub Actions URL

## 执行记录

| 用例 | 命令或方式 | 结果 | 证据 |
| --- | --- | --- | --- |
| TC-01～TC-04 | 聚焦 Node 测试与体积结构合同 | 通过 | V-01～V-03 |
| TC-05 | `npm test`、`npm run validate`、`npm run verify` 与官方 validators | 通过 | V-04 |
| TC-06 | 尚未提交，真实矩阵未运行 | 计划 | V-05 |
