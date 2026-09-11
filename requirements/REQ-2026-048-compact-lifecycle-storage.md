# REQ-2026-048：轻量需求生命周期与证据存储治理

## 基本信息

- 状态：待验证
- 提出人：用户
- 负责人：Codex
- 目标版本：0.19.0
- 关联页面或模块：需求生命周期、OpenSpec 完成流程、验证证据、运行时目录、仓库体积、CI 产物与 AI 上下文
- 关联变更：`compact-lifecycle-storage`

## 背景与目标

当前完成流程会同步规格、移动 OpenSpec 变更、改写证据引用、更新需求状态、迁移需求正文并刷新索引。长期运行后，`openspec/changes/archive/`、`requirements/archive/`、`outputs/` 与 `.frontend-ui-review/runs/` 持续积累，既扩大仓库和 Git，也让每次检查反复判断历史路径、过滤规则与证据状态。

本需求将完整规划和原始证据限定为活动期临时材料：完成时仍复用 OpenSpec 原生严格校验、规格同步、冲突检测和回滚能力，但成功后只保留正式规格与紧凑、追加式的生命周期事件；运行日志、缓存、事务恢复和 UI Review 运行产物统一进入被忽略的有界运行时目录。默认记录用于状态判断而不冒充永久证明，高风险或显式严格模式才保留单一紧凑证据包。

## 决策台账

| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 当前分支持久事实 | 已确认 | 只长期保留当前正式规格、活动需求与活动 OpenSpec 变更；已完成全文和普通原始证据不再留在主工作树 | 用户明确要求减少归档、证据移动和长期文件数量 |
| D-02 | 完成状态事实源 | 已确认 | 新增版本化、追加式生命周期事件；完成状态由事件投影得到，不再依赖把需求正文从“待验证”改为“已验收” | 用户询问待验证状态影响后确认采用新方案 |
| D-03 | 完成实现 | 项目默认 | 继续调用插件内置 OpenSpec 原生 archive 完成严格校验和规格同步，把其归档目录视为事务内临时结果，成功提交事件后清除，不修改内置运行时 | 现有安全、冲突和回滚合同 |
| D-04 | 默认证据边界 | 已确认 | 默认事件仅保存状态声明、规格摘要、校验器版本、能力范围、检查结果和信任级别；不把普通日志、截图和接口快照长期纳入 Git | 用户要求根治 outputs 膨胀 |
| D-05 | 严格证据边界 | 已确认 | 高风险、发布或显式 strict 模式可保留每个完成事件至多一个有界证据包；外部 CI 只记录引用和待执行/已观察语义，不回写仓库形成提交循环 | 前述方案复核结论 |
| D-06 | 事务与并发 | 项目默认 | 完成使用仓库级锁与事务日志，覆盖校验、规格同步、事件追加和清理；崩溃可幂等恢复，不能只锁 JSONL | 并发和部分失败审计 |
| D-07 | Git 工作区保护 | 项目默认 | merge、rebase、cherry-pick、未合并 index、相关 sparse checkout 或生命周期版本不匹配时拒绝完成写入 | Git 边界审计 |
| D-08 | 历史事件一致性 | 项目默认 | 事件具有全局 eventId、scope、changeId、revision、supersedes、发生年份和规范化摘要；旧事件不可编辑，状态不能使用简单最后一行覆盖 | 并发、重开和跨年审计 |
| D-09 | Git 差异门禁 | 项目默认 | CI 对相对 merge-base 校验活动变更删除与 accepted/cancelled/superseded 事件配对，并禁止删除或修改既有事件；显式版本迁移除外 | 手工删除和漏写事件审计 |
| D-10 | 运行时目录 | 已确认 | 使用 `.frontend-ai-workflow/runs`、`cache`、`transactions` 保存本地运行、缓存和恢复数据并整体忽略；`.frontend-ui-review/config` 与适配器可跟踪，`runs` 忽略 | 用户要求不再逐次补 outputs 过滤规则 |
| D-11 | 上下文压缩 | 已确认 | 提供无持久副本的阶段上下文编译器，只返回 plan、implement、verify、complete 所需字段并支持有界分页诊断 | 活动需求 Token 成本审计 |
| D-12 | 正式规格治理 | 已确认 | 默认更新既有 capability；提供重复、退役、总上下文软预算诊断，真正长期决策提升为全局 DEC 标识，去除依赖已删除需求正文的局部 D/A 引用 | 正式规格下一阶段膨胀审计 |
| D-13 | 测试定位 | 已确认 | 新证据使用测试文件和行为名称或全局作用域 ID，不再以裸 `TC-01` 作为唯一定位；现有编号保持兼容但报告歧义 | 测试编号重复审计 |
| D-14 | CI 远端产物 | 已确认 | 普通平台报告设置 14 天保留期；完整安装证据只在手动请求时上传，CI 状态不写回生命周期文件 | CI 产物累积审计 |
| D-15 | 存量迁移 | 已确认 | 提供默认预览、显式写入的迁移；写入前反向检查引用、符号链接、未知文件、Git 状态和内容摘要，任何不明确项失败关闭；不重写 Git 历史 | 用户要求安全优化既有大目录 |
| D-16 | 兼容与版本 | 项目默认 | 仓库声明 lifecycle schema v2 与最低写入器版本；读取器可只读识别 v1，写入器版本不匹配或新旧结构混用时失败；CI 阻止旧插件产出重新进入 | 混合版本审计 |
| D-17 | 分支与多项目语义 | 项目默认 | 状态区分 branch-local 与 merged；scope 使用规范化仓库相对路径，禁止绝对路径并处理大小写、Unicode、长度碰撞 | squash、monorepo 与 Windows 审计 |
| D-18 | 摘要规范 | 项目默认 | 摘要基于 LF 规范化的稳定字节或 Git blob 内容，事件不记录自身尚未生成的 commit SHA，可选记录 baseRevision | CRLF 与自引用 SHA 审计 |
| D-19 | 跨平台风险 | 项目默认 | 跨平台高风险：是；命中 CI、路径、临时目录、子进程、环境变量、Git 和机器诊断；影响真实矩阵 Linux x64/ARM64、Windows x64、macOS Intel/ARM64 | 跨平台清单与 `.github/workflows/validate.yml` |

