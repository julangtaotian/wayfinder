# verifiable-change-delivery Specification

## Purpose
TBD - created by archiving change harden-workflow-lifecycle. Update Purpose after archive.

## Requirements

### Requirement: 检查必须区分工作流、变更和交付层级
系统 MUST 分别报告工作流接入健康、需求与规划一致性、交付就绪状态，并明确区分静态发现、文档记录和实际执行结果。（D-05、D-07；A-05）

#### Scenario: 只执行工作流健康检查
- **WHEN** 用户没有选择需求和变更
- **THEN** 系统只检查受管文件、项目命令声明、分析新鲜度和内置规划引擎，不声称业务命令已执行

#### Scenario: 检查实施一致性
- **WHEN** 用户提供需求和活跃变更并选择实施阶段
- **THEN** 系统组合需求校验、OpenSpec 状态和严格变更校验，报告阻断项与剩余任务

#### Scenario: 检查交付就绪
- **WHEN** 用户选择完成前检查
- **THEN** 系统额外要求待验证状态、全部验收与任务、通过的 V-*、可核验证据和归档目标可用

### Requirement: 可识别的持久证据必须实际存在
系统 MUST 在完成前检查可识别的仓库内证据路径，并在文件缺失或越出项目范围时阻断；无法机器识别的终端摘要 MUST 仅报告为记录而不是已执行证明。（D-05、D-07；A-05、A-06）

#### Scenario: 验证记录引用仓库文件
- **WHEN** V-* 证据位置是项目内相对路径
- **THEN** 系统确认路径存在且没有越出项目根目录

#### Scenario: 验证记录只写终端摘要
- **WHEN** 证据位置无法解析为持久文件
- **THEN** 系统保留记录但不得将其升级为机器验证过的文件证据

### Requirement: 完成归档必须使用不可绕过的硬门禁

系统 MUST 在需求、验收、任务、验证记录、OpenSpec `isPlanningComplete=true`、全部 artifact 为 `done` 或合法 `skipped`、严格校验、规格合并结果和归档目标全部通过后才归档；对缺少 `isPlanningComplete` 的兼容响应 MAY 回退读取 `isComplete`。正常完成入口 MUST NOT 提供跳过验证、跳过规格或确认未完成任务的选项。（D-04、D-05、D-06；A-02、A-03、A-04）

#### Scenario: 任一交付项未完成

- **WHEN** 需求不是待验证、存在未勾选验收或任务、验证未通过、规划完成字段不是 true、artifact 为 ready、blocked、缺失或未知状态，或严格校验失败
- **THEN** 完成入口停止且不修改主规格、需求状态或变更目录

#### Scenario: 兼容历史状态响应

- **WHEN** 状态响应没有 `isPlanningComplete` 但包含布尔值 `isComplete`
- **THEN** 完成入口使用 `isComplete` 作为规划完成兼容值，并继续执行其余全部独立门禁

#### Scenario: 缩进子任务未完成

- **WHEN** `tasks.md` 的顶层任务已完成但任一缩进子任务仍未完成
- **THEN** 状态、实施指令和完成入口均将该子任务计入剩余工作并阻止归档

#### Scenario: 合法无规格变更

- **WHEN** 需求明确确认不改变可观察行为、`.openspec.yaml` 声明 `skip_specs: true`，且只有 specs artifact 为 `skipped`
- **THEN** 完成入口接受该 artifact 状态并要求其余硬门禁全部通过，不伪造规格同步

#### Scenario: 非法 skipped 状态

- **WHEN** 非 specs artifact 为 skipped、缺少 `skip_specs: true` 元数据，或需求没有无行为变化决策
- **THEN** 完成入口阻断并且不向归档命令补传跳过参数

#### Scenario: 完成预览通过

- **WHEN** 所有前置门槛通过但用户未显式写入
- **THEN** 系统读取 archive instructions，只返回将要校验、同步、归档和更新状态的动作，不修改文件

#### Scenario: 显式完成成功

- **WHEN** 用户确认写入且内置运行时成功验证并合并规格、移动变更
- **THEN** 系统原子更新需求状态为已验收并报告归档位置、warnings 与准确同步结果

#### Scenario: 退役最后一项能力需求

- **WHEN** 变更元数据明确声明 `retire_capabilities: true` 且 REMOVED 操作删除能力的最后一个 Requirement
- **THEN** 完成入口仍执行严格校验和运行时归档，由运行时删除对应主规格并准确报告退役能力

#### Scenario: 规格合并或归档失败

- **WHEN** 内置运行时无法验证重建规格、归档目标冲突或移动失败
- **THEN** 系统不得把需求标为已验收，并报告可恢复的实际状态

### Requirement: 历史项目必须保持只读兼容
系统 MUST 对旧需求、旧 Wayfinder 和无 Git 基线项目给出可操作警告，并继续保护管理标记外内容。（D-08；A-07、A-08）

#### Scenario: 旧需求执行完成审计
- **WHEN** 已归档或历史需求仍使用已验收状态且缺少新矩阵
- **THEN** `complete` 审计保持可用并报告迁移缺口

