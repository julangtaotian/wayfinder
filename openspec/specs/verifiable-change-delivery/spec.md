# verifiable-change-delivery Specification

## Purpose
定义轻量交付核心、按影响选择验证以及以用户目标为准的完成合同，使 Direct、Light 与 Complex 共享一个入口，同时保持规划深度、验证深度和完成判断彼此独立。

## Requirements

### Requirement: 日常实施必须按风险选择最小充分路径

系统 MUST 对明确实施请求建立有界 Project Context 与会话内 Execution Brief，并在 Direct、Light、Complex 中选择路径。只有 Complex MAY 创建一个 OpenSpec change；Direct 与 Light MUST NOT 创建 requirement、OpenSpec、evidence 或生命周期事件。

#### Scenario: 局部行为直接实施
- **WHEN** 目标明确且影响可由附近代码和调用方界定
- **THEN** 系统使用 Direct 完成最小修改，不创建管理产物

#### Scenario: 发现硬风险
- **WHEN** 实施涉及架构、权限、安全、持久化、公共契约、依赖、构建、部署、CI、平台或不可界定影响
- **THEN** 系统保持已有安全工作并升级为 Complex，使用一个 OpenSpec 身份继续

### Requirement: 验证深度必须由实际影响独立决定

系统 MUST 在 None、Focused、Targeted UI、Full UI 中按改动影响和验收目标选择最低充分验证，不得按 Direct、Light、Complex 档位推断。项目入口缺失时 MUST 记录一次，不安装依赖，也不重复已知失败。

#### Scenario: 局部运行逻辑变化
- **WHEN** 改动只影响可由现有局部测试观察的运行逻辑
- **THEN** 系统选择 Focused，即使实施路径为 Direct 或 Complex

### Requirement: Outcome Gate 必须逐项核对用户目标

系统 MUST 为每个 acceptance 记录可观察结果。文件已修改、OpenSpec 校验通过、命令退出码为零或页面可打开均不能单独证明完成。失败 MUST 按根因分类；同一分类最多修复两轮，第三次停止并报告。

#### Scenario: 测试通过但用户目标缺少观察事实
- **WHEN** 验证命令成功但任一 acceptance 没有可观察结果
- **THEN** Outcome Gate 保持失败，任务不得报告完成

### Requirement: Complex 完成必须使用单一临时验证摘要

完成门禁 MUST 检查 OpenSpec artifacts、全部 tasks、严格校验和 `.frontend-ai-workflow/runs/<change>/verification-summary.json`。摘要 MUST 受体积限制并要求所有 Outcome Gate 项通过；成功事务 MUST 删除摘要，且年度事件 MUST NOT 复制摘要、日志、截图或证据路径。

#### Scenario: 完成预览缺少摘要
- **WHEN** Complex tasks 已完成但临时验证摘要不存在或任一 outcome 未通过
- **THEN** 完成预览返回稳定阻断且不修改正式规格、事件或活动变更

#### Scenario: 显式完成成功
- **WHEN** 所有门禁通过且用户显式授权写入
- **THEN** 系统同步正式规格、追加一个紧凑 accepted 事件、清理活动 change 和临时摘要
