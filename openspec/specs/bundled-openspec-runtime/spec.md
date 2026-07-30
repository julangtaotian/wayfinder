# bundled-openspec-runtime Specification

## Purpose
TBD - created by archiving change upgrade-openspec-1-7. Update Purpose after archive.
## Requirements
### Requirement: 插件必须固定使用可核验的内置 OpenSpec 运行时
系统 MUST 从官方 npm 包构建并固定使用 `@fission-ai/openspec@1.7.0` 的生产运行时，MUST NOT 探测、调用或自行升级全局 OpenSpec，且发布物 MUST 保留可核验的版本、入口、生产依赖和许可证。（D-01、D-02；A-01、A-09）

#### Scenario: 内置运行时完整
- **WHEN** 插件执行版本、状态、指令、校验或归档命令
- **THEN** 所有调用都使用插件目录内版本为 1.7.0 的入口，并强制关闭运行时版本检查

#### Scenario: 候选运行时核验失败
- **WHEN** 官方包版本、入口、许可证、生产依赖或严格兼容验证任一不满足要求
- **THEN** 升级停止并保留可恢复的 1.6.0 运行时，不发布部分替换结果

### Requirement: 项目操作必须保护规划根目录边界
系统 MUST 校验 OpenSpec 返回的规划根来源；在用户没有明确选择机器级 Store 时，本地项目操作 MUST NOT 写入 `root.source=global_default`，也 MUST NOT 由动态 guidance 改变已选择根目录。（D-05、D-08；A-05、A-06）

#### Scenario: 项目使用最近规划根
- **WHEN** 本地项目存在可识别的 OpenSpec 根且运行时返回 `root.source=nearest`
- **THEN** 系统在规范化并确认路径位于项目边界后继续操作

#### Scenario: 未授权机器默认 Store
- **WHEN** 本地项目操作解析到 `root.source=global_default` 且没有用户的显式 Store 选择
- **THEN** 系统在任何规划或业务文件写入前阻断并说明需要显式选择

### Requirement: 旧版规划数据必须通过新运行时兼容验证
系统 MUST 使用内置 1.7.0 对现有 1.6.0 变更和规格执行严格校验，并 MUST 保持初始化、重复执行、受管升级与检查对既有业务内容的非破坏语义。（D-01、D-09；A-01、A-08、A-10）

#### Scenario: 读取现有规划数据
- **WHEN** 1.7.0 运行时检查升级前创建的变更和规格
- **THEN** 状态、artifact 路径和严格校验结果继续有效，系统不自动改写历史内容

#### Scenario: 升级已有项目
- **WHEN** 用户预览或显式执行工作流升级
- **THEN** 预览保持只读，写入只更新受管区块并逐字保留项目内容、历史需求、变更和规格

