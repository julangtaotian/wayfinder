# REQ-2026-020：插件化 UI 验收与受控自动修复

## 基本信息

- 状态：已验收
- 提出人：用户
- 负责人：Codex
- 目标版本：当前开发迭代
- 关联页面或模块：`plugins/frontend-ai-workflow/skills/`、`plugins/frontend-ai-workflow/scripts/`、`plugins/frontend-ai-workflow/assets/templates/`、`tests/`
- 关联变更：`add-plugin-ui-review-automation`、`prefer-portable-ui-review-capture`、`bundle-playwright-runtime`、`complete-ui-review-capability-chain`、`expand-playwright-platform-runtime`

## 背景与目标

现有仓库已经能够把 AI 给出的 UI 问题转换为节点标注截图和源码修复报告，但该能力仍位于样例输出目录，尚未形成可安装到业务前端项目中的公共工作流。用户明确不建设独立 PC 管理平台，希望 UI 验收成为项目内自动化流程或插件能力，并包含从验收、修复到复验的闭环。

本需求将现有 AI UI 验收合同提升为 `frontend-ai-workflow` 的正式公共能力。业务项目安装插件后，可以由 AI 工具或 CI 在本地执行 UI 验收、按报告受控修改源码并使用相同页面与视口复验；确定性的配置、状态和产物边界由插件脚本校验。插件固定内置 Playwright 运行时和配套 Chromium headless shell，业务项目通过适配器接收 Playwright API，不需要二次安装；Codex Browser 或同类视觉能力继续作为可选兜底，不能成为基础流程的单点依赖。

在前三轮交付基础上，当前闭环仍有四个直接影响原目标的缺口：模板不能执行结构化交互，Playwright 只采集证据而不能形成确定性视觉结论，内置浏览器只覆盖 `darwin-arm64`，多个底层命令尚未形成跨工具统一入口。本轮只补齐这四层，不新增独立管理平台、通用 RPA、远程设计平台连接器或无人值守源码修改。

2026-08-13 用户进一步确认 Playwright 不能只覆盖首批两个平台。兼容范围扩展为 Apple Silicon 与 Intel Mac、Linux x64 与 ARM64、Windows x64 五个平台运行包；各平台继续独立携带浏览器资产、许可和完整性清单，并通过对应原生 CI 真实启动验证。

五平台能力完成后，插件安装副本达到约 1.38 GB，主要空间由同一安装副本内并存的五套 Chromium/FFmpeg 资产占用。用户确认开始优化，并要求控制好安全余量。本轮把发布模型调整为五个平台各自独立的安装包：每个安装包只携带一个匹配平台运行包，共享 Playwright 与 OpenSpec 仍随包离线提供；同时在 Linux ARM64 原生构建阶段安全移除 Chromium 调试符号。体积门禁必须保留明确余量，不能靠删除许可、FFmpeg、完整性清单或改为运行时下载达标。

## 决策台账

| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 产品形态 | 已确认 | 不建设独立 PC、Web 管理平台或数据库服务；能力随 `frontend-ai-workflow` 插件发布并在业务项目内运行 | 用户明确“不想再单独做成一个 PC 端的项目，更想做成项目自动化流程或者插件形式” |
| D-02 | 公共工作流 | 已确认 | 提供 UI 验收、UI 修复、UI 复验三个独立且可串联的 Skill，用户既可单独调用，也可完成完整闭环 | 用户确认按前述三 Skill 插件方案开始实施 |
| D-03 | 自动修复安全模式 | 已确认 | 默认只生成修复建议；只有用户明确要求或项目配置显式启用时才应用修改，且不得直接修改主分支、第三方依赖或报告未授权的源码范围 | 用户确认包含自动修复，并接受 `off / suggest / apply` 分级方案 |
| D-04 | 验收输入 | 已确认 | 首版支持运行页面、项目内本地设计图或 UI 规范、页面视口、目标节点和交互说明；Figma、蓝湖远程同步不作为首版硬依赖 | 用户要求先做项目自动化插件；现有 `REQ-2026-019` 已确认本地设计依据与真实页面验收合同 |
| D-05 | 验收产物 | 项目默认 | 每个场景保留结构化运行状态、实际截图、标注截图和 Markdown 报告；报告继续使用稳定节点、源码锚点、修复边界和复验断言，临时 DOM 与模型推理过程不得作为交付物 | `REQ-2026-019` D-02、D-04、D-09 与现有生成器合同 |
| D-06 | 复验一致性 | 已确认 | 修复后必须复用原场景、页面、视口、目标节点和设计依据；原问题消失且没有新增高置信度问题时才可通过 | 用户确认自动修复后需要自动复验的完整闭环 |
| D-07 | 自动化边界 | 已确认 | 首版提供本地可重复执行入口与 CI 可消费的机器可读结果，但不绑定 GitHub、GitLab 或任一远程服务；PR 评论和状态回写留给后续连接器 | 用户选择项目自动化或插件形式，未要求绑定特定代码托管平台 |
| D-08 | 实现与兼容约束 | 已确认 | 除明确内置的固定版本 Playwright 及其必要运行资产外，插件核心继续只使用 Node.js 标准库；插件运行时不执行依赖安装。已有仅声明 `browser` 或项目命令式 `project-playwright` 的配置继续保持原语义 | 用户明确要求 Playwright 与 OpenSpec 一样下载到插件项目并走项目内依赖；根 `AGENTS.md` 实现约束与插件向后兼容规则 |
| D-09 | 跨 AI 工具采集策略 | 已确认 | 插件内置 Playwright 适配器作为新配置的可移植主路径，既有项目 Playwright 命令继续兼容；Codex Browser 或同类视觉能力保留为兜底。每次运行记录实际采集器，复验必须复用该采集器，不得静默切换 | 用户明确要求“不依赖视觉插件”，同时要求保留视觉验收插件能力作为兜底，并考虑其他 AI 工具可用性 |
| D-10 | Playwright 发布形态 | 已确认 | 固定 Playwright 版本、许可文件和仅供无头验收使用的 Chromium headless shell 随插件发布；运行前校验操作系统、CPU、包版本、浏览器可执行文件和完整性，不兼容时明确阻塞或使用已声明视觉兜底，不在用户机器下载依赖 | 用户明确要求“跟 OpenSpec 一样都下载到当前项目中，然后走项目里面的依赖，避免用户二次安装” |
| D-11 | 结构化交互执行 | 已确认 | 新配置可以使用受限结构化步骤表达点击、悬停、填写、按键、选择、勾选、显隐等待、文本或 URL 断言和分段截图；默认适配器按顺序执行且所有选择器、值和产物路径参与场景指纹。禁止任意 JavaScript、Shell、动态模块和未声明外部文件；旧字符串交互继续只作为自定义适配器说明，不被静默解释 | 用户确认先补齐交互 DSL，并明确目标包含弹窗、下拉、表单等复杂 UI 验收 |
| D-12 | 确定性视觉判断 | 已确认 | 插件使用 DOM/计算样式断言与受控图片区域比较形成 `passed`、`needs-fix` 或 `inconclusive` 三态结果；待分析、对齐失败、中置信度差异或证据不足不得写成通过。只有 `inconclusive` 且场景已声明视觉兜底时，才交给 Codex Browser 或同类能力。必要的固定轻量图片比较依赖随插件发布，业务项目零安装 | 用户确认补齐确定性视觉判断，同时保留视觉插件作为不确定场景兜底 |
| D-13 | 跨平台运行包 | 已确认 | Playwright 运行时按 `platform-arch` 索引并独立校验，发布族必须覆盖 `darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64` 与 `win32-x64`；每个可安装发布物只携带一个匹配平台包，运行阶段不联网下载、不读取其他平台资产作为回退，也不把多平台资产混入单一安装包 | 用户先确认 Apple Silicon Mac 与 Linux x64 首批支持；2026-08-13 进一步明确其他三个平台也要补充，并在五平台安装副本达到约 1.38 GB 后确认按平台瘦身 |
| D-14 | 跨工具统一编排 | 已确认 | 新增一个薄的 Node.js 入口统一组织计划、状态创建、结构化交互、证据采集、确定性判断、报告和复验，输出稳定 JSON 与退出码 `0=passed`、`1=needs-fix`、`2=inconclusive`、`3=blocked`；默认仍只预览，显式 `--write` 才产生运行产物。入口不启动任意项目命令、不自动修复源码、不提交推送，也不绑定特定 CI | 用户确认补齐一键流程编排，并坚持项目自动化或插件形态而非独立平台 |
| D-15 | 真实项目迁移与预览就绪 | 已确认 | 版本 2 统一入口的预览只有在受信适配器摘要匹配、平台运行包可用、比较规则完整且复验上下文一致时才返回 `readyToWrite: true`；自定义版本 2 适配器在预览阶段即以 `blocked` 和退出码 3 停止且不创建产物，不自动覆盖、执行或降级。登录态、接口模拟和固定假数据必须由不含真实凭据的项目自有本地页面环境准备，不能写入受信适配器；迁移后建立独立基线。受控故障注入必须明确标记，不能代替真实源码当前态验收，验收环境或配置问题不得进入业务源码修复候选 | 2026-08-11 真实项目完整复跑暴露旧适配器迁移、预览假就绪和证据来源边界；用户确认调整 |
| D-16 | 安装体积与原生瘦身门禁 | 已确认 | 平台发布命令默认只预览，显式 `--write` 才写入全新暂存目录；成品必须保留共享运行时、当前平台 Chromium/FFmpeg、许可和重建后的独立完整性清单，并排除其他四个平台资产。安装包上限预留约 10% 余量：两个 macOS 包各不超过 260 MiB、Linux x64 不超过 330 MiB、Linux ARM64 不超过 420 MiB、Windows x64 不超过 340 MiB。Linux ARM64 仅在原生构建机安全去除 Chromium 调试符号，失败或冒烟不通过时禁止发布 | 用户确认开始处理约 1.38 GB 的插件体积，并明确要求控制好边距；现有体积审计与未去符号 Linux ARM64 二进制事实 |

