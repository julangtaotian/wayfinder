# Frontend AI Workflow

一个面向多个前端仓库复用的 Codex 团队插件。它把项目识别、AI 协作规则、需求文档、OpenSpec 上下文、健康检查和安全升级集中到一套版本化能力中。

## 当前能力

- 动态收集根 `package.json` 的四类直接依赖声明，保留未知框架、私有包、版本和来源分组；AI 再结合配置、入口、导入和调用证据总结用途。
- 继续提供 Vue、React、微信原生与跨端框架的有限兼容画像，并识别 Vite、Webpack、包管理器和项目声明的脚本；画像不是完整技术栈证明，命令区分“已检测”与“已执行”。
- 区分默认构建、交付构建与 lint 语义，避免把未知包装脚本当作已验证静态检查。
- 初始化项目级 `AGENTS.md`、Wayfinder 项目导航和内部规划配置。
- 把自然语言需求整理成可评审的 Markdown 文档。
- 使用 `$frontend-change` 推进探索、规划、修订、实施、同步和归档的完整受管生命周期。
- 使用独立的 `$frontend-fast-change` 直接完成结果已决定、影响可界定的局部前端改动；出现实质边界时携带已有工作单次交接完整流程。
- 使用 `$frontend-test` 只读盘点测试上下文、形成可追踪 `TC-*` 方案，并在明确请求后按项目原生设施实现与聚焦验证测试。
- 为自动 V-* 生成 schema v2 机器证据，绑定当前 D/A/V/TC 语义、工作区指纹及日志/附件摘要；完成时只读复算这些事实而不重跑项目命令。
- 所有插件受管的项目写入统一拒绝项目根以下的符号链接、越界和跨平台歧义路径，并使用独占暂存与原子替换；项目根本身的路径别名仍可规范化使用。
- 用需求状态、`V-*` 验证记录、人工视觉证据和测试 Git 基线约束交付完成，未满足条件时不允许归档。
- 以交互状态矩阵覆盖初始数据、真实用户操作、刷新、空态、错误态与卸载，并为旧需求提供只读升级缺口预览。
- 检查必需文件、项目脚本、工作流版本和内置规划引擎状态。
- 只升级受管区块，保留业务项目自行维护的内容。
- 在用户明确要求时，按可审计的文件范围完成 AI 深度项目地图与风险分析。
- 深度扫描在读取前排除敏感配置和 Git 忽略项，使用稳定快照指纹提示项目地图是否过期。
- 使用受控需求状态、关联变更范围、逐任务引用和默认 dry-run 的完成入口形成不可绕过的归档门禁。
- 固定内置 OpenSpec 1.9.0，理解规划完成、意外范围报告、归档任务校验、嵌套规格、缩进任务与能力退役，并阻止批量命令在错误规划根静默通过。
- 使用生产包、声明许可证和包树 SHA-256 清单核验内置 OpenSpec，默认检查不会改写清单。
- 用同一个 `npm run verify` 在本地和 CI 串行执行测试、插件结构、OpenSpec 严格校验、归档任务校验、运行时版本与完整性检查。
- 对已确认“不改变可观察行为”的工具、文档或纯内部变更支持受控 `skip_specs`；其他变更仍必须提供 delta specs，完成入口不暴露跳过参数。
- 通过插件提供通用技能，减少每个仓库重复维护 `.codex/skills`。
- 在项目自动化流程内完成结构化复杂交互、DOM/像素三态判断、显式授权修复和相同上下文复验，不需要独立 PC 客户端、管理站点或数据库。
- 随插件提供共享 Playwright，以及 `darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64`、`win32-x64` 五个平台独立浏览器成品；每次安装只携带当前平台，业务项目零安装，视觉插件仅作为已声明的不确定结果兜底。

