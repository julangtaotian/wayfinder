## MODIFIED Requirements

### Requirement: 持续集成必须复用统一入口
GitHub Actions MUST 使用满足根 `engines.node` 最低要求的 Node.js 版本，并 MUST 通过根 npm 脚本复用同一验证编排。每次运行 MUST 先在一个 Linux x64 任务执行一次共享作用域；共享成功后，五平台矩阵 MUST 使用仓库内固定 Playwright CLI 在源码目录之外的有界暂存中重建唯一目标平台资产和插件成品，再分别执行平台作用域、平台打包与报告上传。平台准备 MUST 不依赖仓库 LFS 指针或真实平台二进制，MUST 保持固定版本、目标平台完整性、许可、真实浏览器冒烟和发布包运行期离线合同，并 MUST 在下载或校验失败时清理本次暂存。普通 push/PR MUST 只上传五份小型报告，不上传完整大型平台成品，不增加 cache、schedule 或写权限。共享失败 MUST 阻止平台矩阵开始，且同一精确提交的共享任务与全部五个平台任务成功前 MUST NOT 报告跨平台发布通过。（D-07、D-09、D-11、D-12、D-13；A-03、A-04、A-05）

#### Scenario: CI 触发验证
- **WHEN** push 或 pull request 触发验证工作流
- **THEN** 工作流以 Node.js 20.19.0 执行一次共享作用域，并在其成功后执行 macOS ARM64/x64、Linux ARM64/x64、Windows x64 五个平台作用域

#### Scenario: 共享验证失败
- **WHEN** 共享作用域中的任一阶段失败
- **THEN** 共享任务返回失败，依赖它的五平台矩阵不得开始

#### Scenario: 平台验证或打包失败
- **WHEN** 任一平台的下载、许可、专属测试、目标完整性、浏览器冒烟、打包或报告上传失败
- **THEN** 工作流保留该平台失败，精确清理本次暂存，且本次精确提交不得标记五平台交付证据通过

#### Scenario: CI 重建目标平台资产
- **WHEN** 平台 runner 在不包含平台二进制的源码 checkout 上准备目标 Playwright 运行包
- **THEN** 构建器使用固定 Playwright 1.62.1 CLI 下载对应主机资产，在允许的外部暂存目录生成独立完整性清单和单平台插件成品后再进入平台验证

#### Scenario: 普通 CI 控制大型产物成本
- **WHEN** 五个平台任务完成成品结构、体积、完整性和真实浏览器验证
- **THEN** 每个平台只上传对应 `package-report.json`，工作流不上传完整浏览器成品、不启用缓存、不增加定时触发或写权限

#### Scenario: 人工收集真实 Codex 安装证据
- **WHEN** 用户显式触发五平台安装证据开关
- **THEN** 系统复用原五平台矩阵，在 `outputs/` 安装固定 Codex CLI，从本地复制的完整 marketplace 隔离安装插件，并以新会话模型可见输入确认技能加载
- **AND** 系统不读取登录态或 API 密钥、不调用模型，在不可达代理环境从已安装缓存启动 Chromium，只把小型安装报告加入原报告 artifact；普通 push/PR 不执行该步骤

#### Scenario: 平台资产重建失败
- **WHEN** 官方下载连续三次失败或超时、许可补齐失败、路径越界、完整性检查失败或成品不匹配当前原生平台
- **THEN** 构建器以稳定 `code`、`status` 和 `target` 失败关闭，清理本次暂存，不修改源码目录且不得继续验证、打包或上传
