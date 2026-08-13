## MODIFIED Requirements

### Requirement: 内置 Playwright 必须按平台选择并真实验证运行包
系统 SHALL 从插件随附的按 `platform-arch` 索引运行包中选择唯一匹配项，并 MUST 独立校验固定 Playwright 版本、浏览器 revision、许可和文件摘要。发布物 MUST 覆盖 `darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64` 与 `win32-x64`；五个平台的支持结论都必须来自对应原生环境的真实 Chromium 启动和截图，运行阶段不得联网下载或修改业务项目依赖。其他平台 MUST 明确报告不受支持。（D-08、D-10、D-13，A-07、A-10）

#### Scenario: Apple Silicon Mac 选择匹配运行包
- **WHEN** 当前环境是 `darwin-arm64` 且对应运行包完整
- **THEN** 系统只选择该平台元数据和浏览器资产，真实启动 Chromium 并产生有效截图

#### Scenario: Intel Mac 选择匹配运行包
- **WHEN** 当前环境是 `darwin-x64` 且对应运行包完整
- **THEN** 系统只选择 `darwin-x64` 运行包，真实启动 Chromium 并产生有效截图，不读取 Apple Silicon 资产作为回退

#### Scenario: Linux x64 CI 选择匹配运行包
- **WHEN** Linux x64 Runner 检出完整发布资产并执行统一验证
- **THEN** 系统选择 `linux-x64` 运行包，真实启动 Chromium 并产生截图，浏览器阶段不得以平台不兼容跳过后报告支持通过

#### Scenario: Linux ARM64 CI 选择匹配运行包
- **WHEN** Linux ARM64 Runner 检出完整发布资产并执行统一验证
- **THEN** 系统选择 `linux-arm64` 运行包，真实启动 Chromium 并产生截图，不读取 Linux x64 资产作为回退

#### Scenario: Windows x64 CI 选择匹配运行包
- **WHEN** Windows x64 Runner 检出完整发布资产并执行统一验证
- **THEN** 系统选择 `win32-x64` 运行包，使用平台原生可执行文件真实启动 Chromium 并产生截图

#### Scenario: 当前平台没有运行包或摘要变化
- **WHEN** 当前 `platform-arch` 不在索引中、平台资产混装、许可缺失或任一摘要变化
- **THEN** 系统输出不可用原因和 `blocked` 结论，不读取其他平台资产作为回退，也不执行安装命令