0.18.0 在动态根依赖画像和精简健康检查之上增加持续仓库治理：已验收需求正文按年度归档，根目录只保留轻量入口；统一验证固定执行体积预算门禁；综合测试和核心脚本按职责拆分；蓝湖交付收敛为单一轻量 AI 规范；五平台 CI 从固定 Playwright 官方源只重建当前矩阵平台资产，不依赖仓库 Git LFS 下载额度。AI 默认不展开历史需求正文、无关平台二进制或历史验收资产。动态画像不读取 `node_modules` 或传递依赖，不安装或执行依赖，也不查询注册表、漏洞、许可证和最新版本；“已声明”不等于“已安装、已使用、兼容、安全或验证通过”。项目识别回归覆盖 Vue 2 + Vite、Vue + Webpack、React + Vite、React + Webpack，以及 npm、pnpm、yarn；这些是已认证兼容组合，不是动态识别能力的框架白名单。测试用例闭环首版认证 Vue 3 + Vite + Vitest，其他 runner 只按项目已有文件提供有限支持。Monorepo/workspaces 和多个前端应用的递归依赖画像与专属编排、远程 Figma/蓝湖同步、远程 CI/PR 状态读取与回写不在本版本范围内；外部 CI URL 只能记录为 `external-recorded`，不能由本地字段自我提升为可信通过。

## 安装

前置条件：Node.js 20.19 或更高版本、Codex CLI。插件 0.18.0 已内置并固定 OpenSpec 1.9.0，使用者不需要全局安装或升级 OpenSpec。

```bash
codex plugin marketplace add /absolute/path/to/frontend-ai-workflow
codex plugin add frontend-ai-workflow@frontend-ai-workflow
```

安装或更新插件后，新建 Codex 任务以加载最新技能。

## 使用

对外提供以下 9 个团队命令。OpenSpec 已经作为内部规划引擎内置，使用者不需要全局安装 OpenSpec，也不需要直接接触 `openspec-*` 命令。

使用前请通过 Codex 打开目标前端仓库。安装或更新插件后，建议新建 Codex 任务，以加载最新版命令。调用时输入 `$命令名`，后面直接跟自然语言要求即可。

### 1. `$frontend-workflow-bootstrap`

**作用**：把一个普通前端项目接入统一的 AI 开发流程。

**使用场景**：业务项目第一次接入这套工作流时使用，通常每个项目只需要执行一次。

**使用示例**：

```text
$frontend-workflow-bootstrap 请检查并初始化当前项目，先展示预览
```

确认预览内容后，可以继续输入：

```text
确认写入
```

它会完成以下工作：

- 动态收集根项目全部合法直接依赖，并把 preset、终端和平台画像作为有限兼容信号。
- 识别 Vite、Webpack、包管理器和项目脚本。
- 检查项目已有的开发规范和当前文件状态。
- 先展示准备新增、跳过或者存在冲突的文件。
- 确认后创建 Wayfinder 项目导航和内部规划配置；需求模板仅在首次写正式需求时按需使用。
- 不修改业务代码，不安装业务依赖，不覆盖用户已有内容。

**达到的目的**：让不同业务项目一次接入，后续统一使用需求、规划、开发和验收流程。

需要深度分析时，可以这样调用：

```text
$frontend-workflow-bootstrap 请深度扫描当前项目，先展示扫描范围和预览
```

深度模式会先按 Git 忽略和敏感文件规则列出安全的纳入范围、排除项和限制；AI 必须逐项记账并深读关键链路，再把项目地图增强到 `wayfinder/frontend.md`，不会新增项目分析文件。项目地图会明确区分源码事实、推断和待确认项，并记录扫描时间、Git 状态和稳定范围指纹；确认写入前不会修改项目文件，后续源码变化只产生过期警告。

### 2. `$frontend-requirement-write`

**作用**：把自然语言需求整理成正式、可评审、可验收的需求文档。

**使用场景**：接到新需求、需求描述比较零散，或者准备开发前需要明确范围时使用。

**使用示例**：

```text
$frontend-requirement-write 请把 salesHome 信息收集功能整理成需求文档
```

也可以直接在命令后粘贴完整需求描述：

