# REQ-2026-036：健康检查识别插件仓库

## 基本信息

- 状态：实施中
- 提出人：用户
- 负责人：Codex
- 目标版本：0.18.x
- 关联页面或模块：项目健康检查、插件 marketplace、插件 manifest、工作流检查 Skill
- 关联变更：`recognize-plugin-repository-health`

## 背景与目标

当前健康检查仅把目标识别为 Wayfinder、旧工作流或未初始化项目。本仓库根目录实际由 `.agents/plugins/marketplace.json` 与 `plugins/*/.codex-plugin/plugin.json` 组成插件仓库，但健康检查仍将未使用业务受管标记的 `AGENTS.md`、`openspec/config.yaml` 和缺少 `wayfinder/frontend.md` 判为错误，导致一个可发布的插件仓库被误报为不健康。

本需求让健康检查在不增加日常读取、网络、运行时扫描和自动写入的前提下，识别本地插件仓库、返回可供 AI 与 CI 使用的稳定事实，并将真正的 marketplace/manifest 结构问题与不适用的业务工作流要求区分开。

## 决策台账

| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 识别目标 | 已确认 | 健康检查必须把符合本地 marketplace 与插件 manifest 结构的仓库识别为插件仓库，不再按未初始化业务项目误报。 | 用户“让健康检查识别插件仓库”。 |
| D-02 | 插件仓库签名 | 项目默认 | 以仓库根 `.agents/plugins/marketplace.json` 为入口，逐项识别 `source.source=local` 的插件；每个 source.path 必须安全地指向仓库内目录，且该目录存在 `.codex-plugin/plugin.json`。 | 当前 `.agents/plugins/marketplace.json`、`plugins/frontend-ai-workflow/.codex-plugin/plugin.json` 与项目路径安全规则。 |
| D-03 | 输出兼容合同 | 项目默认 | 保留既有 `layout` 字段语义；新增可选 `repositoryKind: "plugin-repository"` 与 `pluginRepository` 结构描述插件仓库状态、marketplace 与插件条目，不移除完整检查或 summary 的既有字段。 | `check-project.mjs`、`check-project-output.mjs` 与 `ai-context-efficiency` 的兼容合同。 |
| D-04 | 插件仓库检查语义 | 项目默认 | 对已识别插件仓库，不要求 Wayfinder、业务受管标记、构建、lint 或类型检查脚本；改为检查 marketplace/manifest 的存在、JSON 结构、受控路径、名称一致性、必要插件目录及根级 `test`、`validate` 命令。规划引擎、活动变更和需求证据审计保持现有只读检查。 | 当前根 `package.json`、`validate-structure.mjs`、`check-project.mjs` 与插件仓库职责。 |
| D-05 | 成本与读取边界 | 已确认 | 普通健康检查只读取根 package、marketplace、相关 manifest 与必要目录元数据；不得扫描 `runtime/**`、`outputs`、归档正文或执行测试、打包、浏览器、安装和网络下载。完整插件结构/运行时校验仍由显式 `npm run validate` 与统一验证承担。 | 用户持续降低读取与 CI 成本的要求；根 `AGENTS.md` 的 AI 读取路由与持续体积治理。 |
| D-06 | 错误与安全边界 | 项目默认 | marketplace 损坏、非法或越界插件路径、符号链接、缺少 manifest、manifest JSON 损坏、名称不一致和必要目录缺失必须失败关闭，并提供稳定英文 `code`、`status`、`target`；人类说明保持中文。 | `project-path-safety.mjs` 与跨平台 CI 防回归清单。 |
| D-07 | 非插件项目兼容 | 已确认 | Wayfinder、旧工作流和未初始化业务项目的原有检查与迁移提示保持不变；只有确认插件仓库签名后才豁免业务工作流必需项。 | 用户要求“识别插件仓库”，未授权放宽普通项目检查。 |
| D-08 | 自动化与写入边界 | 已确认 | 本变更不初始化、升级、迁移或修改被检查仓库，不改变插件安装/升级、平台运行时交付、CI 触发、权限、缓存或定时任务。 | 用户已确认的运行时交付边界与“不再定时进行此类优化”要求。 |
| D-09 | 测试文件策略 | 项目默认 | 新建手写专用测试 `tests/plugin-repository-health.test.mjs`，避免继续扩大已达 592 行的 `tests/workflow-project.test.mjs`；该新文件纳入现有 `tests/*.test.mjs` 共享集合。 | `scripts/test-groups.mjs` 自动发现规则、现有测试职责与当前文件行数。 |
| D-10 | 跨平台风险与证据 | 项目默认 | 跨平台高风险：是；命中路径和机器可读诊断。受影响平台为现有 CI 的 macOS ARM64/x64、Linux ARM64/x64、Windows x64。实现须覆盖 POSIX 与 Windows 路径样本的双侧规范化；本地聚焦、统一验证与真实 CI 分层记录。 | `plugins/frontend-ai-workflow/references/cross-platform-ci-checklist.md` 与 `.github/workflows/validate.yml`。 |

