# ai-context-efficiency Specification

## Purpose
限制自动触发、模型可见上下文和结果体积，使日常交付只读取当前任务所需事实，并通过固定预算防止旧流程正文、完整日志与无关资产重新进入默认上下文。

## Requirements

### Requirement: 日常 Skill 必须先通过意图门禁

只有明确实施意图 MUST 触发 frontend-delivery。问答、解释、只读分析、审查、状态查询和仅规划请求 MUST NOT 触发日常实施 Skill。

#### Scenario: 用户只询问进度
- **WHEN** 用户请求当前状态而未要求修改
- **THEN** 系统直接只读回答，不加载实施流程

### Requirement: 自动上下文必须有硬预算

系统 MUST 限制 frontend-delivery、受管 AGENTS、CLI help 和状态 JSON 的非空行数或字节数。Project Context MUST 有界且不得包含完整源码、完整日志、规划正文或证据正文。

#### Scenario: 状态查询
- **WHEN** Complex status 被调用
- **THEN** 结果只返回产物完整性、任务进度和阻塞项，不返回 artifact 正文

### Requirement: 验证与 UI 结果必须默认摘要化

默认结果 MUST 只包含命令、退出码、通过/失败计数、首个相关失败摘要、必要截图或 console error 以及 acceptance 状态。trace 只在失败后且确有需要时生成。

#### Scenario: UI 检查成功
- **WHEN** 页面验收得到确定通过结果
- **THEN** 返回有界摘要，不把完整 observations、findings 或 trace 默认送入模型
