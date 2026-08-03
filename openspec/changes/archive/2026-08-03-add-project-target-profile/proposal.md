## Why

当前项目识别只表达框架和构建工具，桌面 Web、移动 Web 与同时包含两类终端证据的项目会得到相同上下文，后续需求分析和验证无法稳定引用终端事实。需要增加一个轻量、保守且可追溯的终端画像，同时严格限制其规模，使它继续服务于需求、变更和实施主链路。（D-01、D-03、D-06）

## What Changes

- 在现有识别结果中新增 `targetProfile`，使用稳定英文值表达桌面、移动、混合或未知终端，并返回来源和有序依赖证据。（D-03、D-04）
- 只使用 `package.json` 中明确的终端型依赖；冲突时返回 `mixed`，无证据时返回 `unknown`，不根据目录名或 CSS 猜测。（D-03）
- 将同一画像同步到项目检查、AGENTS、Wayfinder 和 OpenSpec 受管上下文，供需求与变更流程读取。（D-05）
- 新建终端画像专用测试，覆盖识别、初始化、升级、检查和向后兼容。（D-07、D-08）
- 本轮不加入任何小程序框架、公共命令、配置文件、第三方依赖或独立工作流。（D-02、D-06）

## Capabilities

### New Capabilities

- `project-target-profile`: 提供保守、可追溯的 Web 终端画像，并让现有工作流入口消费同一项目事实。

### Modified Capabilities

- 无。

## Impact

- 受影响代码：项目识别、初始化模板变量、项目检查结果和项目识别参考规则。
- 受影响模板：AGENTS、Wayfinder 和 OpenSpec 配置的受管区块。
- 测试：新增 `tests/project-target-profile.test.mjs`，并运行完整统一门禁。
- 兼容性：只新增字段和受管内容，保留现有 preset、命令、路径、默认预览及未受管文件保护。
- 依赖与发布：不增加依赖；完成后按本地插件开发流程刷新单一 cachebuster 并重新安装验证。
- 关联需求：`requirements/REQ-2026-013-project-target-profile.md`。
