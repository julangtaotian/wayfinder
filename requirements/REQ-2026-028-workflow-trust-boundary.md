# REQ-2026-028：安全写入与机器证据可信度闭环

## 基本信息

- 状态：已验收
- 提出人：用户
- 负责人：Codex
- 目标版本：0.16.0
- 关联页面或模块：初始化与升级、Wayfinder 迁移、变更完成与归档、验证证据、UI Review 证据、跨平台 CI 结论
- 关联变更：`harden-workflow-trust-boundary`

## 背景与目标

当前插件已经具备默认预览、受管内容保护、无 shell 验证命令、工作区指纹、UI Review 状态和五平台 CI，但最新只读审计确认仍有两类可信度缺口：目标项目的部分写入入口只做词法范围判断，既有目标或中间目录为符号链接时可能写到项目外；严格机器证据没有完整绑定当前需求语义、测试方案、日志、附件和 UI 状态，外部 CI 的自声明字段也可能被完成门禁当成有效通过依据。

本需求在不扩展框架识别、不引入远程平台和不改变默认预览语义的前提下，统一目标项目写入安全边界并升级机器证据合同。完成后，插件只能在规范化后的真实项目范围内执行受管写入；严格通过结论必须能够证明它对应当前验收语义、当前测试方案和未被修改的持久证据。证据不足、内容变化、外部状态未复核或 UI 状态不一致时必须失败关闭，而不是用 warning 包装成 passed。

## 决策台账

| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 本次变更范围 | 已确认 | 只修复目标项目安全写入和机器证据可信度；动态项目识别作为后续独立变更 | 用户要求按整体规划开始第一个变更且不得偏离 |
| D-02 | 受管写入安全边界 | 已确认 | 所有修改目标项目的脚本必须以真实项目根为边界，写入、覆盖、归档或删除前检查目标及根以下每级既有祖先；目标或祖先为符号链接时失败关闭，不跟随链接写入 | 本轮安全审计确认初始化、迁移和完成入口存在符号链接逃逸风险 |
| D-03 | 兼容与覆盖保护 | 已确认 | 保持默认 dry-run、显式 `--write`、不覆盖无受管标记内容和可重复执行语义；项目根自身允许由调用路径解析为真实目录，但受管目标不得借内部符号链接改变落点 | 现有仓库规则与用户要求“不要改坏” |
| D-04 | 机器证据版本 | 已确认 | 新生成的严格证据升级为 schema v2；未启用严格合同的历史 schema v1 保持只读并提示迁移，启用严格合同的活动变更不得继续用 v1 证明新完成结论 | 既有历史兼容原则与本轮证据审计 |
| D-05 | 验收语义绑定 | 已确认 | v2 本地证据绑定最新需求修订、相关 D-*、A-*、V-* 可观察断言和对应 TC-* 的稳定语义摘要；执行日期、结果、证据路径、勾选状态等完成后会变化的字段不参与摘要，避免形成自引用 | 当前工作区指纹排除 requirements 与 openspec，修改验收语义不会让旧证据失效 |
| D-06 | 工作区与持久产物完整性 | 已确认 | 继续分别计算实现/测试工作区指纹，并对日志和声明附件逐项记录安全相对路径、字节数和 SHA-256；严格完成时重新检查存在性、范围、大小和摘要，任一变化都使证据失败 | 当前清单记录日志与附件摘要但完成校验没有复算 |
| D-07 | UI Review 证据 | 已确认 | v2 UI Review 证据必须读取并验证真实状态 JSON，要求 runId、场景、场景指纹、采集器、通过状态和关键产物与清单一致；只存在一个任意状态文件不得成为通过证据 | 当前 UI Review 机器证据只检查字段和状态路径存在 |
| D-08 | 外部 CI 信任等级 | 已确认 | 未由插件可信远程读取链生成可验证回执的 external-ci 只作为 `external-recorded` 引用，不得满足严格自动通过门禁；本变更不建设远程读取器，真实 CI 可按人工复核证据记录，但不得描述为插件已远程核验 | 当前 external-ci 自声明 URL、提交和任务即可成为有效机器证据 |
| D-09 | 诊断与结论语义 | 已确认 | 机器输出使用稳定 code、status、target、trust 和 evidenceId；聚合状态只有全部必需证据可信通过时才为 passed，warning 和 recorded 不得被顶层摘要折叠成 passed | 用户要求避免胡乱给结论与既有机器诊断规则 |
| D-10 | 跨平台高风险 | 已确认 | 跨平台高风险：是；命中路径、临时目录、子进程、机器可读诊断和 CI 证据；受影响平台为仓库声明的 Linux x64/ARM64、Windows x64、macOS Intel/ARM64，聚焦回归、本地统一验证和真实矩阵分开取证 | 项目跨平台 CI 防回归规则 |
| D-11 | 实现与回滚边界 | 已确认 | 生产实现只使用 Node.js 标准库；优先抽取共享安全路径和摘要逻辑，调用方逐个迁移并保留旧公共入口；任一阶段失败不删除原文件、不覆盖原始错误，允许按调用点回滚 | 仓库实现约束与用户要求低风险修改 |
| D-12 | 明确排除 | 已确认 | 不修改动态框架/依赖识别，不实现 Monorepo 编排，不扩展非 Vitest 认证，不同步 Figma/蓝湖，不实现 GitHub/GitLab 远程读取或 PR 回写，不在本变更升级 Node 或 Actions 版本 | 用户确认先做第一项且不得偏离 |