#### Scenario: 公共工作流升级
- **WHEN** 项目包含自定义 Wayfinder 分析或 AGENTS 约束
- **THEN** 系统只更新允许的受管区块并逐字保留项目自定义内容

### Requirement: 动态操作输入必须可见且受硬约束

系统 MUST 在实施时读取 `instructions apply --json`，在完成预览时读取 `instructions archive --json`，并报告返回的 context、operationGuidance、warnings 和具体路径；这些输入 MUST NOT 覆盖需求事实、用户选择、规划根或完成硬门禁。实施发现规格外范围时 MUST 暂停并报告，不得静默缩减、延后或简化规定行为，且任务只有在规定行为完整实现后才能标记完成。（D-03、D-08；A-04、A-05）

#### Scenario: 动态指导补充实施步骤

- **WHEN** OpenSpec 返回 apply context 或 operationGuidance
- **THEN** 系统将其作为当前变更的补充约束展示和使用，同时保持需求决策与仓库规则优先

#### Scenario: 动态指导要求绕过门禁

- **WHEN** apply 或 archive guidance 与需求、根目录边界或完成检查冲突
- **THEN** 系统忽略冲突部分并按硬门禁阻断或继续，不扩展写入权限

#### Scenario: 实施发现意外范围

- **WHEN** 完成任务需要规划 artifact 没有描述的额外可观察行为
- **THEN** 系统暂停实施、报告新增范围并建议先更新规划，不得通过缩减或延后规定行为来提前完成任务

### Requirement: 归档和规格处理必须使用运行时实际路径
系统 MUST 使用 OpenSpec 返回的具体 artifact 和规格路径，兼容单层与嵌套目录；归档目标 MUST 对已有完整日期前缀保持原名，对其他名称只增加一次归档日期。（D-06、D-07；A-04、A-07）

#### Scenario: 处理嵌套规格
- **WHEN** delta 或主规格位于 `specs/<area>/<capability>/spec.md`
- **THEN** 系统使用运行时返回的 existingOutputPaths 进行检查和同步，不从通配符猜测或扁平化路径

#### Scenario: 归档已有日期前缀变更
- **WHEN** 活跃变更名以完整 `YYYY-MM-DD-` 日期开头
- **THEN** 归档目标保持该完整名称，不再次添加当天日期

#### Scenario: 归档普通或数字前缀变更
- **WHEN** 变更名没有完整日期前缀，包括以数字开头的合法名称
- **THEN** 归档目标只添加一次当天日期并保留原始名称其余部分

### Requirement: 规划与归档校验必须采用 OpenSpec 1.9.0 语义

系统 MUST 使用内置 OpenSpec 1.9.0 执行规划、任务和归档校验；仓库发布 MUST 保持活动变更与主规格严格模式，并 MUST 独立检查归档任务完成状态。普通模式的多语言兼容 MUST NOT 被误报为严格验证通过。（D-04、D-05、D-06、D-07；A-02、A-03、A-04）

#### Scenario: 普通模式校验中文规范

- **WHEN** Requirement 使用中文规范表述且不包含英文 `SHALL` 或 `MUST`
- **THEN** 普通模式允许通过关键词指导项，结果不得被记录为严格校验证据

#### Scenario: 发布执行严格校验

- **WHEN** 仓库执行统一发布验证
- **THEN** 系统继续运行 `validate --all --strict --no-interactive` 并以非零退出码阻断不合规规范

#### Scenario: 归档任务未完成

- **WHEN** `changes/archive/` 中任一 `tasks.md` 仍有未完成复选框
- **THEN** `validate --archived` 返回非零并定位对应归档变更，且不重新应用规格 delta

#### Scenario: 批量命令位于错误根目录

- **WHEN** `validate --all`、`--changes`、`--specs` 或 `list --json` 在不存在 OpenSpec 根的目录执行
- **THEN** 命令返回非零而不是以空结果静默成功

#### Scenario: 任务编号存在歧义

- **WHEN** spec-driven 任务完整编号重复，或任务前导编号与所属 `## N.` 分组不一致
- **THEN** 校验结果保留明确 warning，插件不得吞掉或改写为无诊断成功

#### Scenario: MODIFIED 遗漏既有 Scenario

- **WHEN** delta 的 MODIFIED Requirement 遗漏主规格中使用任意四级标题声明的 Scenario
- **THEN** 变更在作者校验阶段失败并指出缺失 Scenario，不等待归档阶段才暴露

#### Scenario: 非交互归档缺少确认

- **WHEN** 无 TTY 或重定向环境执行 archive 且缺少变更名或所需确认参数
- **THEN** 运行时返回有限纯文本和非零状态，不输出 ANSI 光标控制或进入无界渲染

#### Scenario: 同步规格保持空白稳定

- **WHEN** archive 或 sync 重建以 Requirements 为末尾的主规格
- **THEN** 文件结尾恰好保留一个 LF，并保持 `## Requirements` 标题周围既有空行
