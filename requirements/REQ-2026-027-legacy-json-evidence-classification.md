# REQ-2026-027：历史 JSON 证据分类兼容修复

## 基本信息

- 状态：实施中
- 提出人：用户
- 负责人：Codex
- 目标版本：0.15.x
- 关联页面或模块：验证证据、需求完成门禁、变更归档
- 关联变更：`fix-legacy-json-evidence-classification`

## 背景与目标

插件闭环审计发现，未启用机器证据合同的历史自动记录只要引用普通 `.json` 资料，校验器就会把它当成 V-* 机器清单并返回失败，错误阻断历史变更完成。本需求修复 JSON 证据分类和兼容严重级别，同时保持新合同严格失败关闭。

## 决策台账

| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 机器证据候选 | 已确认 | 只有文件名匹配 `V-*.json` 或位于 `evidence/` 目录的 JSON 才进入机器清单校验；普通 `plugin.json`、配置 JSON 和报告 JSON 只作为持久资料 | 闭环审计复现与既有生成路径约定 |
| D-02 | 历史兼容严重级别 | 已确认 | 未声明 `verification_evidence: required` 时，无效机器证据候选返回稳定 warning，不升级为完成失败 | 既有历史只读兼容合同 |
| D-03 | 新合同严格度 | 已确认 | 显式启用合同后，无效或缺失同 ID 机器证据仍返回 failed，普通 JSON 不得替代 V-* 证据 | 既有严格证据合同 |
| D-04 | 实现与产物边界 | 已确认 | 生产实现仅使用 Node.js 标准库；持久证据随变更保存，日志与临时验证依赖只进入 `outputs/<验证主题>/` | 仓库实现规则 |
| D-05 | 跨平台高风险 | 已确认 | 命中路径规范化、临时目录和机器可读诊断；稳定比较 `/` 与 `\`，平台暂存发布与清理覆盖 Windows 瞬时目录占用，清理保留原始失败，覆盖 Linux x64/ARM64、Windows x64、macOS Intel/ARM64 | 跨平台 CI 防回归规则与运行 `32353726866` 的 Windows 失败复盘 |

## 范围

### 包含

- 调整机器证据候选的路径分类。
- 调整历史模式下无效候选的诊断严重级别。
- 复用 TC-03 覆盖历史普通 JSON、历史无效候选和新合同严格度。
- 修复 Windows 平台成品暂存目录发布与清理时的瞬时占用，并确保清理异常不覆盖原始打包错误。
- 运行聚焦、仓库统一、官方 validators 与真实矩阵证据复核。

### 不包含

- 不迁移、补造或改写历史机器证据。
- 不改变证据 schema、CLI 参数、外部 CI 信任模型或归档生命周期。
- 不新增远程查询、生产依赖、后台服务或业务项目测试依赖。

## 当前行为

校验器会把验证记录中所有已存在的 `.json` 文件送入机器证据解析，并把解析失败无条件标为 `failed`。因此普通插件 manifest 也会产生机器证据失败；历史合同的 warning 兼容只对“缺少机器证据”生效，不能抵消该误判。

## 期望行为

### 场景：历史记录引用普通 JSON 资料

- 前置条件：历史变更没有声明 `verification_evidence: required`，自动 V-* 引用普通 JSON 持久资料。
- 当：运行需求完成校验或变更完成预览。
- 则：普通 JSON 不进入机器清单解析，也不产生机器证据失败。
- 并且：路径缺失、越界或符号链接逃逸仍按既有安全规则报告。
- 异常或边界：Windows 分隔符与 POSIX 分隔符规范化后语义一致。

### 场景：历史记录引用无效机器证据候选

- 前置条件：历史自动记录引用 `V-*.json` 或 `evidence/` 下的无效 JSON。
- 当：校验机器证据候选。
- 则：返回带稳定 `code`、`target` 和 `warning` 状态的兼容诊断。
- 并且：不补造证据，不改写历史记录。
- 异常或边界：危险路径仍按路径安全规则失败关闭。

### 场景：新合同只有普通 JSON

- 前置条件：变更显式启用机器证据合同，自动 V-* 只引用普通 JSON。
- 当：运行 precomplete 或 complete 校验。
- 则：返回 `machine_evidence_missing` 并失败关闭。
- 并且：普通 JSON 不得替代同 ID 的有效机器证据。
- 异常或边界：无效显式机器候选继续返回失败诊断。

## 页面与交互

- 入口与操作路径：需求校验、变更检查和完成预览命令。
- 字段、文案与默认值：机器输出保持稳定 `code`、`target`、`status`、`evidenceId` 字段。
- 加载态、空态、错误态、禁用态：命令为一次性同步校验，无加载或禁用态；空候选由合同开关区分 warning 与 failed。
- 权限与角色差异：无权限或角色差异。
- 设计稿链接：不适用。

## 交互状态矩阵

| 状态 | 覆盖决定 | 触发或前置条件 | 期望结果 | 验证方式 | 关联验收 | 不适用理由 |
| --- | --- | --- | --- | --- | --- | --- |
| 初始（已有数据） | 覆盖 | 历史记录含普通 JSON | 资料可读且无机器解析失败 | 自动 | A-01 | — |
| 用户操作 | 覆盖 | 执行完成预览或需求校验 | 按合同输出稳定诊断 | 自动 | A-01、A-02、A-03 | — |
| 刷新 | 覆盖 | 对同一工作区重复校验 | 分类和诊断保持幂等 | 自动 | A-01、A-02 | — |
| 空态 | 覆盖 | 新合同没有有效机器候选 | `machine_evidence_missing` 失败关闭 | 自动 | A-03 | — |
| 错误态 | 覆盖 | 显式机器候选无效或路径危险 | 历史候选告警、新合同失败，危险路径不放宽 | 自动 | A-02、A-03 | — |
| 卸载 | 不适用 | 一次性命令无长生命周期资源 | 命令结束后无订阅、计时器或后台资源 | 自动 | — | 无常驻 UI 或后台生命周期。 |

## 接口与数据

- 接口文档链接：不适用，沿用本地脚本接口。
- 请求方法与路径：需求 Markdown、所选 OpenSpec 变更路径和持久证据路径。
- 请求字段及空值语义：`verification_evidence: required` 启用严格合同；未声明表示历史兼容。
- 响应字段及状态码：沿用结构化 `ok`、`errors`、`warnings` 与证据诊断字段。
- 鉴权、加解密或敏感信息要求：不读取项目外文件，不新增敏感信息处理。

## 关联变更范围

| 变更 | 决策范围 | 验收范围 |
| --- | --- | --- |
| fix-legacy-json-evidence-classification | D-01、D-02、D-03、D-04、D-05 | A-01、A-02、A-03、A-04 |

## 修订记录

| 修订 | 日期 | 影响决策 | 影响验收 | 验证与任务处理 |
| --- | --- | --- | --- | --- |
| R-01 | 2026-08-20 | D-01～D-05 | A-01～A-04 | 首次建立需求，复用 TC-03，V-01 保持计划并进入受管变更。 |
| R-02 | 2026-08-20 | D-01～D-05 | A-01～A-03 | 完成失败先行回归与兼容修复：普通 JSON 不再进入机器清单解析，历史无效候选降级为 warning，新合同继续失败关闭；真实遗留变更完成预览不再被 `plugin.json` 误阻断。 |
| R-03 | 2026-08-20 | D-04、D-05 | A-04 | 本地发布级验证、官方 validators、cachebuster 更新与插件重装完成；V-01、V-02 记录当前工作区证据。由于实现命中跨平台路径与机器输出风险，V-03 保持计划，等待当前修复形成提交后取得五平台原生 CI 证据。 |
| R-04 | 2026-08-20 | D-04、D-05 | A-04 | 提交 `8a3eebe` 的 V-03 首次矩阵中，仅 Windows x64 在平台成品暂存清理时报 `ENOTEMPTY`；完整日志确认清理异常遮蔽了首个打包错误。预算检查仍有约 38 MiB 余量，且同一任务的发布级验证已通过，结合清理失败目录为刚关闭的 Chromium，首个错误最可能来自发布改名时 Windows 句柄尚未释放。现有测试只在当前系统断言清理结果，未覆盖发布/清理瞬时占用和首错保留。该技术修订不改变 D-01～D-03 的可观察语义；新增确定性回归和有界重试任务，并以 V-04 重新取得同一提交上的五平台证据。 |
| R-05 | 2026-08-20 | D-04、D-05 | A-04 | 平台暂存发布已对 `EACCES`、`EBUSY`、`ENOTEMPTY`、`EPERM` 增加 8 次线性退避，失败清理使用同一有界策略；清理重试耗尽时以 `platform_package_cleanup_failed` 保留原始异常、清理异常和暂存目录。确定性回归、198/198 全量测试、8/8 发布级验证、9 个 Skill 与 1 个 Plugin 官方校验、cachebuster `0.15.0+codex.20260820094902` 重装均通过，V-01/V-02 已刷新；V-04 继续等待该修复提交的真实五平台矩阵。 |

## 兼容性与风险

- 受影响页面、公共组件、路由、权限或接口：仅影响本地需求完成门禁的证据分类与诊断，不影响业务页面。
- 历史数据与兼容策略：不改写历史资料；普通 JSON 继续接受存在性和路径安全检查，显式机器候选保持可见。
- 上线与回滚注意事项：随插件 cachebuster 更新发布；回滚分类和回归即可，不删除持久证据。
- 跨平台高风险：是；命中路径、临时目录与机器可读诊断，受影响平台为 Linux x64/ARM64、Windows x64、macOS Intel/ARM64。发布成功、发布瞬时失败后重试、清理成功和清理自身失败必须分别可验证，且清理失败不得覆盖原始失败。

## 测试与验证

- 测试文件策略：复用；目标路径：`tests/verification-evidence-integrity.test.mjs`、`tests/ui-review-platform-runtime.test.mjs`；基线证据：Git 可用且两个手写专用测试文件均已受版本控制，TC-03 已覆盖证据完成门禁与历史兼容，平台运行时测试已覆盖成品失败清理；选择理由：分别在同一功能的既有专用文件中补足分类和 Windows 暂存清理回归，不把场景追加到无关或生成测试。
- 独立测试方案：不需要；触发条件：单一既有回归扩展且不新增复杂交互；活动变更与目标：不适用；需求修订基线：R-01。
- 验证范围：聚焦 + 全量；执行命令：TC-03 聚焦命令、`npm test`、`npm run validate`、`npm run verify` 与官方 validators；选择理由：同时证明分类修复、仓库集成和插件可安装性。
- 自动测试：普通 JSON 不误判、无效显式候选历史告警、新合同缺失机器证据失败、既有安全边界不回退；Windows 发布改名的 `EPERM`/`EBUSY` 与清理的 `ENOTEMPTY` 启用受控重试，清理重试耗尽时保留原始打包失败并单独暴露清理失败。
- 人工检查：复核真实遗留变更完成预览不再出现普通 `plugin.json` 机器解析失败。
- 构建与静态检查：结构、manifest、Skill、OpenSpec strict、根目录清洁和 AI 标记禁入。

## 验证记录

| 验证ID | 验证类型 | 执行内容或环境 | 执行日期 | 结果 | 证据位置 |
| --- | --- | --- | --- | --- | --- |
| V-01 | 自动 | `[TC-03] 证据完成门禁与历史兼容` 聚焦回归通过；覆盖普通 JSON、历史无效机器候选和新合同普通 JSON-only 三组边界，并复核真实遗留变更预览不再出现 `plugin.json` 机器解析失败 | 2026-08-20 | 通过 | `openspec/changes/fix-legacy-json-evidence-classification/evidence/V-01.json`、`tests/verification-evidence-integrity.test.mjs` |
| V-02 | 自动 | `npm run verify` 发布级统一验证 8/8 阶段通过；包含 198/198 全量测试、结构、严格 OpenSpec、归档审计、两套运行时完整性与本机真实 Chromium 冒烟 | 2026-08-20 | 通过 | `openspec/changes/fix-legacy-json-evidence-classification/evidence/V-02.json`、`scripts/verify.mjs` |
| V-03 | 自动 | GitHub Actions 运行 `32353726866`，精确提交 `8a3eebe7ec6b3e9dcb1d11033341b7f83bd8b26f`；Linux x64/ARM64、macOS Intel/ARM64 均产出平台报告，Windows x64 在 `Build and verify platform plugin package` 清理暂存 Chromium 目录时报 `ENOTEMPTY`，且清理异常遮蔽了原始打包失败 | 2026-08-20 | 失败 | `https://github.com/julangtaotian/wayfinder/actions/runs/32353726866`、`openspec/changes/fix-legacy-json-evidence-classification/verification.md` |
| V-04 | 自动 | 计划：在包含 Windows 暂存清理修复与确定性回归的同一提交上重新运行 Linux x64/ARM64、Windows x64、macOS Intel/ARM64 原生 CI，要求五个平台成品冒烟全部成功 | 待执行 | 计划 | `.github/workflows/validate.yml`、`openspec/changes/fix-legacy-json-evidence-classification/verification.md` |

