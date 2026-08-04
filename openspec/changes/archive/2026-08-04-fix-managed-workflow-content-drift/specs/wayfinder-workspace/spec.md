## MODIFIED Requirements

### Requirement: Wayfinder 合并元数据与项目导航
系统 SHALL 在 `wayfinder/frontend.md` 中提供互不重叠且各自恰好成对的 `meta`、`facts`、`scope` 与 `analysis` 受管区块。`meta` SHALL 保存工作流版本、项目识别结果、深度状态与范围统计；`facts` SHALL 保存与同次项目识别一致的人类可读项目概览、平台验证边界和目录职责；`scope` SHALL 保存机器范围摘要；`analysis` SHALL 保存 AI 项目地图。（D-02、D-03、D-07；A-01）

#### Scenario: 深度初始化 Wayfinder
- **WHEN** 用户确认对新项目执行深度初始化
- **THEN** 系统 SHALL 在 Wayfinder 的 `meta`、`facts` 和 `scope` 区块写入同次识别与真实范围元数据，并预留 `analysis` 区块，而不得创建独立工作流 YAML 或额外扫描文档

#### Scenario: 升级没有 facts 标记的既有 Wayfinder
- **WHEN** 合法既有 Wayfinder 包含稳定的项目概览和目录职责标题但尚无 `facts` 受管标记
- **THEN** 系统 SHALL 将该标题区间安全替换为新的 `facts` 区块，且 SHALL NOT 重复旧内容或修改 `scope`、`analysis` 和标记外项目内容

## ADDED Requirements

### Requirement: 三个工作流文件必须同步受管项目事实
系统 SHALL 在显式升级中使用当前项目识别结果刷新 AGENTS、Wayfinder 受管事实和 OpenSpec 配置。深度初始化 SHALL 同步已有三个受管文件，且所有写入仍 SHALL 要求显式确认。（D-03、D-07；A-01）

#### Scenario: 深度刷新已有项目
- **WHEN** 已初始化项目的受管文件仍包含旧预设、技术栈、命令状态或目录职责，且用户执行深度刷新预览
- **THEN** 预览 SHALL 将三个文件列为准确的 update 或 unchanged 动作，并 SHALL NOT 修改目标项目

#### Scenario: 确认刷新并重复执行
- **WHEN** 用户显式写入深度刷新并在相同项目快照上再次执行
- **THEN** 三个文件 SHALL 使用一致项目事实，重复深度刷新 MAY 更新扫描时间和范围元数据但 SHALL NOT 重复 facts，普通升级在事实不变时 SHALL 返回 unchanged，未受管同名文件仍 SHALL 保持 conflict

### Requirement: 项目检查必须报告受管内容漂移
系统 SHALL 只读比较当前项目识别结果与可升级受管内容，返回稳定的受管内容新鲜度结果；存在差异时 SHALL 列出具体文件并给出非阻断刷新警告，不得把预览差异描述为已修复。（D-04、D-07；A-02）

#### Scenario: 受管内容与当前项目事实不一致
- **WHEN** AGENTS、Wayfinder 或 OpenSpec 受管内容仍使用旧项目事实
- **THEN** 检查结果 SHALL 标记受管内容 stale、列出实际漂移文件并返回刷新警告，且 SHALL NOT 写入任何文件

#### Scenario: 受管内容已同步
- **WHEN** 三个受管文件与当前项目事实一致
- **THEN** 检查结果 SHALL 返回空漂移列表且 SHALL NOT 产生受管内容过期警告
