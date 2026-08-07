## Why

当前可移植 UI 验收仍要求每个业务项目自行安装 Playwright 和浏览器，安装插件后不能直接运行，且不同项目可能使用不匹配的版本。插件需要像现有 OpenSpec 一样固定并随包发布 Playwright 运行时，让业务项目只实现验收适配逻辑而不重复管理依赖。（D-08～D-10，A-06、A-07）

## What Changes

- 在插件中固定并内置 Playwright 1.62.1、许可文件和当前发布平台的 Chromium headless shell。（D-08、D-10，A-07）
- 增加 Playwright 运行时检查与完整性清单，校验版本、操作系统、CPU 和浏览器可执行文件；运行阶段不联网安装依赖。（D-10，A-07）
- 为 `projectPlaywright` 增加安全的项目相对 `adapter` 合同，由插件运行器注入 Playwright API、规范化场景和受控产物路径。（D-08、D-09，A-02、A-06）
- 采集计划输出插件运行时来源、版本、平台兼容性、不可用原因和可直接执行的参数数组。（D-09、D-10，A-06、A-07）
- 保留既有 `projectPlaywright.command` 和单采集器配置行为，视觉插件继续只作为显式兜底。（D-08、D-09，A-06）
- 更新配置模板、共享说明、UI 验收与复验 Skill、结构校验和发布级测试。（D-08～D-10，A-05）

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `plugin-ui-review-automation`：将可移植 Playwright 主路径从业务项目自备依赖调整为插件内置运行时与注入式适配器，同时保留旧命令合同和显式视觉兜底。

## Impact

- 受影响代码：`plugins/frontend-ai-workflow/runtime/`、`scripts/ui-review-*.mjs`、UI 验收配置模板、三个 UI Skill、共享参考、结构与统一验证脚本。
- 新增固定依赖：Playwright 1.62.1 及其 Playwright Core 依赖，Chromium headless shell 只在插件构建或发布阶段下载。
- 发布影响：插件体积会显著增加；浏览器资产与构建平台绑定，不兼容平台必须安全失败或使用场景已声明的视觉兜底。
- 兼容性：旧 `projectPlaywright.command` 不删除、不重解释；新 `adapter` 与 `command` 互斥。
