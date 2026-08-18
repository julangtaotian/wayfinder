## ADDED Requirements

### Requirement: UI Review Markdown 必须可独立识别运行与证据
系统 SHALL 使每份确定性 UI Review Markdown 报告展示 schema 版本、runId、scenarioFingerprint、实际 capture、baselineRunId、状态文件项目相对路径、关键证据路径和状态/证据摘要，并 MUST 与同次运行的状态 JSON 使用同一规范化事实。状态 JSON 继续作为机器复验来源，Markdown 不得派生不同身份或通过结论。（D-12，A-07）

#### Scenario: 首次验收生成自识别报告
- **WHEN** 默认受支持采集器完成首次 UI 验收并生成状态与 Markdown
- **THEN** 报告头部能够独立定位当前 runId、场景指纹、实际采集器、状态文件和截图证据，baselineRunId 明确为空

#### Scenario: 复验报告引用原始基线
- **WHEN** 使用既有基线状态完成复验
- **THEN** 报告展示当前 runId 和 baselineRunId，且两者、场景指纹、实际采集器和状态文件均与复验状态 JSON 一致

#### Scenario: 必需运行身份缺失
- **WHEN** 报告渲染输入缺少 runId、场景指纹、实际采集器或状态文件路径
- **THEN** 报告生成失败关闭，不输出看似完整但无法追踪的通过文档
