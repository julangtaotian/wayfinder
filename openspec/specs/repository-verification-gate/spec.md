# repository-verification-gate Specification

## Purpose

定义仓库本地验证与 GitHub Actions 的分层职责，使平台无关检查只执行一次，五个原生平台专注路径、子进程、打包与浏览器差异，并只保留能够确定性复现的自动化结论。

## Requirements

### Requirement: 本地验证提供确定性作用域

仓库 MUST 提供 `verify`、`verify:shared` 与 `verify:platform`。Shared MUST 覆盖静态检查、体积门禁、全部平台无关测试、7 个 Skill 与 manifest 结构、OpenSpec strict、固定 OpenSpec 版本与完整性；Platform MUST 只覆盖非空平台合同测试、前端测试运行时离线最小测试、目标 Playwright 完整性与真实 Chromium smoke。未知作用域、空分组或任一步骤失败 MUST 返回稳定 code、scope、failedStep 和非零状态。

#### Scenario: Shared 与 Platform 分区

- **WHEN** 两个作用域分别构建测试集合和验证步骤
- **THEN** 测试集合互斥且并集等于完整测试集合
- **AND** Platform 不包含静态检查、仓库全文扫描、OpenSpec 全量校验或完整 Shared 验证

### Requirement: 测试运行时离线 smoke 保持轻量

Native Platform MUST 先使用锁定输入预热缓存并删除在线运行时，再由独立入口以 `--offline` 恢复 Vitest 3.2.4，只执行 Vue 3 + Vite fixture 中的一个固定最小测试并清理运行时。它 MUST NOT 在五个平台重复完整 Shared 验证。

#### Scenario: 暖缓存后的离线恢复

- **WHEN** 原生 runner 已预热缓存并进入 Platform 验证
- **THEN** smoke 离线重建运行时、只运行 `TC-03` 并成功清理
- **AND** 缓存缺失、零测试或运行失败均失败关闭

### Requirement: Native Platform 保留五个原生 runner

Native MUST 固定使用 `macos-15/darwin-arm64`、`macos-15-intel/darwin-x64`、`ubuntu-24.04/linux-x64`、`ubuntu-24.04-arm/linux-arm64` 与 `windows-2025/win32-x64`。每个平台 MUST 运行路径、临时目录、子进程、清理、安装视图和 Windows junction 等适用合同，随后在源码目录外构建唯一目标 marketplace，并验证平台包完整性与浏览器启动。

#### Scenario: 任一原生平台失败

- **WHEN** 平台合同、下载、许可、打包、完整性、浏览器 smoke 或清理失败
- **THEN** 该矩阵任务失败且不伪造其他平台状态
- **AND** 同一提交不得标记 Native 五平台通过

### Requirement: CI 报告只作为临时 artifact

Native 的 `package-report.json` MUST 由 GitHub Actions 上传并固定保留 14 天。工作流 MUST NOT 写 `.workflow-history`、生成 receipt、support evidence 或第二个状态提交，也 MUST NOT 上传完整大型 marketplace。

#### Scenario: CI 完成报告上传

- **WHEN** Native 的目标任务成功
- **THEN** 只上传对应小型 JSON 报告并设置 `retention-days: 14`
- **AND** 仓库工作树与生命周期历史保持不变

### Requirement: 平台成品裁剪可复算且保护运行时

单平台成品 MAY 删除白名单内的类型声明、源码映射和说明性元数据，但 MUST 保留 package manifest、许可证、第三方声明、可执行代码、浏览器、FFmpeg、平台元数据与完整性文件。报告 MUST 提供互斥组成、裁剪前估算、移除量、预算余量和稳定健康级别，且规范源码在打包前后摘要不变。

#### Scenario: 成品通过裁剪与预算门禁

- **WHEN** 单平台 marketplace 生成完成
- **THEN** 组成之和等于最终逻辑体积，裁剪前估算等于最终体积加移除字节
- **AND** 许可、完整性、预算和真实 Chromium smoke 全部通过后才能上传报告

### Requirement: 项目健康检查呈现当前生命周期

当仓库存在 `.frontend-workflow.json` 时，检查 MUST 返回 schemaVersion、mode、eventCount、diagnostics 与 runtimeIgnored。插件源码仓库不得套用业务项目受管文件要求；任何非 v2 配置或退役路径 MUST 失败关闭，且不得报告为可迁移健康状态。

#### Scenario: 插件仓库使用 schema v2

- **WHEN** marketplace、manifest、生命周期配置与历史都有效
- **THEN** 精简检查返回插件健康、v2、事件计数和运行时忽略状态
- **AND** `retiredWorkflowState` 为 null

### Requirement: CI 固定为两层依赖

GitHub Actions MUST 使用 Node.js 20.19.0，并固定 Shared Validation 与 Native Platform Matrix 两个 job 层级。Shared MUST 只在 `ubuntu-24.04` 执行一次；Native MUST `needs: shared`。push 和 pull request MUST 触发这两层验证，工作流 MUST NOT 下载或执行 Codex CLI，也 MUST NOT 通过会话元数据或提示词输出推断 Skill 激活状态。

#### Scenario: 普通提交触发 CI

- **WHEN** push 或 pull request 触发 Validate
- **THEN** Shared 执行一次且成功后启动 Native 五平台矩阵
- **AND** 工作流不存在 Release Install job、Codex CLI 安装步骤或 Skill 激活探测
