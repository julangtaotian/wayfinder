# REQ-2026-026：验证证据完整性与归档可追溯性

## 基本信息

- 状态：已验收
- 提出人：用户
- 负责人：Codex
- 目标版本：0.15.x
- 关联页面或模块：验证证据、需求完成门禁、变更归档、前端测试方案、UI Review 报告、跨平台验证
- 关联变更：`harden-verification-evidence-integrity`

## 背景与目标

现有插件已经能够生成需求、测试方案、验证记录、UI Review 报告和变更归档文档，但多数完成判断仍依赖 Markdown 中的“通过”文字和证据路径是否存在。该方式能形成过程记录，却不能确定测试命令是否真的执行、是否发现了计划中的测试、证据是否对应当前工作区，也不能保证活动变更归档后需求中的证据引用继续有效。UI Review 的 Markdown 报告还缺少运行 ID、场景指纹、实际采集器和状态文件等关键自识别字段，脱离同目录上下文后难以独立复核。

本需求在不重建测试平台、不重复执行完成阶段命令、不修改业务源码的前提下，为现有验证链增加一层轻量、版本化、可复算的机器证据。首版把本地自动验证的真实执行、完成门禁对持久证据的消费、归档引用迁移及归档后审计、UI Review 报告自描述串成闭环，使“已通过”从文字声明升级为可追溯、可判旧、可归档复验的结论。

## 决策台账

| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 首版能力组合 | 已确认 | 机器证据清单与完成门禁作为同一 P0 能力实现；归档稳定引用同为 P0；UI Review Markdown 自识别为 P1，但纳入同一首版闭环 | 用户要求重新论证四项修复并确认开始实现 |
| D-02 | 机器证据载体 | 已确认 | 本地自动验证由插件受控执行入口生成版本化 JSON 清单，持久文件位于 `openspec/changes/<change>/evidence/<V-ID>.json` 并随变更归档；Markdown 继续负责人类说明 | 对现有 Markdown 可靠性审计与首版范围讨论 |
| D-03 | 本地证据来源 | 已确认 | 受控入口使用无 shell 的参数数组真实执行聚焦命令，记录命令、工作目录、时间、退出码、计划测试定位命中数、工作区指纹、Git 来源和日志摘要；退出成功但零定位命中不得生成通过证据 | 用户要求保护零测试与生成测试，并复验复杂场景 |
| D-04 | 证据新鲜度 | 已确认 | 机器证据记录排除生命周期文档、证据目录和临时 outputs 后的项目工作区指纹；完成门禁重新计算并拒绝与当前实现或测试不一致的过期证据 | 对“Markdown 存在不等于真实执行”的可靠性审计 |
| D-05 | 完成门禁边界 | 已确认 | 完成门禁只读取并验证已经持久化的证据，不在归档或完成时重跑测试、构建、浏览器或外部 CI；缺失、损坏、失败、零测试、未知版本、越界路径和过期证据均失败关闭 | 用户确认修复不得改变完成阶段的非重跑语义 |
| D-06 | 证据类型与信任级别 | 已确认 | 首版区分插件本地捕获的 `local-command`、现有 UI Review 状态证据和带 URL/提交/任务状态的 `external-ci` 引用；只有本地捕获证据自动证明命令执行，外部 CI 不联网复查时必须显式标记为外部来源，不伪装成本地验证 | 对真实 CI 与本地证据边界的既有项目规则 |
| D-07 | 验证记录关联 | 已确认 | 新需求和新变更中，标为“通过”的自动 V-* 必须关联同 ID 的有效机器证据；测试方案的 TC-* 继续关联 V-*，完成校验沿 TC → V → JSON 证据链核验；人工项不得伪装为自动证据 | 现有 `$frontend-test` D/A/V/TC 生命周期 |
| D-08 | 历史兼容 | 已确认 | 新门禁对本变更启用的新合同严格失败关闭；既有已归档需求与未声明机器证据合同的历史变更保持可读并给迁移警告，不批量改写历史事实，不把旧 Markdown 自动升级为机器已验证 | 用户关心对现有插件与历史数据的影响 |
| D-09 | 多证据路径 | 已确认 | 验证记录和验收映射允许引用多个安全项目相对路径，并逐项解析、规范化、去重和校验；不得通过标点拼接绕过存在性与范围检查 | 当前校验器只识别单一路径的审计结论 |
| D-10 | 归档引用迁移 | 已确认 | 完成预览列出从活动变更前缀到带日期归档前缀的确定性改写；正式归档成功后原子更新需求内受影响的证据引用和状态，并立即执行 complete 阶段归档审计 | 已发现历史需求引用活动变更目录后失效 |
| D-11 | 归档故障恢复 | 已确认 | 不覆盖无关文本，不改写项目外、其他变更或 URL 引用；归档成功但需求写入失败时返回稳定错误码、实际归档目标和可重复恢复动作，后续运行能够识别已归档目标并修复引用 | 现有归档与需求状态无法跨文件事务提交的约束 |
| D-12 | UI Review 报告自识别 | 已确认 | 确定性 Markdown 报告必须展示 schema 版本、runId、scenarioFingerprint、实际 capture、baselineRunId、状态文件路径、关键证据路径及状态/证据摘要；状态 JSON 继续作为机器事实来源 | 对 UI Markdown 脱离目录后无法独立识别的审计结论 |
| D-13 | 产物与依赖边界 | 已确认 | 生产实现仅使用 Node.js 标准库；持久机器证据随变更保存，完整命令日志和临时验证产物只写 `outputs/<验证主题>/`；不新增数据库、远程服务、签名系统、根目录依赖或业务项目测试依赖 | 项目实现规则与用户要求保持根目录干净 |
| D-14 | 跨平台高风险标记 | 已确认 | 跨平台高风险：是；命中路径、临时目录、子进程、包管理器入口、机器可读诊断和 CI 证据；受影响平台以仓库 Linux x64/ARM64、Windows x64、macOS Intel/ARM64 矩阵为准，聚焦回归、本地统一验证与真实矩阵分别记证 | 项目跨平台 CI 防回归规则 |
| D-15 | 明确排除 | 已确认 | 不建设日志平台、证据数据库、加密签名或远程 CI 查询；不在完成门禁自动重跑；不自动重写全部历史需求；不改变 OpenSpec 生命周期、公共 Skill 名称、业务源码和测试框架 | 用户确认修复应低影响接入现有插件 |

