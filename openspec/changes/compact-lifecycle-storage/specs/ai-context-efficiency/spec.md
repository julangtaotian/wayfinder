## ADDED Requirements

### Requirement: 活动变更必须支持阶段化上下文编译

系统 MUST 根据 plan、implement、verify 或 complete 阶段读取活动需求与规划文件，并只返回该阶段需要的事实、计数和有界诊断。输出 MUST 支持 offset/limit，limit MUST 同时约束各事实数组和 diagnostics，单条事实文本 MUST 有固定上限，并返回每类 total、displayed、omitted。默认不包含完整 Markdown，不创建持久上下文副本，也不得绕过阶段验证器。（D-11、D-21；A-05、A-09、A-12）

#### Scenario: 实施阶段读取活动变更
- **WHEN** 调用方请求 implement 上下文
- **THEN** 结果 MUST 包含适用决策、任务、影响范围和约束，并 MUST 省略完整历史验证正文与无关 proposal 叙述

#### Scenario: 完成阶段读取活动变更
- **WHEN** 调用方请求 complete 上下文
- **THEN** 结果 MUST 包含状态、未完成计数、规格差异、证据摘要和阻断诊断，不得重跑测试或复制证据内容

#### Scenario: 诊断超过页大小
- **WHEN** 阶段诊断超过显式 limit
- **THEN** 结果 MUST 返回 nextOffset 和 remainingCount，未知阶段或越界参数在读取完整文件前失败

#### Scenario: 事实数量或文本超过上限
- **WHEN** 决策、验收、验证、任务或规格数量超过 limit，或单条事实文本超过固定长度
- **THEN** 结果 MUST 裁剪返回内容并报告 total、displayed、omitted，不得让单次阶段 JSON 无界增长

#### Scenario: 统计两种验收复选框
- **WHEN** 验收标准使用 `A-01：` 或 `[A-01]` 形式
- **THEN** complete 阶段 MUST 正确返回总数和未完成数
