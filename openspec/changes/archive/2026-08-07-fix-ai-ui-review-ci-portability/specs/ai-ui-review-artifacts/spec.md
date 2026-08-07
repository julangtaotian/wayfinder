## ADDED Requirements

### Requirement: AI UI 验收专用验证必须使用跨平台确定性输入
系统 SHALL 让 AI UI 验收产物的专用自动测试在 macOS 开发环境和 Linux CI 中使用一致的确定性图片与工具替身，测试 MUST NOT 依赖 Homebrew、macOS 系统字体或其他特定操作系统的固定绝对路径。正式生成器仍 SHALL 在运行时检查真实 FFmpeg 与中文字体，并在缺失时明确失败。（D-08、D-10，A-06）

#### Scenario: Linux CI 执行专用测试
- **WHEN** GitHub Actions 的 Linux Runner 执行 AI UI 验收专用测试
- **THEN** 测试无需安装额外项目依赖即可创建有效 PNG 输入并完成尺寸解析、两文件交付、零问题结论和未知文件保护断言

#### Scenario: 正式运行环境缺少标注依赖
- **WHEN** 正式生成器所在环境没有可用 FFmpeg 或中文字体
- **THEN** 系统仍以明确中文错误终止，不因专用测试使用工具替身而生成虚假通过结果
