# Frontend AI Workflow 开发规则

本文件适用于整个仓库。修改插件时优先保持向后兼容、可预览、可重复执行和不覆盖业务项目内容。

## AI 代码注释规则

- 禁止在本项目任何文件中新增 `AI-code-start`、AI 生成行数统计或同类工具来源标记。
- 新增和修改代码不得写入上述计数注释；只在确有维护价值时添加必要的中文说明注释。
- 提交前运行仓库验证，确保同类计数注释没有重新进入项目。

## 结构职责

- `.agents/plugins/marketplace.json`：团队 marketplace 入口。
- `plugins/frontend-ai-workflow/.codex-plugin/plugin.json`：插件 manifest。
- `plugins/frontend-ai-workflow/skills`：Codex 可复用工作流。
- `plugins/frontend-ai-workflow/scripts`：确定性的识别、初始化、检查和升级逻辑。
- `plugins/frontend-ai-workflow/runtime`：随插件发布的固定版本 OpenSpec 运行时。
- `plugins/frontend-ai-workflow/assets/templates`：写入目标仓库的模板。
- `plugins/frontend-ai-workflow/references`：技能按需读取的规则说明。
- `tests`：Node.js 端到端测试。

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

- 修改 `.github/workflows/`、文件路径、临时目录、子进程、包管理器入口、环境变量或机器可读诊断时，必须在需求、设计或任务中标记“跨平台高风险”，并写明命中的风险项和受影响平台。
- 跨平台高风险变更先阅读 `plugins/frontend-ai-workflow/references/cross-platform-ci-checklist.md`，只选择与本次影响链对应的检查，但不得省略路径、子进程、临时目录或结构化输出中已经命中的风险。
- 机器可读输出优先断言稳定的 `code`、`target`、`status` 等字段；完整中文文案和平台路径只能作为辅助诊断。路径比较必须先规范化，或显式覆盖 `/` 与 `\`。
- Windows 不直接启动 `.cmd` 包装器；优先使用当前 Node 执行可追溯的 JavaScript CLI 入口。仓库内临时 fixture 必须隔离父 Git 向上发现，并覆盖成功与失败清理。
- 本地聚焦测试、统一验证和真实 CI 矩阵是三类独立证据。仓库声明的 Linux x64/ARM64、Windows x64、macOS Intel/ARM64 没有全部成功前，不得把跨平台发布证据标为通过。
- Actions 失败后必须把根因、失败平台、稳定复现条件和新增回归定位写入当前变更的验证记录；同类问题再次出现时先检查既有回归是否覆盖了真实差异，不只修改表面错误文案。

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
