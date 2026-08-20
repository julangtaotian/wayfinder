# 验证记录：历史 JSON 证据分类兼容修复

## 当前结论

本地功能与发布级验证已完成：普通 `plugin.json`、配置 JSON 和报告 JSON 不再被误当成 V-* 机器清单；历史无效显式候选只产生 warning；启用严格证据合同后仍以 `machine_evidence_missing` 或无效清单 failed 关闭。两个被旧误判阻断的历史活动变更已通过完成门禁并正式归档。

## 回归与本地验证

- 失败先行：修复前 TC-03 新增的历史普通 `plugin.json` 用例稳定复现 `unsafe_evidence_path` 误阻断。
- 修复后 `[TC-03] 证据完成门禁与历史兼容` 聚焦通过，V-01 保存当前工作区指纹、命令、定位命中、退出码和日志摘要。
- `node --test tests/ui-review-automation.test.mjs tests/ui-review-platform-runtime.test.mjs`：42/42 通过。
- `npm test`：196/196 通过。
- `npm run validate`：通过。
- `npm run verify`：196/196 自动测试与 8/8 阶段通过；当前严格 OpenSpec 27/27、归档严格 OpenSpec 40/40、OpenSpec 1.9.0 与 76 个包完整性、Playwright 880 个文件完整性、本机 Chromium 冒烟均通过。V-02 保存当前工作区的发布级统一验证证据。
- 官方校验器：9/9 Skill 和 1/1 Plugin 通过。
- 官方插件开发 helper 已更新单一 cachebuster 至 `0.15.0+codex.20260820074239`；从仓库本地 marketplace 重装后版本一致且启用。

## 历史闭环复核

- `modularize-ui-review-workflow`：完成预览、正式归档和归档后 requirement complete 审计通过。
- `expand-playwright-platform-runtime`：清理旧证据位置歧义并补齐 V-18 后，完成预览、规格同步、正式归档和归档后审计通过。
- 历史记录仍可显示 `legacy_markdown_evidence` 或越界缓存路径 warning；这些 warning 保留历史事实，不再被普通 JSON 误升级为失败。

## 跨平台边界

- 本次实现命中路径规范化与机器可读诊断，属于跨平台高风险。
- 历史运行 `32113775135` 证明旧平台成品变更在五个平台闭环，但早于本次源码修复，不能作为当前修复的五平台发布证据。
- 因当前工作区尚未形成并推送新提交，V-03 保持计划；在该矩阵成功前，A-04 和本变更归档保持未完成。
