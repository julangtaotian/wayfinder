# REQ-2026-040：轻量官方 Skill/Plugin 预检入口

## 基本信息

- 状态：实施中
- 提出人：用户
- 负责人：Codex
- 目标版本：0.18.x
- 关联页面或模块：`scripts/`、`package.json`、`tests/`、`README.md`
- 关联变更：`reproducible-official-validator-runtime`

## 背景与目标

仓库已有项目自定义结构校验，也多次真实运行 OpenAI 内置 Skill/Plugin Creator 的 validators；当前重复问题是系统 Python 缺少 PyYAML 时，需要人工在 `outputs/` 临时准备依赖、逐项执行并清理。这个过程能够完成验证，但容易重复操作、遗漏目标或把“脚本未启动”与“内容校验失败”混淆。

本需求只把已经验证有效的操作收敛为一个显式预检入口：在当前 Codex 开发环境存在官方 Creator validators 时，准备或复用有界依赖缓存，真实执行全部自定义 Skill 和插件校验，并在任何未启动或内容失败时返回非零状态。它不建设官方脚本快照供应链，不改变普通 `validate`、`verify` 或 CI，也不把本地预检扩大为 OpenAI 公共目录最终审核结论。

## 决策台账

| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 预检范围 | 已确认 | 提供 `npm run validate:official`；按稳定顺序对 `plugins/frontend-ai-workflow/skills/` 下每个自定义 Skill 执行当前 Codex 环境的 Skill Creator validator，并对插件根执行一次 Plugin Creator validator。 | 用户要求真实解决官方校验启动与重复操作问题；根 `AGENTS.md` 验证要求 |
| D-02 | validator 来源 | 已确认 | 正常执行读取当前 Codex 开发环境中的 Creator validator，不把其源码复制进仓库；每次结果记录来源相对标识和 SHA256。测试可通过显式参数注入受控替身。 | 用户确认删除固定官方脚本快照、许可治理和升级系统 |
| D-03 | YAML 依赖 | 已确认 | 固定 PyYAML 精确版本与包摘要，首次需要时只安装到 `outputs/official-validator-cache/`，后续校验复用有效缓存；不得安装到用户 Python 或仓库根。缓存为空且依赖不可取得时失败关闭。 | 历史验证已证明 `outputs/` 临时依赖可使官方脚本真实启动；用户要求消除重复安装 |
| D-04 | 生命周期 | 项目默认 | 单次运行临时文件只进入 `outputs/official-validator-runtime/` 并在成功、内容失败或启动异常后精确清理；可复用缓存由独立清理入口删除，不影响其他 `outputs` 内容。 | 根 `AGENTS.md` 有界输出与精确清理规则 |
| D-05 | 执行时机 | 已确认 | 官方预检保持显式，不加入普通 `npm run validate`、`npm run verify` 或常规 CI；修改 Skill、`plugin.json`、`.app.json`、`.mcp.json`、`agents/openai.yaml` 或准备插件发布时执行。 | 用户要求避免重复、繁重和无效工作 |
| D-06 | 失败语义 | 已确认 | validator、Python 或依赖不可用，脚本无法启动，Skill/Plugin 内容失败都必须返回非零；至少区分 `official_validator_unavailable`、`official_validator_dependency_unavailable`、`official_validator_start_failed` 和 `official_validator_validation_failed`，并保留真实退出码与原始输出。 | 用户要求真实执行，禁止把未启动记录为通过 |
| D-07 | 结论边界 | 已确认 | 成功只表述为“当前本地 Creator validators 预检通过”，不宣称固定快照、最新上游规则、Skill 决策质量或公共目录最终审核通过；预检资产不进入插件发布物。 | OpenAI 官方发布端存在更严格检查；用户要求删除无效承诺 |
| D-08 | 跨平台边界 | 项目默认 | 编排使用 Node.js 标准库、平台路径 API 和无 shell 子进程；自动测试用受控替身覆盖 POSIX/Windows 路径与失败传播，并随既有 CI 执行。真实 Creator validator 结论只记录实际执行环境，不额外建设五平台官方脚本矩阵。 | `AGENTS.md` 跨平台 CI 清单；本变更不扩大常规 CI |

## 范围

