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

## 验证

- 运行 `npm test`。
- 运行 `npm run validate`。
- 使用官方 skill validator 检查所有自定义技能。
- 使用官方 plugin validator 检查插件 manifest。
- 至少在一个 Vue 3 + Vite fixture 上验证初始化、重复执行、升级和检查。
- 完成时说明未覆盖的框架和外部依赖。