## 范围

### 包含

- 新增版本化机器证据 schema、路径安全校验、工作区指纹和确定性摘要。
- 新增本地验证证据受控执行入口，真实执行聚焦命令并以测试定位命中保护零测试通过。
- 扩展需求与测试方案完成校验，消费已持久化证据并识别缺失、损坏、失败、过期、越界和未知版本。
- 为新合同增加显式启用与历史兼容策略，旧归档记录只警告、不伪造机器验证结论。
- 支持验证记录和验收映射中的多个安全证据路径。
- 扩展完成预览、正式归档、需求引用改写、归档后完整审计和部分失败恢复信息。
- 为 UI Review Markdown 增加运行身份、采集方法、基线、状态文件和证据摘要。
- 增加聚焦合同测试、归档 fixture、UI 报告回归、跨平台路径/子进程/结构化诊断回归和全量验证。

### 不包含

- 新建远程用例平台、证据数据库、日志检索平台、覆盖率看板或管理后台。
- 对机器证据做加密签名、防恶意篡改或第三方可信时间戳认证。
- 在完成、归档或审计阶段自动重跑测试、构建、浏览器采集或真实 CI。
- 通过网络 API 查询 GitHub Actions 或其他 CI 服务并验证远程真实性。
- 自动补写、重算或批量迁移全部历史需求和归档变更中的验证事实。
- 自动安装或升级 Vitest、Jest、Playwright、包管理器及业务项目依赖。
- 修改业务源码、降低测试断言、允许生成测试覆盖手写专用测试，或改变现有公共 Skill 名称和调用方式。

## 当前行为

- 需求验证记录和验收映射以 Markdown “通过”文字为主，完成阶段主要验证状态、引用和单一证据路径存在性。
- `check-change` 明确不执行项目测试或构建，输出中的 `executed: false` 能说明门禁没有重跑，但无法证明引用的验证此前真实执行。
- `$frontend-test` 要求确认测试定位且零测试失败，但该约束主要存在于 Skill 指令和测试方案文本，没有通用机器证据供完成门禁复算。
- 验证路径解析偏向单一简单路径；同一单元格含多个路径时可能无法逐项确认。
- `finalize-change` 归档 OpenSpec 变更并更新需求状态，但不改写需求中仍指向活动变更目录的证据路径。
- UI Review 状态 JSON 已保存 runId、场景指纹、采集器和证据，生成的 Markdown 报告没有完整展示这些自识别信息。

## 期望行为

