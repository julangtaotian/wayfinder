# REQ-2026-038：按需拆分 UI 验收报告脚本

## 基本信息

- 状态：实施中
- 提出人：用户
- 负责人：Codex
- 目标版本：0.18.x
- 关联页面或模块：`plugins/frontend-ai-workflow/scripts/ui-review-report.mjs`、`ui-review-runner.mjs`、`playwright-adapter-runner.mjs`
- 关联变更：`modularize-ui-review-report-on-demand`

## 背景与目标

`ui-review-report.mjs` 当前为 694 行，同时承担 PNG 尺寸读取、输入契约校验、两类 Markdown 渲染、FFmpeg 标注产物、原子目录替换与 CLI 解析。它只在 UI 验收路径使用，却要求维护者在修改任一职责时阅读整份入口。本轮将其按调用职责拆分为可按需定位的内部模块，并保留原入口作为唯一兼容门面。

目标是在不改变任何用户可见行为、公开导出或 CLI 合同的前提下，使报告输入、文本渲染和图片产物各自独立维护；原入口缩小到稳定 API 与编排。

## 决策台账

| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 拆分范围 | 已确认 | 本轮只拆分 `ui-review-report.mjs`；不同时拆分 `real-project-validation.mjs`、`check-project.mjs`、`playwright-runtime.mjs` 或 CI。 | 用户“现在做一下大脚本按需拆分”；当前行数与调用图盘点 |
| D-02 | 可观察行为 | 项目默认 | 本变更不改变可观察行为，允许 `skip_specs: true`；保留既有公开函数、同步调用方式、CLI 参数、输出字段、中文错误语义与退出状态。 | 纯内部模块化；现有调用方与测试合同 |
| D-03 | 内部职责边界 | 项目默认 | 输入模块负责 PNG 与审核输入解析和基础校验；决策模块负责问题筛选、合并与结论派生；渲染模块负责两类 Markdown；产物模块负责 FFmpeg、受控输出目录、暂存与恢复；原入口仅重导出和编排。 | 当前函数分组、两个生产调用方与聚焦测试 |
| D-04 | 体积与依赖目标 | 项目默认 | 兼容入口不超过 180 行；新增内部模块各不超过 500 行，继续满足全仓单文件 800 行预算；仅使用 Node.js 标准库且不得形成循环依赖。 | `repository-footprint.mjs` 预算合同与项目实现约束 |
| D-05 | 跨平台边界 | 项目默认 | 跨平台高风险：是；命中路径、临时目录、子进程和机器可读诊断。继续使用 Node `path`、受控目录安全 API 与 `spawnSync` 的数组参数，不引入 shell；影响平台以真实 CI 的 darwin-arm64、darwin-x64、linux-x64、linux-arm64、win32-x64 为准。 | `references/cross-platform-ci-checklist.md` 与当前报告链 |
| D-06 | 测试文件策略 | 项目默认 | 新建 `tests/ui-review-report-modularization.test.mjs`，专门覆盖兼容门面、职责边界、失败清理和 Windows/POSIX 路径样本；既有 UI Review 自动化与证据完整性测试继续验证相邻调用方。 | 当前没有同职责的独立报告脚本测试；Git 基线与现有测试目录 |
| D-07 | 验证范围 | 项目默认 | 先执行专用 Node 测试及 UI Review 相关回归，再执行体积门禁、`npm test`、`npm run validate` 和统一验证；真实五平台 CI 仅记录同一提交的外部事实。 | 该入口被报告生成、Playwright 适配器与证据渲染共同导入，属于共享插件链路 |
| D-08 | 后续功能维护规则 | 已确认 | 在 UI 验收报告链新增功能时，先按数据解析、业务判断和输出报告三类职责定位；只有跨职责或已有模块达到维护边界时才拆分。单职责改动继续在所属模块完成，不为拆分而拆分；异常、路径安全、暂存清理和兼容门面语义必须随所属职责保持失败关闭。 | 用户要求将该原则纳入本轮交付并兼容非正常情况 |
| D-09 | 提交前路径与 Markdown 门禁 | 已确认 | 测试方案与需求交付校验必须拒绝 POSIX、`D:/`、`D:\\` 等任一平台绝对路径，Git 基线只以 `HEAD` 判断，不把本轮暂存的新建测试误判为既有文件；结构校验扫描活动变更、活动需求与插件 Markdown 模板，禁止裸 `[D-xx]`、`[A-xx]` 引用标签，要求使用普通编号或有效链接。归档历史不纳入日常扫描。 | 用户要求修复重复出现的 Windows 路径问题和未定义引用标签，避免代码检查报红阻断提交推送 |