## 范围

### 包含

- 新增 UI 验收、受控修复和复验三个公共 Skill 及其界面元数据。
- 新增项目级 UI 验收配置合同，覆盖产物目录、自动修复模式、场景、页面、视口、设计依据和目标节点。
- 新增确定性脚本，对配置路径、场景 ID、视口、设计依据、产物路径、自动修复模式和复验上下文进行校验。
- 支持声明主采集器、可选兜底采集器、插件 Playwright 适配器或兼容项目命令，使外部 AI 工具与 CI 可以读取同一确定性采集计划。
- 内置固定版本 Playwright、Chromium headless shell、许可与完整性元数据，并提供只从插件运行时加载 Playwright 的安全适配器入口。
- 新增运行状态合同，使验收、修复和复验能够在不同 Codex 任务或 CI 步骤间安全衔接。
- 复用并正式化现有节点报告合同，明确自动修复允许范围、禁止范围和复验断言。
- 更新插件结构校验、README 和测试，确保新增 Skills 与脚本随插件发布。
- 新增受限结构化交互执行器，使常见弹窗、下拉、悬停、表单和状态切换不再要求每项目手写适配器。
- 新增确定性 DOM/样式与图片区域比较，使用 `inconclusive` 承接无法可靠判断的结果并保留显式视觉兜底。
- 将内置 Playwright 运行时发布为五个平台独立安装包，覆盖 `darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64` 与 `win32-x64`；每个成品只携带匹配平台资产，并在对应原生环境真实启动 Chromium。
- 新增安全的平台发布暂存入口、体积预算与安装包结构校验；Linux ARM64 在原生构建阶段去除 Chromium 调试符号后重建摘要，不修改仓库中的规范源资产。
- 新增跨工具统一编排入口和稳定退出码，在不扩大自动修复权限的前提下串联验收与复验。
- 增加真实项目迁移与预览就绪门禁：受信适配器保持不可定制，项目自有页面环境负责本地假登录和固定数据，预览不可执行时直接阻塞且不创建产物。

### 不包含

- 独立 PC 客户端、Web 管理后台、用户系统、数据库、计费或团队审批页面。
- 在业务项目或用户机器运行安装命令、联网下载 Playwright 与浏览器；运行时资产只允许在插件构建和发布阶段更新。
- 首版直接调用 Figma、蓝湖、GitHub 或 GitLab 远程接口。
- 绕过用户选择直接修改主分支、提交代码、推送远端或创建 PR。
- 在没有稳定节点、源码目标、修改边界或复验断言时执行自动修复。
- 通用 RPA、任意脚本执行、验证码、Canvas/WebGL 语义理解、多窗口自动化和认证信息托管。
- 独立视觉 SaaS、完整设计系统扫描器、远程 Figma/蓝湖同步或强制依赖 AI 视觉模型。
- Windows ARM64、Linux ARM32、其他操作系统或在运行阶段联网补装缺失平台资产。
- 在单个可安装插件中继续捆绑五个平台浏览器资产、依靠删除许可或 FFmpeg 达成体积目标，或在非 Linux ARM64 原生环境交叉修改该平台 Chromium 二进制。
- 统一入口自动启动业务项目命令、自动修改源码、自动提交推送或回写远程 CI/PR 状态。
- 自动覆盖版本 2 自定义适配器、把真实登录凭据写入配置或适配器，或把受控故障注入描述成真实源码回归。

## 当前行为

- 插件已经公开 UI 验收、显式授权修复和相同上下文复验三个 Skill；版本 2 配置、状态和统一入口已实现，版本 1 配置与历史状态保持只读兼容。
- 默认适配器能够执行受限结构化交互，并在最终状态采集节点与 DOM 观察；弹窗、下拉、悬停、表单、按键、断言和分段截图综合场景已经真实 Chromium 验证。
- DOM、图片区域和混合比较已形成 `passed`、`needs-fix` 与 `inconclusive` 三态，差异图、不可修复问题、修复候选和视觉兜底分流均有独立合同。
- 计算样式改为精确匹配，全遮罩零像素保持不确定；异步节点按步骤超时等待，不可修复问题使用排除实际差异值的稳定身份。
- Playwright 共享运行时已携带 PNGJS 与 pixelmatch，浏览器资产拆为 `darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64` 与 `win32-x64` 五个独立运行包；五平台 880 个文件的完整性和安装缓存已通过，Apple Silicon Mac 本地真实启动成功。
- `ui-review-runner.mjs` 已统一预览、验收与复验，复验预览会前置校验上下文；版本 2 只执行摘要匹配且从插件目录加载的受信适配器，稳定返回四类退出码，不启动项目命令或自动修改源码。GitHub Actions 五平台原生矩阵已配置，仍需本分支推送后取得其余平台的远端启动证据。
- 真实翻译项目原版本 2 适配器包含假登录、接口路由和固定数据，已被正确识别为 `project-adapter`；但统一入口预览仍返回 `ok: true` 和退出码 0，Skill 也没有给出可重复的迁移、页面环境和受控证据标记步骤，导致预览成功不能证明可正式执行。

## 期望行为

### 场景：对业务项目执行 UI 验收

- 前置条件：目标项目已提供有效场景配置，页面可以由当前环境访问，并存在本地设计依据或 UI 规范。
- 当：用户调用 UI 验收 Skill 或自动化入口。
- 则：系统先校验配置与安全路径，再按场景采集页面证据并生成机器可读运行状态、标注截图和 Markdown 报告。
- 并且：报告中的问题必须关联实际检查节点、源码修复上下文和复验断言。
- 异常或边界：页面不可访问、设计依据缺失、视口无效或产物路径越界时必须停止，不能生成通过结论。

