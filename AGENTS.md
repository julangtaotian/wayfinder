# Frontend AI Workflow 开发规则

本文件适用于整个仓库。修改插件时优先保持向后兼容、可预览、可重复执行和不覆盖业务项目内容。

## AI 代码注释规则

- 禁止在本项目任何文件中新增 `AI-code-start`、AI 生成行数统计或同类工具来源标记。
- 新增和修改代码不得写入上述计数注释；只在确有维护价值时添加必要的中文说明注释。
- 提交前运行仓库验证，确保同类计数注释没有重新进入项目。

## 结构职责

- 根 `README.md` 是能力、使用方式和仓库导航的唯一入口；本文件只保留 AI 与维护执行约束。完整路径职责、生命周期和必要性以 README 的“仓库结构与职责”为准。
- marketplace 与 manifest：`.agents/plugins/marketplace.json` 只声明本地插件入口，`plugins/frontend-ai-workflow/.codex-plugin/plugin.json` 是发布 manifest；两者不得承载业务实现。
- 日常插件源码：`plugins/frontend-ai-workflow/scripts`、`skills`、`assets/templates` 和 `references`；根 `scripts` 只负责编排仓库级测试运行时、官方校验、静态检查和统一验证。
- 固定运行时：`plugins/frontend-ai-workflow/runtime`；只在运行时、完整性或平台发布任务中读取，不把生成的平台二进制回写规范源码。
- 生命周期与规划资产：只有 Complex 变更写入 `openspec/changes`，正式合同位于 `openspec/specs`，完成状态由 `.workflow-history` 的 schema v2 紧凑事件投影；Direct 与 Light 不创建管理资产。
- 持久设计输入位于 `design`，长期测试位于 `tests`，跨平台 CI 位于 `.github/workflows`；项目级 `.frontend-ui-review` 只有在受跟踪页面与设计事实可复现时才保留。
- 本地运行、缓存和事务只进入 `.frontend-ai-workflow`，单平台成品只进入被忽略的 `dist`；`outputs`、生命周期证据 sidecar 和永久 OpenSpec 归档均已退役，仓库中不得重新创建。

## AI 读取路由

- 普通功能、修复和检查先在日常源码范围内定位；优先使用精确文件名和限定目录搜索。
- 除非任务明确涉及运行时、平台打包或视觉证据，不递归枚举 `runtime/**/node_modules`、被忽略的单平台成品、`.frontend-ai-workflow` 和 UI Review 运行目录；发现退役目录时直接按体积门禁处理，不把它们作为历史输入继续读取。
- 项目健康检查先使用精简模式；只有用户问题缺少必要事实时才读取完整结果，不恢复已退役的分页诊断参数。

## 持续体积治理

- schema v2 完成状态由 `.workflow-history/<year>.jsonl` 的追加事件投影；Complex 活动变更完成后清除，不再生成需求正文、OpenSpec 永久归档或根存根。
- 生命周期只支持 schema v2 单轨读写；不得恢复旧归档写入器、迁移命令、兼容路由或完成证据 sidecar。不兼容的旧仓库必须先使用对应旧版本工具处理，再进入当前流程。
- 每次仓库统一验证必须执行确定性生命周期与体积门禁，覆盖事件篡改、无事件删除、退役路径、受跟踪运行时、活跃全文需求和日常大文件预算。
- 预算是规划合同。需要调整时必须先建立需求、设计与回归证据，禁止按当前仓库体积静默放宽，也不再依赖定期人工瘦身。

## 实现约束

- 修复前先以“原始验收项、失败门禁、可观察症状”建立问题指纹。候选名、阶段名、研究名、修改层次或根因假设变化，不得把同一问题重新计为新问题。
- 同一问题指纹的失败尝试跨阶段累计；最多允许两轮有证据支持的修复，第三次仍出现同一症状时必须停止。只有确定性证据证明原失败机制已经改变，才能申请新的真实运行，不得靠改写提示、改名或放宽门禁重置次数。
- 开发中或实验性宿主能力不得作为发布或效果门禁的唯一证据；必须设置默认稳定链路对照，无法建立对照时直接记录为方法学阻断。
- 仅使用 Node.js 标准库，除非新增依赖具有明确且必要的价值。
- 仓库内代码、配置和文档不得包含开发机绝对路径；引用仓库内容使用相对路径，涉及跨平台路径时由代码统一规范化处理。
- Node.js 模块依赖使用静态、显式导入；只有确有运行时分支需求时才能动态加载，并补充必要的中文说明。
- 代码与文档以人类可读且符合语言、Markdown 规范为先；不得为消除检查提示而使用无意义转义、伪造链接或宽泛忽略标记。确认属于工具误报时，忽略范围必须最小并说明原因。
- 初始化默认只预览；只有显式 `--write` 才写入目标仓库。
- 不覆盖没有受管标记的现有文件。
- 升级只替换 `frontend-ai-workflow:start/end` 之间的内容。
- 所有目标路径先规范化，并拒绝根目录、用户主目录等危险范围。
- 项目识别依据真实文件和 `package.json`，不得只凭目录名推断。
- OpenSpec 必须通过插件内置运行时执行，不依赖或调用系统全局版本。
- 错误信息使用中文，命令参数和机器可读字段使用稳定英文。

## 跨平台 CI 防回归

- 修改 CI、路径、临时目录、子进程、包管理器入口、环境变量或机器可读诊断时，标记“跨平台高风险”，先阅读 `plugins/frontend-ai-workflow/references/cross-platform-ci-checklist.md`，并在需求、设计或任务中记录命中项、影响平台和回归定位。
- 机器断言优先使用稳定 `code`、`target`、`status` 和计数；跨来源路径比较必须双侧统一规范化，Windows 外平台样本显式使用 `path.win32`。
- Windows 不直接启动 `.cmd` 包装器；仓库内临时 fixture 隔离父 Git 并覆盖成功与失败清理。
- 聚焦测试、本地统一验证和真实五平台 CI 是独立证据；矩阵未全部成功前不得标记跨平台发布通过。

## 验证

- 本地验证日志、截图、fixture、下载内容和依赖统一写入 `.frontend-ai-workflow/runs/<主题>/<run-id>/`，可重建缓存写入 `cache/`，崩溃恢复写入 `transactions/`；三个目录整体忽略，不为每个主题新增过滤规则。
- 默认验证不产生长期受跟踪输出；完成后只保留正式规格与紧凑生命周期事件，外部 CI 结果不回写仓库。
- 仓库级 Vitest 验证运行时固定使用 `.frontend-ai-workflow/runs/frontend-test-runtime/`，缓存使用 `.frontend-ai-workflow/cache/frontend-test-cache/`；清理只作用于对应受管子目录。
- 退役路径、系统元数据、空目录和完成证据 sidecar 必须由仓库门禁拒绝；不得为保留它们新建 archive、backup、legacy 或 evidence 目录。
- 运行 `npm test`。
- 运行 `npm run validate`。
- 使用官方 skill validator 检查所有自定义技能。
- 使用官方 plugin validator 检查插件 manifest。
- 至少在一个 Vue 3 + Vite fixture 上验证初始化、重复执行、升级和检查。
- 完成时说明未覆盖的框架和外部依赖。