## 范围

### 包含

- 将 `ui-review-report.mjs` 拆为输入规范化、报告渲染与标注产物内部模块。
- 保留 `parsePngDimensions`、`normalizeReviewInput`、`renderReviewMarkdown`、`createDeterministicReportContext`、`renderDeterministicAssessmentMarkdown`、`generateUiReview` 与 CLI 的原入口路径和同步语义。
- 新建专用回归，覆盖导出兼容、无问题/有问题渲染、受控输出、异常清理与跨平台路径样本。
- 以体积门禁约束兼容门面与新增模块规模。
- 在 `references/ui-review-workflow.md` 固化报告链的后续功能职责路由与异常兼容规则。
- 修复测试方案、需求交付校验中的跨平台绝对路径识别，并在结构校验中加入活动 Markdown 裸 D/A 引用标签门禁。

### 不包含

- 更改 UI Review 场景、比较算法、报告文案含义、配置 schema、证据 schema 或自动修复边界。
- 修改 Playwright 固定运行时、真实项目验证、平台打包、CI 工作流或根依赖。
- 引入动态下载、系统浏览器回退、定时任务或外部网络服务。
- 扫描归档历史或把所有 Markdown 链接形式纳入强制规范；本轮只禁止会被编辑器误判为未定义引用的裸 D/A 标签。

## 当前行为

同一脚本同时读取图片、校验审核输入、生成 Markdown、启动 FFmpeg、维护暂存目录并解析 CLI。`ui-review-runner.mjs` 与 `playwright-adapter-runner.mjs` 直接从该入口导入公开函数，任何局部维护都需要穿透读取约 694 行实现。

## 期望行为

### 场景：既有调用方生成或读取报告

- 前置条件：调用方继续从 `ui-review-report.mjs` 导入既有公开函数，或执行原 CLI。
- 当：生成标注报告、渲染确定性验收结果或读取 PNG 尺寸。
- 则：函数签名、同步返回值、Markdown、JSON 输出、错误语义和退出状态与拆分前兼容。
- 并且：调用方不需要改为内部模块路径。
- 异常或边界：输入、路径或 FFmpeg 失败时仍失败关闭，且不保留未发布的暂存目录。

### 场景：维护单一报告职责

- 前置条件：维护者只需调整输入契约、文本报告或标注产物之一。
- 当：定位对应内部模块。
- 则：无需读取不相关职责；兼容入口只承担重导出、CLI 参数和总编排。
- 并且：模块之间只能单向依赖，不形成循环。

### 场景：跨平台路径与输出恢复

- 前置条件：输出目录、暂存目录或源图片路径使用 POSIX 或 Windows 风格样本。
- 当：进行安全路径校验、产物写入或失败恢复。
- 则：继续使用平台路径 API 和受控项目路径安全 API；不通过 shell 拼接命令。
- 并且：成功和失败路径都只清理本次创建的受控暂存目录。

### 场景：后续功能进入报告链

- 前置条件：后续需求需要扩展 UI 验收报告的输入、判断或输出。
- 当：维护者确定代码落点。
- 则：先判断其属于数据解析、业务判断、输出报告中的哪一类，再选择既有所属模块或在跨职责、达到维护边界时创建新模块。
- 并且：单职责改动不为形式拆分；既有兼容入口、失败关闭、路径安全、暂存清理和中文诊断保持不变。
- 异常或边界：需求同时改变公开 API、报告语义、权限、路径边界或错误语义时，必须先修订需求台账与验收，不能只依据维护规则直接改动。

### 场景：提交前路径与 Markdown 校验

