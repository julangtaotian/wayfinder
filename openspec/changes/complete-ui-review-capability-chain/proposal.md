## Why

现有插件已经具备安全的 UI 验收、显式修复和相同上下文复验合同，但复杂交互仍需项目手写适配器，Playwright 只完成证据采集，Linux CI 不能真实启动内置浏览器，其他 AI 工具还要自行串联多个底层命令。补齐这四层后，原定的“项目内插件化、跨 AI 工具、业务项目零安装、视觉能力仅兜底”目标才能形成可重复使用的完整链路。（D-01、D-07、D-09、D-11～D-14；A-08～A-12）

## What Changes

- 为新配置增加受限结构化交互步骤，由默认 Playwright 适配器稳定执行常见弹窗、下拉、悬停、填写、选择、显隐等待、断言和分段截图；旧字符串交互保持兼容但不被猜测执行。（D-08、D-11；A-08）
- 增加 DOM/计算样式和受控图片区域的确定性判断，将结果收敛为 `passed`、`needs-fix`、`inconclusive`，证据不足或中置信度差异不再被写成通过，视觉能力只处理已声明的不确定兜底。（D-06、D-09、D-12；A-09）
- 将内置 Playwright 改为按 `platform-arch` 选择和独立校验的运行包，首批覆盖 `darwin-arm64` 与 `linux-x64`；运行阶段继续禁止安装或下载，GitHub Actions 必须真实启动 Linux Chromium。（D-08、D-10、D-13；A-10）
- 增加跨工具统一 Node.js 入口，在默认预览和显式 `--write` 边界内编排验收或复验，并输出稳定 JSON、产物路径与四类退出码；自动修复仍保持独立显式授权。（D-03、D-07、D-14；A-11）
- 更新三个 UI Skill、共享参考、配置模板、插件结构校验、发布验证与专用测试，保留既有命令式 Playwright、细粒度命令和 Browser 兜底语义。（D-01、D-08、D-09；A-06、A-07、A-12）

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `plugin-ui-review-automation`：补充结构化复杂交互、确定性视觉三态、macOS ARM 与 Linux x64 内置运行包，以及跨工具统一验收/复验入口。

## Impact

- 插件配置与状态合同：`plugins/frontend-ai-workflow/scripts/ui-review-workflow.mjs`、UI 配置模板和状态版本兼容逻辑。
- 页面执行与视觉判断：默认 Playwright 适配器、适配器运行器、报告生成器以及新增的确定性比较模块。
- 运行时发布：Playwright 平台目录、每平台元数据与完整性清单、Git LFS/发布构建和 GitHub Actions Linux 冒烟验证。
- 跨工具入口：新增薄编排脚本，复用现有状态函数、适配器和报告生成器，不引入独立服务或远程绑定。
- 插件与 Skill：UI 验收、修复、复验说明和共享合同需要同步；修复继续禁止隐式触发。
- 测试：复用 `tests/ui-review-automation.test.mjs`，新增 `tests/ui-review-platform-runtime.test.mjs`，并执行全量插件、OpenSpec、运行时、官方 Skill 与 Plugin 验证。
- 依赖：允许仅在插件发布物内固定必要的轻量图片比较依赖；业务项目的 `package.json` 与锁文件保持不变。
