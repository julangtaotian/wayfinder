# ai-context-efficiency Specification

## Purpose
为前端工作流健康检查和仓库维护提供渐进、可定位且向后兼容的上下文读取合同，避免历史诊断和无关大体积资产持续扩大 AI 输入。

## Requirements

### Requirement: 健康检查必须提供有界精简结果

系统 SHALL 在显式 `--summary` 模式下返回版本化、机器可读的精简结果。结果 SHALL 保留完整根直接依赖画像、命令及其执行证据、平台画像、工作流布局、规划引擎、活动变更、错误和警告；当目标是插件仓库时，结果还 SHALL 保留 `repositoryKind`、插件仓库整体状态、marketplace 相对路径、插件总数、按状态计数和有界插件样例。历史验证审计 SHALL 保留 requirements、records 和 counts 但省略 diagnostics 全集；静态观察 SHALL 返回总数、按 code 计数、最多 5 项稳定样例和遗漏数。新增字段 SHALL 是可选扩展，既有 `layout`、`schemaVersion`、完整根直接依赖画像和现有 summary 字段保持兼容。（D-02、D-03、D-05；A-01、A-02）

#### Scenario: 项目包含大量历史诊断

- **WHEN** 调用方显式运行健康检查 summary
- **THEN** 结果 SHALL 使用稳定 schema 和 `mode=summary`，并 SHALL NOT 展开历史 diagnostics 全集
- **AND** counts、完整依赖画像和当前健康状态 SHALL 保持可用

#### Scenario: 项目包含大量静态观察

- **WHEN** 深度分析返回超过 5 项静态观察
- **THEN** summary SHALL 返回总数、按 code 计数、前 5 项样例和准确遗漏数
- **AND** 完整检查仍 SHALL 保留全部观察

#### Scenario: 插件 marketplace 包含大量本地条目

- **WHEN** 已识别插件仓库的本地插件条目超过 summary 的固定样例上限
- **THEN** summary SHALL 返回准确的插件总数、显示数、遗漏数和按状态计数
- **AND** summary SHALL 仅返回稳定排序的有界样例，完整检查仍 SHALL 保留全部插件事实

### Requirement: 历史诊断必须支持按稳定 code 查询

系统 SHALL 接受显式 `--diagnostic-code <code>`，并只返回历史验证审计中 code 完全匹配的诊断。查询结果 SHALL 提供 schema、mode、code、count、totalCount、offset、limit、nextOffset、remainingCount、availableCodes 和 diagnostics；默认页大小 SHALL 为 20，显式 limit SHALL 限制在 1～100。未知 code SHALL 返回零 count 和空数组，不得回退为完整报告。（D-04、D-11；A-03、A-06）

#### Scenario: 查询存在的历史诊断

- **WHEN** 调用方查询 counts 中存在的 code
- **THEN** diagnostics SHALL 只包含该 code，count SHALL 等于当前页返回数量，totalCount 和 nextOffset SHALL 反映完整匹配集合

#### Scenario: 查询未知历史诊断

- **WHEN** 调用方查询当前项目不存在的 code
- **THEN** 系统 SHALL 返回零 count、空 diagnostics 和稳定排序的 availableCodes

### Requirement: 完整检查合同必须保持兼容且新模式显式互斥

无参数 CLI SHALL 继续返回完整 `checkProject()` JSON，导出函数的完整事实合同 SHALL 保持不变。`--summary` 与 `--diagnostic-code` SHALL 互斥，冲突、缺值或未知参数 SHALL 在读取项目检查事实前以非零状态失败，且 SHALL NOT 输出部分项目 JSON。（D-02、D-11；A-04、A-06）

#### Scenario: 旧调用方不传新参数

- **WHEN** 调用方按旧方式运行健康检查
- **THEN** 系统 SHALL 返回包含完整历史 diagnostics 和静态 observations 的原结果形状

#### Scenario: 调用方传入冲突参数