- 前置条件：维护者在测试方案、需求交付记录或活动变更 Markdown 中填写路径和 D/A 追踪编号。
- 当：执行测试方案校验或 `npm run validate`。
- 则：POSIX 与两种 Windows 绝对路径均在本地确定性校验中失败关闭；本轮暂存的新建测试仍按 `HEAD` 基线识别为“新建”。
- 并且：裸 `[D-01]`、`[A-01]` 等会被编辑器解析为未定义链接的写法被稳定定位，普通编号和有效 Markdown 链接不受影响。
- 异常或边界：仅扫描活动需求、活动变更和插件模板；归档历史以及反引号代码中的示例不产生提交前噪声。

## 页面与交互

- 入口与操作路径：UI Review 内部调用、`ui-review-report.mjs` CLI 与公开 Node.js 函数。
- 字段、文案与默认值：保持现有 `--screenshot`、`--data`、`--output` 参数、JSON 结果字段与中文错误语义。
- 加载态、空态、错误态、禁用态：一次性 CLI 无加载态；无问题审核生成“通过”报告；输入、路径、FFmpeg 或写入失败返回错误，不发布半成品。
- 权限与角色差异：无新增权限或外部连接。
- 设计稿链接：不适用。

## 交互状态矩阵

| 状态 | 覆盖决定 | 触发或前置条件 | 期望结果 | 验证方式 | 关联验收 | 不适用理由 |
| --- | --- | --- | --- | --- | --- | --- |
| 初始（已有数据） | 覆盖 | 已有有效截图、审核输入与输出目录 | 兼容入口返回与拆分前相同的规范化结果和报告；后续功能有清晰职责落点 | 自动 | A-01、A-02、A-06 | — |
| 用户操作 | 覆盖 | 调用公开函数或原 CLI | 参数、返回结构和文件产物保持兼容 | 自动 | A-01、A-03 | — |
| 刷新 | 覆盖 | 对同一受控输出重复生成 | 原子替换与恢复语义保持，不能遗留暂存目录 | 自动 | A-03 | — |
| 空态 | 覆盖 | 审核输入没有可交付问题 | 生成“通过”报告且不产生问题标注 | 自动 | A-02 | — |
| 错误态 | 覆盖 | PNG、输入、路径、FFmpeg 或提交前文档校验失败 | 失败关闭，保留中文错误语义并清理本次暂存目录；维护规则不允许跨职责吞没异常；路径和裸引用被稳定定位 | 自动 | A-03、A-04、A-06、A-07 | — |
| 卸载 | 不适用 | 所有入口均为一次性 Node.js 调用 | 无订阅、计时器或后台资源 | 自动 | — | 没有持续生命周期。 |

## 接口与数据

- 接口文档链接：不适用。
- 请求方法与路径：不适用。
- 请求字段及空值语义：CLI 继续只接受 `--screenshot <path>`、`--data <path|->`、`--output <path>`；无效或缺失参数失败关闭。
- 响应字段及状态码：成功 JSON 继续包含输出目录、PNG、Markdown 和问题计数；错误继续使用既有退出状态与中文说明。
- 鉴权、加解密或敏感信息要求：不新增鉴权、网络请求或敏感信息持久化。

## 关联变更范围

| 变更 | 决策范围 | 验收范围 |
| --- | --- | --- |
| modularize-ui-review-report-on-demand | D-01、D-02、D-03、D-04、D-05、D-06、D-07、D-08、D-09 | A-01、A-02、A-03、A-04、A-05、A-06、A-07 |

## 修订记录

| 修订 | 日期 | 影响决策 | 影响验收 | 验证与任务处理 |
| --- | --- | --- | --- | --- |
| R-01 | 2026-09-01 | D-01～D-07 | A-01～A-05 | 首次建立按需拆分计划；跨平台高风险命中路径、临时目录、子进程和机器诊断，影响真实五平台矩阵；验证保持计划。 |
| R-02 | 2026-09-01 | D-03、D-08 | A-02、A-03、A-04、A-06 | 用户要求将“数据解析 / 业务判断 / 输出报告”的后续功能路由纳入本轮交付，并明确禁止为拆分而拆分。补充异常路径、兼容门面、路径安全与暂存清理边界；所有验证仍未执行，测试方案需更新至 R-02。 |
| R-03 | 2026-09-01 | D-09 | A-04、A-05、A-07 | 用户要求把重复出现的 Windows 路径识别和 Markdown 未定义引用转为提交前门禁。新增跨平台绝对路径、`HEAD` Git 基线和活动文档扫描边界；V-03 恢复为计划，新增 V-05、V-06、V-07，测试方案需更新至 R-03。 |