## 范围

### 包含

- 生命周期 schema、事件存储、状态投影、并发锁、事务恢复和 Git 安全前置检查。
- 改造完成入口，使归档只作为临时同步步骤，成功后移除活动需求、活动变更和临时归档。
- 默认与严格证据策略、阶段上下文编译器、规格与测试定位治理。
- 将插件本地验证、UI Review 和 CI 临时资产迁到统一运行时边界并增加硬门禁。
- 提供存量 archive、requirements archive、tracked outputs 和 UI Review runs 的安全迁移预览与显式写入。
- 更新技能、模板、README、AGENTS、CI、版本和回归测试。

### 不包含

- 修改或分叉插件内置 OpenSpec 1.9.0 运行时。
- 重写 Git 历史、强推分支、删除远端 Actions 历史或清理用户未跟踪文件。
- 引入数据库、云存储或新的外部服务。
- 将默认生命周期声明描述为不可抵赖的永久审计证明。
- 在本地验证尚未通过时直接批量删除既有历史资产。

## 当前行为

- 完成会把活动变更移动至 `openspec/changes/archive/`，把需求全文移至 `requirements/archive/<year>/`，并在根保留存根和索引。
- 需求完成依赖“待验证 → 已验收”文本更新，证据路径随归档位置改写。
- 验证、缓存和 fixture 按不同主题写入 `outputs/`，UI Review 运行产物写入 `.frontend-ui-review/runs/`。
- footprint 允许一定数量受跟踪 outputs，没有禁止受跟踪运行时文件、旧归档或混合生命周期结构。
- 测试和规格仍含大量仅在原需求上下文中唯一的 `D-*`、`A-*`、`TC-*` 引用。

## 期望行为

### 场景：完成普通需求

- 前置条件：需求为待验证，任务、验收、机器证据和严格 OpenSpec 校验通过，Git 工作区满足安全前置条件。
- 当：开发者预览并显式执行完成。
- 则：OpenSpec 原生流程在事务内同步正式规格，生命周期文件追加一条 accepted 事件，活动需求与活动变更被移除。
- 并且：原生 archive 中间目录、普通证据和运行日志不进入最终持久状态，重复恢复不追加第二条事件。
- 异常或边界：任一步骤失败均保留恢复所需事务信息；未知文件、并发写入或冲突失败关闭。

### 场景：查询需求状态

- 前置条件：需求正文仍显示待验证，或需求正文已经在完成后移除。
- 当：检查器查询 changeId 和 scope。
- 则：活动变更优先报告 active；否则根据有效事件投影报告 accepted-local、accepted-merged、cancelled、superseded 或 unknown。
- 并且：旧“已验收”存根只作为 v1 兼容输入，不覆盖 v2 事件。