### 场景：执行聚焦测试并形成机器证据

- 前置条件：已确认需求、活动变更、V-* 验证记录和可执行聚焦命令存在，自动用例声明稳定测试定位。
- 当：工作流通过受控证据入口显式执行该命令。
- 则：入口无 shell 执行参数数组，保留真实退出码和必要输出摘要，计算当前工作区指纹，并在变更 evidence 目录原子写入同 ID 的版本化 JSON。
- 并且：只有退出码为零且计划测试定位至少命中一次时状态可以是 passed。
- 异常或边界：启动失败、非零退出、输出截断无法判断、零定位命中、危险路径或重复覆盖不一致证据时返回非零且不得写成通过。

### 场景：完成门禁消费持久证据

- 前置条件：需求或变更显式启用机器证据合同，需求准备从待验证进入已验收。
- 当：运行 precomplete 或 complete 校验。
- 则：门禁读取 V-* 指向的 JSON，校验 schema、ID、结果、路径、命令、定位命中和工作区指纹，并把稳定字段输出到机器诊断。
- 并且：门禁只消费现有证据，`projectCommands.executed` 与外部命令执行仍为 false。
- 异常或边界：Markdown 写“通过”但 JSON 缺失、损坏、失败、零测试、未知版本或已过期时失败关闭。

### 场景：归档后证据引用保持有效

- 前置条件：活动变更已通过完成前门禁，需求中包含该变更下的 Markdown 和 JSON 证据引用。
- 当：先预览再显式执行统一完成入口。
- 则：预览展示精确引用改写；归档成功后需求中的活动路径被改为实际带日期归档路径，状态更新为已验收，并立即从归档目录执行 complete 审计。
- 并且：多个证据路径均能独立解析并在归档后存在，重复运行不会重复添加日期或改写无关引用。
- 异常或边界：目标冲突、引用越界、归档失败或需求写入失败时返回稳定错误和恢复上下文，不报告完整成功。

### 场景：历史记录保持兼容

- 前置条件：历史需求已经归档且从未声明机器证据合同，或仍含旧活动目录引用。
- 当：运行只读项目检查或历史完成审计。
- 则：系统保持历史内容不变，报告结构化迁移警告和失效引用，不把 Markdown 自动认定为机器已验证。
- 并且：新变更的严格门禁不能因历史兼容而降级。
- 异常或边界：用户未明确启动迁移变更时不得批量改写历史文档。

### 场景：UI Review Markdown 脱离目录仍可识别

- 前置条件：UI Review 通过默认 Playwright 或既有受支持采集器完成一次验收或复验。
- 当：生成确定性 Markdown 报告。
- 则：报告头部展示 schema 版本、runId、scenarioFingerprint、实际 capture、baselineRunId、状态文件和关键证据路径，并给出与状态 JSON 一致的摘要。
- 并且：报告只增强可读性，机器复验仍以状态 JSON 和既有场景合同为准。
- 异常或边界：缺少必需身份字段时报告生成失败关闭，不输出看似完整但无法追踪的通过报告。

### 场景：跨平台验证证据链

- 前置条件：实现涉及路径、outputs 临时目录、无 shell 子进程、包管理器入口、结构化错误和 CI 引用。
- 当：执行聚焦回归、本地统一验证和发布矩阵。
- 则：路径比较先规范化，Windows 不直接启动 `.cmd` 包装器，日志位于有界 outputs 子目录，诊断优先断言 code、status、target 和计数。
- 并且：五平台矩阵没有在同一提交上全部成功前，外部证据保持计划或阻断，不能由本地通过替代。
- 异常或边界：平台启动差异、清理失败或外部任务缺失必须分别记录原始错误和新增回归定位。

## 页面与交互

- 入口与操作路径：用户仍通过 `$frontend-test`、`$frontend-change`、UI Review 和统一完成入口工作；新增证据执行入口由这些 Skill 在需要持久自动验证时调用，不新增公共 Skill 名称。
- 字段、文案与默认值：机器字段使用稳定英文；人类错误和恢复提示使用中文；机器证据使用 `schemaVersion`、`evidenceId`、`kind`、`status`、`command`、`locatorMatches`、`workspaceFingerprint`、`git`、`startedAt`、`completedAt` 和 `artifacts` 等字段。
- 加载态、空态、错误态、禁用态：无图形界面；未执行或没有证据为空态，过期/损坏/失败证据为错误态，未显式 `--write` 时只预览且不创建持久文件。
- 权限与角色差异：只读检查和完成预览不写文件；命令执行、证据写入与归档必须由用户明确请求的现有工作流阶段触发。
- 设计稿链接：不适用。

