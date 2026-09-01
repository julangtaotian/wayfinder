# REQ-2026-037：可复现的前端测试验证运行时

## 基本信息

- 状态：实施中
- 提出人：用户
- 负责人：Codex
- 目标版本：0.18.0
- 关联页面或模块：`scripts/prepare-frontend-test-runtime.mjs`、`scripts/cleanup-frontend-test-runtime.mjs`、`scripts/verify.mjs`、`.github/workflows/validate.yml`
- 关联变更：`reproducible-frontend-test-runtime`

## 背景与目标

当前仓库在每次验证时动态解析并安装 Vitest，验证结束后同时删除运行时和 npm 缓存。在受限或离线网络中，即使此前已完成过同版本验证，也无法复用已下载的受信依赖，且瞬态解析结果不利于复现。目标是在不向根目录引入依赖或 `node_modules` 的前提下，使用受版本控制的锁定依赖、受控缓存和显式离线模式，使验证运行时可重复准备、可离线复用并可明确清理。

## 决策台账

| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 依赖解析方式 | 已确认 | 使用仓库受版本控制的 Vitest 运行时清单与锁文件，通过 `npm ci` 安装，不再在每次验证中动态解析依赖树。 | 本轮优化目标 |
| D-02 | 缓存位置与生命周期 | 已确认 | 可复用 npm 缓存仅位于被忽略的 `outputs/frontend-test-cache/`；临时运行时仍位于 `outputs/frontend-test-runtime/`，两者分别清理。 | 项目验证规则与本轮优化目标 |
| D-03 | 离线行为 | 已确认 | `--offline` 为显式选项；缓存完整时离线准备成功，缓存缺失或不完整时失败关闭并返回稳定机器可读 code。默认模式允许网络回退，但优先复用受控缓存。 | 本轮优化目标 |
| D-04 | 命令与跨平台兼容 | 项目默认 | 准备和统一验证均支持离线选项；继续通过 npm 的 JavaScript 入口处理 Windows，不直接执行 `.cmd`。 | `AGENTS.md` 跨平台规则、现有实现 |
| D-05 | 验证边界 | 已确认 | 本轮不修改插件发布逻辑、业务项目依赖、官方校验器入口或 UI Review 大脚本结构。 | 本轮范围控制 |
| D-06 | 真实平台矩阵复验 | 已确认 | 仓库既有五平台 CI 矩阵在固定 Node.js 后先在线准备测试运行时、清理运行时、生成对应平台运行时，再执行 `npm run verify:shared -- --offline`；运行结束后总是分别清理运行时和测试缓存。平台运行时必须先行生成，以满足共享结构校验的前置条件。 | 用户追加的真实平台验证授权 |

## 范围

### 包含

- 提交 Vitest 验证运行时的最小清单与锁文件。
- 以 `npm ci` 安装临时运行时，并复用受控 npm 缓存。
- 为准备命令和统一验证提供显式离线模式及稳定失败诊断。
- 提供独立的缓存清理入口，并补充跨平台回归测试和文档。
- 在既有 macOS、Linux 与 Windows CI 矩阵中执行在线预热后的离线共享验证，并保留同一提交的外部任务证据。

### 不包含

- 向根 `package.json` 添加业务依赖或根 `node_modules`。
- 修改插件内置 OpenSpec、Playwright 运行时或平台发布流程。
- 执行或封装当前环境未暴露的官方 Skill / Plugin 校验器。
- 重构 UI Review 报告、Playwright 运行时或真实项目验证的大脚本。

## 当前行为

验证准备脚本在 `outputs/frontend-test-runtime/` 写入仅声明 Vitest 版本的临时 `package.json`，执行 `npm install`，并把 npm 缓存置于该临时目录。统一验证完成后删除整个临时目录，因此缓存与安装结果均无法复用；离线环境会因无法请求 registry 而失败。

## 期望行为