```text
$frontend-requirement-write

在 salesHome 页面增加“收集信息”按钮，点击后打开信息收集弹窗，
收集姓名和手机号，必填并进行有效性和安全性校验。
```

它会完成以下工作：

- 阅读相关页面、组件、接口和测试代码。
- 先建立带来源的决策台账，区分已确认需求、暂定方案和待确认问题。
- 补充交互状态、校验规则、安全要求、异常场景、带编号的验收标准和验收证据映射。
- 校验需求、规格、设计和任务是否只引用已确认或项目默认的业务决策，避免后续文档各自补充规则。
- 建立变更后显式记录该变更适用的 D-* 与 A-*；后续行为修订先更新需求并失效旧证据。
- 生成类似 `requirements/REQ-2026-001.md` 的需求文档。
- 只编写需求文档，不修改业务代码。

**达到的目的**：在开发前把“要做什么”说清楚，减少需求遗漏、理解偏差和返工。

### 3. `$frontend-fast-change`

**作用**：直接完成目标明确、结果已经决定、影响可以界定在局部调用链的前端改动，并运行能证明结果的聚焦验证。

它只读取适用规则、仓库状态、相关源码、必要调用方和邻近测试，不创建需求或 OpenSpec 产物。达成同一局部结果需要多个文件时可以一起完成，不会因目录名、文件数或行数机械升级。

如果发现匹配的活动变更、新的产品决定、无法界定的影响或实质共享契约与工程风险，它会停止扩张，保留已有安全工作，并把触发原因、文件和验证结果只交接一次给 `$frontend-change`。它不会自动提交、推送或发布。

```text
$frontend-fast-change 请修复筛选按钮禁用态不刷新的问题，并运行对应的聚焦验证
```

**达到的目的**：简单任务只加载短路径并直接交付；边界变复杂时已有调查和修改仍能被完整流程复用。

### 4. `$frontend-change`

**作用**：负责一个需求从分析、规划、开发、验证到归档的完整生命周期。

同一个变更可以反复调用该命令。它会读取项目中的需求和规划文件，根据用户意图和当前变更状态，自动选择探索、规划、修订、实施或者完成阶段；独立快速 Skill 不改变这里原有的状态规则和完成门禁。

**分析需求，不生成规划**：

```text
$frontend-change 先分析一下这个需求的影响范围和可选方案，暂时不要生成规划
```

**根据需求生成规划**：

```text
$frontend-change 根据需求文档生成实施规划，暂时不要修改业务代码
```

它会分析现有代码，生成提案、技术设计、变更规格和任务清单，相关内容保存在 `openspec/changes/` 中。

**开始实施代码**：

```text
$frontend-change 开始实施当前变更
```

它会读取已经确认的规划、OpenSpec 1.9 返回的项目 context 与 apply guidance，按照任务顺序修改业务代码、补充必要测试，并记录包含缩进子任务的完成情况。动态指导只能补充项目约束，不能改写需求、用户选择或门禁；实现发现规划外范围时必须先报告，不能静默缩减或延后规定行为。

**需求发生变化时修订方案**：

```text
$frontend-change 手机号需要同时支持大陆号码和港澳号码，请更新方案，暂时不要写代码
```

此时先修订需求台账、验收、关联变更范围、状态矩阵和修订记录，失效不再适用的 V-* 并重新打开受影响任务，再协调规划资料；不会直接混入业务代码修改。仅不改变业务语义的技术选择可以只修订设计和任务。旧需求升级预览也会只读检查这些治理结构是否齐全，不会自动改写历史业务事实。

**查看当前状态**：

```text
$frontend-change 检查当前变更进行到哪一步，还有哪些任务没有完成
```

状态检查是只读操作，不会修改文件。它会区分工作流接入、变更一致性和交付就绪层级，并明确说明项目命令只是已检测、验证记录只是已记录，还是确实执行通过。

**完成变更并收尾**：

```text
$frontend-change 验证、同步并归档当前变更
```

