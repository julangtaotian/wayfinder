# REQ-2026-047：开发者效果基准模块化与最小静态检查

## 基本信息

- 状态：实施中
- 提出人：用户
- 负责人：Codex
- 目标版本：0.18.x
- 关联页面或模块：开发者效果基准、仓库静态检查、统一验证
- 关联变更：`modularize-developer-effectiveness-benchmark`

## 背景与目标

开发者效果基准的主编排模块已达到 800 行，基础模块达到 776 行，继续累加会触及仓库脚本体积预算，也会让局部维护需要读取过多无关上下文。仓库目前依靠测试与结构校验发现行为和结构问题，但缺少一个零依赖、可在统一验证前快速发现 JavaScript 语法错误的静态入口。

本需求在不改变基准公开导入、命令行、机器字段、错误码、运行结果和安全边界的前提下拆分两份模块，并增加只检查仓库自有 JavaScript 语法的最小静态检查。该检查进入统一验证，但不冒充 ESLint、类型检查或完整语义分析。

## 决策台账

| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 可观察行为与规格 | 已确认 | 本变更只做内部模块化与仓库开发门禁，不改变可观察行为；插件与基准的公开导入、CLI、JSON、错误码、输出和安全语义保持兼容，并授权 `skip_specs: true` | 用户要求拆分基准模块并引入最小静态检查；现有 REQ-2026-042 行为合同 |
| D-02 | 主编排模块边界 | 项目默认 | 保留 `developer-effectiveness-benchmark.mjs` 为兼容入口，把单次运行与整轮状态推进下沉到职责明确的内部模块；兼容入口不超过 500 行，新运行模块不超过 500 行 | `AGENTS.md` 800 行预算与现有公开调用方 |
| D-03 | 基础模块边界 | 项目默认 | 保留 `developer-effectiveness-benchmark-foundation.mjs` 的既有公开导出路径，把模拟用例补丁、验收、冻结和路线识别下沉到内部模块；基础入口不超过 600 行，新用例模块不超过 350 行，依赖保持单向且无循环 | 当前源码职责与专用测试导入路径 |
| D-04 | 最小静态检查范围 | 已确认 | 新增零依赖 Node.js 静态入口，仅对根 `scripts/`、`tests/` 与 `plugins/frontend-ai-workflow/scripts/` 中的 `.js`、`.mjs`、`.cjs` 文件执行 `node --check`；不扫描 runtime、outputs、dist 或业务项目，不声称提供 lint、类型或语义检查 | 用户明确要求最小静态检查；仓库仅使用 Node.js 标准库 |
| D-05 | 验证链集成 | 已确认 | 提供独立 package script，并把静态检查作为 `verify` 的确定性步骤；任何文件失败时保留真实退出状态，以稳定 `code`、仓库相对 `target` 和 `status` 定位，后续步骤停止 | 用户要求本次完成；现有统一验证采用无 shell 的 Node 子进程步骤 |
| D-06 | 跨平台范围 | 项目默认 | 跨平台高风险为是，命中 CI、路径、子进程、包管理器入口和机器诊断；使用数组参数与 `shell: false`，路径双侧规范化，受影响平台为真实矩阵的 darwin-arm64、darwin-x64、linux-x64、linux-arm64、win32-x64 | `AGENTS.md` 与 `.github/workflows/validate.yml` |

## 范围

### 包含

- 拆分两个接近 800 行的开发者效果基准模块，保留原入口和全部既有导出。
- 为新模块建立明确职责、单向依赖和确定性行数门禁。
- 新增仓库级最小 JavaScript 语法检查及稳定机器结果。
- 将静态检查加入统一验证步骤并补充聚焦回归。
- 运行基准专用测试、静态检查测试、统一测试、结构、官方校验和体积门禁。

### 不包含

- 不改变合成用例、执行顺序、模型调用、验收、指标或输出 schema。
- 不引入 ESLint、TypeScript、格式化器或任何第三方依赖。
- 不扫描内置 OpenSpec/Playwright 运行时、构建产物、outputs 或外部业务仓库。
- 不修改真实 CI 矩阵定义，不把本机通过写成五平台通过。
- 不重跑开发者效果真实代理基准，不消费额外模型额度验证纯重构。

## 当前行为

- `developer-effectiveness-benchmark.mjs` 为 800 行，提示词、代理运行、预检、单次执行和整轮状态推进集中在同一文件。
- `developer-effectiveness-benchmark-foundation.mjs` 为 776 行，基础路径/Git/输出能力与模拟用例冻结和路线识别集中在同一文件。
- `npm run verify` 有体积、测试、结构、OpenSpec 和运行时检查，但没有独立 JavaScript 语法检查步骤。

## 期望行为

### 场景：既有基准调用保持兼容

