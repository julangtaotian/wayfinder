# compact-lifecycle-history Specification

## Purpose
为需求完成状态提供有界、追加式、可恢复且跨平台一致的事实记录，使完整规划和普通证据不再成为永久仓库负担，同时保留安全迁移与审计边界。

## Requirements

### Requirement: 生命周期事件必须有界且可确定投影

系统 MUST 以 schema v2 事件记录完成、取消、替代和重新打开状态。事件 MUST 包含稳定 eventId、仓库相对 scope、changeId、revision、occurredAt、信任级别和规范化规格摘要，并 MUST 拒绝绝对路径、控制字符、重复 eventId、分叉 revision、未知 supersedes、超长字段或超预算事件。状态 MUST 按 revision 和 supersedes 关系投影，不得使用文件最后一行覆盖。

#### Scenario: 查询已完成需求
- **WHEN** 活动目录不存在且存在唯一有效 accepted 事件
- **THEN** 系统 MUST 根据事件所在分支返回 accepted-local 或 accepted-merged，并保留 trust 与 eventId

#### Scenario: 事件历史发生分叉
- **WHEN** 同一 scope 和 changeId 存在重复 revision、未知 supersedes 或两个未互相替代的终态
- **THEN** 系统 MUST 返回稳定冲突诊断和 unknown 状态，不得选择物理文件中的最后一行

#### Scenario: 跨平台内容等价
- **WHEN** 同一规格分别使用 LF 与 CRLF 或 Windows 与 Git 风格路径表达
- **THEN** 系统 MUST 按规范化字节和路径得到相同摘要与 scope，且不写入开发机绝对路径

#### Scenario: 使用非根 scope 完成并恢复
- **WHEN** 调用方以规范化仓库相对 scope 完成变更，或完成在写入事件前中断
- **THEN** 预览、事务、事件、恢复和状态查询 MUST 使用同一 scope，不得回退为根 scope

#### Scenario: 取消、替代或重新打开
- **WHEN** 调用方通过正式入口执行 cancelled、superseded 或 reopened
- **THEN** 系统 MUST 在仓库锁内验证当前投影、revision、supersedes 与活动材料，并保证终态事件不会和未清理的活动变更形成冲突

### Requirement: 完成必须作为仓库级可恢复事务执行

完成写入 MUST 在仓库级锁内执行 Git 前置检查、原生 OpenSpec 严格归档与规格同步、事件追加和临时材料清理。merge、rebase、cherry-pick、未合并 index、相关 sparse checkout、格式版本不匹配或锁竞争 MUST 在修改文件前失败关闭。原生归档 MUST 仅作为事务中间结果，成功事件提交后不得长期保留。

#### Scenario: 正常完成
- **WHEN** 完成前门禁通过且调用方显式写入
- **THEN** 系统 MUST 同步正式规格、追加一个 accepted 事件并移除活动需求、活动变更和临时归档，重复恢复不得追加第二个事件

#### Scenario: 两个完成操作竞争
- **WHEN** 一个完成事务持有仓库锁且第二个操作尝试完成
- **THEN** 第二个操作 MUST 返回稳定 lifecycle_busy 诊断且不得修改规格、事件或活动材料

#### Scenario: 归档后进程中断
- **WHEN** 原生归档已经完成但事件或清理尚未完成
- **THEN** 恢复 MUST 使用持久事务阶段和内容摘要继续或安全回滚，不得再次移动变更或重复同步规格

### Requirement: Git 差异必须保护追加历史

统一验证 MUST 以显式 base revision、PR base SHA 或普通 push 父提交校验生命周期差异。活动变更删除 MUST 与 accepted、cancelled 或 superseded 事件新增配对；既有事件行不得修改或删除，除非显式 schema 迁移模式已经声明。

#### Scenario: 手工删除活动变更
- **WHEN** Git 差异显示活动变更被删除但没有新增匹配终态事件
- **THEN** 验证 MUST 以稳定 missing_lifecycle_event 诊断失败

#### Scenario: 篡改既有事件
- **WHEN** Git 差异修改或删除基线中已有事件
- **THEN** 验证 MUST 以稳定 lifecycle_history_rewritten 诊断失败

