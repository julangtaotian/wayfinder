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
- 历史与验收资产：`requirements`、`openspec`、`outputs`、`.frontend-ui-review`；按当前需求、变更或验收目标读取。

## AI 读取路由

- 普通功能、修复和检查先在日常源码范围内定位；优先使用精确文件名和限定目录搜索。
- 除非任务明确涉及运行时、平台打包、视觉证据或历史规划，不递归枚举 `runtime/**/node_modules`、被忽略的单平台成品、`outputs`、`.frontend-ui-review/runs` 和 `openspec/changes/archive`。
- 项目健康检查先使用精简模式；只有计数和用户问题需要具体目标时才按诊断 code 查询，完整结果作为必要事实缺失时的兜底。

## 持续体积治理

- 已验收需求的完整正文位于 `requirements/archive/<year>/`；根 `REQ-*.md` 是轻量入口，`requirements/index.json` 是稳定目录。日常检查不得展开归档正文，只有显式历史审计才读取。
- 完成流程负责自动生成根存根并刷新索引；恢复执行必须幂等，不得生成第二份正文。
- 每次仓库统一验证必须执行确定性体积门禁，覆盖退役路径、受跟踪 outputs、活跃全文需求和日常大文件预算。
- 预算是规划合同。需要调整时必须先建立需求、设计与回归证据，禁止按当前仓库体积静默放宽，也不再依赖定期人工瘦身。

## 实现约束

- 仅使用 Node.js 标准库，除非新增依赖具有明确且必要的价值。
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

- 本地验证产生的日志、截图、临时 fixture、下载内容、缓存和仅用于验证的依赖必须写入仓库 `outputs/<验证主题>/`，不得散落在项目根目录或系统临时目录。
- 仓库级 Vitest 验证运行时固定使用 `outputs/frontend-test-runtime/`；需要真实 Vitest 证据时先运行 `npm run prepare:test-runtime`，验证结束后运行 `npm run cleanup:test-runtime`，不在根目录保留 `node_modules`。
- `outputs` 内已有的持久设计与验收资产属于项目内容，禁止为了清理临时验证环境而整体删除；只清理本次验证明确创建的子目录。
- 运行 `npm test`。
- 运行 `npm run validate`。
- 使用官方 skill validator 检查所有自定义技能。
- 使用官方 plugin validator 检查插件 manifest。
- 至少在一个 Vue 3 + Vite fixture 上验证初始化、重复执行、升级和检查。
- 完成时说明未覆盖的框架和外部依赖。
