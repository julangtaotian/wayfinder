## Purpose

明确插件承诺支持的前端框架、构建工具和包管理器组合，并用无需联网或安装第三方依赖的完整工作流回归防止支持范围退化。

## ADDED Requirements

### Requirement: 项目识别必须覆盖受支持框架矩阵

系统 MUST 根据真实 `package.json` 依赖识别 Vue 2 + Vite、Vue + Webpack、React + Vite 和 React + Webpack，且 MUST NOT 根据目录名称推断框架或构建工具。（D-04；A-04）

#### Scenario: 识别受支持框架组合

- **WHEN** 项目依赖分别声明 Vue 2 与 Vite、Vue 与 Webpack、React 与 Vite 或 React 与 Webpack
- **THEN** 检查结果分别返回 `vue2-vite`、`vue-webpack`、`react-vite` 或 `react-webpack`

#### Scenario: 目录名与依赖冲突

- **WHEN** 目标目录名称包含某框架名称但 `package.json` 没有对应依赖
- **THEN** 系统忽略目录名称并只按真实文件和依赖返回识别结果

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