## 范围

### 包含

- 增加只读的插件仓库识别与本地 marketplace/manifest 一致性检查。
- 将插件仓库结果接入完整和 `--summary` 健康检查输出，并维持既有字段兼容。
- 对插件仓库使用专属检查语义，消除不适用的 Wayfinder 与业务脚本误报。
- 为结构错误、路径安全错误和名称不一致提供稳定机器字段与中文说明。
- 更新工作流检查 Skill，并把新增识别器纳入插件结构发布完整性清单。
- 新建专用测试，覆盖成功、重复检查、非插件兼容、空态、错误态和跨平台路径语义。

### 不包含

- 自动初始化、升级、迁移或写入被检查仓库。
- 运行完整插件结构校验、运行时完整性校验、测试、打包、浏览器冒烟、安装或网络下载。
- 改变插件安装/升级、平台运行时交付、GitHub Actions 触发、权限、缓存、依赖或定时任务。
- 让任意含有 `.codex-plugin` 目录的业务项目自动获得插件仓库豁免。

## 当前行为

- `check-project.mjs --target . --summary` 将当前根仓库返回为 `layout: "none"`，并因根 `AGENTS.md`、`openspec/config.yaml` 没有业务受管标记及缺少 `wayfinder/frontend.md` 返回失败。
- `validate-structure.mjs` 能针对当前仓库检查 marketplace 与 manifest，但该完整校验不适合作为每次健康检查的前置：它还会读取运行时、技能和平台资产完整性。
- 普通健康检查会保留依赖画像、命令、规划引擎、活动变更和需求证据审计，但没有仓库类型或插件条目字段。

## 期望行为

### 场景：检查有效插件仓库

- 前置条件：目标根目录存在有效 `.agents/plugins/marketplace.json`，其中本地插件路径位于目标仓库内，且每个对应目录都有有效 manifest。
- 当：调用 `check-project.mjs --target <repository-root> --summary`。
- 则：结果 `ok=true`，并返回 `repositoryKind: "plugin-repository"` 与 `pluginRepository` 的稳定状态、marketplace 和已识别插件条目。
- 并且：不再出现要求业务受管标记、Wayfinder 文件或构建/lint/类型检查脚本的错误或警告。
- 异常或边界：仍保留规划引擎、活动变更、根级 `test`/`validate` 命令和需求证据审计的真实检查结果。

### 场景：插件仓库配置发生变化后再次检查

- 前置条件：有效插件仓库的 marketplace 条目、插件目录或 manifest 内容已变更。
- 当：再次执行健康检查。
- 则：检查直接反映当前文件状态，不依赖缓存，也不生成或修改文件。
- 并且：有效变更保持通过；结构失配转为可定位失败。

### 场景：插件仓库结构无效

- 前置条件：marketplace JSON 损坏、本地 source.path 越界或经过符号链接、缺少 manifest、manifest JSON 损坏、名称不一致或必要目录缺失。
- 当：执行完整或 summary 健康检查。
- 则：检查返回非零状态与 `ok=false`。
- 并且：结果使用稳定 `code`、`status`、`target` 定位，且不因错误回退为 Wayfinder 自动初始化或放宽为成功。

### 场景：检查非插件业务项目

- 前置条件：目标不具备有效插件仓库签名。
- 当：执行健康检查。
- 则：Wayfinder、旧工作流和未初始化项目沿用当前布局识别、错误和迁移提示。
- 并且：不会因为目录名、单一 manifest 或局部 `.codex-plugin` 目录而误判为插件仓库。

## 页面与交互

- 入口与操作路径：`frontend-workflow-check` Skill 与 `check-project.mjs` CLI；不涉及业务页面。
- 字段、文案与默认值：默认完整结果兼容；`--summary` 返回新增可选插件仓库字段；机器字段稳定英文，面向维护者的诊断中文。
- 加载态、空态、错误态、禁用态：命令为一次性只读进程；无本地插件条目或缺少 manifest 是失败关闭的空/错误状态；不存在 UI 禁用态。
- 权限与角色差异：不新增权限，不读取登录态、密钥或网络资源。
- 设计稿链接：不适用。

