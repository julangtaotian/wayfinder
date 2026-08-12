## Why

插件固定内置的 OpenSpec 仍是 1.7.0，无法获得 1.8.0 的规划完成新语义、多语言校验、缩进任务统计、归档安全和工作流修复。需要在不依赖全局工具、不生成上游项目 Skills 且不放宽现有完成门禁的前提下完成受控升级。（D-01、D-03、D-04；A-01、A-02、A-05）

## What Changes

- 从官方 npm 包组装、核验并固定内置 `@fission-ai/openspec@1.8.0` 生产运行时，重建可重复的许可证与 SHA-256 完整性清单。（D-01、D-02；A-01）
- 状态消费者优先读取 `isPlanningComplete`，同时兼容旧 `isComplete`，继续独立执行任务、验收、证据和 artifact 硬门禁。（D-04；A-02）
- 回归普通多语言校验、严格校验、缩进子任务、MODIFIED Scenario 完整性、非交互归档和能力退役行为。（D-05、D-06；A-03、A-04）
- 包装器显式关闭版本检查和匿名遥测，三方合并 1.8.0 内部参考但不向业务项目生成上游 `.agents`、`.codex` 或 Copilot 文件。（D-03、D-07、D-08；A-05）
- 将插件与工作流版本提升到 0.13.0，同步说明、测试和发布验证。（D-09、D-10；A-06）

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `bundled-openspec-runtime`：固定运行时从 1.7.0 升级为 1.8.0，并新增遥测关闭、候选兼容和不生成上游项目 Skills 的边界。
- `verifiable-change-delivery`：完成门禁优先使用 `isPlanningComplete`，并按 1.8.0 统计缩进任务和处理非交互归档、能力退役。

## Impact

- 运行时：`plugins/frontend-ai-workflow/runtime/openspec/`、完整性清单与第三方声明。
- 代码：OpenSpec 包装器、检查/完成状态消费、工作流版本和结构校验。
- 参考与文档：六个内部 OpenSpec 工作流参考、公共 Skill 说明、README 与插件 manifest。
- 测试：复用 `tests/workflow.test.mjs` 增加 1.8.0 行为回归，并执行全仓库验证及官方 validators。（D-10；A-01～A-06）
