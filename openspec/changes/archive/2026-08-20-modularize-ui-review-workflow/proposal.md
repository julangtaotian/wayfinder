## Why

UI Review 的兼容入口和专用测试均已超过千行，配置、采集、状态、存储和命令职责集中在单文件中，增加局部理解、冲突处理与回归定位成本。依据 REQ-2026-023 的 D-01、D-02，本变更先对唯一超过千行的生产脚本及其测试调用链做等价模块化，为后续大型文件治理建立可验证模式。

## What Changes

- 按 D-03 将配置/合同、采集计划、运行状态、状态存储和 CLI 调度拆入独立生产模块。
- 按 D-04 保留 `ui-review-workflow.mjs` 作为兼容门面，维持 18 个公开导出、直接 CLI 和两个现有消费者的导入路径。
- 按 D-05 将 `ui-review-automation.test.mjs` 改为稳定聚合入口，把共享 fixture 与 30 个既有测试按领域拆分。
- 按 D-06 在结构校验中加入门面、测试入口和领域文件行数门禁，防止超长文件回退。
- 按 D-07、D-08 保持安全语义与依赖不变，并执行聚焦测试和发布级验证。
- 按 D-09 使用官方更新流程刷新 cachebuster、验证并重装本地插件。
- 不处理 D-10 列出的另外两份超长测试。

## Capabilities

### New Capabilities

- 无。本变更不新增用户可见能力。

### Modified Capabilities

- 无。REQ-2026-023 D-01 明确确认本变更不改变可观察行为，`.openspec.yaml` 已授权 `skip_specs: true`。

## Impact

- 主要影响 `plugins/frontend-ai-workflow/scripts/ui-review-workflow.mjs`、新增的内部模块、`tests/ui-review-automation.test.mjs` 及其领域测试单元。
- `ui-review-runner.mjs`、`playwright-adapter-runner.mjs`、三个 UI Review Skill 和现有运行状态数据只作为兼容验证对象，不改变其合同。
- 不新增依赖，不修改 OpenSpec/Playwright 运行时、LFS 资产、业务项目内容或 marketplace 条目。