它会先把需求置为“待验证”，检查任务、验收场景、测试结果、持久机器证据、验证记录、规划 artifact 完成状态和严格 OpenSpec 结果；默认先展示包含 archive guidance、证据引用改写、实际规格路径和归档目标的完成预览。所有门槛通过后才同步正式规格、归档变更、把引用迁移到实际归档目录并执行归档后只读审计，再将需求更新为“已验收”；完成阶段不会重跑测试或外部 CI，也不能通过确认跳过失败门禁。

**达到的目的**：使用者只记住一个命令，就能完成“分析 → 规划 → 实施 → 验证 → 归档”，不用学习 OpenSpec 的内部命令。

### 5. `$frontend-test`

**作用**：把已确认需求形成可审查的 `TC-*` 测试方案，并按用户意图区分只读分析、方案写入、测试实现和聚焦验证。

**使用示例**：

```text
$frontend-test 先盘点当前变更的测试覆盖，不要修改文件
$frontend-test 为当前活动变更形成测试用例
$frontend-test 按方案实现并验证 TC-03
```

只读分析会识别项目已有测试命令、runner、配置、目录、手写测试、生成基线和 Git 证据。形成方案时只在活动变更内维护 `test-plan.md`；实现阶段只修改对应测试代码，不安装业务依赖、不修改业务源码。验证入口默认预览，显式执行后只有命令成功且精确发现计划 TC 才生成同 V-* 的 schema v2 JSON 证据；严格完成门禁会复算当前验收语义、工作区、日志和附件，零测试、篡改、过期语义、产品缺陷、测试错误、需求歧义、环境阻塞和历史无关失败会分别报告。视觉用例复用既有 UI Review 通过状态和关键产物，不重复建设浏览器流程。

### 6. `$frontend-ui-review`

**作用**：按项目内配置打开真实页面，对照本地设计图或设计规范生成实际截图、标注截图、Markdown 报告和可继续处理的运行状态。

**使用示例**：

```text
$frontend-ui-review 验收 home-desktop 场景
```

首次使用时，在业务项目创建 `.frontend-ui-review/config.json` 和 `.frontend-ui-review/playwright-adapter.mjs`，声明页面、视口、设计依据、目标节点和交互。两个草案分别来自插件的 `assets/templates/ui-review/config.json` 与 `assets/templates/ui-review/playwright-adapter.mjs`；场景事实和项目交互必须按当前项目修改。

版本 2 配置通过 `projectPlaywright.adapter` 接收插件内置的 Playwright 1.62.1 与当前平台 Chromium headless shell，业务项目不添加 Playwright 依赖，也不修改自己的锁文件。交互使用受限结构化动作表达点击、悬停、输入、按键、选择、勾选、等待、断言和分段截图；比较使用 DOM、图片区域或混合模式，输出 `passed / needs-fix / inconclusive`。Codex Browser 或同类视觉能力只在结果不确定且配置明确声明时作为兜底。

其他 AI 工具不需要理解 Codex Skill，也可以直接消费确定性入口：

```text
node <插件根>/scripts/ui-review-runner.mjs review --target <项目> --scenario home-desktop --run-id build-101
# 确认预览后显式执行
node <插件根>/scripts/ui-review-runner.mjs review --target <项目> --scenario home-desktop --run-id build-101 --write
```

返回值包含固定运行时与平台、结构化交互、比较规则、预计产物和安全边界。稳定退出码为 `0=通过`、`1=需修改/复验失败`、`2=不确定`、`3=阻塞`；默认预览不创建目录。版本 1 老配置继续保持原指纹和采集语义，其字符串交互不会被猜测执行。

当前仓库保留 `darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64`、`win32-x64` 五套规范源资产，共享 Playwright、PNG 解码和像素比较代码。发布入口为当前原生平台生成独立成品，每个成品只携带一套 Chromium、FFmpeg、许可和摘要；未支持或成品不匹配的平台明确阻塞，只能使用场景已经声明的视觉兜底，不会在用户机器现场下载。