### 场景：首次在线准备验证运行时

- 前置条件：仓库根目录没有 `node_modules`，受控缓存可以为空。
- 当：执行默认验证准备命令。
- 则：脚本从受版本控制的锁文件创建 `outputs/frontend-test-runtime/` 并通过 `npm ci` 安装固定依赖。
- 并且：下载缓存只写入 `outputs/frontend-test-cache/`，根目录不产生依赖或锁文件。
- 异常或边界：安装失败时返回稳定 code，临时运行时不会被误报为有效。

### 场景：已缓存依赖的离线准备与验证

- 前置条件：同一锁文件已成功在线准备并保留受控缓存。
- 当：准备命令或共享统一验证带 `--offline` 执行。
- 则：命令只使用受控缓存，不访问 registry，并完成相同版本的运行时准备。
- 并且：统一验证将离线选项传递给准备过程。
- 异常或边界：缓存缺失、损坏或与锁文件不匹配时失败关闭，输出稳定 code、target 和中文说明。

### 场景：清理验证运行时与缓存

- 前置条件：临时运行时与可复用缓存均可能存在。
- 当：执行运行时清理命令。
- 则：只删除 `outputs/frontend-test-runtime/`，保留可复用缓存。
- 并且：执行缓存清理命令时才删除 `outputs/frontend-test-cache/`。
- 异常或边界：任一清理只允许受控 outputs 子路径，不能影响持久验证证据。

## 页面与交互

- 入口与操作路径：`npm run prepare:test-runtime [-- --offline]`、`npm run verify:shared [-- --offline]`、`npm run cleanup:test-runtime`、`npm run cleanup:test-cache`。
- CI 入口：`.github/workflows/validate.yml` 的 `platform` 矩阵在每个平台依次预热缓存、清理运行时、生成平台运行时、执行离线共享验证，并在结束时回收两类临时目录。
- 字段、文案与默认值：默认在线模式优先使用缓存；只有显式 `--offline` 禁止网络回退。
- 加载态、空态、错误态、禁用态：命令行输出稳定 code、target、status 与中文说明；不涉及页面状态。
- 权限与角色差异：无。
- 设计稿链接：不适用。

## 交互状态矩阵

| 状态 | 覆盖决定 | 触发或前置条件 | 期望结果 | 验证方式 | 关联验收 | 不适用理由 |
| --- | --- | --- | --- | --- | --- | --- |
| 初始（已有数据） | 覆盖 | 已有受控缓存与锁文件 | 默认与离线模式均复用固定依赖 | 自动 | A-01、A-02 | — |
| 用户操作 | 覆盖 | 执行准备、验证或清理命令 | 参数正确传递且只影响受控目录 | 自动 | A-01、A-03 | — |
| 刷新 | 覆盖 | 重复执行准备 | 已安装运行时可重新创建，缓存保持可复用 | 自动 | A-01、A-02 | — |
| 空态 | 覆盖 | 缓存目录不存在 | 默认模式允许安装；离线模式失败关闭 | 自动 | A-02 | — |
| 错误态 | 覆盖 | npm 子进程失败、缓存不完整或参数非法 | 输出稳定 code 与目标路径，不保留伪成功状态 | 自动 | A-02、A-04 | — |
| 卸载 | 覆盖 | 执行两类清理命令 | 运行时与缓存分别被有界清理，持久 outputs 不受影响 | 自动 | A-03 | — |

## 接口与数据

- 接口文档链接：不适用。
- 请求方法与路径：不适用。
- 请求字段及空值语义：CLI 仅接受可选 `--offline`；无值、重复或未知参数失败关闭。
- 响应字段及状态码：机器可读失败包含稳定 `code`、`target`、`status`；CLI 非零退出。
- 鉴权、加解密或敏感信息要求：不读取或输出认证令牌；缓存仅含锁文件约束的公开包内容。

## 关联变更范围