## 范围

### 包含

- 盘点并统一所有会修改目标项目内容的确定性脚本入口，增加真实路径、既有祖先和符号链接保护。
- 覆盖初始化、升级、Wayfinder 迁移、验证证据写入、完成归档及 UI Review 目标项目产物写入链。
- 升级机器证据 schema，增加稳定验收语义绑定和可复算持久产物摘要。
- 严格校验本地命令日志、声明附件和 UI Review 状态/产物。
- 将外部 CI 的“已记录”和“已可信复核”拆成不同信任语义；当前无可信远程回执时不得自动通过。
- 调整 check、precomplete、complete 和项目检查的结构化汇总，避免 warning 被聚合成 passed。
- 增加 POSIX/Windows 路径、符号链接、证据篡改、需求修订、UI 状态伪造和外部证据自声明回归。
- 运行聚焦、本地统一、官方 validators 和最终提交真实五平台验证。

### 不包含

- 动态发现或总结框架、三方依赖、workspace 和业务架构。
- Monorepo 或多前端应用自动编排。
- 新增或完整认证 Jest、Mocha、Cypress 等非 Vitest 测试链。
- 远程 Figma、蓝湖、GitHub、GitLab、PR 或 CI 写回能力。
- 加密签名、第三方可信时间戳、证据数据库或远程日志平台。
- 自动安装依赖、自动重跑完成阶段测试、修改业务源码或改变公共 Skill 名称。
- Node LTS、GitHub Actions SHA 和持续依赖扫描升级；这些保留为后续供应链加固变更。

## 当前行为

- `bootstrap-project.mjs`、`migrate-wayfinder-project.mjs` 和 `finalize-change.mjs` 的部分目标路径只检查词法相对关系，未统一拒绝根以下的符号链接祖先。
- 本地证据工作区指纹排除 `requirements`、`openspec` 和 `outputs`，但没有额外绑定当前需求验收语义和测试方案。
- 本地清单保存 logs 和 artifacts 摘要，验证器只检查命令、退出码、测试定位和工作区指纹。
- UI Review 证据只要求 runId、statePath 字段及文件存在，不确认状态 JSON 的身份和结果。
- external-ci 的 URL、提交、任务与 `remotelyVerified` 都来自本地 JSON；即使信任级别为 external-unverified，严格记录仍可能被视为有效机器证据并汇总为 passed。

## 期望行为

### 场景：受管写入遇到项目内符号链接

- 前置条件：目标项目根真实存在，待写文件或任一根以下既有祖先是符号链接。
- 当：预览或显式执行初始化、升级、迁移、证据、UI Review 或完成归档入口。
- 则：入口返回稳定的安全路径诊断，不读取链接外内容，不写入、覆盖、移动或删除链接目标。
- 并且：预览与正式写入使用同一安全路径判断，不能预览通过后才在写入阶段发现不同落点。
- 异常或边界：项目根本身由符号链接入口选择时先解析为唯一真实根；根以下的受管链接仍拒绝。

### 场景：正常项目重复执行受管写入

- 前置条件：全部目标及祖先都位于真实项目根内且不是符号链接，既有文件具有合法受管标记。
- 当：先预览、再显式写入，并对同一状态重复执行。
- 则：首次只修改计划内文件，重复执行保持 unchanged 或安全幂等结果。
- 并且：无受管标记内容、原始失败和无关业务文件保持不变。
- 异常或边界：目标冲突或原子替换失败时保留原文件并返回可定位错误。

### 场景：需求或测试方案在取证后变化