### 场景：根据高置信度报告受控修复

- 前置条件：验收运行完成且存在包含源码目标、稳定锚点、允许范围、禁止范围和复验断言的高置信度问题。
- 当：自动修复模式为 `apply`，或者用户在当前任务中明确授权应用修复。
- 则：AI 只能修改报告声明的仓库相对源码文件和作用域，并在修改前检查 Git 状态与目标文件。
- 并且：不得修改主分支、`node_modules`、锁文件、未声明全局样式或其他问题范围；修改后运行状态进入待复验而不是直接通过。
- 异常或边界：默认 `suggest`、上下文不完整、源码路径越界、工作区冲突或修改范围不唯一时只保留建议并停止应用。

### 场景：使用相同上下文复验

- 前置条件：一次验收运行已经产生完整场景指纹，源码修改已经完成或用户要求重新检查。
- 当：用户调用 UI 复验 Skill 或自动化入口。
- 则：系统复用原页面、视口、设计依据、目标节点和交互说明重新采集并生成新结果。
- 并且：只有原问题全部关闭且未产生新增高置信度问题时结果才为通过；否则保留未解决和新增问题。
- 异常或边界：场景指纹不一致、原设计依据变化或原运行状态不完整时必须要求重新验收，不得将不同上下文结果直接比较。

### 场景：重复执行和 CI 消费

- 前置条件：同一项目和场景已经存在历史运行状态。
- 当：本地任务或 CI 重复执行验收与复验。
- 则：每次运行使用独立 ID，当前状态通过受控索引更新，机器可读结果使用稳定字段和退出语义。
- 并且：重复执行不得覆盖未知文件、越出配置产物根目录或把历史失败静默改为通过。
- 异常或边界：现有目录包含未知文件、状态版本不受支持或并发运行冲突时停止写入并给出中文错误。

### 场景：跨 AI 工具执行确定性主路径并保留视觉兜底

- 前置条件：场景声明项目 Playwright 为主采集器，可选声明 Browser 为兜底，并为 Playwright 提供参数数组形式的项目命令和项目内结果路径。
- 当：AI 工具或 CI 请求采集计划并开始验收。
- 则：系统输出不依赖 Codex 专用视觉插件的确定性命令、结果路径和采集顺序；调用方优先执行项目 Playwright。
- 并且：只有主采集器不可用时才能显式选择已声明的视觉兜底，运行状态记录实际采集器，复验继续使用相同采集器。
- 异常或边界：项目 Playwright 未声明稳定命令时标记为不可移植；视觉兜底也不可用时明确阻塞，不安装依赖、不生成虚假通过结果。

### 场景：使用插件内置 Playwright 而不安装业务依赖

- 前置条件：插件发布物包含与当前操作系统和 CPU 匹配的固定 Playwright 运行时、Chromium headless shell 和完整性元数据，场景声明安全的项目适配器路径。
- 当：AI 工具或 CI 请求采集计划并执行插件生成的 Playwright 命令。
- 则：插件从自身运行时加载 Playwright，把 API、规范化场景和安全产物路径传给项目适配器，业务项目的 `package.json` 与锁文件均不需要新增 Playwright。
- 并且：采集计划公开运行时来源、固定版本、平台兼容性和不可用原因；既有项目命令配置仍按原合同运行。
- 异常或边界：运行时缺失、摘要变化、平台不匹配、适配器越界或浏览器不可启动时必须停止，不得转而执行安装命令；只有场景已声明视觉兜底时才能用新的运行 ID 切换。

### 场景：使用结构化步骤打开并验收弹窗

- 前置条件：场景使用受支持的结构化交互步骤，并以稳定选择器声明触发按钮、弹窗和需要采集的目标节点。
- 当：默认 Playwright 适配器依次执行点击、显隐等待、填写或断言并完成分段截图。
- 则：每个步骤必须按声明顺序执行，失败步骤输出稳定索引和中文原因，成功步骤与交互内容进入场景指纹和结构化证据。
- 异常或边界：未知动作、额外字段、越界文件、任意代码、非唯一操作目标或断言失败时立即阻塞；旧字符串交互继续要求自定义适配器，不进行猜测。

### 场景：确定性判断与视觉兜底分流

- 前置条件：实际截图、设计依据、目标节点和声明的 DOM/样式或图片区域比较规则完整。
- 当：统一判断器比较可测量属性和受控图片区域。
- 则：明确无差异时输出 `passed`，明确超出阈值时输出 `needs-fix`，证据不足、无法对齐或只存在中置信度差异时输出 `inconclusive`。
- 并且：`inconclusive` 不得进入自动修复；只有已声明且当前工具可用的视觉兜底可以补充最终结论，结果仍需通过相同状态校验。
- 异常或边界：设计图片尺寸不兼容、动态区域未声明忽略、比较依赖或图片损坏时不得降级为零问题通过。

### 场景：在五个受支持平台使用内置浏览器

- 前置条件：当前安装的是对应 `platform-arch` 的独立插件发布物，包含共享运行时、该平台运行包、许可和独立完整性清单，且不含其他四个平台资产。
- 当：Apple Silicon Mac、Intel Mac、Linux x64、Linux ARM64 或 Windows x64 环境请求采集计划并启动浏览器冒烟验证。
- 则：运行时选择唯一匹配包，真实启动 Chromium 并产生截图，不修改业务项目依赖，也不读取其他平台包作为回退。
- 异常或边界：当前平台没有运行包、运行包混装、摘要变化或浏览器不可执行时输出 `blocked`，不得把平台跳过当成支持通过。

### 场景：生成并验证平台独立安装包

- 前置条件：仓库保留五个平台规范源资产，调用方选择一个受支持平台键和位于安全暂存根下的全新输出目录。
- 当：调用方先预览发布计划，再显式使用 `--write` 生成平台安装包。
- 则：成品完整复制插件共享内容，只保留所选平台元数据、Chromium/FFmpeg、许可和重建后的完整性清单；输出实际字节数、预算、余量和排除的平台列表。
- 并且：macOS ARM64/x64、Linux x64、Linux ARM64、Windows x64 成品分别不超过 260、260、330、420、340 MiB；Linux ARM64 必须在原生构建机完成调试符号移除、摘要重建和真实截图冒烟。
- 异常或边界：输出已存在、路径越界、平台不匹配、缺少构建工具、去符号失败、其他平台资产残留、超过预算或冒烟失败时必须阻塞并清理未发布暂存目录，不得覆盖已有文件或回退为联网安装。

### 场景：通过一个入口执行验收或复验

- 前置条件：页面已经由项目或 CI 启动，配置和设计依据有效，调用方选择验收场景或合法复验基线。
- 当：调用方使用统一入口预览或显式 `--write` 执行。
- 则：入口按固定顺序完成计划、状态、交互、采集、判断与报告，并输出跨工具可消费的 JSON 和稳定退出码。
- 并且：复验继续使用基线指纹与实际采集器；验收发现问题时只进入 `needs-fix`，不会在同一命令中自动编辑源码。
- 异常或边界：页面不可访问、步骤失败、结果不确定或基础设施阻塞时分别返回稳定状态，不覆盖历史运行或执行任意项目启动命令。

### 场景：迁移真实项目的自定义版本 2 适配器

- 前置条件：目标项目已有版本 2 配置，但项目适配器包含假登录、接口模拟、固定数据或其他自定义执行逻辑，内容摘要与插件受信模板不一致。
- 当：用户或 CI 预览该场景。
- 则：统一入口返回 `blocked`、退出码 3 与 `readyToWrite: false`，不创建运行目录、不导入适配器，也不提示直接追加 `--write`。
- 并且：UI 验收 Skill 保留原配置，要求由项目自有本地页面环境准备不含真实凭据的登录态、接口模拟和固定数据；只有显式迁移配置、完整复制受信模板并建立独立基线后才能执行。
- 异常或边界：历史版本 1 或项目命令只保持原只读/调用方消费语义，不能被自动改写成版本 2；受控故障注入必须标记为能力验证，不能代替真实源码当前态验收或进入业务源码修复候选。

