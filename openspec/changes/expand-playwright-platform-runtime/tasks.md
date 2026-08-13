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

- [ ] 4.1 在分支获得显式推送授权并触发 CI 后，核对五个平台均输出匹配 `platformKey`、`skipped=false` 和有效截图字节数，不以 Runner 跳过或交叉平台检查代替原生启动。（D-13；A-10、A-12）
- [ ] 4.2 将实际命令、文件数、五平台 CI 链接和安装缓存结果写入 V-17，关闭 A-10、A-12，并把需求状态推进到待验证。（D-10、D-13；A-10、A-12）