## 兼容性与风险

- 受影响页面、公共组件、路由、权限或接口：影响插件 UI Review 报告 CLI 与内部 Node.js 导入，不影响业务项目页面。
- 历史数据与兼容策略：保留原入口路径、全部公开导出、同步 API、参数与报告格式；内部模块不作为稳定公共 API。
- 上线与回滚注意事项：拆分时容易遗漏安全路径、临时目录清理或 FFmpeg 参数顺序；回滚只需恢复兼容门面与内部模块，不改动已生成的报告资产。

## 测试与验证

- 测试文件策略：新建；目标路径：`tests/ui-review-report-modularization.test.mjs`；基线证据：规划时该路径未受 Git 跟踪，现有 `tests/ui-review-automation.test.mjs` 仅为 UI Review 自动化聚合入口；选择理由：本轮需要直接约束报告兼容门面和内部职责边界，避免把新场景附加到相邻领域测试。
- 防回归补充：复用；目标路径：`tests/frontend-test-workflow.test.mjs`、`tests/workflow-requirements.test.mjs` 与 `tests/workflow-context.test.mjs`；基线证据：三者均为已受 Git 跟踪的对应工作流专用测试；选择理由：分别锁定测试方案路径、需求交付 Git 基线和结构 Markdown 门禁，避免与 UI Review 报告测试混合职责。
- 独立测试方案：需要；触发条件：本变更跨 D/A/V 追踪兼容导出、模块边界、路径与暂存清理；活动变更与目标：`openspec/changes/modularize-ui-review-report-on-demand/test-plan.md`；需求修订基线：R-03。
- 验证范围：全量；执行命令：专用 Node 测试、`node --test tests/ui-review-automation.test.mjs tests/verification-evidence-integrity.test.mjs`、`npm run footprint`、`npm test`、`npm run validate`、`npm run verify:shared` 与真实五平台 CI；选择理由：报告入口属于共享 UI Review、适配器和证据渲染链。
- 自动测试：断言公开导出、无问题/有问题报告、输出替换、失败清理、PNG 读取、CLI 参数及 Windows/POSIX 路径规范化；检查兼容入口行数和模块单向依赖。
- 自动测试补充：断言长期维护规则明确区分数据解析、业务判断和输出报告，并对单职责、跨职责、公开 API 与异常路径给出可执行边界。
- 人工检查：复核同一提交的五平台 CI 任务，以及生成报告的截图与 Markdown 路径没有越出受控目录；复核维护规则未把所有改动强制拆分或降低异常兼容要求。
- 构建与静态检查：体积门禁、结构校验、严格 OpenSpec 校验与补丁格式检查。

## 验证记录

| 验证ID | 验证类型 | 执行内容或环境 | 执行日期 | 结果 | 证据位置 |
| --- | --- | --- | --- | --- | --- |
| V-01 | 自动 | 专用报告模块化回归：兼容导出、模块边界、路径和清理 | 2026-09-01 | 通过 | `openspec/changes/modularize-ui-review-report-on-demand/evidence/V-01.json` |
| V-02 | 自动 | 专用报告模块化回归：受控产物、失败清理与跨平台路径 | 2026-09-01 | 通过 | `openspec/changes/modularize-ui-review-report-on-demand/evidence/V-02.json` |
| V-03 | 自动 | UI Review 相邻链路、体积与共享统一验证 | 2026-09-01 | 通过 | `openspec/changes/modularize-ui-review-report-on-demand/evidence/V-03.json` |
| V-04 | 人工 | 同一提交的五平台 CI 复核 | 待执行 | 计划 | `openspec/changes/modularize-ui-review-report-on-demand/verification.md` |
| V-05 | 自动 | 测试方案跨平台绝对路径门禁 | 2026-09-01 | 通过 | `openspec/changes/modularize-ui-review-report-on-demand/evidence/V-05.json` |
| V-06 | 自动 | 需求交付路径与 HEAD Git 基线门禁 | 2026-09-01 | 通过 | `openspec/changes/modularize-ui-review-report-on-demand/evidence/V-06.json` |
| V-07 | 自动 | 活动 Markdown 裸 D/A 引用标签门禁 | 2026-09-01 | 通过 | `openspec/changes/modularize-ui-review-report-on-demand/evidence/V-07.json` |

