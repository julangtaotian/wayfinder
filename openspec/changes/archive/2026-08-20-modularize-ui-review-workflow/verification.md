# 验证记录：UI Review 工作流等价模块化

## 结论

UI Review 原公共入口已收敛为 41 行兼容门面，测试入口已收敛为 6 行聚合文件；18 个公开导出、两个生产消费者、30 个既有测试名称和直接 CLI 合同保持兼容。结构、全量回归、官方校验器和本地插件重装均通过，A-01～A-06 已具备完成证据。

## 兼容与结构验证

- `plugins/frontend-ai-workflow/scripts/ui-review-workflow.mjs` 为 41 行，继续导出 18 个公共符号并保留直接运行入口。
- `ui-review-runner.mjs` 与 `playwright-adapter-runner.mjs` 两个生产消费者继续从原路径导入；测试 fixture 也继续通过该公共入口验证合同。
- `tests/ui-review-automation.test.mjs` 为 6 行聚合入口；五个 `.cases.mjs` 单元继续由同一聚焦命令发现，最大单元 `runtime-capture.cases.mjs` 为 467 行。
- `npm run validate` 对领域模块、唯一 helper 来源、导出完整性、依赖方向和规模上限的结构门禁通过。
- 既有 `ui-review-report.mjs` 为 650 行，是本次首批模块化范围外的历史报告模块；未将其冒充为新增领域文件通过规模门禁。

## 自动验证

- `node --test tests/ui-review-automation.test.mjs`：30/30 通过。
- `node --test tests/ui-review-automation.test.mjs tests/ui-review-platform-runtime.test.mjs`：42/42 通过。
- `npm test`：196/196 通过。
- `npm run validate`：通过。
- `npm run verify`：8/8 阶段通过；当前严格 OpenSpec 29/29、归档严格 OpenSpec 38/38、两套内置运行时完整性和本机 Chromium 冒烟通过。
- 官方校验器：9/9 Skill 和 1/1 Plugin 通过。
- `git diff --check`：通过。

## 插件更新

- 使用官方插件开发 helper 更新单一 cachebuster，基础版本保持 `0.15.0`，当前版本为 `0.15.0+codex.20260820074239`。
- 从仓库既有本地 marketplace 重装后，Codex 插件列表显示该版本已启用，安装缓存版本与源码 manifest 一致。

## 验证边界

- 本变更是首批等价拆分，没有新增 UI Review 功能、网络接口或业务依赖。
- 本轮验证覆盖仓库内既有 fixture 和内置 Chromium；未额外声明新的前端框架认证范围。
