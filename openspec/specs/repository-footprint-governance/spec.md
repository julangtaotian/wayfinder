# repository-footprint-governance Specification

## Purpose
以确定性负向门禁阻止已退役工作流资产、长期证据和不可达生产脚本回流，并以固定预算和稳定诊断保护日常源码、测试与正式规格的长期体积。

## Requirements

### Requirement: 退役资产必须使用零上限

仓库门禁 MUST 拒绝 outputs、永久 OpenSpec archive、requirement archive、`.workflow-history/evidence`、活动 change 中的 test-plan/evidence、旧 requirement 校验器、验证证据脚本、CI 回执脚本、独立 lifecycle 入口及其 package scripts。

#### Scenario: 旧脚本或证据回流
- **WHEN** 任一退役路径、源码、package script 或活动 evidence 文件存在
- **THEN** 门禁返回稳定 `code`、`target`、`actual` 和零 `limit`

### Requirement: 紧凑事件不得携带退役字段

年度事件出现 requirementId、checks、trust、evidence 或 evidencePath 时，门禁 MUST 失败并定位文件、行号和字段。

#### Scenario: 历史行仍复制 checks
- **WHEN** JSONL 事件包含 checks
- **THEN** 门禁返回 `retired_lifecycle_field`，不得静默兼容或迁移到其他目录

### Requirement: 生产脚本必须从真实入口可达

插件脚本 MUST 可从 package 命令、公开 Skill/reference、CI 或现有生产入口静态到达。测试引用不得作为生产可达性证明。

#### Scenario: 脚本只有测试消费者
- **WHEN** 一个插件脚本无法从任何生产入口到达
- **THEN** 门禁返回 `unreachable_plugin_script` 和精确路径

### Requirement: 运行物和平台资产不得进入 Git

受管 runs、cache、transactions、平台浏览器成品和系统元数据 MUST 使用零上限；正式 specs 与长期测试使用显式软预算，不得按当前体积静默放宽。

#### Scenario: 强制跟踪运行物
- **WHEN** Git 索引包含受管运行目录或平台成品
- **THEN** 门禁失败，而本地被忽略的可重建运行物不影响结果