## 验收标准

- [x] [A-01] 历史自动记录引用普通 JSON 时不进入机器清单解析，持久路径安全检查保持有效。
- [x] [A-02] 历史无效显式机器候选返回稳定 warning，不阻断历史只读完成流程。
- [x] [A-03] 新合同缺失或引用无效机器证据时继续 failed，普通 JSON 不能替代同 ID 证据。
- [ ] [A-04] 聚焦、仓库统一、官方 validators、插件重装和跨平台证据复核按范围完成。

## 验收—证据映射

| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 | 验证记录 |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 普通 JSON 保持持久资料语义 | D-01、D-05 | 自动 | `tests/verification-evidence-integrity.test.mjs`、`openspec/changes/fix-legacy-json-evidence-classification/evidence/V-01.json` | 普通 JSON 不产生机器清单失败，路径安全规则继续执行 | V-01 |
| A-02 | 历史无效候选降级告警 | D-02、D-05 | 自动 | `tests/verification-evidence-integrity.test.mjs`、`openspec/changes/fix-legacy-json-evidence-classification/evidence/V-01.json` | 无效显式候选返回稳定 code、target 和 warning | V-01 |
| A-03 | 新合同保持严格 | D-03 | 自动 | `tests/verification-evidence-integrity.test.mjs`、`openspec/changes/fix-legacy-json-evidence-classification/evidence/V-01.json` | 普通 JSON-only 返回 machine_evidence_missing，无效显式候选仍 failed | V-01 |
| A-04 | 交付验证完整 | D-04、D-05 | 自动 | `openspec/changes/fix-legacy-json-evidence-classification/verification.md`、`openspec/changes/fix-legacy-json-evidence-classification/evidence/V-02.json`、GitHub Actions 运行链接 | 本地发布级验证、官方 validators 与插件重装已完成；首次矩阵的 Windows 失败已保留，修复后的五平台矩阵仍待执行 | V-02、V-03、V-04 |

## 待确认问题

无。
