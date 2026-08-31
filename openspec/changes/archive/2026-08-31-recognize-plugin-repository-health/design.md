## Context

现有 `check-project.mjs` 先用 `detectWorkflowLayout()` 决定 Wayfinder/旧工作流检查，并无条件校验根 `AGENTS.md` 与 `openspec/config.yaml` 的业务受管标记。当前插件仓库的根 marketplace 与插件 manifest 已被 `validate-structure.mjs` 以硬编码的仓库级完整校验读取，但该校验同时覆盖运行时、技能和平台资产，不能进入日常健康检查。

本设计落实 `proposal.md` 与两份 delta spec 的行为合同。（D-01～D-10；A-01～A-05）路径和机器诊断命中跨平台清单中的“路径、机器可读诊断”，受影响平台为现有 CI 的 macOS ARM64/x64、Linux ARM64/x64、Windows x64。

## Goals / Non-Goals

**Goals:**

- 在健康检查中建立独立、可复用的插件仓库事实，避免修改 `detectWorkflowLayout()` 后误影响初始化、升级和迁移入口。
- 将有效插件仓库、意图明确但配置损坏的插件仓库、非插件项目分为可验证的不同状态。
- 维持完整结果兼容，并使 summary 对多插件场景保持有界。
- 重用项目安全路径解析与既有只读审计，不把发布级完整校验带入日常检查。

**Non-Goals:**

- 不把插件仓库写入 Wayfinder，不改变 bootstrap、update 或 migrate 的目标选择。
- 不复用 `validate-structure.mjs` 作为健康检查子进程，也不扫描运行时、技能全文、平台资产、outputs 或归档。
- 不支持远程 marketplace、自动安装、修复配置、自动迁移、网络访问或 CI 调整。

## Decisions

### 1. 以独立识别器表达仓库类别，不改写工作流布局

新增独立模块，例如 `plugin-repository-health.mjs`，导出只读 `inspectPluginRepository(root)`。它返回三类事实：

- `not-plugin-repository`：根不存在 marketplace，交由既有 Wayfinder/旧工作流路径处理；
- `plugin-repository / healthy`：至少一个本地条目与仓库内匹配 manifest 全部有效；
- `plugin-repository / invalid`：根存在 marketplace，但 JSON、局部条目、路径或 manifest 不能满足插件仓库合同；检查失败关闭，不回退为业务项目成功。

`checkProject()` 将 `repositoryKind` 作为新增顶层字段保留，并在插件类别分支跳过业务受管文件、Wayfinder、深度范围、受管内容刷新和业务脚本缺失检查；规划引擎、活动变更、需求证据审计与根 package 命令事实继续复用。既有 `layout` 保持原值，以保护 bootstrap/update/migrate 与已有调用方。

备选方案是将 `plugin-repository` 加入 `detectWorkflowLayout()` 的枚举。它会让初始化、升级和迁移把插件根当作新的工作流布局，扩大修改范围并存在自动写入风险，因此不采用。

### 2. marketplace 路径先受限规范化，再复用安全路径解析

marketplace 的 `source.path` 允许当前标准写法 `./plugins/<name>`，识别器只剥离一个或多个开头的 `./` 形成项目相对路径，随后交给 `resolveSafeProjectPath()`。绝对路径、反斜杠、空段、`.`、`..`、项目根、项目外路径和任意链路中的符号链接全部拒绝。每个 manifest、`skills` 路径及目录均从已验证的插件根继续安全解析。

诊断对象统一为 `{ code, status, target, message }`：`code/status/target` 稳定英文，`message` 中文；`target` 始终为正斜杠的仓库相对路径。跨来源比较使用同一规范化函数；纯路径函数单测显式覆盖 `path.posix`、`path.win32`、`D:/...` 与 `D:\\...`。

备选方案是直接 `path.resolve(root, source.path)` 后检查前缀。它不能统一处理符号链接和外平台输入，并易出现一侧规范化、另一侧原始比较的问题，因此不采用。

### 3. 以最小 manifest 合同代替完整结构校验

