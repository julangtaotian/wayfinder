## MODIFIED Requirements

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

## RENAMED Requirements

- FROM: `### Requirement: 规划与归档校验必须采用 OpenSpec 1.8.0 语义`
- TO: `### Requirement: 规划与归档校验必须采用 OpenSpec 1.9.0 语义`
