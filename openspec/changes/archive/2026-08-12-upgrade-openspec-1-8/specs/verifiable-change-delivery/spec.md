## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: 规划与归档校验必须采用 OpenSpec 1.8.0 语义

系统 MUST 使用内置 OpenSpec 1.8.0 执行规划、任务和归档校验；仓库发布 MUST 保持严格模式，且普通模式的多语言兼容 MUST NOT 被误报为严格验证通过。（D-05、D-06；A-03、A-04）

#### Scenario: 普通模式校验中文规范

- **WHEN** Requirement 使用中文规范表述且不包含英文 `SHALL` 或 `MUST`
- **THEN** 普通模式允许通过关键词指导项，结果不得被记录为严格校验证据

#### Scenario: 发布执行严格校验

- **WHEN** 仓库执行统一发布验证
- **THEN** 系统继续运行 `validate --all --strict --no-interactive` 并以非零退出码阻断不合规规范

#### Scenario: MODIFIED 遗漏既有 Scenario

- **WHEN** delta 中的 MODIFIED Requirement 没有包含主规格仍存在的 Scenario
- **THEN** 变更在作者校验阶段失败并指出缺失 Scenario，不等待归档阶段才暴露

#### Scenario: 非交互归档缺少确认

- **WHEN** 自动化环境执行归档但缺少所需确认参数
- **THEN** 运行时返回非零状态并给出可执行的参数提示，受管完成入口不得猜测或绕过问题