| 变更 | 决策范围 | 验收范围 |
| --- | --- | --- |
| reproducible-frontend-test-runtime | D-01、D-02、D-03、D-04、D-05、D-06 | A-01、A-02、A-03、A-04、A-05 |

## 修订记录

| 修订 | 日期 | 影响决策 | 影响验收 | 验证与任务处理 |
| --- | --- | --- | --- | --- |
| R-01 | 2026-09-01 | D-01、D-02、D-03、D-04、D-05 | A-01、A-02、A-03、A-04 | 首次建立需求，跨平台风险命中临时目录、子进程、包管理器入口、环境变量与机器诊断；影响平台为 macOS、Linux、Windows，任务待规划。 |
| R-02 | 2026-09-01 | D-06 | A-05 | 用户要求真实 Windows/Linux 验证；跨平台高风险新增 CI 工作流，继续命中路径、临时目录、子进程、包管理器入口、环境变量与机器诊断。影响平台为现有真实矩阵的 darwin-arm64、darwin-x64、linux-x64、linux-arm64、win32-x64；原有 V-01 至 V-06 重置待重新取证，新增 CI 证据任务。 |
| R-03 | 2026-09-01 | D-06 | A-05 | 五平台首次真实 CI 在离线共享验证的结构校验阶段一致失败，原因是平台运行时尚未生成；将平台运行时生成前移至离线验证之前。持续命中路径、临时目录、子进程、包管理器入口、环境变量与机器诊断；影响平台保持为 darwin-arm64、darwin-x64、linux-x64、linux-arm64、win32-x64。 |

## 兼容性与风险

- 受影响页面、公共组件、路由、权限或接口：影响仓库验证 CLI 及 CI 的依赖准备链，不影响业务项目代码。
- 历史数据与兼容策略：保留已有默认准备与运行时清理命令；新增离线和缓存清理命令，不改变根目录无依赖的约束。
- 上线与回滚注意事项：锁文件或 npm 缓存不完整时必须失败关闭；回滚时移除新增清单、命令与缓存目录，不改动持久 outputs 资产。

## 测试与验证

- 测试文件策略：复用；目标路径：`tests/frontend-test-workflow.test.mjs`；基线证据：文件已受 Git 跟踪；选择理由：该手写专用测试继续覆盖运行时准备、跨平台 npm 调用和离线传播；CI 工作流合同扩展同一变更中已受跟踪的 `tests/ui-review-platform-runtime.test.mjs`。
- 独立测试方案：需要；触发条件：本变更需跨 D/A/V 追踪离线、缓存、清理、统一验证传播与真实 CI 矩阵；活动变更与目标：`openspec/changes/reproducible-frontend-test-runtime/test-plan.md`；需求修订基线：R-02。
- 验证范围：全量；执行命令：聚焦 Node 测试、`npm test`、`npm run validate`、`npm run verify:shared -- --offline`、五平台 CI 矩阵、官方 Skill/Plugin validator（当前运行环境可用时）；选择理由：临时目录、包管理器、验证入口与跨平台 CI 共享链均受影响。
- 自动测试：模拟 npm 调用参数、锁文件复制、离线传播、缓存与运行时的有界清理；断言 CI 矩阵的预热、离线验证和总是清理顺序；在线运行真实 Vitest fixture。
- 人工检查：确认根目录无 `node_modules`，离线模式不含网络回退参数，缓存清理不触及持久 outputs；确认同一提交的五平台 CI 任务均成功。
- 构建与静态检查：结构校验、严格 OpenSpec 校验、体积门禁与补丁格式检查。

## 验证记录