### 场景：运行验证或 UI Review

- 前置条件：任务需要日志、截图、浏览器状态、依赖缓存或临时 fixture。
- 当：工具执行并完成或失败。
- 则：产物只写入对应 `runs/cache/transactions` 子目录，路径有界且默认忽略。
- 并且：清理仅作用于本次命名空间；Git 中出现这些路径时统一门禁失败。

### 场景：迁移既有历史

- 前置条件：仓库仍包含 v1 需求归档、OpenSpec 归档、tracked outputs 或受跟踪 UI Review runs。
- 当：先运行迁移预览。
- 则：结果列出可安全压缩的事件、阻断引用、未知文件和预计删除目标，不修改文件。
- 并且：只有显式写入且所有阻断为零时才迁移；用户未跟踪内容和 Git 历史不受影响。

### 场景：两个变更并发完成

- 前置条件：两个进程尝试更新相同正式规格或生命周期文件。
- 当：第二个进程无法取得仓库级完成锁。
- 则：它返回稳定 busy 诊断且不修改任何文件；锁过期时只能通过受控恢复确认事务状态。

## 页面与交互

- 入口与操作路径：CLI、技能工作流、GitHub Actions；不涉及业务页面。
- 字段、文案与默认值：默认 preview；写操作显式 `--write`；严格证据显式 `--evidence-mode strict` 或由高风险规则决定。
- 加载态、空态、错误态、禁用态：无活动变更返回有界空结果；锁冲突、版本冲突、引用不明、Git 特殊状态和路径越界均非零失败。
- 权限与角色差异：不新增权限模型，不自动取得远端 CI 或 GitHub 写权限。
- 设计稿链接：不适用。

## 交互状态矩阵

| 状态 | 覆盖决定 | 触发或前置条件 | 期望结果 | 验证方式 | 关联验收 | 不适用理由 |
| --- | --- | --- | --- | --- | --- | --- |
| 初始（已有数据） | 覆盖 | 仓库存在 v1 归档、历史 outputs 和正式规格 | 预览准确分类可迁移与阻断目标 | 自动 | A-01、A-08 | — |
| 用户操作 | 覆盖 | 执行状态、上下文、完成或迁移命令 | 返回有界稳定机器结果，写入必须显式授权 | 自动 | A-02、A-03、A-04、A-06 | — |
| 刷新 | 覆盖 | 重复查询、完成恢复或迁移预览 | 投影和摘要稳定，不产生重复事件或文件 | 自动 | A-02、A-03、A-08 | — |
| 空态 | 覆盖 | 无活动需求、无事件或无诊断 | 返回空数组和 unknown/healthy，不扫描大目录 | 自动 | A-02、A-05 | — |
| 错误态 | 覆盖 | Git 冲突、并发锁、版本混写、路径越界、未知文件或摘要不一致 | 失败关闭，保留稳定 code、target、status 和恢复提示 | 自动 | A-03、A-07、A-08 | — |
| 卸载 | 覆盖 | 一次性命令成功、失败或被中断 | 释放锁并清理本次临时目录；需恢复事务单独保留 | 自动 | A-03、A-04 | — |

## 接口与数据

- 生命周期配置使用仓库相对路径，声明 `schemaVersion: 2`、`minimumWriterVersion`、事件目录、运行时目录和证据预算。
- 事件至少包含 `schemaVersion`、`eventId`、`scope`、`changeId`、`requirementId`、`type`、`revision`、`occurredAt`、`baseRevision`、`capabilities`、`specDigest`、`checks`、`trust` 和可选 `supersedes`。
- 单条事件和严格证据包必须受大小、数组数量、字符串长度、控制字符、路径和 schema 校验；年份由 `occurredAt` 决定。
- 状态投影按 revision 与 supersedes 关系解析；重复 eventId、分叉 revision、未知 supersedes 或同层冲突返回诊断，不采用文件最后一行。
- 阶段上下文返回 `schemaVersion`、`stage`、`scope`、`changeId`、`facts`、`counts`、`diagnostics`、`offset`、`limit` 和 `nextOffset`，不写新的持久文件。
- Git 差异检查在 PR 使用 base SHA，在普通 push 使用父提交；无法确定基线时报告 unavailable，不伪造通过。

## 关联变更范围

