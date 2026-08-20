## 1. 平台合同与测试基线

- [x] 1.1 将五个平台键和 Playwright 主机覆盖值收敛为单一只读描述表，驱动运行时支持列表与构建入口，并保持未支持平台中文阻塞语义。（D-08、D-10、D-13；A-07、A-10）
- [x] 1.2 在 `tests/ui-review-platform-runtime.test.mjs` 复用手写专用测试，扩展五平台 fixture、索引隔离、完整性、缺包、混装、摘要变化和未支持平台断言。（D-10、D-13；A-10、A-12）
- [x] 1.3 为 `darwin-x64`、`linux-arm64`、`win32-x64` 增加平台元数据，并扩展结构校验与运行时 README，使元数据、许可、完整性和 LFS 发布资产成为必需项。（D-08、D-10、D-13；A-07、A-10）

## 2. 新增平台运行资产

- [x] 2.1 分别预览三个新增平台的构建计划，确认 `mac15`、`ubuntu24.04-arm64`、`win64` 映射、输出目录和运行期零下载字段正确。（D-10、D-13；A-07、A-10）
- [x] 2.2 通过受控构建入口生成三个独立 Chromium headless shell 与 FFmpeg 运行包，保留平台许可并拒绝覆盖现有目录。（D-08、D-10、D-13；A-07、A-10）
- [x] 2.3 重建共享与五平台 SHA-256 清单，校验所有资产只属于各自目录、Git LFS 指针规则生效且没有系统元数据或缓存混入发布物。（D-10、D-13；A-07、A-10、A-12）

## 3. 五平台原生验证链

- [x] 3.1 将 `.github/workflows/validate.yml` 改为 `macos-15`、`macos-15-intel`、`ubuntu-24.04`、`ubuntu-24.04-arm`、`windows-2025` 矩阵，并为每项设置唯一的期望平台键。（D-13；A-10、A-12）
- [x] 3.2 运行聚焦平台测试、五平台完整性检查和当前 `darwin-arm64` Chromium 真实截图冒烟，确认 `skipped=false`。（D-10、D-13；A-10、A-12）
- [x] 3.3 运行 `npm test`、`npm run validate`、`npm run verify`、严格 OpenSpec 校验、官方 Skill 与 Plugin validators、安装缓存检查和 `git diff --check`。（D-08、D-10、D-13；A-07、A-12）
- [x] 3.4 修复 Windows 原生 CI 暴露的文本换行、仓库路径和测试 FFmpeg 启动兼容问题，并复跑相关专用测试与统一验证。（D-08、D-10、D-13；A-07、A-10、A-12）
- [x] 3.5 精确兼容 Windows Chromium `debug.log` 运行副作用和 OpenSpec 真实路径别名，并证明其他未登记文件与跨根目录仍失败关闭。（D-10、D-13；A-10、A-12）
- [x] 3.6 修正嵌套规格路径断言的 Windows 分隔符兼容，并保留 OpenSpec 原生路径输出合同。（D-13；A-10、A-12）

## 4. 验收证据与收尾

- [x] 4.1 在分支获得显式推送授权并触发 CI 后，核对五个平台均输出匹配 `platformKey`、`skipped=false` 和有效截图字节数，不以 Runner 跳过或交叉平台检查代替原生启动。（D-13；A-10、A-12）
- [x] 4.2 将实际命令、文件数、五平台 CI 链接和安装缓存结果写入 V-17，关闭 A-10、A-12，并把需求状态推进到待验证。（D-10、D-13；A-10、A-12）

## 5. 单平台成品合同与实现

- [x] 5.1 先在 `tests/ui-review-platform-runtime.test.mjs` 扩展手写专用测试，覆盖发布预览零写入、目标平台与原生主机一致、安全允许根、危险路径、拒绝覆盖、失败清理、单平台保留、其他四平台排除、共享文件完整、摘要重建和体积报告。（D-10、D-13、D-16；A-07、A-10、A-14）
- [x] 5.2 新增默认预览、显式 `--write` 的 `package-plugin-platform.mjs`，在 `dist/` 或系统临时目录下原子生成包含单平台插件和脚本化 marketplace 描述的暂存根，不修改仓库或个人 marketplace。（D-13、D-16；A-07、A-14）
- [x] 5.3 为 Playwright 增加受完整性保护的 `distribution.json`，让运行时和结构校验区分五平台规范源与单平台成品；成品只验证目标平台且明确拒绝其他平台残留，规范源继续全量校验五平台。（D-10、D-13、D-16；A-07、A-10、A-12、A-14）
- [x] 5.4 在 Linux ARM64 原生写入路径中只对暂存 Chromium 执行 `strip --strip-debug`，用 `readelf`、文件大小和源摘要证明调试段已移除且规范源未变；失败时精确清理暂存目录并阻止发布。（D-10、D-16；A-10、A-14）
- [x] 5.5 对成品按逻辑字节执行 260/260/330/420/340 MiB 平台预算，输出实际体积和余量；更新运行时 README、仓库忽略规则与发布说明，明确许可、FFmpeg、共享运行时和完整性不可裁剪。（D-10、D-13、D-16；A-07、A-14）

## 6. 成品验证与安装收尾

- [x] 6.1 本机运行平台聚焦测试、`npm test`、`npm run validate`、`npm run verify`、严格 OpenSpec、全部官方 Skill validators、规范源 Plugin validator 和 `git diff --check`，确认历史五平台源资产与 UI Review 合同不回归。（D-08、D-10、D-13、D-16；A-07、A-10、A-12、A-14）
- [x] 6.2 使用插件开发工具更新 manifest 单一 cachebuster，生成 `darwin-arm64` 成品并运行成品结构校验和官方 Plugin validator；通过 Codex CLI 注册脚本生成的本地 marketplace 并重装，复核安装缓存逻辑体积、完整性、单平台边界和真实 Chromium 截图。（D-10、D-13、D-16；A-07、A-12、A-14）
- [x] 6.3 扩展五平台 GitHub Actions：每个原生 Runner 先验证规范源，再生成自身平台成品，断言确定性结构、体积预算、其他平台排除、匹配 `platformKey`、`skipped=false` 和有效截图；Linux ARM64 额外断言 `stripped=true` 与无调试段。Codex 官方 Plugin validator 保留在本地规范源与当前平台真实成品门禁，公共 Runner 不临时联网安装外部校验依赖。（D-10、D-13、D-16；A-10、A-12、A-14）
- [x] 6.4 获得提交与推送授权后收集五平台成品大小、预算余量、Linux ARM64 去符号和截图证据，写入 V-18，关闭 A-07、A-10、A-12、A-14，并把需求推进到待验证。（D-10、D-13、D-16；A-07、A-10、A-12、A-14）
