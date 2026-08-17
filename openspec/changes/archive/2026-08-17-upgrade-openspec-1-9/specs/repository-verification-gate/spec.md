## MODIFIED Requirements

### Requirement: 仓库必须提供统一完整验证入口

系统 MUST 提供根级 `npm run verify` 命令，并 MUST 以稳定顺序覆盖自动测试、插件结构、全部 OpenSpec 活动变更和主规格严格校验、归档变更任务完成检查、内置 OpenSpec 版本及运行时完整性；任何阶段失败时 MUST 返回非零状态并标明失败阶段。（D-04、D-10；A-02、A-06）

#### Scenario: 完整验证全部通过

- **WHEN** 开发者在完整仓库中执行 `npm run verify`
- **THEN** 所有验证阶段按声明顺序执行并最终返回零状态

#### Scenario: 子验证失败

- **WHEN** 任一测试、结构、活动或主规格、归档任务、版本或完整性检查返回失败
- **THEN** 统一入口停止后续阶段、返回非零状态并输出失败阶段

#### Scenario: 归档任务检查独立执行

- **WHEN** 活动变更与主规格严格校验通过
- **THEN** 统一入口继续运行 `validate --archived --no-interactive`，并以稳定阶段 id `openspec-archived` 记录结果
