# supported-project-matrix Specification

## Purpose
明确插件承诺支持的前端框架、构建工具和包管理器组合，并用无需联网或安装第三方依赖的完整工作流回归防止支持范围退化。

## Requirements

### Requirement: 项目识别必须覆盖受支持框架矩阵

系统 MUST 根据真实 `package.json` 依赖识别 Vue 2 + Vite、Vue + Webpack、React + Vite 和 React + Webpack，且 MUST NOT 根据目录名称推断框架或构建工具。

#### Scenario: 识别受支持框架组合

- **WHEN** 项目依赖分别声明 Vue 2 与 Vite、Vue 与 Webpack、React 与 Vite 或 React 与 Webpack
- **THEN** 检查结果分别返回 `vue2-vite`、`vue-webpack`、`react-vite` 或 `react-webpack`

#### Scenario: 目录名与依赖冲突

- **WHEN** 目标目录名称包含某框架名称但 `package.json` 没有对应依赖
- **THEN** 系统忽略目录名称并只按真实文件和依赖返回识别结果

### Requirement: 项目识别支持原生微信小程序轻量工作流

系统 MUST 在目标包含 `package.json`、根 `app.json` 与根 `project.config.json` 且没有 Vue/React 依赖时返回 `wechat-native` 预设，并 MUST 在不安装依赖、不调用微信开发者工具的前提下完成初始化、升级与检查。

#### Scenario: 原生微信小程序完成工作流关键路径

- **WHEN** 最小 fixture 包含原生微信配置、Vant Weapp、常用页面组件路径、根 `api` 和带 `globalData` 的 `app.js`
- **THEN** 系统返回 `wechat-native`、`mobile` 和来源明确的项目路径
- **AND** 默认初始化保持只读，显式写入生成三份受管文件，升级只刷新受管区块，检查明确人工微信开发者工具或外部 CI 验证边界

### Requirement: 项目识别必须覆盖受支持包管理器

系统 MUST 通过锁文件以确定性优先级识别 pnpm、yarn 和 npm，并 MUST 为识别结果生成对应的项目脚本命令。

#### Scenario: 识别包管理器命令

- **WHEN** 项目分别存在 `pnpm-lock.yaml`、`yarn.lock` 或仅有 npm 默认文件
- **THEN** 检查结果分别返回 pnpm、yarn 或 npm，并使用对应的 run 命令格式

### Requirement: 受支持矩阵必须通过工作流关键路径

系统 MUST 在临时 fixture 上验证项目识别、默认只读初始化、显式写入、重复执行、受管升级和项目检查，测试过程 MUST NOT 联网或安装 fixture 的第三方依赖。

#### Scenario: fixture 完成工作流关键路径

- **WHEN** 自动测试为受支持矩阵创建最小真实文件并执行工作流关键路径
- **THEN** 每个项目均保持正确预设、包管理器和命令，重复执行不产生额外写入，升级仅改变受管区块

### Requirement: 支持矩阵结论必须区分证据层级

系统 MUST 将最小 fixture 回归、本机真实项目执行、插件本地统一验证和真实 CI 平台矩阵视为互不替代的证据层级。支持说明 MUST 对每个框架、构建工具、包管理器和测试运行器组合明确标记已认证、有限支持、正确阻断或未覆盖；只有对应层级真实通过后才能提升声明。

#### Scenario: 真实项目在本机通过

- **WHEN** 某一项目组合在 macOS ARM64 的精确提交隔离副本中完成真实运行
- **THEN** 支持矩阵可以记录该组合的本机项目证据
- **AND** 不得据此把 Linux、Windows、macOS Intel 或同类所有项目标记为已通过

#### Scenario: runner 只有项目证据

- **WHEN** Jest 或其他非首版认证 runner 在一个或多个真实项目中成功运行
- **THEN** 系统记录项目级通过并继续标明运行器为有限支持
- **AND** 在缺少专用 fixture 与广泛项目证据时不得声明完整认证

#### Scenario: 组合未被六项目覆盖

- **WHEN** 六项目没有 pnpm、React + Vite 或真实 workspace/Monorepo 样本
- **THEN** 最终支持矩阵明确保留这些组合为未覆盖
- **AND** 不得用相邻框架、嵌套 package 或现有 fixture 替代真实项目认证结论

### Requirement: 支持证据矩阵必须提供可重复的机器投影

系统 MUST 提供版本化、默认只读的支持证据矩阵，将每个框架、构建工具、包管理器和测试运行器组合的 fixture、本机真实项目、本地统一验证和五平台 CI 作为独立层级。每个组合 MUST 使用 `certified`、`limited`、`blocked` 或 `uncovered` 之一，并列出阻止提升的具体缺口。

#### Scenario: 只读取仓库内声明证据

- **WHEN** 调用方没有提供本机真实项目结果、统一验证清单或外部 CI 回执
- **THEN** 系统只记录已声明的 fixture 覆盖，并将其他层级显示为 unavailable
- **AND** 不得把存在测试文件、规格声明或相邻组合当成完整认证

#### Scenario: 组合取得分层证据

- **WHEN** 调用方提供 schema、项目组合、精确提交和状态均匹配的本机结果、统一验证或 CI 回执
- **THEN** 系统只提升该组合对应的证据层级并保留来源描述
- **AND** 单机、单项目或单运行器证据不得提升其他平台、项目或组合

