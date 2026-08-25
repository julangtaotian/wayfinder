# supported-project-matrix Specification

## Purpose
明确插件承诺支持的前端框架、构建工具和包管理器组合，并用无需联网或安装第三方依赖的完整工作流回归防止支持范围退化。

## Requirements

### Requirement: 项目识别必须覆盖受支持框架矩阵

系统 MUST 根据真实 `package.json` 依赖识别 Vue 2 + Vite、Vue + Webpack、React + Vite 和 React + Webpack，且 MUST NOT 根据目录名称推断框架或构建工具。（D-04；A-04）

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

系统 MUST 通过锁文件以确定性优先级识别 pnpm、yarn 和 npm，并 MUST 为识别结果生成对应的项目脚本命令。（D-04；A-04）

#### Scenario: 识别包管理器命令

- **WHEN** 项目分别存在 `pnpm-lock.yaml`、`yarn.lock` 或仅有 npm 默认文件
- **THEN** 检查结果分别返回 pnpm、yarn 或 npm，并使用对应的 run 命令格式

### Requirement: 受支持矩阵必须通过工作流关键路径

系统 MUST 在临时 fixture 上验证项目识别、默认只读初始化、显式写入、重复执行、受管升级和项目检查，测试过程 MUST NOT 联网或安装 fixture 的第三方依赖。（D-04、D-06；A-04、A-06）

#### Scenario: fixture 完成工作流关键路径

- **WHEN** 自动测试为受支持矩阵创建最小真实文件并执行工作流关键路径
- **THEN** 每个项目均保持正确预设、包管理器和命令，重复执行不产生额外写入，升级仅改变受管区块

### Requirement: 支持矩阵结论必须区分证据层级

系统 MUST 将最小 fixture 回归、本机真实项目执行、插件本地统一验证和真实 CI 平台矩阵视为互不替代的证据层级。支持说明 MUST 对每个框架、构建工具、包管理器和测试运行器组合明确标记已认证、有限支持、正确阻断或未覆盖；只有对应层级真实通过后才能提升声明。（D-06、D-07、D-08、D-12、D-13；A-05、A-06、A-07、A-10）

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