| 变更 | 决策范围 | 验收范围 |
| --- | --- | --- |
| compact-lifecycle-storage | D-01、D-02、D-03、D-04、D-05、D-06、D-07、D-08、D-09、D-10、D-11、D-12、D-13、D-14、D-15、D-16、D-17、D-18、D-19 | A-01、A-02、A-03、A-04、A-05、A-06、A-07、A-08、A-09、A-10 |

## 修订记录

| 修订 | 日期 | 影响决策 | 影响验收 | 验证与任务处理 |
| --- | --- | --- | --- | --- |
| R-01 | 2026-09-11 | D-01～D-19 | A-01～A-10 | 综合多轮审计建立整体迁移和实现顺序；全部验证保持计划。 |

## 兼容性与风险

- 本次变更影响共享完成入口、Git、文件系统、CI 和持久格式，属于发布级、跨平台高风险。
- v2 不承诺从已被 squash 且未保留事件的分支恢复完整过程；默认历史是状态声明，不是永久证据。
- 完成删除活动正文前必须确保正式规格不再依赖局部 D/A 编号；真正长期决策需提升为全局 DEC。
- 旧插件仍可能生成 v1 文件，因此新写入器失败关闭，统一验证必须拒绝混合结构。
- Windows 需要覆盖盘符、斜杠、大小写、Unicode NFC、路径长度、锁文件和原子替换；摘要统一按 LF 规范化字节计算。
- 外部 CI 只有在真实矩阵对精确候选提交成功后才是交付证据；本地修改阶段保持待执行。

## 测试与验证

- 测试文件策略：新建；目标路径：`tests/lifecycle-history.test.mjs`；基线证据：规划时目标文件不存在，相关完成、footprint、UI Review、CI 与结构测试已受 Git 跟踪；选择理由：生命周期事件建立独立能力测试，迁移和上下文按职责使用独立文件并扩展既有专用测试，不以裸 TC 编号作为唯一定位。
- 独立测试方案：需要；活动变更与目标：`openspec/changes/compact-lifecycle-storage/test-plan.md`；需求修订基线：R-01。
- 验证范围：全量；执行聚焦生命周期测试、`npm test`、`npm run validate`、官方 Skill/Plugin validators 和 `npm run verify`；原因是完成、规格、CI 和共享运行时均受影响。
- 跨平台回归：Windows/POSIX 路径双侧规范化、CRLF/LF 摘要、锁竞争、异常清理、Git 特殊状态、sparse checkout、旧写入器和机器诊断稳定字段。
- 外部验证：五平台真实矩阵在最终候选提交上全部成功前保持待执行。

## 验证记录

| 验证ID | 验证类型 | 执行内容或环境 | 执行日期 | 结果 | 证据位置 |
| --- | --- | --- | --- | --- | --- |
| V-01 | 自动 | 生命周期事件 schema、追加、投影和冲突 | 2026-09-11 | 通过 | `openspec/changes/compact-lifecycle-storage/evidence/V-01.json` |
| V-02 | 自动 | 跨平台路径、Unicode、长度与 LF/CRLF 摘要 | 2026-09-11 | 通过 | `openspec/changes/compact-lifecycle-storage/evidence/V-02.json` |
| V-03 | 自动 | 完成事务、锁、Git 特殊状态、原生 archive 临时化与恢复 | 2026-09-11 | 通过 | `openspec/changes/compact-lifecycle-storage/evidence/V-03.json` |
| V-04 | 自动 | 生命周期 Git 差异保护和追加历史 | 2026-09-11 | 通过 | `openspec/changes/compact-lifecycle-storage/evidence/V-04.json` |
| V-05 | 自动 | 运行时目录、tracked 临时产物硬门禁与 UI Review 边界 | 2026-09-11 | 通过 | `openspec/changes/compact-lifecycle-storage/evidence/V-05.json` |
| V-06 | 自动 | 阶段上下文有界输出且不落盘 | 2026-09-11 | 通过 | `openspec/changes/compact-lifecycle-storage/evidence/V-06.json` |
| V-07 | 自动 | 正式规格治理与测试定位歧义 | 2026-09-11 | 通过 | `openspec/changes/compact-lifecycle-storage/evidence/V-07.json` |
| V-08 | 自动 | 存量迁移预览、引用/未知文件阻断、显式写入与幂等 | 2026-09-11 | 通过 | `openspec/changes/compact-lifecycle-storage/evidence/V-08.json` |
| V-09 | 自动 | CI 事件差异、生命周期版本、产物保留和混合结构门禁 | 2026-09-11 | 通过 | `openspec/changes/compact-lifecycle-storage/evidence/V-09.json` |
| V-10 | 自动 | 本地全量、结构、OpenSpec 与统一验证 | 2026-09-11 | 通过 | `openspec/changes/compact-lifecycle-storage/evidence/V-10.json` |
| V-11 | 自动 | 官方 Skill 与 Plugin validators | 2026-09-11 | 通过 | `openspec/changes/compact-lifecycle-storage/evidence/V-11.json` |
| V-12 | 人工 | 人工复核 Linux x64/ARM64、Windows x64、macOS Intel/ARM64 同一候选提交 | 2026-09-11 | 未执行 | `openspec/changes/compact-lifecycle-storage/verification.md` |

