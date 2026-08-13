## Why

插件内置 Playwright 当前只携带 `darwin-arm64` 与 `linux-x64`，Intel Mac、Linux ARM64 和 Windows x64 会在预览阶段直接阻塞，无法满足用户要求的常用开发机与 CI 平台覆盖。需要把现有按平台隔离、零运行期下载的发布模型扩展到五个平台，并用对应原生环境证明浏览器真实可启动。（D-08、D-10、D-13；A-07、A-10、A-12）

## What Changes

- 将受支持运行包矩阵扩展为 `darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64` 与 `win32-x64`。
- 为新增三个平台生成独立元数据、Chromium headless shell、FFmpeg、许可文件和 SHA-256 完整性清单，继续通过 Git LFS 发布平台资产。
- 扩展平台构建映射、运行时检查、结构校验和 README，使缺包、混装、摘要变化及未支持平台继续稳定阻塞，运行阶段不下载依赖。
- 将 GitHub Actions 调整为五平台原生矩阵，每个任务校验期望的 `platform-arch`，真实启动 Chromium 并生成截图；不得以跳过冒烟作为支持证据。
- 复用专用平台测试，覆盖五平台索引、隔离、完整性与错误边界，并保持现有 UI 验收配置和适配器合同不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `plugin-ui-review-automation`：把内置 Playwright 的可移植运行平台从两个扩展到五个，并要求每个平台通过独立完整性校验和原生 Chromium 冒烟。

## Impact

- 受影响代码：`playwright-runtime.mjs`、`build-playwright-platform.mjs`、`validate-structure.mjs`、平台运行时元数据与完整性清单。
- 受影响发布物：新增约三套 Chromium/FFmpeg Git LFS 资产，插件下载与安装体积增加，但目标业务项目仍零依赖安装。
- 受影响验证：`tests/ui-review-platform-runtime.test.mjs`、`.github/workflows/validate.yml`、统一仓库验证和插件安装缓存检查。
- 不影响网络 API、业务页面、UI Review 配置版本、状态版本、修复权限或视觉兜底语义。