## 页面与交互

- 入口与操作路径：Codex 中可调用三个 Skill；其他 AI 工具和 CI 优先使用统一入口，也可以继续使用现有细粒度配置、采集计划与脚本合同。
- 字段、文案与默认值：自动修复模式默认为 `suggest`；配置至少包含版本、产物根目录和一个场景，场景包含 ID、页面、视口及设计依据；结构化交互与确定性比较规则均为显式字段。
- 加载态、空态、错误态、禁用态：命令运行中不写完成状态；只有确定性结论完整时零问题才是通过候选；不确定结果为 `inconclusive`；错误必须保留上一份完整结果；缺少修复授权时应用行为禁用。
- 权限与角色差异：不引入平台角色；源码修改、提交、推送和远程回写继续遵守 Codex、Git 与目标仓库权限。
- 设计稿链接：首版使用项目内仓库相对图片路径或 UI 规范路径。

## 交互状态矩阵

| 状态 | 覆盖决定 | 触发或前置条件 | 期望结果 | 验证方式 | 关联验收 | 不适用理由 |
| --- | --- | --- | --- | --- | --- | --- |
| 初始（已有数据） | 覆盖 | 项目存在有效配置、至少一个场景和只携带匹配平台资产的安装包 | 配置、结构化步骤、比较规则、运行计划与场景指纹稳定生成；只有受信适配器、可用平台和完整安装包返回 `readyToWrite: true` | 自动 | A-01、A-02、A-08、A-10、A-13、A-14 | — |
| 用户操作 | 覆盖 | 用户或 CI 调用统一验收、显式修复或复验入口 | 结构化步骤按顺序执行，各入口通过运行状态安全衔接；自定义适配器先进入项目页面环境迁移，确定性主路径优先，视觉能力只处理已声明的不确定兜底 | 自动+人工 | A-01、A-03、A-04、A-06、A-08、A-09、A-11、A-13 | — |
| 刷新 | 覆盖 | 对相同配置、交互和比较规则重复运行或复验 | 产生独立运行，复用基线实际采集器，不覆盖未知文件且上下文指纹保持一致；适配器摘要或页面环境事实变化时重新建立独立基线 | 自动 | A-02、A-04、A-11、A-13 | — |
| 空态 | 覆盖 | 确定性判断没有发现问题、只存在不确定结果或修复列表为空 | 完整且明确的零问题形成有限范围通过；不确定结果进入 `inconclusive`；修复阶段不虚构修改 | 自动 | A-03、A-04、A-09 | — |
| 错误态 | 覆盖 | 交互、比较、平台安装包、配置、适配器摘要、路径、授权、体积预算或复验上下文无效 | 中文错误和稳定退出码终止，不留下半成品或错误通过状态；自定义版本 2 适配器、平台混装或跳过、超预算、分析未完成和兜底不可用均不得伪装就绪或通过 | 自动 | A-02、A-03、A-08、A-09、A-10、A-11、A-13、A-14 | — |
| 卸载 | 不适用 | Skill 与脚本均为单次任务，不创建常驻订阅或后台进程 | — | — | — | 命令结束后没有项目内生命周期资源需要释放。 |

## 接口与数据

- 接口文档链接：本需求新增项目级 JSON 配置与 JSON 运行状态合同，不涉及网络 API。
- 请求方法与路径：本地脚本读取显式 `--target`、配置文件和运行目录；平台发布入口读取稳定英文参数 `--platform` 与 `--output`，默认只预览，只有显式 `--write` 写入全新暂存目录；Skill 通过同一合同组织 Browser、源码和验证步骤。
- 请求字段及空值语义：场景数组不得为空；设计依据、页面和视口不得为空；`captureFallback` 可省略，省略表示不允许切换采集器；`projectPlaywright.adapter` 是安全的仓库相对模块路径，由插件注入 Playwright API；兼容字段 `projectPlaywright.command` 继续使用非空参数数组，且不得与 `adapter` 同时出现；结构化交互步骤和比较规则只接受受支持字段；旧字符串交互继续作为兼容说明；零问题只有在确定性判断完整时才可形成通过。
- 响应字段及状态码：统一入口输出规范化计划、运行状态、结论与产物 JSON；有效预览输出 `readyToWrite: true` 与退出码 0，不可执行预览输出 `readyToWrite: false`、`blocked` 与退出码 3；正式运行退出码固定为 `0=passed`、`1=needs-fix`、`2=inconclusive`、`3=blocked`。平台发布计划额外输出 `platformKey`、`output`、`sizeBytes`、`budgetBytes`、`headroomBytes`、`excludedPlatforms` 与 `stripped`，预览不创建运行产物。
- 鉴权、加解密或敏感信息要求：配置和产物不得保存 Cookie、Token、密码、完整本地存储、未脱敏用户数据或模型推理过程。

## 关联变更范围

| 变更 | 决策范围 | 验收范围 |
| --- | --- | --- |
| add-plugin-ui-review-automation | D-01、D-02、D-03、D-04、D-05、D-06、D-07、D-08 | A-01、A-02、A-03、A-04、A-05 |
| prefer-portable-ui-review-capture | D-08、D-09 | A-01、A-02、A-04、A-05、A-06 |
| bundle-playwright-runtime | D-08、D-09、D-10 | A-02、A-05、A-06、A-07 |
| complete-ui-review-capability-chain | D-01、D-03、D-06、D-07、D-08、D-09、D-10、D-11、D-12、D-13、D-14、D-15 | A-01、A-02、A-03、A-04、A-06、A-07、A-08、A-09、A-10、A-11、A-12、A-13 |
| expand-playwright-platform-runtime | D-08、D-10、D-13、D-16 | A-07、A-10、A-12、A-14 |

## 修订记录

