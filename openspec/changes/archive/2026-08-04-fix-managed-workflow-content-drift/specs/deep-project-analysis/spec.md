## ADDED Requirements

### Requirement: 微信小程序文本源码必须进入深度分析范围
系统 SHALL 将 WXML、WXSS 和 WXS 视为可纳入的文本源码，使微信小程序的视图结构、样式和视图脚本参与范围覆盖、统计与项目地图新鲜度判断。范围契约版本 SHALL 在新增文本类型时变化。（D-05、D-06、D-07；A-03）

#### Scenario: 收集微信小程序项目范围
- **WHEN** 安全目标项目包含未被忽略且未超限的 `.wxml`、`.wxss` 或 `.wxs` 文件
- **THEN** 范围清单 SHALL 纳入这些文件并将其计入文件数、字节数和稳定指纹

#### Scenario: 小程序视图源码发生变化
- **WHEN** 已记录深度快照后任一纳入的 WXML、WXSS 或 WXS 内容发生变化
- **THEN** 当前范围指纹 SHALL 与既有指纹不同，项目检查 SHALL 报告深度项目地图可能过期
