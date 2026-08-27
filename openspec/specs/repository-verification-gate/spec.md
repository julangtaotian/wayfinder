# repository-verification-gate Specification

## Purpose
为本地开发和持续集成提供同一套可重复、可定位且默认只读的仓库验证门禁，避免各环境选择不同检查而产生虚假通过。

## Requirements

### Requirement: 仓库必须提供统一完整验证入口

系统 MUST 提供根级 `npm run verify` 命令，并 MUST 以稳定顺序覆盖自动测试、仓库体积预算、插件结构、全部 OpenSpec 活动变更和主规格严格校验、归档变更任务完成检查、内置 OpenSpec 版本及运行时完整性；任何阶段失败时 MUST 返回非零状态并标明失败阶段。（D-06、D-08；A-03、A-06、A-08）

#### Scenario: 完整验证全部通过

- **WHEN** 开发者在完整仓库中执行 `npm run verify`
- **THEN** 所有验证阶段按声明顺序执行并最终返回零状态

#### Scenario: 子验证失败

- **WHEN** 任一测试、仓库体积预算、结构、活动或主规格、归档任务、版本或完整性检查返回失败
- **THEN** 统一入口停止后续阶段、返回非零状态并输出失败阶段

#### Scenario: 归档任务检查独立执行

- **WHEN** 活动变更与主规格严格校验通过
- **THEN** 统一入口继续运行 `validate --archived --no-interactive`，并以稳定阶段 id `openspec-archived` 记录结果

### Requirement: 统一验证默认不得修改仓库

系统 MUST 将 `verify` 作为确定性只读检查执行，不得生成或更新受管文件、完整性清单、规划 artifact 或业务内容。（D-02、D-05；A-02、A-05）

#### Scenario: 连续执行统一验证

- **WHEN** 开发者在未修改仓库的情况下连续两次执行 `npm run verify`
- **THEN** 两次均获得相同的验证结论且工作区内容不因验证而变化

### Requirement: 持续集成必须复用统一入口

GitHub Actions MUST 使用满足根 `engines.node` 最低要求的 Node.js 版本，并 MUST 只调用 `npm run verify` 承载完整验证，避免在 CI 中复制或遗漏子检查。（D-03；A-03）

#### Scenario: CI 触发验证

- **WHEN** push 或 pull request 触发验证工作流
- **THEN** 工作流以 Node.js 20.19.0 执行 `npm run verify`，且没有独立重复测试或结构校验步骤

### Requirement: 聚焦验证与完整验证必须保持证据分层

系统 SHALL 提供稳定聚焦入口以缩短日常反馈，但聚焦结果 MUST 明确其覆盖范围，且 MUST NOT 被报告为统一发布验证或真实五平台 CI 通过。（D-08、D-13；A-06、A-08）

#### Scenario: 聚焦入口通过

- **WHEN** 仓库治理、工作流核心或平台运行时聚焦测试成功
- **THEN** 结果 SHALL 报告所运行测试集合，发布状态仍 SHALL 等待统一验证和适用的外部矩阵

#### Scenario: 聚焦入口没有发现测试

- **WHEN** 入口配置漂移导致零测试被执行
- **THEN** 命令 MUST 返回非零状态，不得以空集合报告成功
