## Context

现有验证链由需求 `V-*`、验收映射、可选 `test-plan.md` 和 Markdown 验证说明组成。`validate-requirement-decisions.mjs` 只在 precomplete 阶段检查一个简单持久路径，`validate-test-plan.mjs` 在 complete 阶段验证测试文件与定位，却不证明命令执行；`check-change.mjs` 正确保持项目命令 `executed: false`。`finalize-change.mjs` 先归档再更新需求状态，尚未迁移证据引用或执行归档后审计。UI Review 状态已经包含运行身份，报告渲染没有完整消费这些字段。

本变更同时影响路径、临时目录、子进程、包管理器入口、机器诊断和外部 CI 证据，按共享清单标记为跨平台高风险。实现必须继续使用插件内置 OpenSpec、Node.js 标准库、安全项目根和 outputs 隔离规则。（D-13、D-14，A-08、A-09）

## Goals / Non-Goals

**Goals:**

- 用一个受控执行入口生成可被完成门禁复算的本地自动验证证据，并以计划测试定位命中保护零测试。（D-02、D-03，A-01）
- 让证据与当前工作区、TC-* 和 V-* 形成稳定关联，同时保持完成阶段零重跑。（D-04、D-05、D-07，A-02、A-03）
- 在现有完成入口内完成引用预览、归档迁移、状态更新、归档后审计和部分失败恢复信息。（D-10、D-11，A-04、A-05）
- 让 UI Markdown 和状态 JSON 共享同一组运行身份事实。（D-12，A-07）

**Non-Goals:**

- 不提供恶意篡改防护、数字签名、远程 CI API 认证或完整日志长期存储。（D-06、D-13、D-15）
- 不改变业务测试框架，不自动安装依赖，不在完成或归档阶段重跑命令。（D-05、D-13、D-15）
- 不自动迁移全部历史需求；本轮只提供检测、警告和当前变更归档时的正确写入。（D-08、D-15）

## Decisions

### 1. 使用“持久清单 + 临时完整日志”双层证据

新增插件脚本 `verification-evidence.mjs`，同时提供可测试的纯函数和 CLI。持久清单固定写入所选活动变更的 `evidence/<V-ID>.json`，随 OpenSpec 归档；stdout/stderr 完整日志写入 `outputs/verification-evidence/<change>/<V-ID>/`，清单只保存大小、SHA-256、截断后的无敏感摘要和相对路径。（D-02、D-13，A-01、A-08）

选择该结构是因为 JSON 适合确定性校验，Markdown 适合人类解释，而完整日志可能很大且含环境噪声，不适合长期进入变更目录。替代方案“只增强 verification.md”仍无法证明真实执行；“把完整日志提交到变更”会放大仓库并增加敏感信息风险。

证据 schema 首版为整数版本 1，核心字段为：`schemaVersion`、`evidenceId`、`kind`、`status`、`requirement`、`change`、`command`、`locator`、`locatorMatches`、`workspaceFingerprint`、`git`、`startedAt`、`completedAt`、`exitCode`、`logs`、`artifacts`。JSON 使用稳定键顺序和换行，写入前校验目标仍位于真实变更目录。（D-04、D-09，A-02、A-03）

### 2. 本地执行采用显式写入、无 shell argv 与精确定位命中

CLI 默认只返回 `readyToWrite`、规范化命令和预计路径；只有 `--write` 才启动命令。`--` 后所有 token 作为 executable/argv 传入，禁止拼接 shell 字符串。`node` 统一替换为当前 `process.execPath`；npm 场景优先解析 `npm_execpath` 或当前 Node 安装内的 npm JavaScript 入口，Windows 无入口时稳定阻断，绝不直接启动 `.cmd`。（D-03、D-14，A-01、A-09）

