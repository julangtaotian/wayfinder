# compact-lifecycle-history Specification

## Purpose
定义 Complex 完成后仅保留正式规格和紧凑年度事件的生命周期合同，使完成状态可安全投影、可恢复且不复制需求正文、检查结果或外部证据。

## Requirements

### Requirement: 年度事件必须保持最小且可投影

事件 MUST 只包含 schemaVersion、eventId、scope、changeId、type、revision、occurredAt、baseRevision、capabilities、specDigest 和 supersedes。事件 MUST NOT 包含 requirement 正文或标识、checks 副本、trust、日志、截图、evidence 或外部 CI 路径。

#### Scenario: 追加 accepted 事件
- **WHEN** Complex 完成事务成功同步正式规格
- **THEN** 系统追加一条满足体积上限的紧凑事件，并可投影 accepted-local 或 accepted-merged

### Requirement: 完成事务必须可恢复

系统 MUST 保留安全锁、规格同步、事件追加、活动 change 清理和中断恢复。事务只保存恢复所需路径与事件，不保存 requirementPath、外部 CI 投影或验证证据副本。

#### Scenario: 规格同步后中断
- **WHEN** 原生规格同步完成但事件或清理尚未完成
- **THEN** 恢复入口根据同一事务阶段幂等追加事件、清理临时归档和验证摘要

### Requirement: 独立生命周期入口必须退役

插件 MUST NOT 发布独立 audit、status 或 transition 入口，也不得提供生命周期迁移、旧状态兼容或本地 CI 回执投影。五平台 CI 只由托管平台同一提交的 required job 状态判断。

#### Scenario: 退役入口回流
- **WHEN** 仓库出现退役脚本、package script 或事件字段
- **THEN** 仓库门禁以稳定 code 和 target 阻断