识别器只校验 marketplace JSON、至少一个本地条目、每个本地条目的目录、manifest JSON、名称一致性、非空版本和 `skills` 相对目录存在。它不校验固定插件名、发布版本同步、公开技能集合、运行时许可、完整性清单、浏览器资产或真实冒烟；这些继续由 `npm run validate` 和 `npm run verify` 负责。

根 `package.json` 的 `test` 与 `validate` 脚本作为插件仓库命令事实保留，缺失仅产生插件语义的非阻断 warning。这样健康检查不会把缺少业务构建/lint/typecheck 误报为插件仓库损坏，也不会对不同插件仓库发明统一发布脚本。

备选方案是让健康检查调用 `validateStructure()`。它会使日常检查读取大运行时资产并执行完整发布结构链，违背有界读取合同，因此不采用。

### 4. summary 只投影有界插件事实

完整 `checkProject()` 结果保留全部本地插件条目与诊断，供显式完整审计使用。`summarizeProjectCheck()` 为 `pluginRepository` 追加专用投影：保留整体状态、marketplace、`totalPlugins`、`displayedPlugins`、`omittedPlugins`、按状态和按 code 计数，并按稳定名称排序最多展示 20 个插件和 20 条诊断。现有历史诊断分页参数不改变；当 summary 样例不足以判断问题时，使用者按现有规则请求完整结果。

新增字段为可选扩展，`CHECK_PROJECT_OUTPUT_SCHEMA_VERSION` 和现有 `layout` 语义保持不变，避免为非破坏性字段增加制造调用方迁移成本。

### 5. 新建专用测试并以结构清单保护发布完整性

新建 `tests/plugin-repository-health.test.mjs`，使用隔离 fixture 覆盖当前有效插件仓库、多个条目、重复只读检查、无本地条目、JSON 损坏、越界/符号链接、缺失/损坏 manifest、名称不一致、摘要上限和 Wayfinder/旧工作流兼容。该文件自动进入现有共享测试集合，无需改动 CI 分组。

`validate-structure.mjs` 的交付资产清单增加新识别模块；`frontend-workflow-check` Skill 解释插件类别、专用诊断与完整检查的按需回退。插件自检、结构清单和技能文案测试共同防止发布后缺少实现或文档。

## Risks / Trade-offs

- [marketplace 内的相对路径含 `./`，而通用安全解析拒绝 `.` 段] → 只在进入安全解析前规范化开头的标准 `./`，其余 `.`、`..`、反斜杠和绝对路径仍失败关闭，并用回归锁定边界。
- [存在 marketplace 但仅含远程条目] → 该根被视为意图明确但不符合本地插件仓库合同的 invalid 状态，返回稳定诊断，不静默豁免业务检查。
- [多插件条目使 summary 再次膨胀] → 完整结果保留事实；summary 固定上限、计数和遗漏数，默认 Skill 继续先读 summary。
- [新增类别破坏依赖 `layout` 的调用方] → 不修改 `layout` 枚举或语义，只增加可选 `repositoryKind`。
- [本地路径回归不能代表五个平台] → 以显式 `path.win32` 确定性样本覆盖归一化逻辑；同一提交的现有共享与五平台 CI 保持最终外部证据。

## Migration Plan

1. 先创建失败回归和与当前插件仓库对应的成功基线，确认新测试处于共享集合。
2. 实现最小识别器与安全路径/诊断合同，再接入 `checkProject()` 的插件类别分支。
3. 为 summary 增加有界投影，补齐完整/summary 兼容和普通项目回归。
4. 更新 Skill 与结构清单，运行专用测试、全量测试、结构和统一验证，并记录 Vue fixture 回归。
5. 使用 WebStorm 提交并推送；仅在同一 SHA 的共享及五个平台 CI 全部通过后记录跨平台证据。若出现回归，移除 `checkProject()` 的类别分支即可恢复原行为；不需要迁移或清理用户数据。

## Open Questions

无。远程 marketplace 与自动安装属于不同产品边界，若后续需要支持，必须建立新需求并重新评估安全与网络合同。
