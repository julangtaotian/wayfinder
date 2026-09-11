# Frontend AI Workflow 开发规则

本文件适用于整个仓库。修改插件时优先保持向后兼容、可预览、可重复执行和不覆盖业务项目内容。

## AI 代码注释规则

- 禁止在本项目任何文件中新增 `AI-code-start`、AI 生成行数统计或同类工具来源标记。
- 新增和修改代码不得写入上述计数注释；只在确有维护价值时添加必要的中文说明注释。
- 提交前运行仓库验证，确保同类计数注释没有重新进入项目。

## 结构职责

- marketplace 与 manifest：`.agents/plugins/marketplace.json`、`plugins/frontend-ai-workflow/.codex-plugin/plugin.json`。
- 日常源码：`plugins/frontend-ai-workflow/scripts`、`skills`、`assets/templates`、`references` 和 `tests`。
- 固定运行时：`plugins/frontend-ai-workflow/runtime`；只在运行时、完整性或平台发布任务中读取。
- 生命周期与验收资产：活动内容位于 `requirements`、`openspec/changes`，正式合同位于 `openspec/specs`，持久设计输入位于 `design`；完成状态优先读取 `.workflow-history`，本地运行内容位于 `.frontend-ai-workflow`。

## AI 读取路由

- 普通功能、修复和检查先在日常源码范围内定位；优先使用精确文件名和限定目录搜索。
- 除非任务明确涉及运行时、平台打包、视觉证据或存量迁移，不递归枚举 `runtime/**/node_modules`、被忽略的单平台成品、`.frontend-ai-workflow`、`outputs`、`.frontend-ui-review/runs` 和旧 `openspec/changes/archive`。
- 项目健康检查先使用精简模式；只有计数和用户问题需要具体目标时才按诊断 code 查询，完整结果作为必要事实缺失时的兜底。

## 持续体积治理

- schema v2 完成状态由 `.workflow-history/<year>.jsonl` 的追加事件投影；活动需求保持到待验证，完成后与活动变更一并清除，不再生成需求正文归档、OpenSpec 永久归档或根存根。
- `legacy-readonly` 只用于迁移旧仓库；v2 写入器不得与旧归档流程混用。迁移必须先预览，引用、未知文件、符号链接或未跟踪目标存在时失败关闭。
- 每次仓库统一验证必须执行确定性生命周期与体积门禁，覆盖事件篡改、无事件删除、退役路径、受跟踪运行时、活跃全文需求和日常大文件预算。
- 预算是规划合同。需要调整时必须先建立需求、设计与回归证据，禁止按当前仓库体积静默放宽，也不再依赖定期人工瘦身。

## 实现约束

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
- 默认验证不产生长期 tracked outputs。高风险、发布或显式 strict 完成至多保留一个受预算约束的证据包；外部 CI 结果不回写仓库。
- 仓库级 Vitest 验证运行时固定使用 `.frontend-ai-workflow/runs/frontend-test-runtime/`，缓存使用 `.frontend-ai-workflow/cache/frontend-test-cache/`；清理只作用于对应受管子目录。
- 旧 `outputs`、`.frontend-ui-review/runs` 和归档资产只能通过 lifecycle migration 预览与显式写入处理，禁止直接整体删除或触碰未跟踪内容。
- 运行 `npm test`。
- 运行 `npm run validate`。
- 使用官方 skill validator 检查所有自定义技能。
- 使用官方 plugin validator 检查插件 manifest。
- 至少在一个 Vue 3 + Vite fixture 上验证初始化、重复执行、升级和检查。
- 完成时说明未覆盖的框架和外部依赖。