## 验收标准

- [x] A-01：当前持久结构不再要求 OpenSpec 归档、需求正文归档和普通 tracked outputs；v2 配置与事件格式有界、可版本化且不含绝对路径。
- [x] A-02：状态由事件安全投影并区分 active、accepted-local、accepted-merged、cancelled、superseded、unknown；待验证正文不再干扰完成后的判断。
- [x] A-03：完成入口复用 OpenSpec 原生安全能力，仓库级锁、Git 前置检查、事务恢复和幂等追加可以阻止并发、部分失败和重复事件。
- [x] A-04：默认运行、缓存、事务和 UI Review 产物进入统一忽略目录；严格模式至多保留一个有界证据包，普通流程不产生长期文件树。
- [x] A-05：阶段上下文有界且不落盘，正式规格具备重复/退役/总上下文诊断，测试证据不依赖裸 TC 编号。
- [x] A-06：CI 对活动变更删除、事件追加、旧事件篡改、混合版本和 tracked 临时目录执行稳定差异门禁，并设置远端产物保留期。
- [x] A-07：Windows/POSIX、LF/CRLF、scope、Unicode、路径长度、锁与子进程错误均有确定性回归；本地结果不冒充五平台外部通过。
- [x] A-08：存量迁移默认预览、显式写入、引用反查、未知文件阻断和幂等恢复成立，不删除未跟踪内容或重写 Git 历史。
- [x] A-09：技能、模板、README、AGENTS 和机器诊断统一采用 v2 生命周期，不再指导每次为 outputs 新增过滤规则或移动证据路径。
- [x] A-10：聚焦、本地全量、结构、官方 validators 和统一验证通过；真实五平台 CI 保持独立待执行直至精确提交成功。

## 验收—证据映射

| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 | 验证记录 |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | v2 持久结构 | D-01、D-02、D-04、D-08、D-16、D-18 | 自动 | `tests/lifecycle-history.test.mjs` | schema、大小、路径和追加合同通过 | V-01 |
| A-02 | 状态投影 | D-02、D-08、D-17 | 自动 | `tests/lifecycle-history.test.mjs` | 状态与冲突投影可定位 | V-01 |
| A-03 | 完成事务 | D-03、D-06、D-07、D-09 | 自动 | 完成流程专用测试 | 并发、Git 状态和恢复失败关闭 | V-03 |
| A-04 | 临时与严格证据 | D-04、D-05、D-10 | 自动 | 运行时与 footprint 测试 | 临时目录不受跟踪，严格证据有界 | V-05 |
| A-05 | 上下文、规格与测试治理 | D-11、D-12、D-13 | 自动 | `tests/stage-context.test.mjs`、规格审计 | 输出有界且歧义可见 | V-06、V-07 |
| A-06 | CI 差异与远端保留 | D-09、D-14、D-16 | 自动 | 生命周期差异测试、工作流文本合同 | 删除和篡改阻断，产物 14 天保留 | V-04、V-09 |
| A-07 | 跨平台确定性 | D-07、D-17、D-18、D-19 | 自动+人工 | 跨平台 fixture 与真实矩阵 | 本地稳定回归；外部待执行 | V-02、V-03、V-12 |
| A-08 | 存量安全迁移 | D-15 | 自动 | `tests/lifecycle-migration.test.mjs` | 预览、阻断、写入和恢复幂等 | V-08 |
| A-09 | 使用指引一致 | D-01～D-18 | 自动 | 技能、模板、README、AGENTS 引用检查 | 不再生成旧归档和 outputs 指引 | V-09、V-10 |
| A-10 | 发布级验证 | D-19 | 自动+人工 | 本地统一验证与 GitHub Actions | 本地通过；外部保持待执行 | V-10、V-11、V-12 |

## 待确认问题

- 无。默认轻量记录、严格模式边界、存量迁移安全条件和不重写 Git 历史均已由用户确认。
