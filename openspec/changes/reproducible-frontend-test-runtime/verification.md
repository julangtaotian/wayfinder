# 验证说明

## 本机检查

- 环境：macOS（Apple Silicon）、Node.js 22、npm。
- 已确认根目录未生成 `node_modules`；Vitest 仅写入受忽略的 `outputs/frontend-test-runtime/`。
- 已确认 `outputs/frontend-test-cache/` 与运行时目录独立；运行时清理不删除缓存，缓存清理命令仅删除缓存目录。
- 已使用缓存成功执行 `npm run prepare:test-runtime -- --offline` 与 `npm run verify:shared -- --offline`。
- 已确认不支持的准备参数返回 `frontend_test_runtime_argument_invalid`，包含稳定 `code`、`target` 和 `status`。

## 自动验证摘要

- `node --test tests/frontend-test-workflow.test.mjs`：19 项通过。
- `npm test`：192 项通过，0 项失败，8 项因外部平台资产边界跳过。
- `npm run validate`：通过。
- `npm run verify:shared -- --offline`：7 个阶段全部通过，包含仓库体积、完整测试、结构校验、严格 OpenSpec、历史变更与内置运行时完整性检查。
- 平台 CI 工作流合同：断言每个矩阵 runner 在固定 Node.js 后预热缓存、清理运行时、清空平台运行时环境后执行离线共享验证并分别清理运行时与缓存，随后生成平台运行时进行专属验证。

## 未覆盖边界

- 当前执行环境为 macOS；Windows 与 Linux 的 npm JavaScript 入口、路径、诊断和 CI 命令顺序已由确定性测试覆盖。首次五平台任务 [#80](https://github.com/julangtaotian/wayfinder/actions/runs/33464540918) 证实平台结构校验必须在运行时生成后执行；修复后的真实五平台结果尚未记录为通过。
- 当前 Codex CLI 未暴露独立的官方 Skill / Plugin validator 子命令；已由仓库结构校验、内置 OpenSpec 完整性与已安装插件冒烟结果替代，不将其标注为官方校验器通过。
