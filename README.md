# Frontend AI Workflow

Frontend AI Workflow 是一套可复用的 Codex 前端交付插件。它把日常实施收敛为轻量 Delivery Core，把真正复杂的工程变更交给内置 OpenSpec，并将测试、UI 验收、项目初始化和健康检查保持为显式专项能力。

## 能力概览

### 日常交付

`frontend-delivery` 只在用户明确要求修改或实现前端代码时触发。它先建立最多 4 KB 的项目上下文，再按风险选择执行深度：

- Direct：目标明确、局部行为清晰，直接实施并做最低充分验证。
- Light：影响链可界定，先在会话内保留 3～7 步 Execution Brief，再实施。
- Complex：涉及架构、鉴权、安全、持久化、公共契约、依赖、构建、部署、CI、平台或影响无法界定时，创建一个 OpenSpec change。

Direct 和 Light 不写 `requirements/`、`openspec/changes/`、`.workflow-history/` 或证据文件。Complex 只使用 `workflow-cli.mjs` 的四个公共命令：

```bash
node plugins/frontend-ai-workflow/scripts/workflow-cli.mjs create --target <repository> --change <name>
node plugins/frontend-ai-workflow/scripts/workflow-cli.mjs status --target <repository> --change <name>
node plugins/frontend-ai-workflow/scripts/workflow-cli.mjs validate --target <repository> --change <name>
node plugins/frontend-ai-workflow/scripts/workflow-cli.mjs complete --target <repository> --change <name>
```

`create` 和 `complete` 默认只预览；需要写入时显式追加 `--write`。完成后同步正式规格、删除活动 change，并只向 `.workflow-history/<year>.jsonl` 追加紧凑 schema v2 事件。

验证深度与规划深度独立选择：None、Focused、Targeted UI 或 Full UI。Outcome Gate 必须逐项对照用户原始目标和可观察结果；同类失败最多修复两轮，第三次停止并报告根因。

### 七个公开 Skill

| Skill | 用途 | 写入边界 |
| --- | --- | --- |
| `frontend-delivery` | 明确的前端实施请求 | Direct/Light 不写管理资产；Complex 只写单个 OpenSpec change |
| `frontend-test` | 测试覆盖分析、测试计划，以及用户明确要求后的测试实现 | 复用项目原生测试设施，不安装依赖 |
| `frontend-ui-review` | 页面 UI 验收、复杂视觉审查和可复现报告 | 不修改业务源码 |
| `frontend-ui-verify` | 使用既有 UI Review 基线复验修复结果 | 不切换捕获方式，不修改业务源码 |
| `frontend-workflow-bootstrap` | 首次接入或显式深度项目分析 | 默认预览，只有 `--write` 写受管文件 |
| `frontend-workflow-check` | 只读检查工作流、命令、导航和运行时健康 | 永不修复或初始化 |
| `frontend-workflow-upgrade` | 插件更新后同步受管区块 | 只替换成对标记之间的内容 |

解释、分析、评审、状态查询和只写计划的请求不会触发日常交付 Skill。

## 初始化、升级与检查

普通初始化只创建五个必要文件：

- `AGENTS.md`
- `wayfinder/frontend.md`
- `openspec/config.yaml`
- `.frontend-workflow.json`
- `.gitignore` 中的受管忽略区块

```bash
node plugins/frontend-ai-workflow/scripts/bootstrap-project.mjs --target <repository>
node plugins/frontend-ai-workflow/scripts/bootstrap-project.mjs --target <repository> --write
node plugins/frontend-ai-workflow/scripts/update-project.mjs --target <repository>
node plugins/frontend-ai-workflow/scripts/update-project.mjs --target <repository> --write
node plugins/frontend-ai-workflow/scripts/check-project.mjs --target <repository> --summary
```

初始化和升级不会创建需求台账，不覆盖无受管标记的同名文件，也不安装项目依赖。升级只替换 `frontend-ai-workflow:start/end` 区块并保留项目自定义内容。显式深度初始化会建立安全范围、逐文件阅读账本和 Wayfinder 项目地图；文件清单本身不算架构结论。

当前版本只支持 schema v2。若检查返回 `retired_workflow_state`，插件只报告退役路径，不读取、迁移或删除旧格式；请使用与该项目匹配的历史插件版本处理，或在确认内容不再需要后由用户显式清理。

## 项目识别与运行时

插件从真实文件和根 `package.json` 识别包管理器、直接依赖、开发/构建/测试/lint/类型检查命令、终端形态与平台候选。识别到命令不代表已经执行；依赖声明也不证明安装、使用、安全或兼容。

插件固定内置：

- OpenSpec 1.9.0
- Playwright 1.62.1
- Vitest 3.2.4 仓库验证运行时
- Node.js 最低版本 20.19.0

OpenSpec 必须通过插件内置入口执行，不依赖系统全局安装。Playwright 支持 `darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64` 和 `win32-x64` 五个平台成品；源码仓库不跟踪生成的平台二进制。

## 安装

```bash
codex plugin marketplace add /absolute/path/to/frontend-ai-workflow
codex plugin add frontend-ai-workflow@frontend-ai-workflow
```

安装或更新后，新建 Codex 任务以加载最新 Skill。开发中更新本地插件时，按插件创建器提供的缓存刷新与重装流程执行；仓库脚本不会自动修改用户插件安装状态。

## 仓库结构与职责