- 前置条件：v2 本地证据已由真实命令生成并绑定当前 D/A/V/TC 语义。
- 当：相关验收文案、断言、最新修订或 TC 定义发生变化后运行严格完成校验。
- 则：校验返回稳定的语义证据过期诊断并阻断 passed。
- 并且：只更新执行日期、结果、证据路径或验收勾选状态不会制造自引用过期。
- 异常或边界：与该 V-* 无关的需求说明变化不得无差别使全部证据过期。

### 场景：日志或声明附件被修改

- 前置条件：v2 清单记录项目内安全路径、字节数和 SHA-256。
- 当：完成校验发现文件缺失、越界、经符号链接逃逸、大小变化或摘要变化。
- 则：对应证据失败并报告具体文件和稳定错误 code。
- 并且：完成阶段只复算持久证据，不重跑命令。
- 异常或边界：历史 v1 清单按合同模式给出迁移 warning 或严格失败，不伪造成 v2 已验证。

### 场景：UI Review 状态与证据不一致

- 前置条件：自动 V-* 引用 v2 UI Review 清单。
- 当：状态文件不存在、无法解析、status 不是 passed、runId/场景/指纹/采集器不一致，或关键产物摘要变化。
- 则：校验失败关闭并返回不一致字段或目标。
- 并且：任意 JSON 文件存在或手写 passed 字段不能替代真实状态合同。
- 异常或边界：inconclusive、needs-fix、failed 和 blocked 永远不能升级为通过。

### 场景：外部 CI 只有本地自声明记录

- 前置条件：external-ci 清单包含 URL、精确提交和 passed jobs，但没有插件可信远程读取回执。
- 当：严格完成门禁校验自动 V-*。
- 则：证据保持 `external-recorded`，返回非通过信任诊断，不能满足机器证据门禁或顶层 passed。
- 并且：用户人工复核真实 CI 后可以按人工验证记录交付事实，但报告必须明确“人工复核”，不能写成插件远程核验。
- 异常或边界：手工把 `remotelyVerified` 改为 true 不能提升信任等级。

## 页面与交互

- 入口与操作路径：现有 bootstrap、update、Wayfinder migration、verification evidence、UI Review、check-change 和 finalize-change 命令；不新增公共 Skill。
- 字段、文案与默认值：默认仍为预览；机器字段使用稳定英文，中文信息解释阻断原因和恢复方向。
- 加载态、空态、错误态、禁用态：无图形界面；没有 v2 证据、证据过期或外部未复核属于明确阻断/记录态，不显示为通过。
- 权限与角色差异：只读检查不写入；显式 `--write` 也不能绕过安全路径和证据信任门禁。
- 设计稿链接：不适用。

## 交互状态矩阵

| 状态 | 覆盖决定 | 触发或前置条件 | 期望结果 | 验证方式 | 关联验收 | 不适用理由 |
| --- | --- | --- | --- | --- | --- | --- |
| 初始（已有数据） | 覆盖 | 正常项目、既有 v1/v2 证据和历史归档同时存在 | 明确区分安全目标、历史兼容、严格可信与已记录外部证据 | 自动 | A-01、A-03、A-06 | — |
| 用户操作 | 覆盖 | 用户执行预览、显式写入、证据生成或完成入口 | 只在计划范围写入，只有可信证据进入 passed | 自动 | A-01、A-02、A-03、A-04、A-05 | — |
| 刷新 | 覆盖 | 相同项目与证据重复检查或重复执行 | 路径判断、摘要和状态保持幂等，既有安全内容不漂移 | 自动 | A-02、A-03、A-06 | — |
| 空态 | 覆盖 | 目标目录尚未创建、严格证据缺失或外部只有 URL | 安全创建普通目录；严格证据缺失/未复核保持阻断或 recorded | 自动 | A-01、A-03、A-05 | — |
| 错误态 | 覆盖 | 符号链接、路径越界、摘要变化、UI 状态不一致或 schema 不足 | 返回稳定诊断，不覆盖原文件、不重跑命令、不报告 passed | 自动 | A-01、A-03、A-04、A-05、A-06 | — |
| 卸载 | 不适用 | 全部入口是一次性命令，无订阅、计时器或后台任务 | 命令结束后无长生命周期资源；临时产物按有界目录处理 | 自动 | — | 无常驻 UI 或后台生命周期。 |

## 接口与数据