### 包含

- 新增一个显式官方预检编排入口及必要的隔离启动器。
- 固定 PyYAML 版本和包摘要，在 `outputs/official-validator-cache/` 准备或复用依赖。
- 逐项执行全部 Skill 与一次 Plugin validator，记录实际脚本摘要、Python/PyYAML 版本、目标和结果。
- 为 unavailable、依赖失败、启动失败和内容失败提供稳定机器字段。
- 增加一个聚焦测试文件，覆盖缓存复用、目标排序、真实退出状态、路径边界和精确清理。
- 更新根命令和 README，说明适用时机、缓存清理和结论边界。

### 不包含

- 把 OpenAI Creator validator 源码、许可证或快照清单提交进仓库。
- 建设 validator 快照更新、差异预览、原子替换或回滚系统。
- 修改普通 `npm run validate`、`npm run verify`、共享/平台作用域或 GitHub Actions。
- 在每次普通提交或五个平台任务中重复执行真实官方脚本。
- 保证冷缓存离线准备成功；离线且缓存缺失时必须明确失败。
- 用本地预检代替项目自定义校验、行为测试、真实安装或 OpenAI 公共目录提交检查。
- 修改插件 cachebuster 或把开发预检资产打入插件发布物。

## 当前行为

- `npm run validate` 稳定执行项目自定义结构校验，但不会运行 Creator validators。
- 完成重大变更时，维护者需要手工定位两个官方脚本、在 `outputs/` 安装 PyYAML、逐项运行全部 Skill 和 Plugin，再手工清理。
- 本机缺少 PyYAML 时官方脚本会在读取仓库内容前退出；历史验证通过临时依赖成功恢复，但流程未形成单一入口。

## 期望行为

### 场景：复用缓存执行真实预检

- 前置条件：当前 Codex 环境提供两个 Creator validators，Python 可用，依赖缓存完整。
- 当：维护者执行 `npm run validate:official`。
- 则：系统按稳定顺序执行全部自定义 Skill 和一次 Plugin validator，全部通过后返回零状态。
- 并且：输出实际脚本摘要、Python/PyYAML 版本、Skill 总数、目标结果和诚实结论边界。

### 场景：首次准备依赖

- 前置条件：validator 和 Python 可用，但缓存不存在，依赖源可访问。
- 当：维护者执行官方预检。
- 则：系统使用固定版本与摘要把 PyYAML 只准备到有界缓存，再运行真实 validators。
- 并且：后续执行复用已核验缓存，不重复安装，不修改用户环境或仓库根依赖。

### 场景：预检无法启动

- 前置条件：validator、Python、依赖缓存或依赖源任一不可用。
- 当：维护者执行官方预检。
- 则：命令使用稳定 code 和非零状态报告“未执行”，不得回退自定义校验或声称官方预检通过。
- 并且：只清理本次临时运行目录，保留其他输出和已有有效缓存。

### 场景：Skill 或 Plugin 内容失败

- 前置条件：官方脚本已经启动，某个目标不符合当前 Creator validator 规则。
- 当：预检执行该目标。
- 则：命令返回 `official_validator_validation_failed`，通过 `validator` 和 `target` 区分 Skill/Plugin，保留真实退出码、stdout 和 stderr。
- 并且：不得把项目自定义结构校验结果覆盖为官方通过。

## 页面与交互

- 入口：`npm run validate:official`、独立缓存清理命令。
- 默认值：预检读取当前仓库插件；缓存有效时直接复用，缓存缺失时才准备依赖。
- 错误态：validator、Python、依赖或目标缺失以及内容失败均为非零状态。
- 权限：不读取令牌，不修改用户 Python，不修改业务项目，不触发远程发布。
- 设计稿：不适用。

## 交互状态矩阵

