## Why

`ui-review-report.mjs` 已增长至 694 行，输入校验、文本渲染、标注产物和 CLI 编排耦合在同一入口中。该入口仅服务于 UI 验收链路，却提高了局部维护的读取成本，也使后续新增逻辑更接近脚本体积预算。

## What Changes

- 将报告脚本按输入规范化、Markdown 渲染和标注产物三个职责拆为内部模块。
- 保留 `ui-review-report.mjs` 作为唯一兼容入口，维持既有 Node.js 导出、同步调用方式和 CLI 合同。
- 新增专用回归，约束兼容门面、模块单向依赖、输出替换、失败清理及 Windows/POSIX 路径样本。
- 将兼容入口限制在 180 行以内，新增模块各不超过 500 行，且不引入依赖、循环导入或 shell 调用。
- 在 UI Review 长期参考资料中交付后续功能路由：先判断数据解析、业务判断或输出报告职责；单职责改动不为拆分而拆分，异常和兼容边界随职责保持失败关闭。
- 补齐提交前防回归：测试方案和需求交付校验统一拒绝任一平台绝对路径，Git 基线以 `HEAD` 为准；结构校验阻止活动 Markdown 中裸 D/A 引用标签进入提交。

## Capabilities

### New Capabilities

无。本轮是纯内部模块化，不引入新的可观察能力。

### Modified Capabilities

无。既有 UI Review 的公开行为、报告内容和配置 schema 不变；变更已在 `.openspec.yaml` 中声明 `skip_specs: true`。

## Impact

- 需求依据：D-01、D-02、D-03、D-04、D-05、D-06、D-07、D-08、D-09；验收边界：A-01、A-02、A-03、A-04、A-05、A-06、A-07。
- 受影响代码：`ui-review-report.mjs` 及新增的内部报告模块、`validate-test-plan.mjs`、`requirement-delivery-validation.mjs`、Markdown 结构校验和对应专用测试。
- 受影响参考资料：`references/ui-review-workflow.md` 新增报告链维护与异常兼容规则。
- 兼容调用方：`ui-review-runner.mjs`、`playwright-adapter-runner.mjs` 与既有测试继续从原入口导入。
- 不影响：业务项目页面、UI Review 场景和比较算法、Playwright 固定运行时、CI 工作流及根依赖。
