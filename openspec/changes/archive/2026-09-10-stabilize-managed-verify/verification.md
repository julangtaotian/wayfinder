# 受管 Verify 稳定性验证记录

## 最终候选

- 提交：`b2ad648089626bc722ca4088280642ffcf692ecb`
- 分支：`codex/dynamic-dependency-context`
- 工作区：提交后本地工作区干净，HEAD 与远端分支一致。

## 本地验证

- V-01：语义绑定 v2 结果补写、真实语义漂移、v1 兼容和未知版本失败关闭聚焦回归通过；机器清单为 `evidence/V-01.json`。
- V-02：受管 Verify 一次通过公开合同聚焦回归通过；机器清单为 `evidence/V-02.json`。
- V-03：固定 Vitest 运行时下全量测试 243 项，235 项通过、8 项按既有外部项目边界跳过、0 项失败；结构校验、10 个 Skill 与插件官方校验、仓库体积门禁均通过，临时测试运行时已清理。

## 外部 CI 复核

- 运行：[GitHub Actions Validate #105](https://github.com/julangtaotian/wayfinder/actions/runs/34441985129)
- 身份：事件为 push，attempt 1，head SHA 为 `b2ad648089626bc722ca4088280642ffcf692ecb`，工作流结论为 success。
- 共享任务：`Shared validation (linux-x64)` 为 success，`npm run verify:shared` 步骤成功。
- 五平台任务：`Validate (linux-x64)`、`Validate (linux-arm64)`、`Validate (darwin-x64)`、`Validate (darwin-arm64)`、`Validate (win32-x64)` 均为 success，且各自的 `npm run verify:platform` 步骤成功。
- 边界：本次 push 未启用可选的 Codex CLI 安装与离线加载专项；CI 成功不扩张为插件安装缓存已同步，也不把外部结果伪装成本地捕获机器证据。