## 交互状态矩阵

| 状态 | 覆盖决定 | 触发或前置条件 | 期望结果 | 验证方式 | 关联验收 | 不适用理由 |
| --- | --- | --- | --- | --- | --- | --- |
| 初始（已有数据） | 覆盖 | 存在新合同证据、旧 Markdown 证据、UI 状态和活动变更 | 稳定区分机器已验证、外部引用、历史兼容和待迁移状态，默认只读 | 自动 | A-01、A-03、A-06、A-08 | — |
| 用户操作 | 覆盖 | 用户要求执行验证、完成预览或正式归档 | 只有显式写入才生成证据或归档，成功结果可沿 TC/V/JSON/归档链追踪 | 自动 | A-01、A-02、A-04、A-05 | — |
| 刷新 | 覆盖 | 对相同工作区、同一 V-* 和同一变更重复校验或恢复 | 结果幂等，不重复加日期、不误改无关路径，证据新鲜度稳定 | 自动 | A-03、A-04、A-05、A-06 | — |
| 空态 | 覆盖 | Markdown 标为通过但没有机器证据，或外部 CI 尚未运行 | 新合同失败关闭；历史合同只给迁移警告；不得声称机器验证通过 | 自动 | A-02、A-06、A-09 | — |
| 错误态 | 覆盖 | 命令非零、零测试、证据损坏/越界/过期、归档部分失败或 UI 身份缺失 | 返回稳定分类和恢复信息，不重跑、不伪造通过、不覆盖无关文件 | 自动 | A-01、A-02、A-04、A-05、A-07、A-09 | — |
| 卸载 | 不适用 | 本能力是一次性命令与文件校验，不创建订阅、计时器或后台服务 | 命令结束后没有长生命周期资源；临时日志按有界 outputs 规则清理 | 自动 | — | 无常驻 UI 或后台生命周期。 |

## 接口与数据

- 接口文档链接：本变更的 OpenSpec delta specs、设计和测试方案。
- 请求方法与路径：插件内置 Node.js CLI 接收项目根、需求路径、活动/归档变更、V-*、测试定位和 `--` 后的参数数组；全部路径先规范化并限制在安全项目范围。
- 请求字段及空值语义：本地自动证据必须有 V-*、命令、定位和工作区指纹；外部 CI 必须有 URL、精确提交和任务状态，但未联网复查时明确保留外部来源标志；UI baseline 缺失时使用空值而非猜测。
- 响应字段及状态码：JSON 优先返回稳定 `ok`、`code`、`status`、`target`、`evidenceId`、`locatorMatches`、`fresh`、`archiveTarget`、`rewrites`、`warnings` 和 `errors`；失败返回非零。
- 鉴权、加解密或敏感信息要求：不上传源码和日志，不记录环境变量值、令牌或完整敏感输出；首版不提供加密签名，可靠性边界是插件真实捕获、内容摘要和当前工作区复算，不宣称防恶意篡改。

## 关联变更范围

| 变更 | 决策范围 | 验收范围 |
| --- | --- | --- |
| harden-verification-evidence-integrity | D-01、D-02、D-03、D-04、D-05、D-06、D-07、D-08、D-09、D-10、D-11、D-12、D-13、D-14、D-15 | A-01、A-02、A-03、A-04、A-05、A-06、A-07、A-08、A-09 |

## 修订记录

| 修订 | 日期 | 影响决策 | 影响验收 | 验证与任务处理 |
| --- | --- | --- | --- | --- |
| R-01 | 2026-08-18 | D-01～D-15 | A-01～A-09 | 用户确认开始实现；先建立已确认需求，机器证据、完成门禁、归档引用和 UI 报告自识别进入首版规划，验证保持计划。 |
| R-02 | 2026-08-18 | D-01～D-15 | A-01～A-09 | 建立并关联 `harden-verification-evidence-integrity`，启用必需独立测试方案；验证保持计划，等待 OpenSpec 规划完成。 |
| R-03 | 2026-08-18 | D-01～D-15 | A-01～A-09 | 需求与测试方案 implement 门禁通过，按新建专用手写测试策略进入测试先行实施；V-01～V-07 保持计划。 |
| R-04 | 2026-08-18 | D-14 | A-09 | 根据真实矩阵暴露的 Node.js 20 action 弃用警告，把 `actions/upload-artifact` 从 v4 升级到官方当前 v7；该技术修订不改变产物名称、路径或插件可观察行为，复用 `tests/workflow.test.mjs` 增加版本回归，并将 V-06 与任务 6.5～6.6 重新打开，等待新提交五平台复验。 |
| R-05 | 2026-08-18 | D-10、D-11、D-14 | A-04、A-05、A-09 | 真实归档暴露归档测试方案仍保留活动变更名和证据路径、重复恢复只改需求且无法通过完整审计；撤回部分归档，复用 `tests/verification-evidence-integrity.test.mjs` 增加真实归档与恢复回归，重新打开 V-03、V-05、V-06 和对应任务，修复后重新完成本地与五平台验证。 |

