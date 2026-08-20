## Why

历史需求没有启用机器证据合同时，完成校验会把验证记录中的任意 `.json` 路径都当成 V-* 机器清单解析。普通 `plugin.json`、配置 JSON 或报告 JSON 因而产生失败诊断，错误阻断本应保持只读兼容的历史变更完成流程。

## What Changes

- 只把显式 `V-*.json` 或 `evidence/` 目录下的 JSON 识别为机器证据候选，普通 JSON 继续接受既有的持久路径和安全边界检查。（D-01）
- 未启用新合同的历史变更中，无效机器证据候选降级为可定位警告。（D-02）
- 显式启用合同的新变更继续严格失败关闭。（D-03）
- 复用 TC-03 增加历史普通 JSON、无效 V-* 候选和新合同严格度回归，并按仓库约束完成本地与跨平台验证。（D-04、D-05）
- 针对首次五平台矩阵暴露的 Windows 暂存目录句柄释放竞争，为发布改名与失败清理启用受控重试，并保留原始打包错误；补充确定性回归后重新取得矩阵证据。（D-04、D-05）

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `verification-evidence-integrity`：明确历史普通 JSON 资料与机器证据候选的分类规则和兼容严重级别。

## Impact

- 影响 `plugins/frontend-ai-workflow/scripts/verification-evidence.mjs` 的证据候选分类与诊断状态。
- 影响 `tests/verification-evidence-integrity.test.mjs` 的历史兼容回归。
- 影响 `plugins/frontend-ai-workflow/scripts/package-plugin-platform.mjs` 与 `tests/ui-review-platform-runtime.test.mjs` 的平台成品失败清理链。
- 不改变证据 schema、CLI 参数、OpenSpec 生命周期、外部 CI 查询能力或生产依赖。
- 跨平台高风险：命中路径规范化和机器可读诊断，影响 Linux x64/ARM64、Windows x64、macOS Intel/ARM64；需保留稳定 `code`、`target`、`status` 并运行真实矩阵证据复核。
