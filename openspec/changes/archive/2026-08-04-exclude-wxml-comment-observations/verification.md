# 验证记录

## 聚焦验证

- 命令：`node --test tests/workflow.test.mjs`
- 结果：41/41 通过，0 失败。
- 覆盖：合法活动标记、活动属性粘连、单行注释、跨行注释、未闭合注释、同一行注释前后活动标记、原始路径和行号、Git 忽略文件。

## 完整验证

- `npm test`：114/114 自动测试通过，0 失败。
- `npm run validate`：插件结构验证通过。
- `npm run verify`：114/114 自动测试通过；OpenSpec 全量严格校验 22/22 项通过；内置 OpenSpec 1.7.0 与 76 个包完整性通过；统一门禁 5/5 阶段通过。
- 单变更严格校验：`exclude-wxml-comment-observations` 通过，0 个问题。

## 官方验证器与安装一致性

- 源码插件：官方 plugin validator 通过。
- 源码技能：5/5 官方 skill validator 通过。
- 安装副本插件：官方 plugin validator 通过。
- 安装副本技能：5/5 官方 skill validator 通过。
- 源码与安装副本的范围收集器、项目检查器和插件 manifest 逐文件一致。

## 安装副本与目标项目只读复核

- 安装版本：`0.11.0+codex.20260804025906`。
- 安装目录：`/Users/lvshuai/.codex/plugins/cache/frontend-ai-workflow/frontend-ai-workflow/0.11.0+codex.20260804025906`。
- 目标项目：`/Users/lvshuai/Desktop/ikang/dytsh/ikang-mini-wechat-inspect`。
- 工作流检查：`ok: true`；既有范围版本 2.1.0 与当前 2.2.0 指纹不同，`freshness.stale: true`。
- 验证边界：文件枚举、文本读取和 SHA-256 为 `performed`；语法解析、平台编译、Lint 和测试均为 `not-run`。
- 静态观察：返回 19 处活动 `wxml-attribute-spacing`；不再包含 `package-help/pages/helps/helps.wxml:22` 的注释位置。
- 只读确认：目标项目检查前后的 `git status --short` 完全一致，没有新增或修改目标文件。

## 剩余边界

- WXML 检测仍是静态启发式，不是完整 WXML 解析器，也不判断条件渲染分支是否可达。
- 未运行微信开发者工具、平台编译、真机、目标项目 Lint 或测试；这些外部验证不能由范围收集结果替代。
- 本次只减少注释误报，没有自动修复目标项目的 19 处活动位置。