## 兼容性与风险

- 受影响页面、公共组件、路由、权限或接口：不涉及业务页面；影响插件验证 CLI、需求/测试方案校验、完成入口、UI Review 报告和相关 Skill 说明。
- 历史数据与兼容策略：新合同显式启用后严格；历史已归档需求继续可读并给警告，不自动补造证据或更改已验收事实。
- 上线与回滚注意事项：证据 schema 必须版本化；门禁和生成器需同版本发布。回滚可以停用新合同消费，但不能删除已经随变更归档的 JSON 证据或破坏新报告可读性。
- 跨平台高风险：是；命中路径、临时目录、子进程、包管理器入口、机器可读诊断和 CI。受影响平台为仓库声明的 Linux x64/ARM64、Windows x64、macOS Intel/ARM64。
- 主要风险：通用测试输出难以解析、工作区指纹排除规则过宽或过窄、归档与需求写入无法形成单文件事务、历史警告误升级为阻断、报告字段与状态 JSON 漂移；通过明确测试定位、稳定排除表、归档后审计、显式启用和共享渲染数据降低风险。

## 测试与验证

- 测试文件策略：复用；目标路径：`tests/verification-evidence-integrity.test.mjs`；基线证据：Git 可用且该手写专用测试文件已受版本控制，并已覆盖 TC-04 归档引用迁移与恢复；选择理由：R-05 修复同一完成与归档能力，扩展现有 TC-04 比新建重复测试文件更能复现真实归档和恢复链。
- 独立测试方案：需要；触发条件：新增机器证据格式、执行入口与跨阶段完成门禁；活动变更与目标：`openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/test-plan.md`；需求修订基线：R-05。
- 验证范围：全量；执行命令：新专用测试的聚焦命令、受影响既有测试、`npm test`、`npm run validate`、严格 OpenSpec 校验、官方 Skill validator、官方 Plugin validator 和真实五平台 CI；选择理由：修改所有插件使用者共享的完成、归档和 UI 证据链。
- 自动测试：本地真实执行、零测试、非零退出、工作区指纹过期、未知 schema、危险/多路径、历史兼容、预览零写入、归档改写/幂等/部分失败恢复、UI 报告字段一致性、POSIX/Windows 路径和稳定机器诊断。
- 人工检查：核对 Skill 文案没有宣称完成门禁会重跑，没有把外部 CI 引用说成本地真实执行，UI 报告可独立定位对应状态文件。
- 构建与静态检查：结构校验、manifest、公开 Skill 清单、版本一致性、AI 标记禁入、根目录清洁和 `git diff --check`。

## 验证记录

| 验证ID | 验证类型 | 执行内容或环境 | 执行日期 | 结果 | 证据位置 |
| --- | --- | --- | --- | --- | --- |
| V-01 | 自动 | `node --test --test-name-pattern="受控执行与零测试证据保护" tests/verification-evidence-integrity.test.mjs` | 2026-08-18 | 通过 | `openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/verification.md`、`openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/evidence/V-01.json` |
| V-02 | 自动 | `node --test --test-name-pattern="证据安全与工作区新鲜度" tests/verification-evidence-integrity.test.mjs` | 2026-08-18 | 通过 | `openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/verification.md`、`openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/evidence/V-02.json` |
| V-03 | 自动 | `node --test --test-name-pattern="归档引用迁移与恢复" tests/verification-evidence-integrity.test.mjs` | 2026-08-18 | 通过 | `openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/verification.md`、`openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/evidence/V-03.json` |
| V-04 | 自动 | `node --test --test-name-pattern="UI 报告运行身份一致性" tests/verification-evidence-integrity.test.mjs` | 2026-08-18 | 通过 | `openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/verification.md`、`openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/evidence/V-04.json` |
| V-05 | 自动 | `npm run verify`，并执行官方 Skill/Plugin validators、根目录清洁与 AI 标记禁入检查 | 2026-08-18 | 通过 | `openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/verification.md`、`openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/evidence/V-05.json` |
| V-06 | 自动 | GitHub Actions Validate #33：在修复提交 `7ec96ac786485e44b0e074ed90e7099280ce8c73` 复跑 Linux x64/ARM64、Windows x64、macOS Intel/ARM64 五平台矩阵 | 2026-08-18 | 通过 | `openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/verification.md`、`openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/evidence/V-06.json` |
| V-07 | 自动 | `node --test --test-name-pattern="证据完成门禁与历史兼容" tests/verification-evidence-integrity.test.mjs` | 2026-08-18 | 通过 | `openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/verification.md`、`openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/evidence/V-07.json` |