| 状态 | 覆盖决定 | 触发或前置条件 | 期望结果 | 验证方式 | 关联验收 | 不适用理由 |
| --- | --- | --- | --- | --- | --- | --- |
| 初始（已有数据） | 覆盖 | 当前插件、全部 Skill、validator 和有效缓存存在 | 稳定排序真实执行并报告实际身份 | 自动+人工 | A-01、A-02 | — |
| 用户操作 | 覆盖 | 执行预检或显式缓存清理 | 预检真实运行；清理只删除专属缓存 | 自动 | A-01、A-02、A-04 | — |
| 刷新 | 覆盖 | 连续执行两次预检 | 第二次复用缓存，目标顺序和结论一致 | 自动 | A-02 | — |
| 空态 | 覆盖 | validator、Python、依赖或 Skill 集合缺失 | 失败关闭并说明未执行 | 自动 | A-03 | — |
| 错误态 | 覆盖 | 依赖取得失败、脚本启动失败或内容非法 | 分类返回稳定 code、目标和真实输出 | 自动 | A-03 | — |
| 卸载 | 覆盖 | 成功或失败后结束；显式清理缓存 | 临时运行时必清理，缓存仅显式删除 | 自动 | A-02、A-04 | — |

## 接口与数据

- 输入：当前仓库插件根；测试或非默认安装可显式提供 validator 路径和 Python 入口。
- 依赖：固定 PyYAML 版本与摘要；缓存无效时不得复用。
- 输出：至少包含 `ok`、`code`、`status`、`validator`、`target`、`validatorSha256`、`pythonVersion`、`yamlVersion` 和 Skill 计数。
- 状态码：全部预检完成且通过时退出 0；任何未执行、启动或内容失败时退出非零。
- 安全：不联网提交插件，不读取凭据；包摘要用于核验依赖，不证明外部 validator 的上游真实性。

## 关联变更范围

| 变更 | 决策范围 | 验收范围 |
| --- | --- | --- |
| reproducible-official-validator-runtime | D-01、D-02、D-03、D-04、D-05、D-06、D-07、D-08 | A-01、A-02、A-03、A-04、A-05 |

## 修订记录

| 修订 | 日期 | 影响决策 | 影响验收 | 验证与任务处理 |
| --- | --- | --- | --- | --- |
| R-01 | 2026-09-02 | D-01～D-11 | A-01～A-07 | 首次规划固定官方 validator 快照、离线运行时和常规 CI 门禁。 |
| R-02 | 2026-09-02 | 重写为 D-01～D-08 | 重写为 A-01～A-05 | 用户确认以真实解决问题和避免重复劳动为目标；删除快照再分发、更新系统、普通门禁接入、五平台真实官方执行和无关 fixture 验证，全部 V-* 恢复为轻量方案计划。 |
| R-03 | 2026-09-03 | D-06、D-08 | A-03 | 实施前发现严格机器证据只能绑定一个精确测试定位；为失败关闭用例增加独立 V-04，不改变可观察行为、验收数量或实施范围。 |

## 兼容性与风险

- 跨平台高风险：是。
- 命中项：路径、临时目录、子进程、环境变量、机器可读诊断；不修改 CI 配置。
- 受影响平台：编排逻辑面向 macOS、Linux、Windows；真实官方预检只证明实际执行平台。
- 对应回归：新建 `tests/official-validator-preflight.test.mjs`，使用受控替身覆盖 POSIX/Windows 路径、缓存、退出状态和清理，并随既有 CI 测试集合执行。
- 外部证据：既有 CI 矩阵只证明项目编排与替身回归；不把它表述为五平台 Creator validator 通过。
- 网络风险：冷缓存准备依赖可能需要网络；失败时不降级，暖缓存可直接复用。
- 上游漂移：当前 Codex 环境中的 validator 可能更新；每次记录摘要，不提供固定或最新保证。
- 回滚：删除新增命令和脚本即可恢复原人工预检方式，不迁移业务数据。

## 测试与验证

- 测试文件策略：新建；目标路径：`tests/official-validator-preflight.test.mjs`；基线证据：规划前该文件不存在；选择理由：外部脚本定位、依赖缓存、失败传播和清理是一个独立的小型编排能力。
- 独立测试方案：需要；活动变更与目标：`openspec/changes/reproducible-official-validator-runtime/test-plan.md`；需求修订基线：R-02。
- 验证范围：聚焦测试、`npm test`、`npm run validate`、OpenSpec 严格校验、一次当前开发环境真实 `npm run validate:official`，以及既有 CI 中的替身回归；不新增 CI 任务。
- 自动测试：目标排序、缓存命中/失效、依赖准备失败、validator/Python 缺失、启动失败、Skill/Plugin 内容失败、真实退出状态、Windows/POSIX 路径和精确清理。
- 人工检查：确认真实命令执行当前环境的两个 Creator validators、输出摘要与结论边界准确、插件成品不包含预检缓存或外部脚本。

