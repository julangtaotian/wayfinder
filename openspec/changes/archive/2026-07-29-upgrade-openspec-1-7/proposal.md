## Why

插件当前固定内置 OpenSpec 1.6.0，尚未理解 1.7.0 新增的 artifact `skipped`、动态操作输入、嵌套规格路径、默认 Store 和日期前缀归档语义。只替换运行时会让完成门禁、需求关联和归档预检产生静默偏差，因此需要把运行时与工作流约束作为一个受控变更整体升级。

本提案落实需求 D-01～D-10，并以 A-01～A-10 作为实现和验证边界。

## What Changes

- 将插件内置运行时精确升级到 `@fission-ai/openspec@1.7.0`，只保留生产依赖并固定关闭运行时自更新检查。
- 完成检查要求规划 `isComplete=true`，且所有 artifact 只能为 `done` 或由变更元数据支持的合法 `skipped`。
- 仅对需求明确确认不改变可观察行为的变更使用 `skip_specs: true`，不向常规完成入口暴露绕过参数。
- 实施与完成预览分别读取 OpenSpec 返回的 apply/archive 动态 context 和 guidance，但不允许动态输入覆盖需求事实、根目录选择或硬门禁。
- 支持数字或日期前缀变更名、嵌套规格实际路径和无规格归档结果；未经明确选择时阻断机器默认 Store。
- 三方合并上游 1.7.0 参考与插件治理规则，只升级已有项目的受管区块并保留业务内容。
- 插件功能版本升级到 0.10.0，并扩展端到端、严格规格、官方验证器和已安装插件验证。

## Capabilities

### New Capabilities

- `bundled-openspec-runtime`: 规定内置 OpenSpec 运行时的精确版本、供应链完整性、自更新隔离、Store 根目录边界和兼容验证。

### Modified Capabilities

- `verifiable-change-delivery`: 增加规划 artifact 完整状态、合法无规格变更、动态归档输入、日期归档名与嵌套规格路径的完成约束。
- `governed-requirement-revision`: 增加完整变更名优先匹配、系统生成归档名回退和 `skip_specs` 必须由需求决策支持的关联规则。

## Impact

- 运行时与依赖：`plugins/frontend-ai-workflow/runtime/openspec`、第三方声明。
- 执行与门禁：OpenSpec 包装器、需求校验、变更检查、归档完成脚本。
- 分发内容：插件 manifest、项目初始化/升级元数据、模板和内部 OpenSpec 参考。
- 验证：`tests/workflow.test.mjs`、严格 OpenSpec 校验、官方 skill/plugin validator、Vue 3 + Vite fixture 和插件缓存重装。