#### Scenario: Git 基线不可用
- **WHEN** 浅克隆或环境无法解析比较基线
- **THEN** 系统 MUST 报告 unavailable 并不得把差异保护描述为通过

### Requirement: 存量迁移必须先预览并失败关闭

系统 MUST 为 v1 OpenSpec 归档、需求归档、受跟踪 outputs 和 UI Review runs 提供只读预览；只有显式写入且引用反查、符号链接、未知文件、Git 状态、事件摘要和未跟踪内容检查全部通过时才可迁移。迁移 MUST 不重写 Git 历史，不得删除未跟踪内容，并 MUST 幂等恢复。

#### Scenario: 存在未知或仍被引用文件
- **WHEN** 预览发现无法分类的文件、符号链接或活动文档仍引用目标
- **THEN** 迁移 MUST 返回阻断目标并拒绝写入

#### Scenario: 安全迁移
- **WHEN** 所有历史条目均可建立有界事件且所有删除目标都受跟踪、无活动引用和未知内容
- **THEN** 显式写入 MUST 追加事件并删除对应工作树文件，保留 Git 可恢复性和确定性结果

#### Scenario: 重复迁移
- **WHEN** 对已迁移仓库再次运行相同命令
- **THEN** 系统 MUST 返回零新增事件和零删除目标，不生成重复记录

#### Scenario: 路径只出现在迁移合同样例中
- **WHEN** 精确历史路径只出现在迁移器自身实现或生命周期迁移专用回归测试中
- **THEN** 预览 MUST 把它记录为有界合同字面量诊断而不阻断，同时生产源码或持久文档中的同类引用 MUST 继续阻断

### Requirement: 外部 CI 回执必须与仓库提交解耦

系统 MUST 在真实 CI 运行前把正式规格、accepted 事件和活动材料清理封存到同一个候选提交，并 MUST 只从统一忽略运行时目录显式读取该提交产生后的外部 CI 回执。回执 MUST 匹配显式目标 revision，该 revision MUST 包含被查询的 accepted 事件，且回执只能携带有界 HTTPS 引用和稳定任务状态。状态查询 MUST 保留 `accepted-local` 与 `accepted-merged` 兼容状态，并独立返回 `commit-pending`、`external-ci-pending` 或 `external-ci-recorded` 派生交付状态；整个查询 MUST 只读，不得把精确候选 SHA、运行 URL 或 CI 任务结果写回事件、需求或规格。合法回执只能记录 `external-recorded` 语义，不得冒充可信远程核验。

#### Scenario: accepted 事件尚未进入目标提交

- **WHEN** 活动材料已经本地完成但 accepted 事件尚未包含在显式目标 revision 中
- **THEN** 系统 MUST 保持 `accepted-local` 或以稳定 `external_ci_event_not_in_revision` 拒绝回执派生
- **AND** 不修改工作树或把本地事实描述为提交后 CI 结果

#### Scenario: 未提供外部回执

- **WHEN** 显式目标 revision 包含 accepted 事件但调用方没有提供外部 CI 回执
- **THEN** 状态查询 MUST 返回 `accepted-merged` 与 `external-ci-pending`
- **AND** 本地通过和旧事件内嵌 check 不得冒充当前 accepted 提交的外部结果

#### Scenario: 回执匹配最终候选

- **WHEN** 受管回执的 revision 等于显式目标 revision、该 revision 包含 accepted 事件且声明的任务均成功
- **THEN** 状态查询 MUST 只读返回 `accepted-merged` 与 `external-ci-recorded`
- **AND** 返回 recorded、revision、有界引用、任务列表和 `external-recorded` 信任级别

#### Scenario: 重复查询匹配回执

- **WHEN** 调用方对相同目标 revision 与相同回执重复查询
- **THEN** 系统 MUST 返回确定一致的派生状态且 `write` 保持 false
- **AND** 事件流、活动材料、正式规格和 Git 工作树不得发生变化

#### Scenario: 回执越界或版本不匹配

- **WHEN** 回执位于受管目录之外、引用不是 HTTPS、内容超限、缺少目标 revision 或 revision 不匹配
- **THEN** 状态查询 MUST 以稳定诊断失败关闭并保持仓库不变
