## Why

GitHub Actions 在 Linux Runner 上执行 `npm run verify` 时，AI UI 验收专用测试因写死 Homebrew FFmpeg 和 macOS 字体绝对路径而失败，导致测试尚未进入实际生成器断言。需要让测试输入与操作系统解耦，恢复仓库验证门禁的可移植性。（D-10、A-06）

## What Changes

- 将专用测试使用的 PNG 输入改为由 Node.js 标准库确定性写入，不再调用 macOS 专用 FFmpeg 路径。
- 保留真实标注截图生成器对可用 FFmpeg 和中文字体的运行时检查，不降低正式能力的失败门禁。
- 复用 `tests/ai-ui-review.test.mjs` 验证尺寸解析、两文件交付、零问题结论和未知文件保护，并执行 GitHub Actions 同入口完整验证。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `ai-ui-review-artifacts`：专用自动测试必须在 macOS 开发环境和 Linux CI 中使用一致的确定性输入，不得依赖特定操作系统的工具或字体绝对路径。（D-08、D-10，A-06）

## Impact

- 受影响文件：`tests/ai-ui-review.test.mjs`、需求与本变更验证材料。
- 不修改插件运行时 API、验收产物格式、业务项目依赖或正式 FFmpeg/字体错误语义。
- 验证入口：聚焦专用测试与 `.github/workflows/validate.yml` 使用的 `npm run verify`。