| 修订 | 日期 | 影响决策 | 影响验收 | 验证与任务处理 |
| --- | --- | --- | --- | --- |
| R-01 | 2026-08-06 | D-01～D-08 | A-01～A-05 | 首次建立插件化 UI 验收与受控自动修复需求，V-01～V-04 保持计划，任务待规划。 |
| R-02 | 2026-08-06 | D-01～D-08 | A-01～A-05 | 完成三个 Skill、确定性状态合同、报告正式化、文档与测试；V-01～V-04 全部执行通过，进入交付门禁。 |
| R-03 | 2026-08-07 | D-08、D-09 | A-01、A-02、A-04、A-05、A-06 | 将项目 Playwright 与机器可读证据调整为跨 AI 工具主路径，保留视觉插件为显式兜底；受影响验收恢复待验证并建立新变更。 |
| R-04 | 2026-08-07 | D-08、D-09 | A-01、A-02、A-04、A-05、A-06 | 完成采集计划、显式视觉兜底、实际采集器复验约束、Skill 与模板更新；V-05、V-06 执行通过，进入交付门禁。 |
| R-05 | 2026-08-07 | D-08、D-09、D-10 | A-02、A-05、A-06、A-07 | 将 Playwright 与 Chromium 调整为插件内置固定运行时，业务项目改用注入式适配器且无需二次安装；受影响验收恢复待验证并建立新变更。 |
| R-06 | 2026-08-07 | D-08、D-09、D-10 | A-02、A-05、A-06、A-07 | 完成固定运行时、平台与完整性门禁、注入式适配器、Git LFS 发布链路和兼容命令；V-07、V-08 全部通过，进入交付归档门禁。 |
| R-07 | 2026-08-10 | D-01、D-03、D-06～D-14 | A-04、A-06～A-12 | 用户确认补齐结构化交互、确定性视觉判断、首批跨平台运行包和统一编排四层；需求恢复为已确认，新验收 V-09～V-12 保持计划，既有 V-01～V-08 只证明历史基线。 |
| R-08 | 2026-08-10 | D-01、D-03、D-06～D-14 | A-08～A-12 | 完成四层代码、复杂场景、Mac 真实浏览器、安装缓存和本地全量门禁；A-08、A-09、A-11 已通过，A-10、A-12 等待分支推送后的 GitHub Actions Linux x64 真实冒烟证据。 |
| R-09 | 2026-08-11 | D-06、D-09、D-11、D-12、D-14 | A-08、A-09、A-11、A-12 | 真实项目复查发现 DOM-only 场景可在未声明几何或图片证据时被误写为视觉通过，且弹窗过渡动画期间即可截图；V-10、V-12 继续作为历史能力证据，新增 V-13，重新打开视觉范围、稳定截图、几何断言、真实失败基线和复验任务。 |
| R-10 | 2026-08-11 | D-06、D-08、D-09、D-11、D-12、D-14 | A-02、A-04、A-06、A-08、A-09、A-11、A-12 | 修复后复查确认样式子串与全遮罩区域可误通过、异步节点等待会提前失败、不可修复问题指纹不稳定、复验预览延迟校验，以及项目适配器被误标为内置实现；V-13 保留为历史主链路证据，新增 V-14 并重新打开受影响验收与任务。 |
| R-11 | 2026-08-11 | D-02、D-03、D-06、D-08、D-09、D-14、D-15 | A-01、A-02、A-03、A-04、A-06、A-11、A-12、A-13 | 修复后真实项目完整复跑确认确定性比较与同上下文复验有效，但原自定义版本 2 适配器预览仍假就绪，且三个 Skill 缺少页面环境迁移、受控证据和修复边界；V-14 保留为历史代码门禁，新增 V-15 并重新打开相关 Skill、预览、缓存安装与真实项目验收任务。 |
| R-12 | 2026-08-11 | D-02、D-03、D-06、D-08、D-09、D-14、D-15 | A-01、A-02、A-03、A-04、A-06、A-11、A-13 | 完成三个 Skill、共享合同和统一入口就绪门禁调整；重新安装插件缓存后，真实项目原配置安全阻塞且零产物，受信页面环境 9 个场景、受控故障基线、同上下文复验、专项测试和 UAT 构建均通过。远端 Linux x64 真实启动证据仍由 V-11、A-10、A-12 单独保持未完成。 |
| R-13 | 2026-08-11 | D-10、D-13 | A-10、A-12 | 核验分支 `codex/verification-hardening` 的 GitHub Actions 运行 `31465108200`：commit `f9fe3f80a8b68101ad19f2fcc459f1195eba45a0` 与当前远端 HEAD 一致，`ubuntu-latest` 上内置 Chromium 返回 `platformKey=linux-x64`、`skipped=false` 并生成 3017 字节截图；当前未提交改动未触碰 Linux 运行链，V-11、6.9、A-10 与 A-12 据此关闭。 |
| R-14 | 2026-08-12 | D-01、D-07、D-10、D-13、D-14 | A-01、A-10、A-11、A-12 | 完成发布收尾：精确忽略 Playwright 运行时目录中的 `.DS_Store`，更新并重装缓存版本 `0.12.0+codex.20260812012020`，安装副本完整性和 Chromium 真实启动通过；当前 commit `ef389ca73b17dba2bb6d2048eb813e7d8e656a5b` 的 `ubuntu-latest` CI 再次成功。插件源码仓库按用户决定不初始化 Wayfinder，不影响插件面向业务项目提供初始化与检查能力。 |
| R-15 | 2026-08-13 | D-08、D-10、D-13 | A-07、A-10、A-12 | 用户要求补充 Playwright 其他平台，兼容范围从两个运行包扩展到 `darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64`、`win32-x64` 五个平台；需求恢复为已确认，A-10、A-12 重新打开，新增 V-17 计划，并建立 `expand-playwright-platform-runtime` 受管变更。 |
| R-16 | 2026-08-13 | D-08、D-10、D-13 | A-07、A-10、A-12 | 五个平台元数据、独立运行资产、SHA-256 清单和原生 CI 矩阵已落地；本地 164 项测试、统一 7 阶段门禁、8 个官方 Skill validator、Plugin validator、安装缓存 880 文件完整性及 `darwin-arm64` 真实截图通过。A-10、A-12 继续等待分支推送后的五平台原生 CI 证据。 |
| R-17 | 2026-08-13 | D-08、D-10、D-13 | A-10、A-12 | 修复 Windows Chromium `debug.log` 运行副作用、OpenSpec 真实路径别名和测试路径分隔符兼容后，commit `7b083c95458c03f2773e3c091a48164c7672f015` 的 GitHub Actions 运行 `31665699089` 在五个原生 Runner 全部成功；V-17 通过，A-10、A-12 关闭，需求推进到待验证。 |
| R-18 | 2026-08-13 | D-10、D-13、D-16 | A-07、A-10、A-12、A-14 | 五平台能力使当前插件安装副本达到约 1.38 GB；用户确认按平台拆分安装包并在 Linux ARM64 原生构建阶段安全去除调试符号，同时要求体积门禁保留余量。V-17 继续作为五平台规范源资产和原生启动历史证据；受影响验收重新打开，新增 V-18，并继续修订 `expand-playwright-platform-runtime`。交互状态矩阵只更新安装包就绪与错误边界，页面交互、配置和修复权限不变。 |
| R-19 | 2026-08-20 | D-10、D-13、D-16 | A-07、A-10、A-12、A-14 | 复核 commit `16d8b27b34996fa2bea3ae8849e2ed623486b92e` 的 GitHub Actions 运行 `32113775135`：五个平台原生成品任务均成功，每个成品只含目标平台运行包且低于预算，Chromium 均以 `skipped=false` 生成截图；Linux ARM64 暂存 Chromium 完成去调试符号并保持规范源摘要不变。V-18 通过，关闭四项验收并进入完成门禁。 |

## 兼容性与风险

- 受影响页面、公共组件、路由、权限或接口：不修改业务页面；新增插件公共 Skill、脚本、模板和结构校验，属于所有安装项目可见的共享能力。
- 历史数据与兼容策略：保留现有 `REQ-2026-019`、样例验收结果、字符串交互和命令式 `projectPlaywright.command`；新结构化交互与比较字段为增量合同。平台键、元数据结构和运行时选择语义保持不变，既有状态仍可读取；只有发布物布局从五平台同包改为单平台成品。新状态必须能够识别历史基线并拒绝不安全降级，未知版本继续拒绝处理。
- 上线与回滚注意事项：仓库继续保存五个平台规范源资产，安装与发布只消费受控暂存成品；不得把暂存目录、构建日志或临时摘要提交为规范源。Linux ARM64 去符号只修改暂存副本，原生冒烟失败时回滚整个成品；各平台超过预算即禁止发布。若回滚，恢复五平台同包安装但保留现有完整性和运行期零下载合同。视觉兜底取决于当前 AI 工具是否提供能力；确定性判断与兜底都不能下结论时使用 `inconclusive`，不能伪造验收。统一入口只是现有底层命令的编排层，可以回退到细粒度命令而不改变历史配置。

## 测试与验证

