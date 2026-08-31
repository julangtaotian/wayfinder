# repository-verification-gate Specification

## Purpose
为本地开发和持续集成提供同一套可重复、可定位且默认只读的仓库验证门禁，避免各环境选择不同检查而产生虚假通过。

## Requirements

### Requirement: 仓库必须提供统一完整验证入口

系统 MUST 提供根级 `npm run verify` 命令，并 MUST 以稳定顺序覆盖自动测试、仓库体积预算、插件结构、全部 OpenSpec 活动变更和主规格严格校验、归档变更任务完成检查、内置 OpenSpec 版本及运行时完整性、Playwright 完整性和真实浏览器冒烟；任何阶段失败时 MUST 返回非零状态并标明失败阶段。系统 MUST 通过同一编排提供 `shared` 与 `platform` 作用域，且两个作用域的测试并集 MUST 等于完整测试集合，未知作用域或零测试 MUST 失败关闭。（D-02、D-03、D-07；A-01、A-02、A-03）

#### Scenario: 完整验证全部通过

- **WHEN** 开发者在完整仓库中执行 `npm run verify`
- **THEN** 所有验证阶段按声明顺序执行并最终返回零状态

#### Scenario: 子验证失败

- **WHEN** 任一测试、仓库体积预算、结构、活动或主规格、归档任务、版本或完整性检查返回失败
- **THEN** 当前作用域停止后续阶段、返回真实非零状态并输出作用域与失败阶段

#### Scenario: 归档任务检查独立执行

- **WHEN** 完整或共享作用域中的活动变更与主规格严格校验通过
- **THEN** 统一入口继续运行 `validate --archived --no-interactive`，并以稳定阶段 id `openspec-archived` 记录结果

#### Scenario: 共享与平台作用域分区

- **WHEN** CI 分别调用共享与平台作用域
- **THEN** 共享作用域运行全部非平台测试和仓库治理阶段，平台作用域运行非空平台测试、目标 Playwright 完整性与真实浏览器冒烟，且两者不遗漏完整测试集合

#### Scenario: 作用域无效或没有测试

- **WHEN** 调用方传入未知作用域，或测试分组漂移导致共享或平台测试集合为空
- **THEN** 命令以稳定 `code`、`scope`、`status` 和非零退出状态失败，不得回退完整作用域或报告成功

### Requirement: 统一验证默认不得修改仓库

系统 MUST 将 `verify` 作为确定性只读检查执行，不得生成或更新受管文件、完整性清单、规划 artifact 或业务内容。（D-02、D-05；A-02、A-05）

#### Scenario: 连续执行统一验证

- **WHEN** 开发者在未修改仓库的情况下连续两次执行 `npm run verify`
- **THEN** 两次均获得相同的验证结论且工作区内容不因验证而变化

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

### Requirement: 聚焦验证与完整验证必须保持证据分层

系统 SHALL 提供稳定聚焦入口以缩短日常反馈，但聚焦结果 MUST 明确其覆盖范围，且 MUST NOT 被报告为统一发布验证或真实五平台 CI 通过。（D-08、D-13；A-06、A-08）

#### Scenario: 聚焦入口通过

- **WHEN** 仓库治理、工作流核心或平台运行时聚焦测试成功
- **THEN** 结果 SHALL 报告所运行测试集合，发布状态仍 SHALL 等待统一验证和适用的外部矩阵

#### Scenario: 聚焦入口没有发现测试

- **WHEN** 入口配置漂移导致零测试被执行
- **THEN** 命令 MUST 返回非零状态，不得以空集合报告成功

### Requirement: 持续集成必须取消同一引用的过时运行

GitHub Actions MUST 以工作流和 Git 引用组成并发组，并 MUST 在同一组出现新运行时取消旧的等待或在途运行。工作流 MUST 保留 push 与 pull request 触发、只读权限和不同引用的独立边界，并 MUST NOT 增加定时触发。（D-04、D-05；A-04、A-06）

#### Scenario: 同一引用连续更新

- **WHEN** 同一工作流和同一 Git 引用已有等待或运行中的验证，且新提交触发另一运行
- **THEN** 旧运行被取消，最新运行继续执行

#### Scenario: 不同引用分别验证

- **WHEN** push 与 pull request 使用不同 Git 引用，或两个分支分别触发工作流
- **THEN** 它们不共享同一并发组，任一运行不得取消另一个引用的必要检查

#### Scenario: 工作流触发边界

- **WHEN** 检查 Validate 工作流的事件和权限配置
- **THEN** push、pull request 与 `contents: read` 保持存在，且没有 schedule、路径忽略、缓存或新增写权限