- 接口文档链接：本需求关联 OpenSpec delta specs、设计和独立测试方案。
- 请求方法与路径：沿用项目根、需求、变更、V-*、UI 状态、日志和附件等本地参数；路径必须是规范化后的安全项目相对路径。
- 请求字段及空值语义：v2 证据增加语义绑定、持久产物摘要和具体 kind 合同；缺失字段表示证据不足，不使用默认 passed。
- 响应字段及状态码：保留 `ok`、`code`、`status`、`target`、`evidenceId`，增加明确 `trust`、`fresh` 和不一致分类；顶层状态不得掩盖子诊断。
- 鉴权、加解密或敏感信息要求：不读取项目外内容，不在清单记录环境变量值；日志原样持久化的既有风险保持可见，本变更不新增凭据采集。

## 关联变更范围

| 变更 | 决策范围 | 验收范围 |
| --- | --- | --- |
| harden-workflow-trust-boundary | D-01、D-02、D-03、D-04、D-05、D-06、D-07、D-08、D-09、D-10、D-11、D-12 | A-01、A-02、A-03、A-04、A-05、A-06、A-07 |

## 修订记录

| 修订 | 日期 | 影响决策 | 影响验收 | 验证与任务处理 |
| --- | --- | --- | --- | --- |
| R-01 | 2026-08-21 | D-01～D-12 | A-01～A-07 | 首次建立安全写入与机器证据可信度需求；所有 V-* 保持计划，待建立受管变更和独立测试方案。 |
| R-02 | 2026-08-21 | D-04、D-08、D-09、D-11 | A-05、A-06、A-07 | 实施前确认既有证据测试直接引用 schema 常量；新增行为仍集中在专用测试，允许只更新旧测试的既有 schema 与信任预期，不追加本次新场景。V-* 仍保持计划。 |

## 兼容性与风险

- 受影响页面、公共组件、路由、权限或接口：不影响业务页面；影响所有修改目标项目的插件脚本和严格完成门禁。
- 历史数据与兼容策略：不批量改写已归档 v1 证据；历史只读检查给迁移提示，新严格变更必须使用 v2。
- 上线与回滚注意事项：安全路径逻辑集中实现、调用点分批迁移；证据 schema 保留显式版本分支，出现兼容问题可回滚调用点而不删除历史证据。
- 跨平台高风险：是；命中路径、临时目录、子进程、机器可读诊断和 CI 证据。路径回归覆盖 POSIX 与 Windows 语义，真实交付以 Linux x64/ARM64、Windows x64、macOS Intel/ARM64 最终提交矩阵为准。
- 剩余风险：本变更不提供远程 CI 可信读取和加密签名，不能抵御拥有仓库写权限的恶意作者伪造全部源码与需求历史；它负责防止普通流程把不足证据误判为可信通过。

## 测试与验证

- 测试文件策略：新建；目标路径：`tests/workflow-trust-boundary.test.mjs`；基线证据：Git 可用且该目标当前未受版本控制，既有安全与证据测试分散在多个文件；选择理由：新建专用手写测试集中覆盖跨入口写入边界与证据可信度，不把新场景追加到生成测试或单一旧缺陷文件。
- 配套兼容测试：允许最小更新已受 Git 跟踪的 `tests/verification-evidence-integrity.test.mjs` 中既有 schema 版本和 external-ci 信任预期；不得向该文件追加本变更的新场景，全部新增断言仍位于专用目标测试。
- 独立测试方案：需要；触发条件：本变更包含跨安全写入、本地证据、UI 证据和外部信任的多条可追踪回归；活动变更与目标：`openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/test-plan.md`；需求修订基线：R-02。
- 验证范围：聚焦 + 全量；执行命令：`node --test tests/workflow-trust-boundary.test.mjs`、`npm test`、`npm run validate`、`npm run verify` 和官方 Skill/Plugin validators；选择理由：安全路径与证据逻辑属于初始化、升级、完成归档和发布共享链，聚焦回归后必须执行仓库级统一验证。
- 自动测试：安全普通路径、目标符号链接、祖先符号链接、项目根符号链接入口、重复执行、证据语义变化、日志/附件缺失与篡改、UI 状态身份与结果、外部自声明信任、v1 历史兼容和稳定机器诊断。
- 人工检查：复核预览动作、错误说明和支持边界没有把 recorded、warning、inconclusive 或 blocked 描述成 passed。
- 构建与静态检查：结构、OpenSpec strict、归档任务、运行时完整性、AI 标记禁入、插件安装结构和最终五平台成品验证。

## 验证记录

