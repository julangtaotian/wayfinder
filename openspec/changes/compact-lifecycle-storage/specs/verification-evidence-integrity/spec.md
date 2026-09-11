## MODIFIED Requirements

### Requirement: schema v2 证据必须验证工作区新鲜度与路径安全

系统 SHALL 只接受已知 schema 版本、同一 V-* 的证据 ID、受支持 kind 和安全项目相对路径，并 MUST 通过排除生命周期文档、证据目录、旧临时 outputs、`.frontend-ai-workflow/` 受管运行时以及 `.frontend-ui-review/runs/` 旧运行产物后的项目工作区指纹判断证据是否仍对应当前实现与测试。持久 UI Review 配置仍 MUST 参与指纹；路径 MUST 先规范化，符号链接、绝对路径、父级穿越和项目外目标 MUST 失败关闭。（D-04、D-10；A-04、A-07）

#### Scenario: 受管运行时变化不使证据过期

- **WHEN** 测试、缓存、事务或 UI Review 运行产物只在受管运行目录中新增、更新或清理
- **THEN** 工作区指纹 MUST 保持一致，既有机器证据不得因可重建运行时变化被误判为过期

#### Scenario: 持久 UI Review 配置变化使证据过期

- **WHEN** `.frontend-ui-review/config.json` 或其他参与实现的持久项目文件发生变化
- **THEN** 工作区指纹 MUST 变化，旧机器证据 MUST 被判定为过期

