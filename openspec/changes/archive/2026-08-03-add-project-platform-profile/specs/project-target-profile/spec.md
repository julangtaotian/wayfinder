## ADDED Requirements

### Requirement: 系统生成保守的平台框架画像
系统 MUST 在现有 `targetProfile` 中增加包含稳定英文 `kind`、有序 `frameworks`、`source` 和 `evidence` 的 `platform` 对象，并 MUST 只使用已确认的固定文件组合或明确包依赖作为证据。（D-02、D-03、D-04、D-05；A-01、A-02）

#### Scenario: 微信原生固定配置组合
- **WHEN** 有 `package.json` 的项目同时包含受支持位置的微信原生应用配置和项目配置
- **THEN** 系统返回 `platform.kind=native-mini-program`、`frameworks=[wechat-native]` 和不含配置内容的相对文件证据

#### Scenario: 单一跨端框架证据
- **WHEN** 项目只匹配 uni-app、Taro 或 Remax 中一个框架的明确依赖，或匹配 uni-app 固定配置组合
- **THEN** 系统返回 `platform.kind=cross-platform`、对应框架和有序证据，但不得宣称任何具体发布目标已配置或验证

#### Scenario: 没有平台框架强证据
- **WHEN** 项目没有匹配固定文件组合或明确框架依赖，即使项目名或任意普通目录包含小程序、微信、uni-app 或 Taro 字样
- **THEN** 系统返回 `platform.kind=unknown`、未知来源、空框架和空证据

#### Scenario: 多个框架证据冲突
- **WHEN** 项目同时匹配两个或以上不同平台框架
- **THEN** 系统返回 `platform.kind=conflict` 和全部有序框架与证据，不得自行选择实施框架或阻断现有工作流

### Requirement: 平台画像服务于需求与变更上下文
系统 MUST 让项目识别、初始化、显式升级和项目检查消费同一平台画像，并 MUST 让需求整理只在存在平台证据时核对相关生命周期、导航、权限、存储、网络和构建边界。（D-01、D-06、D-07；A-03）

#### Scenario: 初始化或检查平台项目
- **WHEN** 用户对有平台框架证据的项目执行初始化预览、显式写入或项目检查
- **THEN** 识别结果、AGENTS、Wayfinder 和 OpenSpec 上下文表达相同平台类型、框架、来源和证据，预览仍保持只读

#### Scenario: 平台证据变化后显式升级
- **WHEN** 已初始化项目的平台框架证据变化且用户执行显式升级
- **THEN** 系统只更新受管区块的平台画像并保留项目自定义内容

#### Scenario: 需求分析读取平台画像
- **WHEN** 需求整理读取到 `native-mini-program`、`cross-platform` 或 `conflict`
- **THEN** 系统要求核对适用的平台边界；对于 `unknown` 不得擅自补造小程序专项要求

## MODIFIED Requirements

### Requirement: 终端画像保持轻量兼容边界
系统 MUST 在不增加公共命令、项目配置文件、第三方依赖、框架适配器或框架专用工作流分支的情况下提供终端与平台画像，并 MUST NOT 把框架识别描述为构建、真机或发布支持；目标仓库仍 MUST 具有 `package.json`。（D-01、D-05、D-07；A-02、A-04）

#### Scenario: 既有调用继续运行
- **WHEN** 现有调用方不读取新增平台画像字段
- **THEN** 原有 CLI、默认预览、受管文件保护、formFactor、preset、命令和路径语义保持兼容

#### Scenario: 遇到没有 package.json 的纯小程序目录
- **WHEN** 用户把缺少 `package.json` 的目录作为目标
- **THEN** 系统保持现有安全错误，不因存在小程序配置而绕过项目根契约

#### Scenario: 遇到小程序框架项目
- **WHEN** 项目匹配微信原生、uni-app、Taro 或 Remax 证据
- **THEN** 系统只报告平台框架画像，不安装工具、不选择构建命令、不生成框架代码，也不宣称具体平台已可运行
