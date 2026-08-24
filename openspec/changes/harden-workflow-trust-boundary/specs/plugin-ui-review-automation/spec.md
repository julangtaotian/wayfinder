## ADDED Requirements

### Requirement: UI Review 机器证据必须复核真实运行状态与关键产物
schema v2 UI Review 机器证据 MUST 读取其声明的安全项目相对状态 JSON，并 MUST 验证 runId、场景 ID、场景指纹、实际采集器、状态文件身份和 `passed` 结果与清单一致。清单还 MUST 绑定完成该结论所需的关键产物大小与 SHA-256；任一状态或产物不一致时，证据 MUST 失败关闭。（D-06、D-07，A-04、A-06）

#### Scenario: 通过状态和关键产物一致
- **WHEN** UI Review 状态可解析，身份字段与 v2 清单一致，状态为 `passed`，且全部关键产物仍在安全范围并保持相同大小和摘要
- **THEN** UI Review 证据合同通过，并继续参与其余严格完成门禁

#### Scenario: 状态不是通过
- **WHEN** 状态 JSON 为 `inconclusive`、`needs-fix`、`failed`、`blocked` 或未知状态
- **THEN** 系统保留真实状态并拒绝把该 UI Review 证据升级为 passed

#### Scenario: 运行身份不一致
- **WHEN** 状态 JSON 的 runId、场景、场景指纹、实际采集器或状态文件身份与清单不一致
- **THEN** 系统返回具体不一致字段和稳定错误，不接受任意 JSON 文件存在作为通过证明

#### Scenario: 关键产物被替换
- **WHEN** 状态仍声明 passed，但必需截图、比较结果或报告缺失、越界、大小变化或摘要变化
- **THEN** UI Review 机器证据失败，不得只依据状态字符串形成通过结论

