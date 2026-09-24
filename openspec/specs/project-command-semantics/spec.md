# project-command-semantics Specification

## Purpose
定义项目真实命令发现、本地入口检查与保守执行语义，确保声明、可运行性和实际结果被清楚区分，缺失入口不会触发安装、猜测命令或重复失败。

## Requirements

### Requirement: 命令必须来自当前项目事实

系统 MUST 根据 package.json、锁文件、配置和真实入口识别开发、构建、测试、lint 与类型检查命令，不得按目录名猜测。输出 MUST 区分 detected、missing、placeholder 和 unverified。

#### Scenario: 测试脚本是失败占位符
- **WHEN** package.json 的 test 仅输出错误并失败
- **THEN** 系统标记 placeholder，不把它当作可用测试入口

### Requirement: 执行前必须确认本地入口

在运行项目命令前，系统 MUST 确认对应本地 CLI、模块或包装器存在。入口缺失时 MUST 记录一次并停止，不安装依赖或重复已知失败。Windows 不得直接启动 `.cmd` 包装器。

#### Scenario: npm JavaScript 入口缺失
- **WHEN** Windows 环境无法定位 npm 的 JavaScript 入口
- **THEN** 系统返回稳定阻断，不以 shell 执行 npm.cmd

### Requirement: 命令发现不得夸大执行事实

检查结果 MUST 明确 `executed: false`，直到命令真实运行。默认构建与发布构建的来源 MUST 分开报告，回退候选不得描述为生产交付已验证。

#### Scenario: 只有默认 build
- **WHEN** 项目没有显式发布构建脚本
- **THEN** 系统把默认 build 报告为回退候选并保持未执行语义
