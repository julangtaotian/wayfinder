## Why

四个项目的真实试运行表明，工作流可以建立规划与测试策略，却仍会把名为 `lint` 的非检查脚本视为有效 lint、将默认构建误作交付构建，或在人工检查和构建证据缺失时让变更看似完成。需要把现有的结构化需求能力延伸到命令语义和可交付性验证，避免文档勾选掩盖验证缺口。

## What Changes

- 在不改变既有 `commands` 字段含义的前提下，增加默认构建、交付构建候选和 lint 语义状态的检查报告。
- 为需求增加统一状态、验证记录及人工视觉证据的可解析结构，并保留旧需求的默认校验兼容性。
- 为需求校验器增加规划、实施和完成阶段；完成阶段阻止状态、任务、验收、验证记录或人工视觉证据不完整的变更同步与归档。
- 在需求编写、变更实施和完成规则中校验测试文件策略的 Git 基线，避免将新文件误标为复用。
- 为上述行为补充 Node.js 端到端回归测试，不新增外部依赖或自动写入业务项目。

## Capabilities

### New Capabilities

- `project-command-semantics`: 以兼容方式报告默认构建、交付构建和 lint 的语义可信度。
- `delivery-evidence-gating`: 以需求状态、验收、任务和验证记录作为变更完成与归档的确定性门槛。
- `test-file-baseline-validation`: 使用可用 Git 基线核验“新建 / 复用”测试文件策略，并明确无法确认的降级状态。

### Modified Capabilities

- 无。当前 `openspec/specs/` 没有已同步的能力规格。

## Impact

- 影响 `inspect-project.mjs`、`check-project.mjs`、`validate-requirement-decisions.mjs`、需求模板、工作流规则、变更技能和 `tests/workflow.test.mjs`。
- CLI JSON 新增稳定英文机器字段；现有 `commands.build`、默认校验入口和业务项目文件均保持兼容。
- 完成阶段会更严格，但只在用户请求完成、同步或归档时阻断；不会自动执行项目命令或伪造人工证据。

## 需求追踪

- 决策依据：D-01、D-02、D-03、D-04、D-05、D-06、D-07。
- 验收目标：A-01、A-02、A-03、A-04、A-05、A-06。
