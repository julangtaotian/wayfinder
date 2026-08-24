## MODIFIED Requirements

### Requirement: 三个工作流文件必须同步受管项目事实
系统 SHALL 在显式升级中使用当前项目识别结果刷新 AGENTS、Wayfinder 受管事实和 OpenSpec 配置。三份上下文 SHALL 同步同一次动态直接依赖画像的总数、可读摘要、截断状态和完整事实边界，并 SHALL 将 preset、终端画像和平台画像描述为有限兼容或安全信号。深度初始化 SHALL 同步已有三个受管文件，且所有写入仍 SHALL 要求显式确认。（D-03、D-04、D-06、D-08、D-11；A-02～A-05）

#### Scenario: 深度刷新已有项目
- **WHEN** 已初始化项目的受管文件仍包含旧预设、技术栈、依赖摘要、命令状态或目录职责，且用户执行深度刷新预览
- **THEN** 预览 SHALL 将三个文件列为准确的 update 或 unchanged 动作，并 SHALL NOT 修改目标项目

#### Scenario: 确认刷新并重复执行
- **WHEN** 用户显式写入深度刷新并在相同项目快照上再次执行
- **THEN** 三个文件 SHALL 使用一致项目事实，重复深度刷新 MAY 更新扫描时间和范围元数据但 SHALL NOT 重复 facts，普通升级在事实不变时 SHALL 返回 unchanged，未受管同名文件仍 SHALL 保持 conflict

#### Scenario: 动态依赖超过摘要上限
- **WHEN** 完整直接依赖数量超过受管上下文展示上限
- **THEN** 三份受管上下文 SHALL 显示一致的总数、展示数和遗漏数，并 SHALL 指示 AI 读取完整机器画像或根 package 后再总结
- **AND** 受管上下文 SHALL NOT 将截断摘要描述为完整技术栈