## 交互状态矩阵

| 状态 | 覆盖决定 | 触发或前置条件 | 期望结果 | 验证方式 | 关联验收 | 不适用理由 |
| --- | --- | --- | --- | --- | --- | --- |
| 初始（已有数据） | 覆盖 | 当前仓库包含一个有效本地 marketplace 条目和对应 manifest | summary 正确识别插件仓库，且不出现业务工作流误报 | 自动 | A-01、A-02 | — |
| 用户操作 | 覆盖 | 维护者执行完整或 summary 健康检查 | 返回兼容的完整事实和新增插件仓库字段；不写入目标 | 自动 | A-01、A-02 | — |
| 刷新 | 覆盖 | 修改 marketplace、source.path 或 manifest 后再次执行同一命令 | 无缓存地反映当前状态；有效/失配结论准确切换 | 自动 | A-02、A-03 | — |
| 空态 | 覆盖 | marketplace 存在但没有可识别的本地插件条目，或目标不是插件仓库 | 前者失败关闭并给出稳定诊断；后者保持普通项目原有语义 | 自动 | A-03、A-04 | — |
| 错误态 | 覆盖 | JSON 损坏、路径越界/符号链接、manifest 缺失或名称不一致 | `ok=false`、非零退出和稳定 `code/status/target`，不自动修复 | 自动 | A-03 | — |
| 卸载 | 不适用 | 健康检查不创建订阅、浏览器、服务或常驻任务 | 不适用 | 自动 | — | 一次性 Node 只读进程没有组件或后台生命周期。 |

## 接口与数据

- CLI 参数保持 `--target`、`--summary`、`--diagnostic-code`、`--diagnostic-offset` 和 `--diagnostic-limit` 现有合同，不增加隐式写入参数。
- 完整和 summary 结果新增可选 `repositoryKind` 与 `pluginRepository`；`layout`、历史诊断查询和现有字段继续保持兼容。
- `pluginRepository` 至少表达整体状态、marketplace 相对路径和已识别插件的名称、相对路径、manifest 版本与状态；错误对象使用稳定 `code`、`status`、`target`。
- 插件 source.path 必须使用仓库相对的正斜杠路径；绝对路径、`..`、空路径段、符号链接和项目外路径均拒绝。

## 关联变更范围

| 变更 | 决策范围 | 验收范围 |
| --- | --- | --- |
| recognize-plugin-repository-health | D-01、D-02、D-03、D-04、D-05、D-06、D-07、D-08、D-09、D-10 | A-01、A-02、A-03、A-04、A-05 |

## 修订记录

| 修订 | 日期 | 影响决策 | 影响验收 | 验证与任务处理 |
| --- | --- | --- | --- | --- |
| R-01 | 2026-08-31 | D-01～D-10 | A-01～A-05 | 首次建立插件仓库健康识别需求；所有验证保持计划，任务待规划。 |

## 兼容性与风险

- `layout` 是既有健康检查输出字段，变更其语义会影响现有调用方；本需求仅新增仓库类别字段，不用插件类别覆盖旧布局值。
- marketplace 的路径属于不可信配置输入。所有路径解析必须复用项目安全路径规则，并在外平台样本中显式覆盖 `path.win32` 语义。
- 把完整结构校验嵌入普通健康检查会读取运行时与平台资产，重新扩大日常 AI 与 CI 成本；本需求明确将两类检查分层。
- 插件仓库与业务项目可能共存。只有完整签名成立才豁免业务工作流必需项；不完整签名必须失败关闭，不能静默降级。
- 本变更不修改 CI，但健康检查机器输出与路径行为属于跨平台高风险；聚焦回归不能替代同一提交的现有五平台 CI 证据。

## 测试与验证

