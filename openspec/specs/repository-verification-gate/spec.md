# repository-verification-gate Specification

## Purpose
为本地开发和持续集成提供同一套可重复、可定位且默认只读的仓库验证门禁，避免各环境选择不同检查而产生虚假通过。

## Requirements

### Requirement: 仓库必须提供统一完整验证入口

系统 MUST 提供根级 `npm run verify` 命令，并 MUST 以稳定顺序覆盖自动测试、仓库体积预算、插件结构、全部 OpenSpec 活动变更和主规格严格校验、归档变更任务完成检查、内置 OpenSpec 版本及运行时完整性、Playwright 完整性和真实浏览器冒烟；任何阶段失败时 MUST 返回非零状态并标明失败阶段。系统 MUST 通过同一编排提供 `shared` 与 `platform` 作用域，且两个作用域的测试并集 MUST 等于完整测试集合，未知作用域或零测试 MUST 失败关闭。

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

系统 MUST 将 `verify` 作为确定性只读检查执行，不得生成或更新受管文件、完整性清单、规划 artifact 或业务内容。

#### Scenario: 连续执行统一验证

- **WHEN** 开发者在未修改仓库的情况下连续两次执行 `npm run verify`
- **THEN** 两次均获得相同的验证结论且工作区内容不因验证而变化

### Requirement: 持续集成必须复用统一入口

GitHub Actions MUST 使用满足根 `engines.node` 最低要求的 Node.js 版本，并 MUST 通过根 npm 脚本复用同一验证编排。每次运行 MUST 先在一个 Linux x64 任务执行一次共享作用域；共享成功后，五平台矩阵 MUST 使用仓库内固定 Playwright CLI 在源码目录之外的有界暂存中重建唯一目标平台资产和插件成品，再分别执行平台作用域、平台打包与报告上传。平台准备 MUST 不依赖仓库 LFS 指针或真实平台二进制，MUST 保持固定版本、目标平台完整性、许可、真实浏览器冒烟和发布包运行期离线合同，并 MUST 在下载或校验失败时清理本次暂存。普通 push/PR MUST 只上传五份保留 14 天的小型报告，不上传完整大型平台成品，不增加 cache、schedule 或写权限。共享失败 MUST 阻止平台矩阵开始，且同一精确提交的共享任务与全部五个平台任务成功前 MUST NOT 报告跨平台发布通过。

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
- **THEN** 每个平台只上传对应 `package-report.json` 且保留 14 天，工作流不上传完整浏览器成品、不启用缓存、不增加定时触发或写权限

#### Scenario: 人工收集真实 Codex 安装证据

- **WHEN** 用户显式触发五平台安装证据开关
- **THEN** 系统复用原五平台矩阵，在 `.frontend-ai-workflow/cache/platform-install-codex/` 安装固定 Codex CLI，并在 `.frontend-ai-workflow/runs/platform-install-evidence/` 生成小型报告
- **AND** 系统不读取登录态或 API 密钥、不调用模型，在不可达代理环境从已安装缓存启动 Chromium；普通 push/PR 不执行或上传该证据

#### Scenario: 平台资产重建失败

- **WHEN** 官方下载连续三次失败或超时、许可补齐失败、路径越界、完整性检查失败或成品不匹配当前原生平台
- **THEN** 构建器以稳定 `code`、`status` 和 `target` 失败关闭，清理本次暂存，不修改源码目录且不得继续验证、打包或上传

### Requirement: 聚焦验证与完整验证必须保持证据分层

系统 SHALL 提供稳定聚焦入口以缩短日常反馈，但聚焦结果 MUST 明确其覆盖范围，且 MUST NOT 被报告为统一发布验证或真实五平台 CI 通过。

#### Scenario: 聚焦入口通过

- **WHEN** 仓库治理、工作流核心或平台运行时聚焦测试成功
- **THEN** 结果 SHALL 报告所运行测试集合，发布状态仍 SHALL 等待统一验证和适用的外部矩阵

#### Scenario: 聚焦入口没有发现测试

- **WHEN** 入口配置漂移导致零测试被执行
- **THEN** 命令 MUST 返回非零状态，不得以空集合报告成功

### Requirement: 持续集成必须取消同一引用的过时运行

GitHub Actions MUST 以工作流和 Git 引用组成并发组，并 MUST 在同一组出现新运行时取消旧的等待或在途运行。工作流 MUST 保留 push 与 pull request 触发、只读权限和不同引用的独立边界，并 MUST NOT 增加定时触发。

#### Scenario: 同一引用连续更新

- **WHEN** 同一工作流和同一 Git 引用已有等待或运行中的验证，且新提交触发另一运行
- **THEN** 旧运行被取消，最新运行继续执行

#### Scenario: 不同引用分别验证

- **WHEN** push 与 pull request 使用不同 Git 引用，或两个分支分别触发工作流
- **THEN** 它们不共享同一并发组，任一运行不得取消另一个引用的必要检查

#### Scenario: 工作流触发边界

- **WHEN** 检查 Validate 工作流的事件和权限配置
- **THEN** push、pull request 与 `contents: read` 保持存在，且没有 schedule、路径忽略、缓存或新增写权限