- 前置条件：调用方继续从两份原模块导入既有函数，或运行既有基准 CLI。
- 当：完成内部模块拆分后执行同一输入。
- 则：公开导出、返回字段、错误码、输出内容和退出状态保持一致。
- 并且：原入口满足新的行数上限，内部模块按职责单向依赖。
- 异常或边界：不得通过动态导入或消费者迁移规避兼容入口。

### 场景：静态检查通过

- 前置条件：三类受管源码目录只包含语法合法的 JavaScript 文件。
- 当：运行独立静态检查或统一验证。
- 则：每个发现的文件恰好执行一次 `node --check`，返回稳定通过状态与文件计数。
- 并且：runtime、outputs、dist 和外部目录不进入扫描。
- 异常或边界：目录不存在时按空目录处理，但三类目录合计零文件时失败关闭。

### 场景：静态检查发现语法错误

- 前置条件：受管目录内存在语法非法文件。
- 当：静态检查运行到该文件。
- 则：停止并返回非零状态、稳定错误码和规范化的仓库相对目标，同时保留 Node 的语法诊断。
- 并且：统一验证不继续执行后续步骤。
- 异常或边界：文件名包含空格、非 ASCII 字符或 Windows 分隔符时仍使用参数数组并稳定定位。

## 页面与交互

- 入口与操作路径：`npm run check:static`；`npm run verify` 自动执行相同步骤。
- 字段、文案与默认值：机器字段使用英文稳定值，人类摘要使用中文；默认扫描固定三类目录。
- 加载态、空态、错误态、禁用态：无图形界面；正常输出计数，零发现或语法错误失败关闭。
- 权限与角色差异：不增加网络、Git 写入、业务仓库或系统权限。
- 设计稿链接：不适用。

## 交互状态矩阵

| 状态 | 覆盖决定 | 触发或前置条件 | 期望结果 | 验证方式 | 关联验收 | 不适用理由 |
| --- | --- | --- | --- | --- | --- | --- |
| 初始（已有数据） | 覆盖 | 当前基准入口和专用测试存在 | 原导入路径与行为基线可被聚焦测试证明 | 自动 | A-01、A-02 | — |
| 用户操作 | 覆盖 | 运行静态检查或统一验证 | 固定目录中的源码被逐一检查并报告稳定结果 | 自动 | A-03、A-04 | — |
| 刷新 | 覆盖 | 重复运行相同检查 | 发现顺序、计数和结果保持确定性且零写入 | 自动 | A-03 | — |
| 空态 | 覆盖 | fixture 中没有候选文件 | 返回稳定零发现失败，不伪造通过 | 自动 | A-03 | — |
| 错误态 | 覆盖 | fixture 含语法错误或子进程启动失败 | 保留真实状态和相对目标，统一验证停止 | 自动 | A-03、A-04 | — |
| 卸载 | 不适用 | 一次性同步检查没有订阅或后台资源 | 进程结束即释放资源 | 自动 | — | 不存在长期生命周期资源 |

## 接口与数据

- 接口文档链接：本变更设计；不新增插件公共业务接口。
- 请求方法与路径：静态检查接收仓库根和可注入执行器；CLI 默认使用当前仓库根。
- 请求字段及空值语义：目录清单固定；没有候选文件返回失败，不以零计数作为成功。
- 响应字段及状态码：返回 `ok`、`code`、`status`、`checkedFiles`、`target` 和必要诊断；成功退出 0，失败保留真实非零状态。
- 鉴权、加解密或敏感信息要求：不访问网络、环境凭据或文件内容之外的数据；诊断只持久显示仓库相对路径。

## 关联变更范围

| 变更 | 决策范围 | 验收范围 |
| --- | --- | --- |
| modularize-developer-effectiveness-benchmark | D-01、D-02、D-03、D-04、D-05、D-06 | A-01、A-02、A-03、A-04 |

## 修订记录

| 修订 | 日期 | 影响决策 | 影响验收 | 验证与任务处理 |
| --- | --- | --- | --- | --- |
| R-01 | 2026-09-10 | D-01～D-06 | A-01～A-04 | 根据用户第五项建立纯模块化与最小静态检查需求；所有验证保持计划。 |

## 兼容性与风险

- 受影响页面、公共组件、路由、权限或接口：不影响 UI；影响基准内部模块边界和仓库统一验证。
- 历史数据与兼容策略：既有基准 JSON、输出目录、CLI 和导出路径不变；静态检查只新增仓库开发入口。
- 上线与回滚注意事项：可同时回退新内部模块、静态入口和统一验证步骤；不涉及数据迁移。
- 跨平台高风险：是。
- 命中项：CI、路径、子进程、包管理器入口、机器可读诊断。
- 受影响平台：darwin-arm64、darwin-x64、linux-x64、linux-arm64、win32-x64。
- 对应回归：`tests/developer-effectiveness-benchmark.test.mjs` 锁定兼容导出与模块边界；新建 `tests/static-check.test.mjs` 覆盖空格/非 ASCII 路径、Windows/POSIX 目标规范化、零发现、语法错误、退出状态和统一验证步骤。
- 外部证据：最终候选提交的五平台 CI 尚未运行，保持待执行；本地聚焦与统一验证不替代真实矩阵。

