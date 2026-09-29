# verifiable-change-delivery Specification

## Purpose
定义轻量交付核心、按影响选择验证以及以用户目标为准的完成合同，使 Direct、Light 与 Complex 共享一个入口，同时保持规划深度、验证深度和完成判断彼此独立。

## Requirements

### Requirement: 日常实施必须按风险选择最小充分路径

系统 MUST 对明确实施请求建立有界 Project Context 与会话内 Execution Brief，并在 Direct、Light、Complex 中选择路径。三种路径 MUST 都保留目标、范围、验收、实现方案和验证结果；Direct 与 Light MUST NOT 创建 requirement、OpenSpec、evidence 或生命周期事件，Complex MUST 只创建一个 OpenSpec change。

#### Scenario: 局部行为直接实施

- **ACCEPTANCE** `AC-01`
- **WHEN** 目标明确且影响可由附近代码和调用方界定
- **THEN** 系统使用 Direct 完成需求理解、必要方案、最小修改和逐项验收，不创建管理产物

#### Scenario: 有界多步改动使用会话计划

- **ACCEPTANCE** `AC-02`
- **WHEN** 改动需要多个相关步骤但影响仍可在当前会话界定
- **THEN** 系统使用 Light 保留包含目标、范围、非目标、验收、方案、三至七步计划和验证方式的会话内 Execution Brief，不创建管理产物

#### Scenario: 发现硬风险

- **ACCEPTANCE** `AC-03`
- **WHEN** 实施涉及架构、权限、安全、持久化、公共契约、依赖、构建、部署、CI、平台、跨会话或不可界定影响
- **THEN** 系统保持已有安全工作并升级为 Complex，使用一个 OpenSpec 身份继续

### Requirement: 验证深度必须由实际影响独立决定

系统 MUST 在 None、Focused、Targeted UI、Full UI 中按改动影响和验收目标选择最低充分验证，不得按 Direct、Light、Complex 档位推断。项目入口缺失时 MUST 记录一次，不安装依赖，也不重复已知失败。

#### Scenario: 局部运行逻辑变化
- **WHEN** 改动只影响可由现有局部测试观察的运行逻辑
- **THEN** 系统选择 Focused，即使实施路径为 Direct 或 Complex

### Requirement: Outcome Gate 必须逐项核对用户目标

系统 MUST 为每个 acceptance 记录可观察结果。文件已修改、OpenSpec 校验通过、命令退出码为零或页面可打开均不能单独证明完成。Complex MUST 使用规格场景中唯一的 `AC-*` 标识关联任务和临时验证摘要，且完成时的验收集合 MUST 与规格集合完全一致。失败 MUST 按根因分类；同一分类最多修复两轮，第三次停止并报告。

#### Scenario: 测试通过但用户目标缺少观察事实

- **ACCEPTANCE** `AC-04`
- **WHEN** 验证命令成功但任一 acceptance 没有可观察结果
- **THEN** Outcome Gate 保持失败，任务不得报告完成

#### Scenario: Complex 验收集合不一致

- **ACCEPTANCE** `AC-05`
- **WHEN** 临时验证摘要缺少、重复或增加了规格中未定义的 Acceptance ID
- **THEN** 完成门禁返回稳定阻断且不写入生命周期结果

### Requirement: Complex 完成必须使用单一临时验证摘要

完成门禁 MUST 检查 OpenSpec artifacts、全部 tasks、严格校验和 `.frontend-ai-workflow/runs/<change>/verification-summary.json`。摘要 MUST 受体积限制、使用唯一 `acceptanceId` 并要求所有 Outcome Gate 项通过；同步后的正式规格 MUST 包含非占位 Purpose 且不得保留显式占位内容；成功事务 MUST 删除摘要，且年度事件 MUST NOT 复制摘要、日志、截图或证据路径。

#### Scenario: 完成预览缺少摘要

- **ACCEPTANCE** `AC-06`
- **WHEN** Complex tasks 已完成但临时验证摘要不存在、验收集合不一致或任一 outcome 未通过
- **THEN** 完成预览返回稳定阻断且不修改正式规格、事件或活动变更

#### Scenario: 显式完成成功

- **ACCEPTANCE** `AC-07`
- **WHEN** 所有规划、任务、严格校验和 Outcome Gate 均通过且用户显式授权写入
- **THEN** 系统同步正式规格、追加一个紧凑 accepted 事件、清理活动 change 和临时摘要

#### Scenario: 正式规格同步后仍有占位符

- **ACCEPTANCE** `AC-10`
- **WHEN** OpenSpec 同步后的正式规格缺少 Purpose 或仍包含显式占位内容
- **THEN** 完成事务保持可恢复阻断，不写 accepted 事件，也不得把不完整规格报告为完成

### Requirement: Complex 规划必须完整且可追溯

系统 MUST 为 Complex 创建现有 `.openspec.yaml`、`proposal.md`、`specs/<capability>/spec.md`、`design.md` 和 `tasks.md` 文件集合。新能力规格骨架 MUST 包含待完善的 Purpose；初始骨架 MUST 明确处于待完善状态；确定性校验 MUST 拒绝缺失章节、显式占位、重复 Acceptance ID、无效引用和未被任务覆盖的 Acceptance ID。校验 MUST NOT 尝试以关键词数量、句式或主观评分判断自然语言质量。

#### Scenario: 初始骨架不能冒充完成规划

- **ACCEPTANCE** `AC-08`
- **WHEN** Complex change 刚由 `create` 建立且语义内容尚未填写
- **THEN** `status` 和 `validate` 返回稳定阻断，实施不得开始

#### Scenario: 完整规划允许实施

- **ACCEPTANCE** `AC-09`
- **WHEN** proposal、spec、design 和 tasks 已由 Skill 根据真实项目事实完善，且所有 Acceptance ID 有效并被任务覆盖
- **THEN** `status` 和 `validate` 通过规划门禁，任务可以进入实施