### 7. `$frontend-ui-fix`

**作用**：只在用户明确要求后，根据验收报告声明的源码文件、稳定锚点和修改边界应用最小修复。

**使用示例**：

```text
$frontend-ui-fix 应用 build-101 的 UI 验收修复
```

默认 `autoFix: "suggest"` 只输出建议；当前任务显式授权后才会修改。它拒绝直接修改 `main` / `master`、拒绝覆盖重叠的未提交改动，并且修复后只进入“待复验”，不会直接标记通过，也不会自动提交、推送或创建 PR。

### 8. `$frontend-ui-verify`

**作用**：使用与基线完全相同的页面、视口、设计依据、目标节点、交互和首次实际采集器重新验收，区分已关闭、未解决和新增问题；不能在项目 Playwright 与视觉兜底之间切换。

**使用示例**：

```text
$frontend-ui-verify 复验 build-101 的修复结果
```

只有未解决与新增问题都为空时才通过；场景上下文已经变化时会要求重新开始独立验收。

### 9. `$frontend-workflow-check`

**作用**：只读检查当前项目是否正确接入工作流，以及工作流能否正常运行。

**使用场景**：初始化后、升级后、开始新需求前，或者工作流出现异常时使用。

**使用示例**：

```text
$frontend-workflow-check 检查当前项目的工作流是否健康
```

它会检查以下内容：

- 必需的配置和 Wayfinder 项目导航是否存在，以及旧布局是否需要迁移。
- 项目的测试、默认构建、交付构建和 lint 语义是否已检测；只有实际执行过的命令才报告通过。
- 工作流版本是否正确。
- 内置 OpenSpec 规划引擎是否完整。
- 当前规划目录是否存在异常。
- 深度项目地图的快照是否过期，以及是否存在已完成但仍未归档的活跃变更。
- 历史自动验证是否只有 Markdown、证据是否仍误指活动目录、外部 CI 是否仅记录而未远程复查；这些只形成结构化警告，不自动改写历史文件。
- 选择具体需求和变更时，检查需求—规划—任务一致性或交付就绪状态。

该命令不会写入文件、安装依赖或者初始化项目。

**达到的目的**：快速判断当前项目能否正常使用这套流程，并定位缺失配置或版本问题。

### 10. `$frontend-workflow-upgrade`

**作用**：公共工作流发布新版本后，安全升级业务项目中的受管规则。

**使用场景**：插件已经更新，而现有业务项目需要同步最新版公共规则时使用。它不是日常开发命令，也不需要每个需求都执行。

**使用示例**：

```text
$frontend-workflow-upgrade 检查可以升级的内容，先展示预览
```

确认升级内容后，可以继续输入：

```text
确认升级
```

它只更新带有工作流管理标记的公共内容，包括把项目受管配置同步到工作流 0.18.0 / OpenSpec 1.9.0，并刷新根项目直接依赖摘要；不会修改 `package.json`、安装依赖，也不会覆盖业务代码、需求文档、项目专属上下文、正在进行的规划、历史规格、测试方案或测试代码，以及管理标记之外的项目自定义内容。发现管理标记缺失、重复、发生冲突或受管目标经过项目内符号链接时，会停止升级并说明原因。

升级预览还会只读检查 `requirements/REQ-*.md`，列出活跃或状态未知需求缺少的决策台账、验收映射和统一状态；它不会改写任何历史需求，迁移必须逐份确认业务事实后再进行。

**达到的目的**：让各业务项目安全同步公共规则，不需要重新初始化，也不需要手工复制文件。

### 推荐完整流程

