## Purpose

为项目检查和 AI 分析提供不依赖框架白名单的完整直接依赖事实，使未知框架、私有包和普通第三方依赖都可追溯，同时阻止依赖声明被夸大为运行时、安全或兼容性结论。

## ADDED Requirements

### Requirement: 系统必须动态收集完整直接依赖事实

系统 SHALL 从目标根 `package.json` 的 `dependencies`、`devDependencies`、`peerDependencies` 和 `optionalDependencies` 动态生成版本化 `dependencyProfile`。画像 SHALL 保存唯一包总数、各分组有效条目数，以及按包名稳定排序的完整包清单；每个包 SHALL 保存其全部来源分组和对应原始版本声明，不得由固定技术包名单决定是否纳入。（D-01～D-03；A-01）

#### Scenario: 收集未知框架和私有包

- **WHEN** 根 package 声明插件未预置的框架、普通第三方包或作用域私有包
- **THEN** `dependencyProfile` SHALL 返回每个合法直接依赖的包名、原始版本声明和来源分组
- **AND** 结果 SHALL NOT 因包未命中 preset 或平台画像规则而省略它

#### Scenario: 同一包跨分组声明不同版本

- **WHEN** 同一包出现在两个或以上依赖分组且版本声明不同
- **THEN** 完整清单 SHALL 只包含一个包条目，并 SHALL 在固定分组顺序中保留每组原始声明
- **AND** 唯一包总数与各分组条目数 SHALL 分别反映去重和原始声明语义

#### Scenario: 重复收集相同 package

- **WHEN** 在相同 `package.json` 内容上跨平台或重复执行项目识别
- **THEN** schema 版本、来源、计数、包顺序、声明顺序和诊断顺序 SHALL 保持一致，且结果 SHALL NOT 包含工作区绝对路径

### Requirement: 空值和非法依赖声明必须可审计

系统 SHALL 把缺失依赖分组视为合法空值，并 SHALL 为显式非法分组、包名或非空字符串以外的版本声明输出稳定的 `code`、`status` 和 `target` 诊断。无效条目 SHALL 被排除，不得强制字符串化为可信事实；根 `package.json` 无法解析时 SHALL 沿用整体失败语义。（D-03、D-07；A-01）

#### Scenario: 项目没有直接依赖

- **WHEN** 四类依赖分组均缺失或均为空对象
- **THEN** 系统 SHALL 返回零总数、零分组计数、空包清单、空诊断和明确的未声明直接依赖摘要
- **AND** 系统 SHALL NOT 根据项目名、目录名或普通源码文件猜测框架

#### Scenario: 分组类型不合法

- **WHEN** package 显式把任一依赖分组声明为数组、字符串、数字或空值
- **THEN** 系统 SHALL 忽略该分组并返回定位到分组名的稳定非法分组诊断
- **AND** 其他合法分组 SHALL 继续形成可用事实

#### Scenario: 包名或版本声明不合法

- **WHEN** 依赖对象包含不安全包名、空版本或非字符串版本
- **THEN** 系统 SHALL 排除对应声明并返回定位到分组与包名的稳定诊断
- **AND** 人类摘要 SHALL NOT 渲染该无效内容

### Requirement: 人类摘要不得损失完整机器事实

系统 SHALL 从 `dependencyProfile` 生成确定性的直接依赖摘要。摘要 MAY 使用固定展示上限控制受管文档长度，但 SHALL 明确总数、展示数、遗漏数和完整事实来源；完整 `packages` 清单 SHALL 不受展示上限影响。（D-03、D-04、D-12；A-01、A-02）

#### Scenario: 依赖数量不超过展示上限

- **WHEN** 合法唯一直接依赖数量未超过展示上限
- **THEN** 摘要 SHALL 按稳定包名顺序显示全部包及声明，并报告零遗漏

#### Scenario: 依赖数量超过展示上限

- **WHEN** 合法唯一直接依赖数量超过展示上限
- **THEN** 摘要 SHALL 只渲染固定数量的有序条目并准确报告剩余数量
- **AND** `dependencyProfile.packages` SHALL 继续包含全部合法条目，供 AI 或调用方读取

### Requirement: 共享工作流入口必须消费同一依赖画像

项目检查、初始化、显式升级和受管上下文 SHALL 使用同一次项目识别生成的 `dependencyProfile` 与摘要。普通初始化 SHALL 保持只读，显式写入 SHALL 只更新合法受管区块并保留项目自定义内容。（D-03、D-04、D-08、D-11；A-02、A-05）

#### Scenario: 初始化未知框架项目

- **WHEN** 用户对包含未预置直接依赖的安全项目执行初始化预览或显式写入
- **THEN** 识别结果及 AGENTS、Wayfinder、OpenSpec 上下文 SHALL 表达同一依赖总数、动态摘要和完整性边界
- **AND** 预览 SHALL NOT 修改项目，显式写入 SHALL NOT 安装或执行依赖

#### Scenario: 修改依赖后显式升级

- **WHEN** 已初始化项目修改根 package 依赖并执行升级预览或显式升级
- **THEN** 预览 SHALL 报告真实受管漂移，写入 SHALL 只刷新受管依赖事实并保留标记外内容
- **AND** 在相同快照上重复升级 SHALL 保持幂等

### Requirement: 依赖采集必须保持只读和有界

动态依赖画像 SHALL 只读取目标根 `package.json`，不得联网、查询 registry、读取或执行 `node_modules`、安装或升级依赖、解析传递依赖或扫描 workspace 子包。系统 SHALL 明确直接声明不能证明依赖已安装、正在使用、安全或兼容。（D-02、D-08、D-09、D-12；A-05、A-06）

#### Scenario: 项目存在 node_modules 和 workspace 声明

- **WHEN** 根项目同时存在 `node_modules`、lockfile、workspace 配置和子包 package
- **THEN** 本阶段画像 SHALL 只反映根 package 的四类直接声明
- **AND** 结果与移除 `node_modules` 内容后的结果 SHALL 相同，且 SHALL 明确 Monorepo、传递依赖和运行时状态未覆盖