### Requirement: 插件源码仓库必须呈现生命周期健康状态

当仓库存在生命周期配置时，项目健康检查 MUST 无论仓库属于业务项目还是插件源码仓库，都返回 schemaVersion、mode、eventCount、diagnostics、runtimeIgnored 和 migrationRequired。插件仓库专属检查不得把 lifecycle 置空或只按旧布局推断迁移要求。

#### Scenario: 插件仓库仍处于 legacy-readonly
- **WHEN** 插件源码仓库配置 lifecycleMode 为 legacy-readonly
- **THEN** 健康摘要 MUST 显示实际 mode 并标记需要迁移，不得返回 lifecycle null

#### Scenario: 插件仓库已切换 v2
- **WHEN** 插件源码仓库配置 lifecycleMode 为 v2 且历史有效
- **THEN** 健康摘要 MUST 返回 v2、事件计数和运行时忽略状态，且不得套用业务项目的受管文件要求

### Requirement: 平台成品裁剪必须可复算且不破坏运行时

系统 MUST 只在单平台成品副本中移除明确白名单内的非运行时元数据，并 MUST 保留 package manifest、许可证与声明、可执行代码、浏览器、FFmpeg、平台元数据和完整性文件。规范源码 MUST 在打包前后保持不变；裁剪后仍 MUST 通过目标平台完整性、结构、预算和真实 Chromium 冒烟。

#### Scenario: 成品移除白名单元数据

- **WHEN** OpenSpec 或 Playwright 生产依赖闭包包含类型声明、源码映射或说明性文本
- **THEN** 平台打包器只从成品副本移除命中白名单的文件并记录规则、文件数和逻辑字节数
- **AND** 源运行时同名文件及其摘要保持不变

#### Scenario: 许可证或运行时文件不进入裁剪范围

- **WHEN** 候选文件是 package manifest、LICENSE、NOTICE、第三方声明、JavaScript 运行时代码、浏览器、FFmpeg、平台元数据或完整性文件
- **THEN** 系统 MUST 保留该文件，不得为了满足体积预算扩大裁剪规则

#### Scenario: 裁剪后验证失败

- **WHEN** 成品在裁剪后出现许可、完整性、结构、预算或浏览器冒烟失败
- **THEN** 系统 MUST 阻止发布成品并清理本次有界暂存，不修改规范源码或既有成品

### Requirement: 平台包体报告必须解释组成与余量

平台报告 MUST 保留既有总量、预算、平台排除、去符号和冒烟字段，并 MUST 以版本化结构新增裁剪统计、裁剪前估算、互斥包体组成、预算余量比例和稳定健康级别。组成总量、裁剪量和余量 MUST 可由报告字段复算，且预算阈值不得按当前包体静默放宽。

#### Scenario: 生成可复算报告

- **WHEN** 单平台成品通过全部打包门禁
- **THEN** 报告的组成之和等于最终插件逻辑体积，裁剪前估算等于最终体积与移除字节之和，余量等于预算减最终体积
- **AND** 健康级别只根据固定余量比例阈值确定

#### Scenario: 重复构建相同输入

- **WHEN** 相同平台、规范源码、固定运行时和预算重复生成报告
- **THEN** 裁剪规则、组成键、文件计数、逻辑字节和健康级别保持确定顺序与一致语义

### Requirement: 本地统一验证必须生成精确提交回执

系统 MUST 提供版本化的本地统一验证回执入口。入口默认 MUST 只预览目标、精确提交和输出位置，不执行验证或写入文件；只有显式写入时，系统才可在工作区干净且当前提交与调用方提供的 40 位 revision 完全一致后，以无 shell 参数数组固定执行一次完整统一验证。全部阶段成功且执行后 Git 状态未漂移时，系统 MUST 向既有忽略运行目录原子写入包含 revision、作用域、平台、已完成阶段、总耗时和证据摘要的 schema v1 回执。系统 MUST NOT 接受任意验证命令、持久化完整输出、覆盖既有目标或在失败后留下通过回执。

#### Scenario: 预览本地验证回执

- **WHEN** 调用方提供合法目标仓库和精确 revision，但未显式请求写入
- **THEN** 系统返回将执行的固定统一验证、目标回执和前置条件
- **AND** 系统不启动验证子进程、不创建运行目录或回执

#### Scenario: 干净精确提交完成一次验证

- **WHEN** 工作区干净、当前提交与请求 revision 一致，且固定完整统一验证成功
- **THEN** 系统只执行该验证一次，并原子生成状态为 `passed` 的 schema v1 回执
- **AND** 回执包含稳定 `code`、`scope`、平台、阶段、总耗时和受控证据摘要

#### Scenario: 前置条件或验证失败

- **WHEN** revision 非法或不匹配、工作区脏、固定步骤失败、执行后工作区漂移、输出越界或目标已存在
- **THEN** 系统以稳定 `code`、`status` 和 `target` 失败关闭
- **AND** 系统不得发布通过回执、执行调用方提供的任意命令或覆盖已有证据