| 路径 | 职责 |
| --- | --- |
| `README.md` | 能力、使用方式、仓库导航和版本策略的唯一入口 |
| `AGENTS.md` | AI 与维护执行约束，不重复维护能力说明 |
| `package.json` | 仓库版本和受支持的验证、基准入口 |
| `LICENSE`、`THIRD_PARTY_NOTICES.md` | 仓库许可证与第三方声明 |
| `.gitignore`、`.gitattributes` | 运行物忽略策略和 Git 属性 |
| `.frontend-workflow.json` | 当前仓库的工作流 schema 与受管版本配置 |
| `.agents/` | 本地 marketplace 声明；不承载业务实现 |
| `.agents/plugins/marketplace.json` | 本地 marketplace 入口，不承载业务实现 |
| `.github/` | Shared、五平台 Native、手动 Release Install 三层 CI |
| `plugins/frontend-ai-workflow/.codex-plugin/plugin.json` | 发布 manifest 和公开能力声明 |
| `plugins/frontend-ai-workflow/` | 插件源码、模板、参考资料和固定运行时的发布根目录 |
| `plugins/frontend-ai-workflow/skills/` | 七个公开 Skill |
| `plugins/frontend-ai-workflow/scripts/` | 插件运行逻辑、CLI、生命周期、检查与打包 |
| `plugins/frontend-ai-workflow/assets/templates/` | 初始化受管模板 |
| `plugins/frontend-ai-workflow/references/` | 专项 Skill 和稳定诊断按需读取的参考资料 |
| `plugins/frontend-ai-workflow/runtime/` | 固定 OpenSpec 与共享 Playwright 运行时 |
| `openspec/specs/` | 当前正式合同 |
| `openspec/changes/` | 仅 Complex 使用的活动变更；完成后删除 |
| `.workflow-history/` | schema v2 紧凑年度完成事件 |
| `tests/` | 长期确定性回归测试 |
| `scripts/` | 仓库级测试运行时、静态检查、官方校验和统一验证编排 |
| `.github/workflows/` | Shared、五平台 Native、手动 Release Install 三层 CI |
| `.frontend-ai-workflow/` | 被忽略的 runs、cache 和 transactions |
| `design/` | 可复现的持久设计输入 |
| `requirements/` | 退役路径；当前架构不得重新创建需求台账 |
| `dist/` | 被忽略的本地单平台成品，不进入规范源码 |

`outputs/`、永久 OpenSpec archive、`requirements/`、生命周期 evidence sidecar 和受跟踪的平台成品均为退役路径，仓库门禁会拒绝它们。

## 开发与验证

常用命令：

```bash
npm test
npm run test:repository
npm run test:workflow
npm run test:platform
npm run check:static
npm run validate
npm run validate:official
npm run verify
npm run verify:shared
npm run verify:platform
npm run footprint
```

`npm run validate` 检查插件结构、文档引用、运行时和体积预算；`npm run validate:official` 使用 Codex 官方 Skill/Plugin validators；`npm run verify` 是本地完整门禁。GitHub Actions 将平台无关验证只运行一次，再在五个原生 runner 上验证平台合同、单平台 marketplace 完整性和真实 Chromium smoke。真实安装 smoke 仅由手动触发，并使用固定 Codex CLI；普通 push 和 pull request 不安装 Codex CLI。CI 临时报告保留 14 天，不写回生命周期或仓库历史。

跨平台高风险改动必须先阅读 `plugins/frontend-ai-workflow/references/cross-platform-ci-checklist.md`。本地聚焦测试、完整验证和真实五平台 CI 是独立结论；本地通过不能替代五平台发布状态。

## 版本策略

插件版本当前为 0.19.0。发布 manifest、初始化模板、Wayfinder 元数据和仓库结构校验必须保持一致。固定运行时升级需要同时更新版本常量、锁定输入、完整性清单、正式规格、回归测试和五平台 CI；不能只修改 manifest。

仓库只维护当前 schema v2 单轨实现，不增加旧格式解析、迁移命令、兼容路由或历史资产目录。需要改变体积预算、运行时版本或公共合同，必须先建立 Complex 变更和可复现回归依据。

## 效果基准

`npm run benchmark:developer-effectiveness --` 提供 Direct/Light/Complex 的合成配对基准；`npm run effectiveness:real-evidence --` 只转换用户显式提供的匿名真实研究输入。两者默认预览，输出只进入 `.frontend-ai-workflow/runs/`，不会被普通测试、验证或 CI 自动执行。小样本结果只描述冻结任务，不外推团队生产率或个人绩效。

当前轻量交付架构只声明结构与功能合同，不声明相对旧版降低 Token、耗时、费用或整体生产率。相关效果验证已延期；重新启动时必须重新冻结候选、主对照、CLI、模型、任务、验收器和预算，历史探索样本不得直接计入新结论。

## 边界

- 仅使用 Node.js 标准库实现仓库自有运行逻辑，固定运行时除外。
- 默认不提交、不推送、不发布、不部署，也不安装业务项目依赖。
- 不从目录名、包名或一次测试成功推断完整架构、兼容性或交付完成。
- UI Review 的 Browser 视觉检查只在声明的不确定兜底中使用；复验必须保持同一基线和捕获方式。
- 当前 fixture 重点覆盖 Vue 3 + Vite；其他已识别框架仍需依赖各项目真实命令和适用平台验证。
