## MODIFIED Requirements

### Requirement: 证据持久化与清理必须限制在本轮输出根

系统 MUST 把冻结清单、结构化事件、脱敏日志、验收摘要、差异统计、指标和清理结果限制在 `.frontend-ai-workflow/runs/developer-effectiveness-benchmark/<run-id>/`，并将可复用缓存限制在 `.frontend-ai-workflow/cache/`。这些内容默认不进入 Git 或 `outputs/`。成功、阶段失败和进程异常均 MUST 清理本轮工作区；清理失败 MUST 保留原始运行结果并单独报告（D-10～D-12、A-05、A-07）。

#### Scenario: 持久输出经过脱敏和限长

- **WHEN** 代理、Git 或验收命令输出包含业务绝对路径、令牌、Cookie、密码、私钥或超过大小上限
- **THEN** 系统替换业务路径别名、拒绝保存敏感原文并截断非敏感超长内容，同时记录稳定脱敏或截断状态

#### Scenario: 清理只作用于有界工作区

- **WHEN** 一轮运行成功、失败、超时或中断后开始清理
- **THEN** 系统只删除本轮工作区下已验证的非符号链接目录；越界、根目录、用户主目录或符号链接目标必须失败关闭

#### Scenario: 恢复运行不覆盖既有证据

- **WHEN** 使用同一运行 ID 重启已部分完成的基准
- **THEN** 系统校验冻结清单和既有证据摘要，只继续允许恢复的未完成阶段；内容冲突或已完成输出重写请求必须阻断