- 测试文件策略：复用；目标路径：`tests/ui-review-platform-runtime.test.mjs`；基线证据：该文件已由 Git 跟踪并专门覆盖平台运行包选择、隔离、完整性和真实浏览器冒烟；选择理由：平台安装包暂存、体积和去符号仍属于同一运行时发布职责，继续在专用平台测试中扩展能避免与 UI 功能聚合测试耦合。
- 验证范围：全量；执行命令：聚焦 `node --test tests/ui-review-platform-runtime.test.mjs`，随后 `npm test`、`npm run validate`、`npm run verify`，并由 GitHub Actions 在五个原生平台分别生成单平台成品、校验体积预算与结构、真实启动 Chromium；选择理由：发布布局、结构校验、安装缓存和共享验证入口影响所有插件安装者，且 Linux ARM64 去符号不能由其他 CPU 或操作系统代替证明。
- 自动测试：覆盖发布预览零写入、安全输出边界、拒绝覆盖、单平台保留、其他平台排除、共享文件完整、摘要重建、体积预算与失败清理；五个平台原生 CI 均从各自成品真实启动 Chromium 并生成截图，Linux ARM64 额外证明暂存二进制已去除调试符号，任何平台不得通过跳过冒烟伪装支持。
- 人工检查：检查三个 Skill 的触发描述、职责边界、真实项目迁移步骤和串联方式；在真实翻译项目或隔离 fixture 上执行包含弹窗、下拉和表单的综合场景，确认自定义版本 2 适配器预览直接阻塞且不创建产物，迁移后的受信环境可完整执行，受控故障注入与真实源码当前态证据分开标记，视觉范围缺少几何、样式或图片证据时保持不确定。
- 构建与静态检查：官方 Skill validator 检查全部自定义 Skill，官方 Plugin validator 检查平台成品 manifest，`git diff --check` 检查补丁格式，仓库 AI 标记策略测试保持通过；本机 marketplace 只从匹配平台成品重装，安装缓存复测体积、完整性和真实 Chromium。

## 验证记录