- **WHEN** 同时传入 summary 与 diagnostic-code
- **THEN** 系统 SHALL 返回明确参数错误和非零退出状态，不调用项目检查

### Requirement: AI 必须采用渐进读取并避开无关大体积资产

工作流检查 Skill SHALL 首先读取 summary，并只在 counts 与用户问题需要精确目标时按 code 查询；完整输出 SHALL 作为必要事实缺失时的兜底。仓库级指导 SHALL 默认把插件源码、技能、参考、模板和测试作为工作范围，并 SHALL 仅在任务明确涉及运行时、平台打包、视觉证据或历史规划时读取运行时依赖、平台资产、outputs 和归档。（D-05、D-06；A-05、A-07）

#### Scenario: 普通功能或检查任务

- **WHEN** 任务没有明确涉及运行时、平台发布、视觉验收或历史变更
- **THEN** AI SHALL 优先在默认源码范围内定位事实，不枚举无关大体积目录

#### Scenario: 精简结果不足以回答问题

- **WHEN** summary 报告非零诊断或遗漏，且用户问题需要具体目标
- **THEN** AI SHALL 先使用最小按需查询，再决定是否读取完整报告或目标文件

### Requirement: 历史需求正文必须按生命周期渐进读取

系统 MUST 默认只读取活跃完整需求和已验收需求的轻量存根；完整历史正文 MUST 存放在年度归档目录，并且只有显式历史审计、诊断 code 查询或用户指定需求时才读取。目录索引 MUST 足以定位需求 ID、状态、根存根和归档正文，且不得包含绝对路径或生成时间戳。（D-03、D-05；A-02、A-07）

#### Scenario: 普通健康检查包含已验收需求

- **WHEN** 项目根存在已验收需求存根和对应归档正文
- **THEN** 默认检查 MUST 使用存根与索引完成计数，不得递归读取归档正文或展开历史验证记录

#### Scenario: 用户指定历史需求或诊断

- **WHEN** 用户明确选择某个已验收需求或按稳定 code 请求历史审计
- **THEN** 系统 MUST 解析索引指向的单一归档正文，并保持现有分页和诊断边界

#### Scenario: 归档索引缺失或不一致

- **WHEN** 存根、索引与归档正文无法形成唯一映射
- **THEN** 系统 MUST 返回稳定结构诊断并停止把该条目报告为可用历史事实

### Requirement: 技能包内静态引用必须可解析

统一验证 MUST 从技能与引用文档所在目录解析静态相对文件引用，并定位缺失或越出插件包的目标；远程 URL、模板占位符和业务项目路径 MUST 不被当作包内文件。诊断 MUST 保留稳定 code、target、line 和 reference。（D-02、D-04；A-02）

#### Scenario: 引用文件移动后相对路径失效
- **WHEN** 引用文档包含不存在的包内相对目标
- **THEN** 统一验证失败并给出源文档、行号和引用

#### Scenario: 动态项目路径与合法包内引用
- **WHEN** 文档同时包含项目路径占位符、远程 URL 和存在的包内文件
- **THEN** 动态和远程引用不误报，合法包内引用通过

### Requirement: 技能读取和输出必须与当前任务相称

技能 MUST 根据当前意图、阶段和受影响链选择材料，复用仅限仍有效的同项目和同变更上下文；报告 MUST 先呈现结论、实际变化、阻塞及必要行动，完整机器证据继续保留。优化 MUST 保留原有只读、授权、需求身份、受管保护和 UI 证据新鲜度合同，MUST 不将静态检查冒充真实模型效率提升。（D-03、D-04、D-05；A-03、A-04、A-05）

#### Scenario: 阶段继续且材料没有变化
- **WHEN** 所需策略已读且相关文件没有变化
- **THEN** 复用材料并读取新增或失效部分，强制校验和明确要求重跑的验证继续执行

#### Scenario: 输出检查结论
- **WHEN** 精简健康结果未覆盖历史正文或实际命令执行
- **THEN** 报告标明检查范围，不将零告警扩大为全项目交付通过
