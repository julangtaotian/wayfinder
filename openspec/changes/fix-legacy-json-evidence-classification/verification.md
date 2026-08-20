# 验证记录：历史 JSON 证据分类兼容修复

## 当前结论

本地功能与发布级验证已完成：普通 `plugin.json`、配置 JSON 和报告 JSON 不再被误当成 V-* 机器清单；历史无效显式候选只产生 warning；启用严格证据合同后仍以 `machine_evidence_missing` 或无效清单 failed 关闭。两个被旧误判阻断的历史活动变更已通过完成门禁并正式归档。

## 回归与本地验证

- 失败先行：修复前 TC-03 新增的历史普通 `plugin.json` 用例稳定复现 `unsafe_evidence_path` 误阻断。
- 修复后 `[TC-03] 证据完成门禁与历史兼容` 聚焦通过，V-01 保存当前工作区指纹、命令、定位命中、退出码和日志摘要。
- `node --test tests/ui-review-platform-runtime.test.mjs`：14/14 通过；新增发布 `EPERM`/`EBUSY` 重试与清理 `ENOTEMPTY` 首错保留回归均通过。
- `npm test`：198/198 通过；首次未准备隔离 Vitest 运行时的执行按预期提示前置条件，完成 `npm run prepare:test-runtime` 后重跑全量通过，随后由统一验证清理运行时。
- `npm run validate`：通过。
- `npm run verify`：198/198 自动测试与 8/8 阶段通过；当前严格 OpenSpec 27/27、归档严格 OpenSpec 40/40、OpenSpec 1.9.0 与 76 个包完整性、Playwright 880 个文件完整性、本机 Chromium 冒烟均通过。V-02 保存当前工作区的发布级统一验证证据。
- 官方校验器：9/9 Skill 和 1/1 Plugin 通过。
- 官方插件开发 helper 已更新单一 cachebuster 至 `0.15.0+codex.20260820094902`；从仓库本地 marketplace 重装后版本一致且启用。

## 历史闭环复核

- `modularize-ui-review-workflow`：完成预览、正式归档和归档后 requirement complete 审计通过。
- `expand-playwright-platform-runtime`：清理旧证据位置歧义并补齐 V-18 后，完成预览、规格同步、正式归档和归档后审计通过。
- 历史记录仍可显示 `legacy_markdown_evidence` 或越界缓存路径 warning；这些 warning 保留历史事实，不再被普通 JSON 误升级为失败。

## CI 失败复盘

- 失败运行：`32353726866`，精确提交 `8a3eebe7ec6b3e9dcb1d11033341b7f83bd8b26f`。
- 失败平台与步骤：仅 Windows x64 的 `Build and verify platform plugin package` 失败；Linux x64/ARM64、macOS Intel/ARM64 均成功上传平台报告。
- 稳定错误：命令 `node plugins/frontend-ai-workflow/scripts/package-plugin-platform.mjs --write --platform win32-x64` 以退出码 1 结束，最终错误为暂存 Chromium 目录的 `ENOTEMPTY` `rmdir`。
- 根因：可确认的直接根因是打包 catch 使用默认 `fs.rmSync({ recursive: true, force: true })` 清理大型 Windows 暂存目录，默认 `maxRetries` 为 0；清理异常又覆盖了先发生的原始打包异常，所以 CI 只能看到二次 `ENOTEMPTY`。首个错误已无法从日志恢复；预算仍有约 38 MiB 余量且发布级验证已通过，结合目录位于刚关闭的 Chromium 下，最可能是最终发布改名遭遇尚未释放的 Windows 句柄。
- 为何本地未发现：既有测试只在当前 macOS fixture 上断言语义失败后暂存目录不存在，没有在文件操作边界模拟 Windows 发布 `EPERM`/`EBUSY` 或清理 `ENOTEMPTY`，也没有断言退避次数、清理重试配置和原始错误保留。
- 新增回归定位：`tests/ui-review-platform-runtime.test.mjs`；确定性模拟发布瞬时失败后成功、清理重试配置与清理重试耗尽三条路径。修复后复跑链接写入 V-04，V-03 保留为失败事实。

## 跨平台边界

- 本次实现命中路径规范化与机器可读诊断，属于跨平台高风险。
- 历史运行 `32113775135` 证明旧平台成品变更在五个平台闭环，但早于本次源码修复，不能作为当前修复的五平台发布证据。
- V-03 已记录首次矩阵失败；在包含清理修复的提交取得 V-04 五平台成功前，A-04 和本变更归档保持未完成。