| 验证ID | 验证类型 | 执行内容或环境 | 执行日期 | 结果 | 证据位置 |
| --- | --- | --- | --- | --- | --- |
| V-01 | 自动 | `node --test tests/ui-review-automation.test.mjs tests/ai-ui-review.test.mjs`，聚焦状态合同与报告兼容性 | 2026-08-06 | 通过 | `tests/ui-review-automation.test.mjs` |
| V-02 | 自动 | `npm test` 128/128、`npm run validate`、`npm run verify`、`git diff --check` | 2026-08-06 | 通过 | `scripts/verify.mjs` |
| V-03 | 自动 | 官方 Skill validator 检查三个新 Skill；官方 Plugin validator 检查 manifest | 2026-08-06 | 通过 | `plugins/frontend-ai-workflow/.codex-plugin/plugin.json` |
| V-04 | 自动 | 聚焦测试静态核对三个 Skill 的职责、显式调用策略、相同上下文复验和无远程权限扩大 | 2026-08-06 | 通过 | `tests/ui-review-automation.test.mjs` |
| V-05 | 自动 | `node --test tests/ui-review-automation.test.mjs`，13/13；覆盖采集计划、Playwright 主路径、视觉兜底、老配置、非法输入、实际采集器记录和复验禁止切换 | 2026-08-07 | 通过 | `tests/ui-review-automation.test.mjs` |
| V-06 | 自动 | `npm test` 134/134、`npm run validate`、`npm run verify`、需求校验、严格 OpenSpec 校验、三个官方 Skill validator、Plugin validator、`git diff --check` | 2026-08-07 | 通过 | `plugins/frontend-ai-workflow/.codex-plugin/plugin.json` |
| V-07 | 自动 | `node --test tests/ui-review-automation.test.mjs` 15/15；覆盖 Playwright 1.62.1、208 文件完整性、平台检查、真实 Chromium 截图、适配器注入、目标项目零依赖、兼容命令、待分析阻断和视觉兜底；安装缓存再次通过完整性与真实启动 | 2026-08-07 | 通过 | `tests/ui-review-automation.test.mjs`、`plugins/frontend-ai-workflow/scripts/playwright-runtime.mjs` |
| V-08 | 自动 | `npm test` 136/136；`npm run verify` 7/7；结构、需求、严格 OpenSpec、8 个官方 Skill validator、Plugin validator、Git LFS 属性和 `git diff --check` 全部通过 | 2026-08-07 | 通过 | `scripts/verify.mjs`、`.gitattributes`、`plugins/frontend-ai-workflow/.codex-plugin/plugin.json` |
| V-09 | 自动 | `tests/ui-review-automation.test.mjs` 24/24；覆盖结构化动作、稳定指纹、真实弹窗/下拉/悬停/表单、分段截图和非法动作失败关闭 | 2026-08-10 | 通过 | `tests/ui-review-automation.test.mjs`、`tests/fixtures/ui-review-complex/` |
| V-10 | 自动+人工 | DOM 与图片区域通过/失败/损坏/对齐失败/掩码三态均通过；人工查看 1280×800 弹窗与最终截图；同一复杂场景先形成 `needs-fix` 基线，恢复页面后复验得到 `resolved=1`、`remaining=0`、`new=0`，且两次确定性执行均为 `fallbackRequired=false` | 2026-08-10 | 通过 | `tests/fixtures/ui-review-complex/.frontend-ui-review/runs/manual-complex-20260810/complex-dialog/`、`tests/fixtures/ui-review-complex/.frontend-ui-review/runs/manual-verify-baseline-20260810/complex-dialog/`、`tests/fixtures/ui-review-complex/.frontend-ui-review/runs/manual-verify-passed-20260810/complex-dialog/` |
| V-11 | 自动 | 两套平台元数据、许可与独立完整性共 536 个文件通过；Apple Silicon Mac 与安装缓存均真实启动 Chromium、`skipped=false`。GitHub Actions 运行 `31465108200` 在 `ubuntu-latest` 上对 commit `f9fe3f80a8b68101ad19f2fcc459f1195eba45a0` 完成 7/7 验证，Linux 冒烟返回 `platformKey=linux-x64`、`skipped=false`、`screenshotBytes=3017`；当前 commit `ef389ca73b17dba2bb6d2048eb813e7d8e656a5b` 的运行 `31476800432` 又在 `ubuntu-latest` 完成 `npm run verify` 且结论为成功 | 2026-08-12 | 通过 | `tests/ui-review-platform-runtime.test.mjs`、`.github/workflows/validate.yml`、[GitHub Actions 31465108200](https://github.com/julangtaotian/wayfinder/actions/runs/31465108200)、[GitHub Actions 31476800432](https://github.com/julangtaotian/wayfinder/actions/runs/31476800432) |
| V-12 | 自动 | 统一入口预览、写入、四类退出码和复验通过；`npm run verify` 148/148、7/7，严格 OpenSpec 24/24，8 个官方 Skill validator、Plugin validator、安装缓存综合场景与 `git diff --check` 通过 | 2026-08-10 | 通过 | `tests/ui-review-automation.test.mjs`、`scripts/verify.mjs`、`tests/fixtures/ui-review-complex/.frontend-ui-review/runs/installed-cache-complex-20260810/complex-dialog/` |
| V-13 | 自动+人工 | Chromium 视口 `1440px × 900px` 与 `1280px × 800px`、DPR 1；检查项：视觉范围失败关闭、弹窗动画稳定截图、节点移除等待、固定/相对几何三态以及翻译平台行高和按钮中心线。聚焦测试 28/28；翻译平台受控基线实测行高 79px、中心线差 6px并形成 `needs-fix`，同一 1440×900 指纹复验后为 57px、0px，`resolved=2`、`remaining=0`、`new=0`，1280×800 及其余七个场景均通过且 `fallbackRequired=false`；全量 110/110、综合门禁 152/152、8 个官方 Skill validator 和 Plugin validator 通过；缓存版本 `0.12.0+codex.20260811034952` 重装后再次真实验收通过 | 2026-08-11 | 通过 | `tests/ui-review-automation.test.mjs`、`scripts/verify.mjs`、[复验截图](../tests/fixtures/ui-review-complex/.frontend-ui-review/runs/manual-verify-passed-20260810/complex-dialog/actual.png) |
| V-14 | 自动 | UI-review 专项 30/30 覆盖样式精确比较、零有效像素不确定、异步节点等待、稳定问题指纹、复验预览前置校验和受信内置适配器摘要；`npm test` 112/112、`npm run verify` 154/154 且 7/7 阶段通过，结构校验、严格 OpenSpec 24/24、8 个官方 Skill validator、Plugin validator、适配器模板摘要一致和 `git diff --check` 全部通过 | 2026-08-11 | 通过 | `tests/ui-review-automation.test.mjs`、`plugins/frontend-ai-workflow/scripts/ui-review-workflow.mjs`、`plugins/frontend-ai-workflow/scripts/ui-review-runner.mjs`、`plugins/frontend-ai-workflow/scripts/playwright-adapter-runner.mjs`、`scripts/verify.mjs` |
| V-15 | 自动+人工 | Chromium 视口 `1440px × 900px` 与 `1280px × 800px`、DPR 1；检查项：原项目自定义适配器安全阻塞、迁移预览零产物、受控故障来源、同上下文复验、九场景真实当前态和 Browser 兜底边界。UI-review 专项 30/30、`npm test` 112/112、`npm run verify` 154/154 且 7/7 阶段通过，结构校验、严格 OpenSpec 24/24、三个官方 Skill validator、Plugin validator 与 `git diff --check` 全部通过；缓存版本 `0.12.0+codex.20260811083530` 重装且源码/缓存一致。真实翻译项目原配置预览为 `blocked/3`、`readyToWrite: false`、零产物；迁移后 9/9 预览就绪且零产物，受控基线检出 2 项，同上下文复验 `resolved=2`、`remaining=0`、`new=0`，真实当前态 9/9 通过、零 finding、零 Browser 兜底，专项测试 16/16 和 UAT 构建通过 | 2026-08-11 | 通过 | `tests/ui-review-automation.test.mjs`、`plugins/frontend-ai-workflow/skills/frontend-ui-review/SKILL.md`、`plugins/frontend-ai-workflow/skills/frontend-ui-fix/SKILL.md`、`plugins/frontend-ai-workflow/skills/frontend-ui-verify/SKILL.md`、`plugins/frontend-ai-workflow/references/ui-review-workflow.md`、[复验截图](../tests/fixtures/ui-review-complex/.frontend-ui-review/runs/manual-verify-passed-20260810/complex-dialog/actual.png) |
| V-16 | 自动 | 缓存版本更新为 `0.12.0+codex.20260812012020` 并从本地 marketplace 重装；安装副本的 Playwright 536 文件完整性通过，`darwin-arm64` Chromium 真实启动返回 `skipped=false`、`screenshotBytes=3509`；8 个官方 Skill validator、Plugin validator、仓库结构校验和 `git diff --check` 全部通过，运行时 `.DS_Store` 已被精确忽略 | 2026-08-12 | 通过 | `plugins/frontend-ai-workflow/.codex-plugin/plugin.json`、`.gitignore`、本机插件缓存 `/Users/lvshuai/.codex/plugins/cache/frontend-ai-workflow/frontend-ai-workflow/0.12.0+codex.20260812012020/` |
| V-17 | 自动 | 本地阶段：平台专项 5/5、`npm test` 165/165、`npm run validate`、`npm run verify` 7/7、严格 OpenSpec 26/26、8 个官方 Skill validator、Plugin validator、Git LFS 属性和 `git diff --check` 均通过；源码与安装缓存的五平台清单均覆盖 880 个文件，安装缓存 `darwin-arm64` 返回 `skipped=false`、`screenshotBytes=3509`。远端阶段：commit `7b083c95458c03f2773e3c091a48164c7672f015` 的运行 `31665699089` 五个原生任务全部成功，分别返回 `linux-x64/false/3017`、`darwin-x64/false/3506`、`linux-arm64/false/2814`、`win32-x64/false/1909`、`darwin-arm64/false/3506`（顺序为 `platformKey/skipped/screenshotBytes`），没有使用 Runner 跳过或交叉平台替代 | 2026-08-13 | 通过 | `tests/ui-review-platform-runtime.test.mjs`、`scripts/verify.mjs`、`.github/workflows/validate.yml`、本机插件缓存 `/Users/lvshuai/.codex/plugins/cache/frontend-ai-workflow/frontend-ai-workflow/0.13.0+codex.20260813022518/`、[五平台运行](https://github.com/julangtaotian/wayfinder/actions/runs/31665699089)、[Linux x64](https://github.com/julangtaotian/wayfinder/actions/runs/31665699089/job/94339671332)、[Intel Mac](https://github.com/julangtaotian/wayfinder/actions/runs/31665699089/job/94339671344)、[Linux ARM64](https://github.com/julangtaotian/wayfinder/actions/runs/31665699089/job/94339671357)、[Windows x64](https://github.com/julangtaotian/wayfinder/actions/runs/31665699089/job/94339671371)、[Apple Silicon Mac](https://github.com/julangtaotian/wayfinder/actions/runs/31665699089/job/94339671414) |
| V-18 | 自动 | 平台专项与 UI Review 联合测试 42/42、`npm test` 196/196、`npm run validate`、`npm run verify` 8/8、严格 OpenSpec 当前 29/29 与归档 38/38、9 个官方 Skill validator、Plugin validator、本机 `darwin-arm64` Chromium `skipped=false` 全部通过。commit `16d8b27b34996fa2bea3ae8849e2ed623486b92e` 的运行 `32113775135` 五个原生任务全部成功：darwin-arm64 237378377/272629760、darwin-x64 239846652/272629760、linux-x64 307829825/346030080、linux-arm64 387225523/440401920、win32-x64 316733152/356515840 字节（实际/预算）；截图字节依次为 3506、3506、3017、2814、1909，均 `skipped=false`、不含其他四个平台资产且运行期不下载。Linux ARM64 `stripped=true`，暂存 Chromium 从 314181896 降至 310380008 字节，规范源 SHA-256 保持 `e8b500712730fd4cbd0261f675a27c5a79b2375276876f1e3f69db10ee080a72` | 2026-08-20 | 通过 | `tests/ui-review-platform-runtime.test.mjs`、`.github/workflows/validate.yml`、[五平台成品运行 32113775135](https://github.com/julangtaotian/wayfinder/actions/runs/32113775135) |

## 验收标准

- [x] [A-01] 插件公开 UI 验收、UI 修复和 UI 复验三个职责清晰的 Skill，能够通过同一项目运行状态串联而不引入独立平台服务或 Codex 专用视觉单点依赖。
- [x] [A-02] 项目配置、采集计划和运行状态通过确定性脚本校验，场景、视口、设计依据、产物目录、Playwright 适配器和上下文指纹稳定，危险路径与未知版本被拒绝。
- [x] [A-03] 自动修复默认只建议；只有显式授权才允许应用，并且缺少源码目标、稳定锚点、修改边界或复验断言时不得修改代码。
- [x] [A-04] 复验复用原场景上下文和首次实际采集器，只有原问题关闭且没有新增高置信度问题时才通过；适配器摘要或受控页面环境变化必须建立独立验收，不能伪装成原基线复验。
- [x] [A-05] 聚焦测试、全量仓库验证、全部官方 Skill validator、Plugin validator 和人工职责检查全部通过，插件发布资产未遗漏。
- [x] [A-06] 插件内置 Playwright 是跨 AI 工具可执行的默认主路径；视觉插件只作为已声明且显式选择的兜底，老配置仍保持原单采集器行为。
- [x] [A-07] Playwright 包、匹配平台的 Chromium headless shell、FFmpeg、许可和完整性元数据随对应平台插件成品发布；业务项目无需修改 `package.json` 或锁文件，平台或摘要不匹配时不会联网安装或生成虚假通过。
- [x] [A-08] 新配置能够用受限结构化步骤完成弹窗、下拉、悬停和表单等常见交互；步骤顺序、断言、目标和截图可追踪，非法动作、任意代码和旧字符串猜测被拒绝。
- [x] [A-09] 确定性 DOM/样式与图片区域比较能够区分 `passed`、`needs-fix` 和 `inconclusive`；分析未完成、证据不足、中置信度差异和对齐失败不能写成通过，视觉能力只处理已声明的不确定兜底。
- [x] [A-10] 插件发布族覆盖 `darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64` 与 `win32-x64`，每个平台成品只携带自身运行包，并使用重建后的独立完整性清单在原生环境真实启动 Chromium 和生成截图；业务项目零安装，CI 不得以平台跳过证明支持。
- [x] [A-11] 其他 AI 工具和 CI 可以通过一个 Node.js 入口预览或显式执行验收与复验，获得稳定 JSON、产物和四类退出码；预览只有可正式执行时才返回 `readyToWrite: true`，入口不启动任意项目命令、不自动修改源码或扩大远程权限。
- [x] [A-12] 聚焦平台测试、五平台成品原生冒烟、全量仓库验证、全部官方 Skill validator、Plugin validator 和匹配平台安装缓存检查全部通过，且旧配置、细粒度命令和三 Skill 安全边界保持兼容。
- [x] [A-13] 真实项目已有自定义版本 2 适配器时，预览在零产物前提下给出稳定阻塞和迁移方向；不含真实凭据的项目页面环境承载假登录与固定数据，受信适配器保持原样，迁移后使用独立基线完成验收；受控故障证据与真实源码当前态证据分开，环境问题不会触发业务源码修复。
- [x] [A-14] 平台发布入口默认预览且只写入安全的全新暂存目录；五个平台成品分别不超过 260、260、330、420、340 MiB，均不含其他平台资产并保留完整共享运行时。Linux ARM64 只在原生构建机对暂存 Chromium 去除调试符号，失败、超预算或冒烟不通过时不得发布。

## 验收—证据映射

| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 | 验证记录 |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 三 Skill 插件闭环 | D-01、D-02、D-07、D-09、D-15 | 自动 | 三个 `SKILL.md`、`agents/openai.yaml`、结构校验和 README | 三个入口职责不重叠，可按运行状态串联；UI 验收负责迁移前置检查，修复与复验不扩大该环境权限 | V-03、V-04、V-06、V-15 |
| A-02 | 配置、采集计划与状态安全合同 | D-04、D-05、D-06、D-08、D-09、D-10、D-15 | 自动 | `tests/ui-review-automation.test.mjs`、插件确定性脚本 | 有效输入稳定规范化；自定义版本 2 适配器和其他危险上下文在预览阶段以 `blocked/3` 拒绝且不创建产物 | V-07、V-14、V-15 |
| A-03 | 受控自动修复 | D-03、D-05、D-08、D-15 | 自动 | 修复 Skill、配置测试和职责边界静态检查 | 默认不修改；验收环境、适配器迁移和受控故障注入不进入业务源码修复候选 | V-01、V-04、V-15 |
| A-04 | 相同上下文与采集器复验 | D-05、D-06、D-09、D-15 | 自动 | 复验 Skill、状态指纹测试和闭环静态检查 | 不同上下文、适配器摘要或采集器不能比较；受控故障基线明确标记；原问题关闭且无新增问题才通过 | V-01、V-04、V-05、V-14、V-15 |
| A-05 | 插件完整验证 | D-01～D-10 | 自动 | 仓库验证、官方 validators、`git diff --check` 和验证记录 | 新增公共能力未破坏既有工作流、运行时与插件结构 | V-08 |
| A-06 | 可移植主路径与视觉兜底 | D-08、D-09、D-10、D-15 | 自动 | 配置模板、采集计划 CLI、三个 Skill 和专用测试 | 只有与插件模板摘要一致的受信适配器进入统一主路径；自定义模块不会被误标、自动执行或自动覆盖；项目页面环境负责非敏感准备；旧项目命令只保持既有调用方消费语义 | V-07、V-08、V-14、V-15 |
| A-07 | 内置 Playwright 运行时 | D-08、D-10、D-13、D-16 | 自动 | 平台成品结构、运行时检查、完整性清单、真实 Chromium 启动测试和结构校验 | 固定共享包与匹配平台浏览器随对应成品发布，目标项目零依赖安装，平台或摘要不匹配时安全失败 | V-07、V-08、V-17、V-18 |
| A-08 | 结构化复杂交互 | D-04、D-08、D-11 | 自动+人工 | `tests/ui-review-automation.test.mjs`、综合 UI fixture、`tests/fixtures/ui-review-complex/.frontend-ui-review/runs/manual-verify-passed-20260810/complex-dialog/actual.png`；视口 `1440×900`、`1280×800`，DPR 1 | 检查弹窗、下拉、悬停、表单、异步节点和截图稳定：常见步骤无需项目手写适配器即可执行；截图前等待有限动画、字体和双帧稳定；非法动作和任意代码失败关闭 | V-09、V-12、V-13、V-14 |
| A-09 | 确定性视觉三态 | D-05、D-06、D-09、D-12 | 自动+人工 | 判断器聚焦测试、结构化结果与 `tests/fixtures/ui-review-complex/.frontend-ui-review/runs/manual-verify-passed-20260810/complex-dialog/actual.png`；视口 `1440×900`、`1280×800`，DPR 1 | 检查样式、几何、实际比较像素和对齐：视觉范围证据完整才通过；零有效像素和其他证据不足不误报且只进入显式视觉兜底 | V-10、V-12、V-13、V-14 |
| A-10 | 五平台 Playwright 运行包 | D-08、D-10、D-13、D-16 | 自动 | 平台成品测试、五套独立完整性清单和 GitHub Actions 原生平台冒烟截图 | 五个平台成品只携带匹配运行包并真实启动；缺包、混装和摘要变化稳定阻塞 | V-11、V-17、V-18 |
| A-11 | 跨工具统一入口 | D-01、D-03、D-07、D-14、D-15 | 自动 | 统一入口聚焦测试、JSON 结果与退出码断言 | 单入口在预览阶段即拒绝不可执行计划和非法复验上下文；只有完整就绪计划返回 `readyToWrite: true` | V-12、V-13、V-14、V-15 |
| A-12 | 四层增强与五平台完整验证 | D-01、D-03、D-06～D-16 | 自动+人工 | 聚焦测试、五平台成品 CI、全量验证、官方 validators 与 `tests/fixtures/ui-review-complex/.frontend-ui-review/runs/manual-verify-passed-20260810/complex-dialog/actual.png`；视口 `1440×900`、`1280×800`，DPR 1 | 检查复杂交互、确定性视觉、统一入口、五平台单平台成品及真实截图：规范源、平台成品、安装缓存和验收证据一致且未扩大权限 | V-09、V-10、V-11、V-12、V-13、V-14、V-15、V-17、V-18 |
| A-13 | 真实项目迁移与证据来源 | D-02、D-03、D-06、D-08、D-09、D-14、D-15 | 自动+人工 | 三个 UI Skill、共享合同、预览聚焦测试与 `tests/fixtures/ui-review-complex/.frontend-ui-review/runs/manual-verify-passed-20260810/complex-dialog/actual.png`；视口 `1440×900`、`1280×800`，DPR 1 | 检查迁移阻塞、九场景、受控故障和同上下文复验：原适配器预览零产物，受控与真实当前态证据分开且环境问题不进入修复 | V-15 |
| A-14 | 平台成品体积与原生瘦身 | D-10、D-13、D-16 | 自动 | 平台发布预览与写入测试、成品体积报告、Linux ARM64 调试符号检查、五平台原生冒烟和本机缓存重装 | 默认零写入，成品只含一个平台且低于带余量预算；Linux ARM64 只修改暂存副本，任一门禁失败即停止发布 | V-18 |

## 待确认问题

- 无。