| 验证ID | 验证类型 | 执行内容或环境 | 执行日期 | 结果 | 证据位置 |
| --- | --- | --- | --- | --- | --- |
| V-01 | 自动 | `node --test --test-name-pattern="受管写入符号链接边界与兼容性" tests/workflow-trust-boundary.test.mjs`，覆盖安全写入与符号链接边界 | 2026-08-24 | 通过 | `openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/verification.md`、`openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/evidence/V-01.json` |
| V-02 | 自动 | `node --test --test-name-pattern="机器证据语义完整性与信任聚合" tests/workflow-trust-boundary.test.mjs`，覆盖需求/TC 语义绑定、日志附件摘要、UI 状态和外部信任等级 | 2026-08-24 | 通过 | `openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/verification.md`、`openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/evidence/V-02.json` |
| V-03 | 自动 | `npm test`、`npm run validate`、`npm run verify` 与官方 Skill/Plugin validators | 2026-08-24 | 通过 | `openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/verification.md`、`openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/evidence/V-03.json` |
| V-04 | 人工 | 复核预览、失败诊断和顶层汇总没有越界结论 | 2026-08-21 | 通过 | `openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/verification.md` |
| V-05 | 人工 | 实现提交 `2a690b16b42cab0259222a70e1bdb058fc12ec36` 的 Linux x64/ARM64、Windows x64、macOS Intel/ARM64 GitHub Actions 矩阵人工复核 | 2026-08-24 | 通过 | `https://github.com/julangtaotian/wayfinder/actions/runs/32682933594`、`openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/verification.md` |

## 验收标准

- [x] [A-01] 所有修改目标项目的确定性入口在目标或根以下祖先为符号链接时失败关闭，且不修改项目外内容。
- [x] [A-02] 正常项目保持默认预览、显式写入、受管内容保护、原子失败保护和重复执行语义。
- [x] [A-03] v2 本地证据绑定当前相关 D/A/V/TC 语义，相关语义变化、日志或附件缺失/篡改时严格完成失败。
- [x] [A-04] v2 UI Review 证据只有在状态身份、场景、采集器、passed 结果和关键产物全部一致时有效。
- [x] [A-05] 没有可信远程回执的 external-ci 保持 external-recorded，不能满足严格自动通过或被顶层汇总为 passed。
- [x] [A-06] 历史 v1 证据保持只读可解释，新严格合同失败关闭，并为所有失败返回稳定可定位诊断。
- [x] [A-07] 聚焦、本地统一、官方 validators、插件结构和最终提交真实五平台验证按分层证据完成。

## 验收—证据映射

| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 | 验证记录 |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 目标项目写入不能经符号链接逃逸 | D-02、D-03、D-11 | 自动 | `tests/workflow-trust-boundary.test.mjs`、`openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/evidence/V-01.json` | 所有公开写入入口返回稳定安全诊断，链接外哨兵文件不变 | V-01 |
| A-02 | 正常与失败写入保持兼容 | D-03、D-11 | 自动+人工 | `tests/workflow-trust-boundary.test.mjs`、`openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/verification.md` | dry-run 零写入、受管写入幂等、冲突和原始失败不覆盖 | V-01、V-04 |
| A-03 | 本地证据绑定当前验收语义与持久产物 | D-04、D-05、D-06 | 自动 | `tests/workflow-trust-boundary.test.mjs`、`openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/evidence/V-02.json` | 相关 D/A/V/TC 或日志附件变化返回具体过期/完整性失败 | V-02 |
| A-04 | UI Review 证据验证真实状态 | D-04、D-07 | 自动 | `tests/workflow-trust-boundary.test.mjs`、`openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/evidence/V-02.json` | 非 passed、身份不一致、产物变化和任意 JSON 均不能通过 | V-02 |
| A-05 | 外部证据信任不越界 | D-08、D-09 | 自动+人工 | `tests/workflow-trust-boundary.test.mjs`、`openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/verification.md` | 自声明外部记录只能是 external-recorded，顶层不得显示 passed | V-02、V-04 |
| A-06 | 历史兼容与稳定诊断 | D-04、D-09、D-10 | 自动 | `tests/workflow-trust-boundary.test.mjs`、`openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/evidence/V-02.json` | 历史 v1 提示迁移，严格 v1 阻断，code/status/target/trust 稳定 | V-02 |
| A-07 | 交付验证按风险分层完成 | D-10、D-11、D-12 | 自动+人工 | `openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/verification.md`、`openspec/changes/archive/2026-08-24-harden-workflow-trust-boundary/evidence/V-03.json`、GitHub Actions 运行 URL | 聚焦、本地统一、官方校验与最终提交五平台结果分别记录且全部通过后才完成 | V-03、V-05 |

## 待确认问题

无。
