## Why

插件固定内置的 OpenSpec 仍是 1.8.0，统一验证无法检查归档变更的未完成任务，批量命令在错误目录的失败关闭、非交互 archive 输出和非标准 Scenario 保护也没有建立 1.9.0 回归。需要在不依赖全局工具、不生成上游项目 Skills 且不放宽完成门禁的前提下完成受控升级。（D-01、D-04、D-05、D-06；A-01～A-05）

## What Changes

- 从官方 npm 包组装、核验并固定内置 `@fission-ai/openspec@1.9.0` 生产运行时，重建许可证和 SHA-256 完整性清单。（D-01、D-02；A-01）
- 在统一验证中新增独立的 `validate --archived` 阶段，保持活动变更和主规格的 `--all --strict` 校验不变。（D-04；A-02）
- 回归错误根批量命令、任务编号歧义、非标准四级 Scenario、规格空白和非交互 archive 纯文本行为。（D-05、D-06、D-07；A-03、A-04）
- 合并 1.9.0 apply 的意外范围报告约束，同时继续保护需求台账、规划根、离线环境和业务项目文件。（D-03、D-08；A-04、A-05）
- 将插件与工作流版本提升到 0.14.0，同步说明、测试、cachebuster 和本地安装验证。（D-09、D-10；A-06）

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `bundled-openspec-runtime`：固定运行时从 1.8.0 升级为 1.9.0，并保持离线、完整性与历史规划兼容边界。
- `verifiable-change-delivery`：采用 1.9.0 的范围报告、根目录失败关闭、任务编号、Scenario 和非交互归档语义。
- `repository-verification-gate`：统一验证新增只读归档任务检查阶段。

## Impact

- 运行时：`plugins/frontend-ai-workflow/runtime/openspec/` 与完整性清单。
- 代码：OpenSpec 包装器版本、统一验证步骤、工作流版本和结构断言。
- 参考与文档：apply 内部参考、公共升级说明、README、第三方声明和插件 manifest。
- 测试：复用 `tests/workflow.test.mjs` 增加 1.9.0 行为回归，并执行全仓库验证及官方 validators。（D-10；A-01～A-06）
