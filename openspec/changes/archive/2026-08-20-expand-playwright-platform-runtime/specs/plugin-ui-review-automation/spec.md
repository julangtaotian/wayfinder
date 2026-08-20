## MODIFIED Requirements

### Requirement: 内置 Playwright 必须按平台选择并真实验证运行包
系统 SHALL 从当前插件成品随附的按 `platform-arch` 索引运行包中选择唯一匹配项，并 MUST 独立校验固定 Playwright 版本、浏览器 revision、许可和文件摘要。发布族 MUST 覆盖 `darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64` 与 `win32-x64`，但每个可安装成品 MUST 只携带一个匹配平台运行包；五个平台的支持结论都必须来自对应原生成品的真实 Chromium 启动和截图，运行阶段不得联网下载或修改业务项目依赖。其他平台 MUST 明确报告不受支持。（D-08、D-10、D-13、D-16，A-07、A-10、A-14）

#### Scenario: Apple Silicon Mac 选择匹配运行包
- **WHEN** 当前环境是 `darwin-arm64` 且安装了对应单平台成品
- **THEN** 系统只发现并选择该平台元数据和浏览器资产，真实启动 Chromium 并产生有效截图

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

## ADDED Requirements

### Requirement: 平台成品必须安全暂存并满足带余量的体积预算
系统 MUST 提供默认只预览、显式 `--write` 才执行的平台发布入口，并 MUST 只向位于允许暂存范围内的全新输出目录写入。成品 SHALL 完整保留插件共享 Playwright、OpenSpec、Skills、脚本、当前平台 Chromium/FFmpeg、许可和重建后的完整性清单，同时 MUST 排除其他四个平台的元数据、清单和浏览器资产。macOS ARM64、macOS x64、Linux x64、Linux ARM64 与 Windows x64 成品大小 MUST 分别不超过 260、260、330、420、340 MiB；任一条件不满足时 MUST 阻止发布并清理未完成暂存目录。（D-10、D-13、D-16，A-07、A-12、A-14）

#### Scenario: 预览平台成品不产生写入
- **WHEN** 调用方提供受支持平台键和安全输出路径但未传入 `--write`
- **THEN** 系统只返回平台键、输出路径、体积预算、预期排除平台和瘦身步骤，不创建目录或修改规范源资产

#### Scenario: 生成只包含一个平台的完整成品
- **WHEN** 调用方显式使用 `--write` 向不存在的安全暂存目录生成平台成品
- **THEN** 系统复制所有共享插件内容，只保留目标平台元数据和资产，重建共享与该平台清单，并输出实际字节数、预算与余量
- **AND** 成品结构校验能够识别平台成品模式，不要求其他四个平台文件，同时确认它们没有残留

#### Scenario: 输出越界、已存在或成品超预算
- **WHEN** 输出路径越出允许暂存根、指向仓库或用户主目录、已经存在，或生成后的实际体积超过当前平台预算
- **THEN** 系统以中文错误停止，不覆盖已有文件，不保留半成品，也不修改仓库规范源资产

#### Scenario: Linux ARM64 原生去除调试符号
- **WHEN** `linux-arm64` 原生 Runner 显式生成平台成品
- **THEN** 系统只对暂存成品中的 Chromium headless shell 去除调试符号，证明规范源摘要未变，再重建成品清单并真实启动 Chromium 产生截图
- **AND** 缺少原生工具、调试符号仍残留、摘要重建失败或浏览器无法启动时阻止发布

#### Scenario: 其他平台不执行 Linux ARM64 二进制改写
- **WHEN** 当前原生平台不是 `linux-arm64` 或目标成品不是 `linux-arm64`
- **THEN** 系统不得执行 Linux ARM64 去符号步骤，也不得交叉修改该平台规范源或暂存二进制
