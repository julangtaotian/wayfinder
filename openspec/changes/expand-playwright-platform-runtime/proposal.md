## Why

插件内置 Playwright 已覆盖五个平台并取得对应原生 Chromium 启动证据，但把五套浏览器同时安装后，插件缓存达到约 1.38 GB，其中跨平台 Chromium/FFmpeg 资产占绝大部分。需要在保持五平台覆盖、目标项目零安装和运行期零下载的前提下，把发布模型调整为单平台成品，并对异常偏大的 Linux ARM64 Chromium 暂存副本安全去除调试符号。体积门禁必须留下明确余量，不能通过删除许可、FFmpeg、完整性清单或降低真实启动验证达标。（D-08、D-10、D-13、D-16；A-07、A-10、A-12、A-14）

## What Changes

- 保留仓库内五个平台规范源资产，新增默认只预览的单平台发布入口；只有显式 `--write` 才向安全的全新暂存目录生成插件成品。
- 每个成品完整携带共享 Playwright、OpenSpec、Skills 和脚本，只保留一个匹配平台的 Chromium/FFmpeg、元数据、许可和重建后的 SHA-256 清单，结构校验同时支持规范源模式与平台成品模式。
- 为五个平台设置带余量的安装体积上限：macOS ARM64/x64 各 260 MiB、Linux x64 330 MiB、Linux ARM64 420 MiB、Windows x64 340 MiB；报告实际体积、预算和剩余余量，超限即阻塞。
- Linux ARM64 只在对应原生 Runner 对暂存 Chromium 去除调试符号，随后重建清单并真实启动；缺少工具、处理失败或冒烟失败都不得发布，也不修改仓库规范源资产。
- 扩展五平台 GitHub Actions，使每项从自身平台成品运行结构校验、体积门禁和真实 Chromium 截图；本机 marketplace 从匹配平台成品重装并复测缓存体积。
- 复用专用平台测试覆盖预览零写入、路径安全、拒绝覆盖、平台排除、共享内容、摘要重建、体积和失败清理，并保持现有 UI 验收配置、状态和适配器合同不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `plugin-ui-review-automation`：把五平台内置 Playwright 从同一安装副本拆为五个单平台成品，并要求每个成品通过独立完整性、体积预算和原生 Chromium 冒烟。

## Impact

- 受影响代码：新增平台成品暂存入口，并调整 `playwright-runtime.mjs`、`validate-structure.mjs` 与发布体积检查；现有五平台规范源资产和运行时平台键保持不变。
- 受影响发布物：从包含五套浏览器的约 1.38 GB 通用安装副本改为只含一个平台的成品；仓库 Git LFS 仍保留五平台规范源，不把临时成品提交为源资产。
- 受影响验证：`tests/ui-review-platform-runtime.test.mjs`、`.github/workflows/validate.yml`、统一仓库验证、官方 Plugin validator 和匹配平台安装缓存检查。
- 不影响网络 API、业务页面、UI Review 配置版本、状态版本、修复权限或视觉兜底语义。
