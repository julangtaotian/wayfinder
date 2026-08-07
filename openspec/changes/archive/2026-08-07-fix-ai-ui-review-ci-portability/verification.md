# 验证记录

## 结论

AI UI 验收专用测试已移除 macOS 专用 FFmpeg 与字体绝对路径，使用 Node.js 标准库生成确定性 PNG，并以临时工具替身验证产物编排。聚焦测试、GitHub Actions 同入口完整验证、严格规格校验和插件官方校验全部通过。（D-10，A-06）

## 自动验证

| 范围 | 执行内容 | 结果 | 关联验收 |
| --- | --- | --- | --- |
| 聚焦 | `node --test tests/ai-ui-review.test.mjs` | `6/6` 通过；尺寸解析、两文件交付、零问题结论、重复生成与未知文件保护均通过 | A-01、A-02、A-03、A-06 |
| 全量 | `npm run verify` | 自动测试 `136/136`、OpenSpec 严格校验 `24/24`、运行时完整性和 Playwright Chromium 启动通过；统一验证 `7/7` | A-06 |
| 结构 | `npm run validate` | 插件与技能结构通过 | A-06 |
| 变更 | 内置 OpenSpec 1.7 严格校验 `fix-ai-ui-review-ci-portability` | `1/1` 通过 | A-06 |
| 官方校验器 | 8 个自定义 Skill 与插件 manifest | Skill `8/8`、Plugin `1/1` 通过 | A-06 |
| 差异 | `git diff --check` | 通过，无空白错误 | A-06 |

## 环境说明

应用受限沙箱内首次执行完整验证时，两个需要真实启动 Chromium 的既有测试因 macOS 进程权限返回 `EPERM`；在获准启动项目内置 Chromium 后以完全相同的 `npm run verify` 重跑并全部通过。该限制不影响 GitHub Actions 的 Linux Runner，也不属于本次代码失败。

## 边界

- 正式生成器仍要求运行环境存在可用 FFmpeg 和中文字体，缺失时继续明确失败。
- 临时工具替身只验证确定性产物编排，不替代既有双项目真实截图和人工视觉证据。
- 项目依赖、插件运行时 API 和业务项目安装方式均未改变。