执行过程同时把 stdout/stderr 流式写入有界日志并统计精确 locator 文本。passed 的必要条件为“进程成功启动、退出码 0、locatorMatches > 0”；其他结果可以保留失败清单用于诊断，但不得覆盖已有 passed 清单，除非调用方显式选择同一证据的更新且新执行完成。（D-03、D-05，A-01、A-02）

选择显式 locator 而不是通用解析 Vitest/Jest/Node 输出，是因为各 runner 格式和本地化不稳定；测试方案已经要求稳定定位，精确命中能用同一合同保护零测试。替代方案“只信退出码”会被 `passWithNoTests` 等配置绕过；“维护所有 runner 解析器”超出首版。

### 3. 工作区指纹基于可执行项目内容，不包含生命周期噪声

指纹器按规范化项目相对路径排序，对安全范围内文件的路径、大小和 SHA-256 汇总。它排除 `.git`、`outputs`、依赖/缓存、OpenSpec 活动与归档变更、需求验证状态文档以及机器证据自身；保留业务源码、测试、配置、package/lockfile 和共享插件实现。证据额外记录需求、test-plan、目标测试和可选受影响文件的独立摘要，完成门禁逐项复算。（D-04，A-02、A-03）

这样，验证后修改业务实现、测试或命令会使证据过期，而把 V-* 从计划改为通过、写 verification.md、生成 JSON 或迁移归档前缀不会自我失效。替代方案“记录 HEAD”无法覆盖未提交实现，也会因提交证据文档而误判；“指纹整个仓库”会被生命周期写入形成循环。

为降低排除范围过宽风险，排除表集中、机器可见并以 fixture 断言：实现/测试/package 变化必须失效，需求状态/证据/归档路径变化不得失效。（D-04、D-14，A-02、A-09）

### 4. 新合同显式启用，证据解析复用统一模块

在 `.openspec.yaml` 增加稳定 `verification_evidence: required` 元数据。`check-change`、需求校验和测试方案完成校验都从同一证据模块读取 schema、拆分多路径、校验范围和新鲜度，避免三个入口各自解释 JSON。TC-* 的自动用例继续引用 V-*；V-* 的类型决定是否必须存在同 ID `local-command`，视觉类型复用 UI Review 状态，external-ci 保留外部来源标志。（D-05～D-09，A-02、A-03、A-06）

旧变更没有该元数据时保持既有完成语义，但项目检查扫描 Markdown-only 与失效路径并给稳定 warning code。新合同绝不因兼容分支跳过 JSON。选择显式元数据而不是按文件是否存在隐式启用，可避免半成品 evidence 目录意外改变历史行为。（D-08，A-06）

多路径解析只接受反引号包裹的项目相对路径和明确分隔符，URL 单独分类；解析后逐项规范化、去重和检查。自然语言中的任意斜杠片段不作为路径，以免误判说明文字。（D-09，A-03）

### 5. 完成入口预计算改写，归档后以实际目标提交需求

预览阶段根据 `check-change` 的安全活动路径和预计 archive target 生成引用改写表，不修改文件。正式执行仍先通过 precomplete，再调用内置 OpenSpec 归档；以引擎返回的 `archivedAs` 为准构造最终前缀，重新核对预览与实际目标，然后在内存中同时生成“已验收状态 + 引用迁移”的需求内容，采用同目录临时文件和 rename 原子写入。（D-10，A-04）

写入后立即以实际归档变更路径运行 requirement complete、test-plan complete 和证据完整性审计。全部通过才返回 `ok: true`。重复调用若活动变更不存在但唯一归档目标与需求关联一致，则进入 recovery/audit 分支，不再次归档或添加日期。（D-10、D-11，A-04、A-05）

OpenSpec 目录移动与需求文件无法形成真正跨文件事务。因此归档成功后的任何写入或审计失败都返回 `archive_partial_failure`、`archiveTarget`、`rewrites`、`failedStage` 和恢复命令参数；不尝试回滚已经同步的主规格，也不把用户确认当成跳过门禁。（D-11，A-05）

