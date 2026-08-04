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

