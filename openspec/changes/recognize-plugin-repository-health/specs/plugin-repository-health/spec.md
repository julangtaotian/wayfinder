## Purpose

为本地插件 marketplace 仓库提供只读、失败关闭且可定位的健康识别，使其不被业务工作流规则误报，同时不扩大日常检查的读取和执行成本。

## ADDED Requirements

### Requirement: 健康检查必须识别有效本地插件仓库

系统 SHALL 将根目录存在 `.agents/plugins/marketplace.json`、且至少一个 `source.source` 为 `local` 的条目安全对应到仓库内 `.codex-plugin/plugin.json` 的目标识别为插件仓库。检查结果 SHALL 返回 `repositoryKind: "plugin-repository"` 和 `pluginRepository`，其中包含整体状态、marketplace 相对路径、已识别插件的名称、相对路径、manifest 版本与状态。该类别 SHALL 保持 `layout` 的原有语义不变，并且不要求 Wayfinder、业务受管标记、构建、lint 或类型检查脚本。（D-01、D-02、D-03、D-04；A-01、A-02）

#### Scenario: 当前插件仓库通过健康检查

- **WHEN** 调用方对具有有效本地 marketplace 条目与匹配 manifest 的仓库执行完整或 `--summary` 健康检查
- **THEN** 结果 SHALL 报告 `repositoryKind: "plugin-repository"`，并以插件仓库规则给出成功结论
- **AND** 结果 SHALL NOT 因缺少 Wayfinder、业务受管标记、构建、lint 或类型检查脚本而产生错误或警告

#### Scenario: 插件仓库包含多个本地条目

- **WHEN** 有效 marketplace 包含多个本地插件条目
- **THEN** 健康检查 SHALL 分别核对每个条目，并在完整结果中保留全部插件事实
- **AND** summary SHALL 返回稳定总数、状态计数和有界样例，不得因条目数量扩大为无界输出

### Requirement: 插件配置与路径必须失败关闭并可定位

系统 SHALL 只接受仓库内、项目相对、正斜杠表示且不经符号链接的本地插件路径。marketplace JSON 损坏、没有本地插件条目、非法或越界路径、符号链接、缺少或损坏 manifest、条目名称与 manifest 名称不一致、manifest 缺少名称/版本/技能目录或技能目录不存在时，系统 MUST 返回 `ok=false` 与非零 CLI 状态。`pluginRepository.diagnostics` MUST 使用稳定英文 `code`、`status`、`target`，并保留中文人类说明。（D-02、D-06、D-10；A-03）

#### Scenario: marketplace 或 manifest 损坏

- **WHEN** marketplace 或任一被引用 manifest 无法解析为有效 JSON
- **THEN** 健康检查 SHALL 以稳定诊断报告对应相对目标并失败关闭
- **AND** 系统 SHALL NOT 以 Wayfinder 初始化、自动修复或成功降级替代该失败

#### Scenario: 本地插件路径不安全或不一致

- **WHEN** 本地 source.path 越出仓库、包含禁止路径段、经过符号链接、缺少 manifest，或条目名称与 manifest 名称不一致
- **THEN** 健康检查 SHALL 返回稳定的 `code`、`status`、`target` 和非零状态
- **AND** 系统 SHALL 使用同一规范化规则处理 POSIX 与 Windows 外平台路径样本

### Requirement: 插件仓库健康检查必须保持只读和有界

插件仓库健康检查 SHALL 只读取根 package、marketplace、被引用 manifest 及其必要目录元数据。它 SHALL 继续执行已有只读规划引擎、活动变更和需求证据审计，但 MUST NOT 扫描 `runtime/**`、`outputs` 或归档正文，也 MUST NOT 运行测试、打包、浏览器、安装或网络下载。根级 `test` 与 `validate` 命令 SHALL 作为插件仓库命令事实呈现；缺失时只给出非阻断提醒，不得虚构命令。（D-04、D-05、D-08；A-01、A-02、A-05）

#### Scenario: 重复检查有效插件仓库

- **WHEN** 调用方连续两次检查同一有效插件仓库，或在两次之间修改 marketplace 或 manifest
- **THEN** 每次结果 SHALL 只反映当前文件状态且不得写入任何目标文件
- **AND** 修改后的有效或失配状态 SHALL 在下一次检查中直接反映，不依赖缓存、运行时扫描或网络访问

### Requirement: 非插件项目必须保持既有健康检查语义

当目标没有插件 marketplace，或没有形成完整插件仓库签名时，系统 SHALL 保持 Wayfinder、旧工作流和未初始化业务项目的既有布局识别、错误与迁移提示。单独存在 `.codex-plugin` 目录、目录名或其他局部文件 SHALL NOT 使目标获得插件仓库豁免。（D-07；A-04）

#### Scenario: Wayfinder 项目不受插件识别影响

- **WHEN** 已初始化 Wayfinder 项目执行健康检查且不具备完整插件仓库签名
- **THEN** 系统 SHALL 保持其原有 `layout`、工作流检查和迁移语义
- **AND** 系统 SHALL NOT 增加插件仓库字段或豁免既有工作流要求