## 测试与验证

- 测试文件策略：复用 `tests/developer-effectiveness-benchmark.test.mjs`，Git 基线提交为 `82eb4e9e58cc450507c4b920730af24ab27da8af`，用于同一基准公开兼容和模块边界；新建 `tests/static-check.test.mjs`，因为仓库静态检查是独立职责，不混入基准行为测试。
- 独立测试方案：需要；触发条件：模块拆分、失败诊断、统一验证和跨平台子进程边界需要跨 D/A/V 跟踪；目标为 `openspec/changes/modularize-developer-effectiveness-benchmark/test-plan.md`；需求修订基线为 R-01。
- 验证范围：聚焦 + 全量 + 外部矩阵；先运行两份目标测试和 `npm run check:static`，完成前运行 `npm test`、`npm run validate`、`npm run validate:official` 与 `npm run footprint`；最终候选提交由真实五平台 CI 验证。
- 自动测试：原入口导出与行为、模块单向依赖、行数限制、静态发现、确定性排序、成功/零发现/语法错误、路径规范化和统一验证停止语义。
- 人工检查：复核模块职责命名和导入方向，确认检查没有扫描 runtime、outputs、dist 或声称 ESLint/类型检查能力。
- 构建与静态检查：本项目无前端构建；执行新增 Node.js 静态检查、结构、官方技能/插件和补丁格式检查。

## 验证记录

| 验证ID | 验证类型 | 执行内容或环境 | 执行日期 | 结果 | 证据位置 |
| --- | --- | --- | --- | --- | --- |
| V-01 | 自动 | 基准模块化聚焦测试：9 项通过，定位命中 2 次 | 2026-09-10 | 通过 | `openspec/changes/modularize-developer-effectiveness-benchmark/evidence/V-01.json` |
| V-02 | 自动 | 最小静态检查与统一验证步骤聚焦测试：2 项通过，定位命中 2 次 | 2026-09-10 | 通过 | `openspec/changes/modularize-developer-effectiveness-benchmark/evidence/V-02.json` |
| V-03 | 自动 | `npm run verify`：246 项、238 通过、8 跳过、0 失败；官方校验与体积门禁独立通过 | 2026-09-10 | 通过 | `openspec/changes/modularize-developer-effectiveness-benchmark/evidence/V-03.json`、`openspec/changes/modularize-developer-effectiveness-benchmark/verification.md` |
| V-04 | 人工 | 最终候选五平台 GitHub Actions 外部复核 | 2026-09-10 | 计划 | 待最终提交后记录运行 URL 与精确 SHA |

## 验收标准

- [x] A-01：`developer-effectiveness-benchmark.mjs` 不超过 500 行，新运行模块不超过 500 行，原公开导出、CLI 和基准行为保持兼容。
- [x] A-02：`developer-effectiveness-benchmark-foundation.mjs` 不超过 600 行，新用例模块不超过 350 行，原公开导出、错误码、路径和安全行为保持兼容。
- [x] A-03：`npm run check:static` 使用当前 Node、参数数组与 `shell: false` 检查固定仓库目录，成功、零发现、语法错误和跨平台路径均返回稳定机器结果。
- [ ] A-04：静态检查进入统一验证并在失败时停止后续步骤；聚焦、全量、结构、官方与体积门禁通过，真实五平台 CI 保持独立待执行。

## 验收—证据映射

| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 | 验证记录 |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 主编排模块兼容拆分 | D-01、D-02 | 自动 | `tests/developer-effectiveness-benchmark.test.mjs`、`openspec/changes/modularize-developer-effectiveness-benchmark/evidence/V-01.json` | 原入口导出与运行结果兼容，门面和新模块满足行数上限 | V-01 |
| A-02 | 基础模块兼容拆分 | D-01、D-03 | 自动 | `tests/developer-effectiveness-benchmark.test.mjs`、`openspec/changes/modularize-developer-effectiveness-benchmark/evidence/V-01.json` | 原入口继续提供全部既有导出，冻结、校验和路线判断保持一致 | V-01 |
| A-03 | 最小静态检查 | D-04、D-06 | 自动 | `tests/static-check.test.mjs`、`openspec/changes/modularize-developer-effectiveness-benchmark/evidence/V-02.json` | 固定范围、确定性顺序、失败诊断和路径兼容均通过 | V-02 |
| A-04 | 统一验证与分层证据 | D-05、D-06 | 自动+人工 | `tests/static-check.test.mjs`、`scripts/verify.mjs`、`openspec/changes/modularize-developer-effectiveness-benchmark/evidence/V-03.json` | 本地门禁通过；五平台证据未运行前不宣称跨平台发布通过 | V-02、V-03、V-04 |

## 待确认问题

- 无。用户已明确要求完成第五项；行为兼容、最小检查范围和外部 CI 边界均由现有仓库规则确定。