| 验证ID | 验证类型 | 执行内容或环境 | 执行日期 | 结果 | 证据位置 |
| --- | --- | --- | --- | --- | --- |
| V-01 | 自动 | TC-01 锁定输入与缓存路径 | 2026-09-01 | 通过 | `openspec/changes/reproducible-frontend-test-runtime/evidence/V-01.json` |
| V-02 | 自动 | TC-02 显式离线模式失败关闭 | 2026-09-01 | 通过 | `openspec/changes/reproducible-frontend-test-runtime/evidence/V-02.json` |
| V-03 | 自动 | TC-03 运行时与缓存的分离清理 | 2026-09-01 | 通过 | `openspec/changes/reproducible-frontend-test-runtime/evidence/V-03.json` |
| V-04 | 自动 | TC-04 统一验证传播离线选项 | 2026-09-01 | 通过 | `openspec/changes/reproducible-frontend-test-runtime/evidence/V-04.json` |
| V-05 | 自动 | 离线共享统一验证 | 2026-09-01 | 通过 | `openspec/changes/reproducible-frontend-test-runtime/evidence/V-05.json` |
| V-06 | 人工 | 本机 macOS；检查根目录、缓存、离线命令与清理边界 | 2026-09-01 | 通过 | `openspec/changes/reproducible-frontend-test-runtime/verification.md` |
| V-07 | 自动 | TC-06 平台矩阵离线验证工作流合同 | 2026-09-01 | 通过 | `openspec/changes/reproducible-frontend-test-runtime/evidence/V-07.json` |
| V-08 | 自动 | 同一提交的五平台矩阵真实执行 | 待执行 | 计划 | 首次运行 [#80](https://github.com/julangtaotian/wayfinder/actions/runs/33464540918) 因平台运行时生成顺序失败；修复后待新提交 CI 结果 |

## 验收标准

- [x] [A-01] 固定锁文件驱动的准备过程可重复创建临时 Vitest 运行时，且根目录不产生依赖目录。
- [x] [A-02] 已缓存依赖可由显式离线模式完成准备和共享验证；缓存缺失或不匹配时失败关闭并提供稳定诊断。
- [x] [A-03] 运行时与可复用缓存可分别、有界地清理，持久 outputs 资产不受影响。
- [x] [A-04] Windows、macOS 与 Linux 的 npm JavaScript 入口、路径、环境变量和机器诊断回归均有确定性覆盖。
- [ ] [A-05] 同一提交的五平台 CI 矩阵均先在线预热、清理运行时、生成平台运行时，再完成离线共享验证和受控清理。

## 验收—证据映射

| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 | 验证记录 |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 锁定依赖与重复准备 | D-01、D-02 | 自动 | `openspec/changes/reproducible-frontend-test-runtime/evidence/V-01.json`、`openspec/changes/reproducible-frontend-test-runtime/evidence/V-05.json` | 通过 | V-01、V-05 |
| A-02 | 离线复用与失败关闭 | D-01、D-02、D-03 | 自动 | `openspec/changes/reproducible-frontend-test-runtime/evidence/V-02.json`、`openspec/changes/reproducible-frontend-test-runtime/evidence/V-04.json`、`openspec/changes/reproducible-frontend-test-runtime/evidence/V-05.json` | 通过 | V-02、V-04、V-05 |
| A-03 | 分离且有界的清理 | D-02、D-04 | 自动+人工 | `openspec/changes/reproducible-frontend-test-runtime/evidence/V-03.json`、`openspec/changes/reproducible-frontend-test-runtime/verification.md` | 通过 | V-03、V-06 |
| A-04 | 跨平台命令合同 | D-03、D-04 | 自动 | `openspec/changes/reproducible-frontend-test-runtime/evidence/V-04.json` | 通过 | V-04 |
| A-05 | 五平台真实离线验证 | D-02、D-03、D-04、D-06 | 自动+人工 | `openspec/changes/reproducible-frontend-test-runtime/evidence/V-07.json`、待 CI 运行链接与任务结果 | 待执行 | V-07、V-08 |

## 待确认问题

- [x] 本轮只实施验证运行时的可复现性；官方校验器入口与大脚本拆分分别建立后续变更。