#### Scenario: 输入证据失效或不匹配

- **WHEN** 可选输入无法解析、schema 不支持、提交不匹配、任务不完整或组合标识未知
- **THEN** 系统返回稳定 `code`、`status` 和 `target` 并拒绝沿用该输入生成提升结论

### Requirement: 已知未覆盖范围必须显式保留

支持证据矩阵 MUST 显式包含 pnpm 原生测试执行、React + Vite 真实项目、workspace/Monorepo、多应用、远程设计同步和后端链等已知缺口。系统 MUST NOT 因 fixture 能识别相应锁文件或框架而把真实执行与生产适用性标记为已认证。

#### Scenario: fixture 能识别 pnpm 与 React Vite

- **WHEN** 确定性 fixture 已覆盖 pnpm 命令生成或 React + Vite 识别，但没有对应真实项目执行
- **THEN** 矩阵保留 fixture 层证据，同时把原生执行或真实项目层标记为 uncovered

#### Scenario: 没有真实开发者效果样本

- **WHEN** 只有合成配对基准或没有三个真实项目的有效配对数据
- **THEN** 矩阵把真实开发者、团队和生产收益标记为 unmeasured，不生成收益百分比

### Requirement: 支持矩阵必须直接聚合标准证据并区分旧输入信任

支持证据矩阵 MUST 直接消费标准本地统一验证回执、标准真实项目支持证据和既有 GitHub CI 回执，并 MUST 要求全部已提供输入与调用方指定的同一 40 位 revision 一致。矩阵 MUST 分别呈现各层来源、信任和有效项目；只有生成器可验证的标准本地回执与标准真实项目证据才能参与 `certified` 提升。第二阶段的手工 schema v1 输入 MUST 继续可读，但 MUST 标记为旧式记录且不得单独形成认证。缺少任何可选输入时，默认组合状态、已知缺口和真实效益 `unmeasured`/`null` MUST 保持不变。

#### Scenario: 三类标准证据同提交聚合

- **WHEN** 调用方提供同一 revision 的标准本地验证回执、标准真实项目证据和完整 GitHub CI 回执
- **THEN** 系统分别展示三层来源、信任与实际项目覆盖，并只提升同时满足认证条件的匹配组合
- **AND** 任一组合的证据不得提升其他框架、包管理器、runner 或平台组合

#### Scenario: 读取第二阶段手工 schema v1 输入

- **WHEN** 调用方提供结构仍合法但缺少标准生成器身份与来源摘要的旧式 schema v1 本地或真实项目输入
- **THEN** 系统继续显示该输入的记录状态并将其信任标为旧式
- **AND** 该输入不得满足认证提升所需的本地或真实项目证据层

#### Scenario: 没有新增真实证据

- **WHEN** 调用方不提供标准本地回执、真实项目证据或真实开发者配对样本
- **THEN** 默认矩阵继续返回 0 个 `certified`、6 个 `limited` 和 1 个 `uncovered`
- **AND** 真实开发者、团队和生产效益保持 `unmeasured`，收益百分比保持 `null`

#### Scenario: 标准输入不一致或损坏

- **WHEN** 任一已提供输入的 schema、revision、生成器身份、来源摘要、任务状态或组合标识无效
- **THEN** 系统以稳定 `code`、`status` 和 `target` 失败关闭
- **AND** 系统不得回退旧证据、忽略无效层或输出提升后的矩阵

### Requirement: 支持矩阵必须保守消费标准真实开发者效果证据

支持矩阵 MUST 接受可选的标准真实开发者效果证据，并 MUST 校验 schema、固定生成器身份、调用方指定的插件 40 位提交、研究状态、样本摘要和输入来源的相对路径、字节数及 SHA-256。没有输入时真实开发者效果 MUST 保持 `unmeasured` 且 `benefitPercent` 为 null；有效但未达到证明门槛的证据 MUST 保留其真实结论并保持收益为空；只有标准证据为 `demonstrated-improvement` 时才能投影非空收益百分比。旧式手工文件、合成基准、损坏摘要或提交不匹配 MUST NOT 形成提升结论。

#### Scenario: 不提供真实效果证据
- **WHEN** 调用方按现有参数生成支持矩阵
- **THEN** 系统维持既有支持组合计数、`developerEffectiveness.status=unmeasured` 和 `benefitPercent=null`

#### Scenario: 同提交标准证据证明改善
- **WHEN** 调用方提供同一插件提交、来源摘要可复算且状态为 `demonstrated-improvement` 的标准真实效果证据
- **THEN** 系统投影生成信任、研究别名、项目数、配对数和真实收益百分比，并且不改变框架支持组合认证状态

#### Scenario: 标准证据未证明改善
- **WHEN** 标准证据状态为 `inconclusive`、`no-demonstrated-improvement` 或 `regressed`
- **THEN** 系统保留对应状态、样本与阻断原因，但收益百分比保持 null

#### Scenario: 证据伪造或来源漂移
- **WHEN** 输入不是标准生成器结果、revision 不匹配、字段越界或来源文件大小与摘要改变
- **THEN** 系统返回稳定失败并且不得回退为旧式信任、忽略该层或输出部分提升矩阵