## 验收标准

- [ ] A-01：原入口继续提供全部既有公开函数、CLI 参数与同步调用语义，内部调用方无需改为新路径。
- [ ] A-02：输入规范化、两类 Markdown 渲染和标注产物职责独立，兼容入口不超过 180 行，新增模块均不超过 500 行。
- [ ] A-03：正常、空问题、重复写入、输入或 FFmpeg 失败时，输出、原子替换与暂存清理行为保持兼容且受控。
- [ ] A-04：路径、临时目录、子进程和机器诊断保持跨平台安全边界；无新增依赖、循环导入或 shell 调用。
- [ ] A-05：专用、相邻、体积、全量、结构和统一验证通过；真实五平台 CI 在同一提交全部成功后才标记通过。
- [ ] A-06：报告链维护规则已作为持久参考资料交付：后续功能按数据解析、业务判断和输出报告定位；单职责改动不为拆分而拆分，异常与兼容边界不被削弱。
- [ ] A-07：测试方案、需求交付与结构校验可在任一宿主系统拒绝 POSIX 和 Windows 绝对路径，并定位活动文档中的裸 D/A 引用标签，不产生归档历史或代码示例噪声。

## 验收—证据映射

| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 | 验证记录 |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 公开 API 与 CLI 兼容 | D-02、D-03、D-06 | 自动 | `openspec/changes/modularize-ui-review-report-on-demand/evidence/V-01.json` | 既有导出、参数、同步返回值和 JSON 字段保持兼容 | V-01 |
| A-02 | 可按职责维护的模块边界 | D-01、D-03、D-04、D-06 | 自动 | `openspec/changes/modularize-ui-review-report-on-demand/evidence/V-01.json` | 兼容入口和内部模块行数达标，职责单向且可定位 | V-01 |
| A-03 | 受控产物与失败恢复 | D-02、D-03、D-05、D-06 | 自动 | `openspec/changes/modularize-ui-review-report-on-demand/evidence/V-01.json` | 正常、空问题、重复写入和失败清理行为兼容 | V-01 |
| A-04 | 跨平台安全边界 | D-04、D-05、D-06 | 自动 | `openspec/changes/modularize-ui-review-report-on-demand/evidence/V-02.json` | 路径、暂存、子进程与稳定诊断回归通过，无循环依赖或 shell 调用 | V-02 |
| A-05 | 发布级验证 | D-05、D-06、D-07 | 自动+人工 | `openspec/changes/modularize-ui-review-report-on-demand/evidence/V-03.json`、`openspec/changes/modularize-ui-review-report-on-demand/verification.md` | 本地共享链通过；五平台同一提交全部成功 | V-03、V-04 |
| A-06 | 长期维护与异常兼容规则 | D-03、D-05、D-08 | 自动+人工 | `openspec/changes/modularize-ui-review-report-on-demand/evidence/V-03.json`、`plugins/frontend-ai-workflow/references/ui-review-workflow.md` | 持久规则明确职责路由、避免机械拆分，并保留异常、路径、清理与兼容门面边界 | V-03、V-04 |
| A-07 | 提交前跨平台路径与 Markdown 门禁 | D-09 | 自动 | `openspec/changes/modularize-ui-review-report-on-demand/evidence/V-05.json`、`openspec/changes/modularize-ui-review-report-on-demand/evidence/V-06.json`、`openspec/changes/modularize-ui-review-report-on-demand/evidence/V-07.json` | 测试方案与需求交付拒绝 POSIX/Windows 绝对路径，Git 基线按 HEAD 判断；结构校验定位活动文档裸 D/A 标签 | V-05、V-06、V-07 |

## 待确认问题

- [x] 本轮不扩展到其他大脚本；它们依据后续实际维护压力独立发起，避免一次性重构过大范围。
