## ADDED Requirements

### Requirement: 安全纳入的 WXML 必须提供属性粘连静态观察
系统 SHALL 只对已经通过敏感路径、Git 忽略、文件大小、总量和文本内容限制的 WXML 检查属性结束引号后紧邻下一属性名的静态模式。每个观察 SHALL 返回稳定英文代码、`warning` 级别、项目相对路径、1 基行号和不包含源码值的中文说明。（D-03、D-06；A-02）

#### Scenario: WXML 属性之间疑似缺少空白
- **WHEN** 安全纳入 WXML 的一个属性结束引号后立即出现下一属性名和等号
- **THEN** 范围结果 SHALL 返回 `wxml-attribute-spacing` 观察及准确文件和行号，不得输出属性值或源码片段

#### Scenario: WXML 属性分隔合法
- **WHEN** 安全纳入 WXML 的相邻属性之间存在空白，且没有匹配的属性粘连模式
- **THEN** 范围结果 SHALL 不为该文件生成 `wxml-attribute-spacing` 观察

#### Scenario: WXML 未进入安全范围
- **WHEN** WXML 被 Git 忽略、属于敏感路径、超过限制或包含二进制内容
- **THEN** 系统 MUST 按既有原因排除该文件，且 MUST NOT 读取其内容执行静态观察

### Requirement: 静态观察不得冒充平台编译结论
系统 MUST 将 WXML 属性粘连作为非阻断启发式观察，并明确未执行微信开发者工具或其他平台编译。项目检查 SHALL 在发现观察时保持健康状态成功，同时返回数量、有限位置和验证边界。（D-03、D-04；A-02、A-03）

#### Scenario: 健康检查发现 WXML 静态观察
- **WHEN** 当前安全范围包含一个或多个 `wxml-attribute-spacing` 观察
- **THEN** 项目检查 SHALL 保持 `ok: true`，返回观察列表，并警告这不是平台编译结论且需要真实开发工具或外部 CI 确认

#### Scenario: 健康检查没有静态观察
- **WHEN** 当前安全范围没有 `wxml-attribute-spacing` 观察
- **THEN** 项目检查 SHALL 返回空观察列表，且不得据此声称 WXML 已通过语法或平台编译验证