### 6. UI 报告身份由完成状态统一投影

`materializeReport` 不再分别拼装状态和报告事实，而是先构造一个规范化 report context：schemaVersion、runId、scenarioFingerprint、capture、baselineRunId、statePath、evidence paths 和摘要。状态写入完成后，报告渲染只消费该 context；缺少必需身份字段直接失败。（D-12，A-07）

Markdown 头部用稳定字段展示相对路径，不写绝对工作区。状态 JSON 仍是复验机器源，Markdown 只是同源的人类投影。替代方案“报告再读取状态文件”增加 I/O 和部分写入窗口，同源 context 更容易做纯函数一致性测试。

### 7. 跨平台验证分三层，机器输出优先稳定字段

聚焦测试覆盖 POSIX/Windows 分隔符、符号链接、带空格和中文路径、npm JavaScript 入口、零测试、流式日志清理、结构化错误、归档幂等与恢复。全量本地验证覆盖插件结构、OpenSpec、UI Review 和历史兼容。真实 CI 必须在同一提交上覆盖 Linux x64/ARM64、Windows x64、macOS Intel/ARM64；没有完整矩阵时 V-06 保持计划。（D-14，A-09）

错误对象以 `code`、`status`、`target`、`evidenceId`、`locatorMatches`、`fresh`、`archiveTarget` 和 `failedStage` 为稳定断言，中文消息只承载解释。fixture 和日志全部进入 `outputs/verification-evidence-integrity/` 或测试注入的 outputs 子目录，成功与失败均只清理本次创建范围。（D-13、D-14，A-08、A-09）

## Risks / Trade-offs

- [首版证据不能抵抗恶意手改 JSON] → 明确可靠性边界为插件真实捕获、内容摘要与当前工作区复算；不宣称签名或第三方认证。（D-06、D-15）
- [测试输出可能不包含定位或被截断] → locator 同时扫描 stdout/stderr 流，缺失一律失败关闭；不猜测 runner 成功。（D-03）
- [工作区排除表可能漏掉影响测试的文件] → 对源码、测试、配置、package/lockfile 默认纳入，排除项使用集中合同和正反 fixture。（D-04）
- [完整日志可能含敏感信息] → 只在 outputs 保存、清单仅保留摘要与 digest，不记录环境变量；文档提示验证命令不得打印秘密。（D-13）
- [归档成功后需求写入失败会产生部分状态] → 返回实际归档目标和幂等恢复分支，不尝试危险回滚或隐藏失败。（D-11）
- [历史兼容造成新旧可靠性等级并存] → 机器输出和 Markdown 明确 `legacy`、`external`、`local-command`，新合同只走严格分支。（D-06、D-08）
- [Windows 包管理器入口无法解析] → 优先 JS 入口并稳定阻断，不启 shell 或直启 `.cmd`；五平台矩阵提供外部证据。（D-14）

## Migration Plan

1. 先新增证据纯函数、schema、指纹器和聚焦合同测试，不接入完成门禁。
2. 增加 CLI 预览/执行、outputs 日志与跨平台启动回归，确认失败不会覆盖 passed 证据。
3. 在本变更 `.openspec.yaml` 启用 `verification_evidence: required`，接入需求、测试方案和 check-change 的同一只读校验模块。
4. 增加完成预览、归档改写、归档后审计与 recovery 分支；用隔离 OpenSpec fixture 验证部分失败。
5. 增加 UI 报告同源 context 与自识别字段，再同步 Skills、模板、README/结构合同。
6. 完成聚焦、全量、官方 validators 和真实五平台矩阵后，才将需求与测试方案标为完成。

回滚时可停止新变更启用元数据和 CLI 调用，但保留已经生成并归档的 JSON 与报告字段；不得删除历史证据。若完成入口回退，需先保证其仍能读取含新字段的需求和变更目录。（D-08、D-13、D-15）