- 测试文件策略：新建；目标路径：`tests/plugin-repository-health.test.mjs`；基线证据：该路径尚不存在，`tests/workflow-project.test.mjs` 已受 Git 跟踪且为 592 行；选择理由：插件仓库识别、路径安全和输出兼容形成独立职责，避免继续扩大通用工作流测试。
- 独立测试方案：需要；触发条件：本变更需要跨 D-01～D-10 与 A-01～A-05 跟踪成功、刷新、空态、错误态、兼容与跨平台路径场景；活动变更与目标：`openspec/changes/recognize-plugin-repository-health/test-plan.md`；需求修订基线：R-01。
- 验证范围：全量；计划执行专用 Node 测试、`npm test`、`npm run validate`、`npm run verify`、官方 Skill/Plugin validators、Vue 3 + Vite fixture 与同一精确提交的现有共享加五平台 CI；选择理由：检查结果、路径安全、机器可读输出、插件结构清单和共享验证入口均受影响。
- 自动测试：覆盖有效单/多插件仓库、重复只读检查、无本地条目、损坏 JSON、越界与符号链接、缺失/损坏 manifest、名称不一致、普通 Wayfinder/旧工作流兼容、summary/完整结果兼容、POSIX 与 Windows 外平台路径样本。
- 人工检查：复核当前仓库的 summary 不再出现 Wayfinder/业务脚本误报，并确认结果未读取运行时、输出或归档内容。
- 构建与静态检查：执行 `npm run validate` 与 `npm run verify`；不把任一命令嵌入日常健康检查。

## 验证记录

| 验证ID | 验证类型 | 执行内容或环境 | 执行日期 | 结果 | 证据位置 |
| --- | --- | --- | --- | --- | --- |
| V-01 | 自动 | `node --test tests/plugin-repository-health.test.mjs` | 2026-08-31 | 通过 | `openspec/changes/recognize-plugin-repository-health/verification.md` |
| V-02 | 自动 | `npm test`、`npm run validate`、`npm run verify` 与结构发布校验 | 2026-08-31 | 通过 | `openspec/changes/recognize-plugin-repository-health/verification.md` |
| V-03 | 自动 | Vue 3 + Vite fixture 初始化、重复执行、升级和健康检查兼容回归 | 2026-08-31 | 通过 | `openspec/changes/recognize-plugin-repository-health/verification.md` |
| V-04 | 人工 | 环境：当前插件仓库；检查 summary 中插件类别、误报消失与无运行时扫描 | 2026-08-31 | 通过 | `openspec/changes/recognize-plugin-repository-health/verification.md` |
| V-05 | 人工 | 环境：同一精确提交的 GitHub Actions shared 与五平台矩阵；检查任务状态与平台范围 | 待执行 | 计划 | GitHub Actions 运行链接：待产生 |

## 验收标准

- [ ] [A-01] 有效本地插件仓库的完整和 summary 健康检查均识别 `repositoryKind: "plugin-repository"`，返回可用插件仓库事实，并消除不适用的业务工作流误报。
- [ ] [A-02] 新增输出字段与既有 `layout`、完整结果、summary、诊断查询兼容；重复检查只反映当前文件状态且不写入目标。
- [ ] [A-03] marketplace/manifest 损坏、空本地条目、越界或符号链接路径、缺失目录/manifest、名称不一致均失败关闭，并以稳定 `code`、`status`、`target` 定位。
- [ ] [A-04] 非插件业务项目继续沿用 Wayfinder、旧工作流和未初始化项目的既有识别与迁移提示，不因局部插件目录误豁免。
- [ ] [A-05] 专用回归、全量测试、结构/统一验证、官方 validators、Vue 3 + Vite fixture 与同一精确提交的共享加五平台 CI 全部通过；无新增网络、缓存、权限、依赖、CI 触发或定时任务。

## 验收—证据映射

| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 | 验证记录 |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 有效插件仓库识别及误报消除 | D-01、D-02、D-04、D-05 | 自动+人工 | 专用测试与 `verification.md` | 有效 marketplace/manifest 返回插件类别，未再要求 Wayfinder 或业务脚本 | V-01、V-04 |
| A-02 | 输出和只读兼容 | D-03、D-05、D-08 | 自动 | 专用测试与 `verification.md` | 既有字段保持，新增字段可选；重复检查不写入且反映当前文件 | V-01、V-02 |
| A-03 | 结构、路径与机器诊断安全 | D-02、D-06、D-10 | 自动 | 专用测试与 `test-plan.md` | 所有无效结构非零失败，稳定字段可定位并覆盖 Windows 外平台路径语义 | V-01、V-02 |
| A-04 | 非插件项目兼容 | D-07 | 自动 | 专用测试与 Vue fixture 回归 | Wayfinder、旧工作流和未初始化项目维持原有结论 | V-01、V-03 |
| A-05 | 分层验证和交付边界 | D-05、D-08、D-09、D-10 | 自动+人工 | `verification.md`、机器证据与 GitHub Actions | 验证链和五平台 CI 通过，未增加运行时读取、网络、CI 触发或定时任务 | V-02、V-03、V-04、V-05 |

## 待确认问题

- 无。插件仓库识别以当前 marketplace 的本地 source 结构为范围；远程 marketplace 或自动安装语义不在本变更内。
