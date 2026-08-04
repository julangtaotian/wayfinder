# secure-project-analysis Specification

## Purpose
TBD - created by archiving change harden-workflow-lifecycle. Update Purpose after archive.
## Requirements
### Requirement: 深度扫描必须在读取前排除敏感和忽略文件
系统 MUST 在读取项目文件内容前排除真实环境配置、凭据、密钥类文件和 Git 忽略项，仅允许明确的环境模板文件，并为每个排除项给出稳定原因。（D-01、D-08；A-01、A-07）

#### Scenario: Git 项目包含本地敏感配置
- **WHEN** 深度范围收集遇到被忽略的 `.env.local`、凭据文件或密钥文件
- **THEN** 系统不读取其内容且在排除清单中报告敏感或 Git 忽略原因

#### Scenario: 项目提供环境模板
- **WHEN** 项目包含 `.env.example`、`.env.sample` 或 `.env.template`
- **THEN** 系统允许将模板纳入范围，但不得因此允许真实 `.env` 变体

#### Scenario: 项目没有 Git 基线
- **WHEN** 目标目录不是可用 Git 工作树
- **THEN** 系统回退到安全文件遍历并明确报告 Git 元数据不可用

### Requirement: 项目范围必须生成稳定且源码优先的快照
系统 MUST 由版本化范围规则、纳入路径和内容摘要生成稳定指纹，并在总量受限时优先保留配置、源码和测试。新增的 WXML、WXSS 和 WXS 文本源码 MUST 继续服从敏感路径、Git 忽略、文件大小、总量和二进制内容限制。（D-05、D-06、D-07；A-03）

#### Scenario: 相同项目快照重复收集
- **WHEN** 同一项目内容和规则没有变化并连续收集两次
- **THEN** 两次范围结果和指纹完全一致

#### Scenario: 纳入文件内容变化
- **WHEN** 任一纳入文件内容发生变化
- **THEN** 新范围指纹与已记录指纹不同

#### Scenario: 总量达到上限
- **WHEN** 文档或其他文件与源码竞争总量预算
- **THEN** 系统先纳入配置、源码和测试，并为超限文件记录原因

#### Scenario: 小程序文本文件触发既有安全限制
- **WHEN** WXML、WXSS 或 WXS 文件被 Git 忽略、超过大小限制或包含二进制内容
- **THEN** 系统 MUST 按既有稳定原因排除该文件，且 MUST NOT 因扩展名受支持而绕过安全边界

### Requirement: Wayfinder 必须记录并检查分析快照
系统 MUST 在显式深度刷新时记录扫描时间、Git 提交、脏状态和范围指纹；普通升级 MUST 保留该基线，健康检查发现变化时只警告而不覆盖分析。（D-02、D-08；A-02、A-07）

#### Scenario: 显式完成深度刷新
- **WHEN** 用户确认执行深度写入
- **THEN** Wayfinder 受管元数据记录本次扫描快照和时间

#### Scenario: 普通工作流升级
- **WHEN** 已完成深度分析的项目只升级公共受管规则
- **THEN** 系统保留原扫描时间、提交、脏状态和指纹

#### Scenario: 项目源码已变化
- **WHEN** 健康检查计算出的当前指纹不同于 Wayfinder 记录值
- **THEN** 系统返回项目地图可能过期的警告且不修改任何文件

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

### Requirement: WXML 静态观察必须忽略注释内容
系统 SHALL 在属性粘连观察前屏蔽 WXML `<!--` 至 `-->` 注释内容，并 MUST 保留原始换行与注释外活动文本，使单行、跨行和未闭合注释不产生观察，注释外观察仍返回原始文件和 1 基行号。（D-01、D-02；A-01）

#### Scenario: 单行注释包含属性粘连样式
- **WHEN** 一行 WXML 注释内部包含属性结束引号紧邻下一属性名的文本
- **THEN** 系统 SHALL 不为该注释内容生成 `wxml-attribute-spacing` 观察

#### Scenario: 跨行或未闭合注释包含属性粘连样式
- **WHEN** WXML 注释跨越多行或从开始位置持续到文件结束，且屏蔽范围内包含属性粘连样式
- **THEN** 系统 SHALL 屏蔽对应注释行内容且不得将其报告为活动属性观察

#### Scenario: 注释前后存在活动标记
- **WHEN** 同一行注释前后或相邻行存在注释外的属性粘连
- **THEN** 系统 SHALL 只报告注释外匹配，并保持其原始文件路径和行号