```text
# 每个项目首次接入时执行一次
$frontend-workflow-bootstrap 请检查并初始化当前项目，先展示预览

# 结果已决定且影响局部的修改直接走独立快速通道
$frontend-fast-change 请修复这个已有行为的小问题，并运行对应的聚焦验证

# 新功能或高风险变更先整理需求文档
$frontend-requirement-write 请整理 salesHome 信息收集需求

# 根据需求生成规划
$frontend-change 根据需求文档生成实施规划，暂时不要修改业务代码

# 确认规划后开始开发
$frontend-change 开始实施当前变更

# 需要独立测试方案或测试实现时执行
$frontend-test 为当前活动变更形成测试用例并实现聚焦测试

# 开发完成后验证和归档
$frontend-change 验证、同步并归档当前变更

# 需要进行 UI 验收闭环时执行
$frontend-ui-review 验收 home-desktop 场景
$frontend-ui-fix 应用本次验收中已授权的安全修复
$frontend-ui-verify 使用原场景复验修复结果

# 初始化后、升级后或者出现问题时执行
$frontend-workflow-check 检查当前项目的工作流是否健康

# 公共工作流发布新版本后执行
$frontend-workflow-upgrade 检查可以升级的内容，先展示预览
```

可以简单记为：`bootstrap` 管接入，`fast-change` 管明确局部修改，`requirement-write` 管需求，`change` 管完整开发过程，`test` 管测试用例闭环，`ui-review / ui-fix / ui-verify` 管 UI 验收闭环，`check` 管检查，`upgrade` 管升级。

## 项目落地文件

初始化后，目标仓库会得到以下轻量配置：

```text
AGENTS.md
openspec/config.yaml
wayfinder/frontend.md
```

业务需求在首次创建时写入 `requirements/REQ-*.md`，OpenSpec 变更保留在 `openspec/changes/`。需求验收和变更归档成功后，完整需求正文自动迁入 `requirements/archive/<year>/`，根文件成为轻量入口，`requirements/index.json` 提供稳定定位；普通检查只读取根入口，只有显式历史审计才展开归档正文。公共能力更新不覆盖这些业务内容。

旧项目如仍包含 `.ai-workflow.yaml` 和 `docs/ai-context/frontend.md`，先运行 Wayfinder 迁移预览；确认创建、保留和删除计划后再显式写入。普通升级不会自动移动或删除旧文件。

## 本地开发

```bash
npm run prepare:test-runtime
npm run verify
npm run cleanup:test-runtime
npm run cleanup:test-cache
```

`prepare:test-runtime` 从 `scripts/fixtures/frontend-test-runtime/` 中受版本控制的锁定输入创建固定 Vitest 运行时，并通过 `npm ci` 写入被定向忽略的 `outputs/frontend-test-runtime/`；可复用 npm 缓存独立位于 `outputs/frontend-test-cache/`，不会在项目根目录创建 `node_modules`。首次在线准备会填充缓存；此后可使用 `npm run prepare:test-runtime -- --offline` 或 `npm run verify:shared -- --offline` 强制只使用缓存，缓存缺失或不完整时命令失败关闭。`cleanup:test-runtime` 只删除临时运行时，`cleanup:test-cache` 才删除可复用缓存。`verify` 是本地与 CI 的统一门禁，首先检查退役路径、受跟踪 outputs、活跃全文需求和日常大文件预算，再执行测试、结构、OpenSpec 与运行时验证；预算调整必须先形成正式需求和设计决策，不能按当前体积静默放宽。它会把跨平台临时目录固定到 `outputs/verify-runtime/tmp` 后自动清理。定位问题时可运行 `npm run test:repository`、`npm run test:workflow`、`npm run test:platform`、`npm run footprint`、`npm run validate` 和 `npm run openspec:version`。

规范源码只保存 Playwright 共享 JavaScript 运行时、锁文件、许可证、五平台元数据和共享完整性清单，不再保存 Chromium/FFmpeg 二进制或平台生成清单。Validate CI 在各原生 runner 上通过固定 Playwright 1.62.1 CLI，在源码目录之外的有界暂存中只生成当前平台 marketplace；普通 push/PR 只上传小型 `package-report.json`，不上传大型浏览器成品，也不增加 cache、schedule 或写权限。完整性、许可、体积和真实 Chromium 冒烟仍是必需门禁，不能用跳过冒烟代替成功。

