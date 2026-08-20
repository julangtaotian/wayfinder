# 验证记录：Playwright 五平台单平台成品

## 结论

commit `16d8b27b34996fa2bea3ae8849e2ed623486b92e` 的 GitHub Actions 运行 `32113775135` 已在 Linux x64/ARM64、Windows x64、macOS Intel/ARM64 五个平台完成单平台成品构建、预算检查和真实 Chromium 冒烟。五个任务均为成功，浏览器均未跳过；Linux ARM64 仅对暂存副本去除调试符号，规范源摘要保持不变。结合本地全量验证和官方校验器，A-07、A-10、A-12、A-14 已具备完成证据。

## 本地验证

- `node --test tests/ui-review-automation.test.mjs tests/ui-review-platform-runtime.test.mjs`：42/42 通过，其中 UI Review 30/30、平台运行时 12/12。
- `npm test`：196/196 通过。
- `npm run validate`：插件结构、9 个 Skill、manifest 与版本合同通过。
- `npm run verify`：8/8 阶段通过；当前严格 OpenSpec 29/29、归档严格 OpenSpec 38/38、OpenSpec 1.9.0 与 76 个包完整性、Playwright 880 个文件完整性、本机 `darwin-arm64` Chromium `skipped=false` 均通过。
- 官方校验器：9/9 Skill 和 1/1 Plugin 通过。

## 五平台原生成品

| 平台 | 实际字节 | 预算字节 | 余量字节 | 截图字节 | 结果 |
| --- | ---: | ---: | ---: | ---: | --- |
| darwin-arm64 | 237378377 | 272629760 | 35251383 | 3506 | `skipped=false`，任务成功 |
| darwin-x64 | 239846652 | 272629760 | 32783108 | 3506 | `skipped=false`，任务成功 |
| linux-x64 | 307829825 | 346030080 | 38200255 | 3017 | `skipped=false`，任务成功 |
| linux-arm64 | 387225523 | 440401920 | 53176397 | 2814 | `skipped=false`、`stripped=true`，任务成功 |
| win32-x64 | 316733152 | 356515840 | 39782688 | 1909 | `skipped=false`，任务成功 |

- 五个平台成品均只保留目标平台资产，排除其余四个平台，`downloadsAtRuntime=false`，共享运行时与真实 Chromium 冒烟均通过。
- Linux ARM64 暂存 Chromium 去符号前后分别为 314181896 和 310380008 字节；规范源 SHA-256 保持 `e8b500712730fd4cbd0261f675a27c5a79b2375276876f1e3f69db10ee080a72`。
- 远端证据：[GitHub Actions 32113775135](https://github.com/julangtaotian/wayfinder/actions/runs/32113775135)。五个未过期平台报告产物与五个矩阵任务一一对应。

## 证据边界

- 远端矩阵精确证明上述 commit 的五平台发布链，不自动证明其后的源码修改。
- 本轮本地复验覆盖当前工作区的历史兼容与回归；任何后续命中跨平台高风险的实现修改仍需在新提交上重新取得五平台矩阵证据。
- 未新增业务项目依赖，目标项目仍不需要安装 Playwright 或浏览器。