## 验收标准

- [x] [A-01] 插件受控入口能够真实执行聚焦命令，并只在退出成功且计划测试定位至少命中一次时生成版本化 passed 机器证据。
- [x] [A-02] 新合同完成门禁能够拒绝 Markdown-only、缺失、损坏、失败、零测试、未知版本、越界和工作区已变化的证据，且不会重跑外部命令。
- [x] [A-03] TC-*、V-* 与 JSON 证据能形成稳定关联，多证据路径被逐项解析、规范化、去重和检查。
- [x] [A-04] 完成预览展示确定性归档改写，正式归档后需求引用指向实际归档目录并立即通过 complete 审计。
- [x] [A-05] 归档改写保持幂等，不覆盖无关路径；部分失败返回稳定错误、实际归档目标和可重复恢复信息。
- [x] [A-06] 历史需求保持可读并获得迁移警告，新合同严格度不因兼容策略降低，也不自动补造历史机器证据。
- [x] [A-07] UI Review Markdown 展示运行身份、场景指纹、实际采集器、基线、状态文件和关键证据摘要，且与状态 JSON 一致。
- [x] [A-08] 生产实现仅使用 Node.js 标准库，持久证据随变更归档，临时日志和验证依赖只进入有界 outputs 子目录，项目根目录保持清洁。
- [x] [A-09] 聚焦回归、全量本地验证、官方 validators 和同一提交真实五平台矩阵按各自证据层级完成；未执行外部矩阵不得标为通过。

## 验收—证据映射

| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 | 验证记录 |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 真实执行与零测试保护 | D-02、D-03、D-13 | 自动 | `openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/verification.md` | 通过：退出成功、定位命中、零测试与覆盖保护均通过 | V-01 |
| A-02 | 完成门禁只消费有效持久证据 | D-04、D-05、D-07 | 自动 | `openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/verification.md` | 通过：严格门禁、过期识别和完成零重跑均通过 | V-01、V-02、V-07 |
| A-03 | TC/V/JSON 与多路径关联 | D-07、D-09 | 自动 | `openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/verification.md` | 通过：同 ID、同需求、同定位与多路径逐项校验 | V-02、V-07 |
| A-04 | 归档引用改写与归档后审计 | D-10 | 自动 | `openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/verification.md` | 通过：真实目录移动后需求与测试方案均迁移到实际归档范围，完整审计通过 | V-03 |
| A-05 | 归档幂等与故障恢复 | D-10、D-11 | 自动 | `openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/verification.md` | 通过：部分失败保留稳定阶段与归档目标，恢复同时修复两类文件且不重跑项目命令 | V-03 |
| A-06 | 历史兼容且不降级新合同 | D-08 | 自动 | `openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/verification.md` | 通过：三类结构化警告与不改写历史合同通过 | V-07 |
| A-07 | UI Markdown 自识别且与状态一致 | D-12 | 自动 | `openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/verification.md` | 通过：报告身份字段和 UI 全量 30/30 回归通过 | V-04 |
| A-08 | 标准库、outputs 与根目录清洁 | D-13 | 自动 | `openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/verification.md` | 通过：统一验证、官方 validators、根目录清洁与 AI 标记禁入检查通过，临时运行时已清理 | V-05 |
| A-09 | 三层验证与五平台证据边界 | D-06、D-14 | 自动 | `openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity/verification.md` | 通过：R-05 聚焦与本地统一验证通过，修复提交 Validate #33 五个平台任务、平台包和空 annotations 已远程复核 | V-03、V-05、V-06 |

## 待确认问题

- 无。首版范围、兼容边界、证据可靠性边界和非目标均已确认。
