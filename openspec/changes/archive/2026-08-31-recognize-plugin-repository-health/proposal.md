## Why

健康检查目前只理解 Wayfinder、旧工作流和未初始化业务项目。当前仓库是由本地 marketplace 和插件 manifest 定义的插件仓库，却被误报为缺少业务工作流文件与受管标记，导致维护者和 AI 无法从一次轻量检查获得真实仓库状态。（D-01、D-02；A-01）

现在需要以受控的本地结构签名识别插件仓库，在不把完整发布校验塞入日常检查、不放宽普通业务项目检查的前提下，消除误报并让配置问题可定位。（D-05、D-06、D-07、D-08；A-02、A-03、A-04、A-05）

## What Changes

- 新增只读插件仓库识别：以根 marketplace 的本地条目和仓库内插件 manifest 为共同签名，安全解析每个插件路径。
- 健康检查新增插件仓库类别和状态事实；已识别插件仓库不再被要求满足 Wayfinder、业务受管标记或业务构建/lint/类型检查脚本。
- 对损坏 marketplace、空本地条目、越界或符号链接路径、缺少或损坏 manifest、名称不一致和必要目录缺失失败关闭，并提供稳定机器诊断。
- 保持 `layout`、完整结果、summary、诊断查询和非插件项目语义兼容；普通检查保持只读、有界，不扫描运行时或执行完整校验。
- 增加专用回归、跨平台路径样本、健康检查 Skill 指引和插件结构清单，确保发布时不会遗漏新识别器。

## Capabilities

### New Capabilities

- `plugin-repository-health`: 定义本地插件仓库的识别签名、健康结果、路径安全与失败关闭合同。

### Modified Capabilities

- `ai-context-efficiency`: 精简健康检查结果增加有界的插件仓库事实，同时保持既有输出与渐进读取兼容。

## Impact

- 主要代码：`plugins/frontend-ai-workflow/scripts/check-project.mjs`、`check-project-output.mjs`、项目路径安全模块与新增插件仓库识别模块。
- 技能与发布完整性：`plugins/frontend-ai-workflow/skills/frontend-workflow-check/SKILL.md`、`validate-structure.mjs`。
- 测试：新增 `tests/plugin-repository-health.test.mjs`，并复核既有健康检查、输出和 CLI 参数安全测试。
- 兼容性：新增可选机器字段，不改变既有 `layout` 的语义；Wayfinder、旧工作流和未初始化业务项目保持原行为。
- 依赖与外部系统：只使用 Node.js 标准库；不新增依赖、网络访问、CI 触发、缓存、权限或定时任务。