安装或离线交付时，先用 `prepare-platform-marketplace.mjs --platform <platform-arch> --output <被忽略的成品目录>` 预览，确认后追加 `--write`；写入只允许当前原生平台。生成的完整 marketplace 可以复制到离线环境安装，插件使用阶段不会下载浏览器或回退用户缓存。失败时只清理本次暂存；需要回滚时恢复上一条已验证提交或保留的旧成品，不改写 Git 历史，也不自动清理本地或远端 LFS 对象。

### 升级内置 Playwright

1. 在 `plugins/frontend-ai-workflow/runtime/playwright/package.json` 固定同一个 Playwright 版本，使用官方 npm 注册表更新包和锁文件。
2. 用 `prepare-platform-marketplace.mjs --platform <platform-arch> --output <被忽略的成品目录>` 预览发布计划，只有当前原生平台的维护阶段才追加 `--write` 下载固定 Chromium headless shell 与 FFmpeg。
3. 更新 `runtime/playwright/platforms/<platform-arch>.json` 的浏览器 revision、可执行文件和许可路径；平台资产只能位于自己的独立目录。
4. 重建并校验源码共享完整性；平台完整性清单只在实际单平台成品中生成，不回写规范源码。
5. 在五个受支持平台都完成结构、体积、许可、真实 Chromium 冒烟和安装证据后再更新插件 cachebuster。不得把某个平台的浏览器发布物标记为通用版本。

### 生成单平台插件成品

1. 运行 `node plugins/frontend-ai-workflow/scripts/package-plugin-platform.mjs --platform <platform-arch> --output outputs/<平台成品目录>` 预览平台、排除资产和体积预算；预览不创建目录。
2. 仅在 `<platform-arch>` 与当前原生平台一致时追加 `--write`。成品完整保留共享 Playwright、OpenSpec、Skills、脚本、当前平台 Chromium/FFmpeg、许可和重建后的完整性清单，同时排除其他四个平台资产。
3. 成品逻辑体积上限为 macOS ARM64/x64 各 260 MiB、Linux x64 330 MiB、Linux ARM64 420 MiB、Windows x64 340 MiB。许可、FFmpeg、共享运行时和完整性文件不得用于体积裁剪。
4. Linux ARM64 只在原生构建机对暂存 Chromium 去除调试符号，不修改规范源码；结构、完整性、体积或真实浏览器冒烟任一失败时都不会发布半成品。

### 升级内置 OpenSpec

内置运行时按“候选先行、验证后替换”升级：

1. 在 `outputs/<OpenSpec 升级验证目录>/` 精确安装目标版本，使用 `--omit=dev --ignore-scripts --no-audit --no-fund`，不在项目根目录或现有运行时目录直接安装。
2. 从官方包内容和生产依赖闭包组装候选，核验 `package.json` 版本、`bin/openspec.js`、根 LICENSE、每个直接生产依赖和依赖许可证。
3. 用候选执行版本命令、当前仓库 `validate --all --strict --json`、`validate --archived --json` 和兼容场景；全部通过后才备份并替换 `plugins/frontend-ai-workflow/runtime/openspec`。
4. 显式运行 `node plugins/frontend-ai-workflow/scripts/runtime-integrity.mjs --write`，生成不含绝对路径和时间戳的生产包许可证与 SHA-256 清单。
5. 同步包装器固定版本、第三方声明、内部参考、模板、插件版本和测试；包装器保持 `OPENSPEC_NO_UPDATE_CHECK=1`，不调用全局安装或 `openspec update`。
6. 运行 `npm run verify` 和插件 cachebuster 重装。验证未全部通过时恢复备份，不发布部分替换结果。

只生成项目范围清单，不读取业务语义或写入文件：

```bash
node plugins/frontend-ai-workflow/scripts/collect-project-scope.mjs --target /path/to/project
```

插件发布前还应运行 Codex 的插件与技能官方验证脚本。仓库采用 MIT License。