## 验证记录

| 验证ID | 验证类型 | 执行内容或环境 | 执行日期 | 结果 | 证据位置 |
| --- | --- | --- | --- | --- | --- |
| V-01 | 自动 | `node --test --test-name-pattern=TC-01 tests/official-validator-preflight.test.mjs`：缓存准备、复用、稳定目标与独立清理通过 | 2026-09-03 | 通过 | `openspec/changes/reproducible-official-validator-runtime/evidence/V-01.json` |
| V-02 | 自动+人工 | `node scripts/official-validator-preflight.mjs`：当前 Codex 环境 10 个 Skill 与 1 个 Plugin validator 真实通过，冷/暖缓存身份和结论边界已核对 | 2026-09-03 | 通过 | `openspec/changes/reproducible-official-validator-runtime/evidence/V-02.json`、`openspec/changes/reproducible-official-validator-runtime/verification.md` |
| V-03 | 自动 | `node scripts/verify.mjs`：218 项测试零失败，结构、34 项严格 OpenSpec、53 项归档校验及运行时完整性共 7 阶段通过 | 2026-09-03 | 通过 | `openspec/changes/reproducible-official-validator-runtime/evidence/V-03.json` |
| V-04 | 自动 | `node --test --test-name-pattern=TC-02 tests/official-validator-preflight.test.mjs`：四类稳定 code、真实输出、双平台路径和清理通过 | 2026-09-03 | 通过 | `openspec/changes/reproducible-official-validator-runtime/evidence/V-04.json` |

## 验收标准

- [x] A-01：`npm run validate:official` 在当前 Codex 开发环境真实执行全部自定义 Skill 和一次 Plugin Creator validator，全部通过才返回 0。
- [x] A-02：PyYAML 只在 `outputs/official-validator-cache/` 准备并复用；单次临时运行时在所有出口精确清理，不修改用户 Python、仓库根依赖或其他输出。
- [x] A-03：validator、Python、依赖、启动或内容异常都失败关闭，使用稳定 `code`、`validator`、`target`、真实退出码和原始输出区分“未执行”与“校验失败”。
- [x] A-04：普通 `validate`、`verify` 和 CI 配置保持不变；新增资产不进入插件发布物，缓存只由显式命令清理。
- [x] A-05：输出记录实际脚本摘要和执行环境，只声明当前本地 Creator 预检结果；聚焦、仓库验证和既有 CI 回归通过，不夸大为五平台官方执行或公共目录审核通过。

## 验收—证据映射

| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 | 验证记录 |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 真实执行全部官方预检目标 | D-01、D-02 | 自动+人工 | 真实预检日志与聚焦目标编排测试 | 全部 Skill 恰好一次、Plugin 恰好一次，真实非零状态不被吞掉 | V-01、V-02 |
| A-02 | 缓存复用和有界生命周期 | D-03、D-04 | 自动 | 缓存与清理聚焦测试 | 第二次不重复准备依赖，只清理专属运行时 | V-01 |
| A-03 | 失败关闭与稳定诊断 | D-06、D-08 | 自动 | 失败样本和路径样本 | 未执行、启动和内容失败可由稳定字段区分 | V-04 |
| A-04 | 普通门禁与发布边界不扩大 | D-04、D-05、D-07 | 自动+人工 | package scripts、CI、成品文件列表复核 | 现有命令和 CI 不变，开发资产不入插件包 | V-03 |
| A-05 | 诚实结论与兼容证据 | D-02、D-07、D-08 | 自动+人工 | 输出文案、仓库回归和既有 CI | 只报告实际平台与当前脚本摘要，不扩张结论 | V-02、V-03 |

## 待确认问题

- 无。PyYAML 的具体固定版本和包摘要属于实施阶段依赖锁定事实，不改变已确认行为；若当前 Python 无法使用带摘要的目标安装，则回到修订阶段选择等价的有界缓存方式，不扩大为快照运行时。
