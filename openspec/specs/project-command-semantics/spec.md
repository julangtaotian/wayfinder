# project-command-semantics Specification

## Purpose
TBD - created by archiving change enforce-delivery-evidence. Update Purpose after archive.
## Requirements
### Requirement: 项目检查报告构建语义

项目检查器 SHALL 保留现有 `commands.build` 和 `scriptNames.build` 字段，并 SHALL 额外返回稳定的构建语义字段，分别表示默认构建和交付构建。默认构建 SHALL 优先选择 `build`；交付构建 SHALL 优先选择 `build:prod`、`build:production` 或 `build:release`，不存在时 SHALL 回退默认构建并标示回退来源。

#### Scenario: 项目同时定义默认和生产构建脚本

- **WHEN** `package.json` 同时包含 `build` 与 `build:prod`
- **THEN** 检查报告保留原有 `commands.build`
- **AND** 构建语义字段分别报告 `build` 为默认构建、`build:prod` 为交付构建

#### Scenario: 项目只定义默认构建脚本

- **WHEN** `package.json` 只包含 `build`
- **THEN** 默认构建和交付构建均报告该命令
- **AND** 交付构建字段标示其从默认构建回退

### Requirement: 项目检查报告 lint 语义

项目检查器 SHALL 在保留现有 lint 命令字段的同时报告 lint 语义状态。仅静态识别为 lint 工具的脚本 SHALL 标记为 `verified`；存在但无法静态识别的脚本 SHALL 标记为 `unverified` 并产生中文警告；缺少脚本 SHALL 标记为 `missing`。

#### Scenario: lint 脚本不执行已识别检查工具

- **WHEN** 项目的 `lint` 脚本为 `vite optimize`
- **THEN** 报告保留该 lint 命令
- **AND** lint 语义状态为 `unverified`
- **AND** 警告不得将该脚本描述为有效 lint

#### Scenario: lint 脚本执行已识别检查工具

- **WHEN** 项目的 `lint` 脚本包含 `eslint`、`stylelint`、`biome`、`oxlint` 或 Vue CLI 的 lint 子命令
- **THEN** lint 语义状态为 `verified`
- **AND** 不产生语义未验证警告

