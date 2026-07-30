## MODIFIED Requirements

### Requirement: 完成归档必须使用不可绕过的硬门禁
系统 MUST 在需求、验收、任务、验证记录、OpenSpec `isComplete=true`、全部 artifact 为 `done` 或合法 `skipped`、严格校验、规格合并结果和归档目标全部通过后才归档，且正常完成入口 MUST NOT 提供跳过验证、跳过规格或确认未完成任务的选项。（D-03、D-04、D-06、D-07；A-02、A-03、A-04、A-06、A-07）

#### Scenario: 任一交付项未完成
- **WHEN** 需求不是待验证、存在未勾选验收或任务、验证未通过、`isComplete` 不是 true、artifact 为 ready、blocked、缺失或未知状态，或严格校验失败
- **THEN** 完成入口停止且不修改主规格、需求状态或变更目录

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

#### Scenario: 规格合并或归档失败
- **WHEN** 内置运行时无法验证重建规格、归档目标冲突或移动失败
- **THEN** 系统不得把需求标为已验收，并报告可恢复的实际状态

## ADDED Requirements

### Requirement: 动态操作输入必须可见且受硬约束
系统 MUST 在实施时读取 `instructions apply --json`，在完成预览时读取 `instructions archive --json`，并报告返回的 context、operationGuidance、warnings 和具体路径；这些输入 MUST NOT 覆盖需求事实、用户选择、规划根或完成硬门禁。（D-05；A-05）

#### Scenario: 动态指导补充实施步骤
- **WHEN** OpenSpec 返回 apply context 或 operationGuidance
- **THEN** 系统将其作为当前变更的补充约束展示和使用，同时保持需求决策与仓库规则优先

#### Scenario: 动态指导要求绕过门禁
- **WHEN** apply 或 archive guidance 与需求、根目录边界或完成检查冲突
- **THEN** 系统忽略冲突部分并按硬门禁阻断或继续，不扩展写入权限

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
