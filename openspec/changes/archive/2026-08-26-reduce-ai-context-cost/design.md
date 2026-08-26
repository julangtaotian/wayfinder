## Context

`checkProject()` 返回的完整事实仍有兼容价值，但 CLI 当前只有一种全量 JSON 形态。历史证据诊断会随需求数量持续增长，静态观察也可能在大型项目中形成长数组。Skill 无法在第一次调用时区分当前状态和需要展开的历史目标。

本变更命中机器可读诊断与 CLI 参数风险；实现只使用 Node.js 标准库，新增模式不修改项目，不执行项目命令，测试优先断言稳定字段和退出状态。

## Goals / Non-Goals

**Goals:**

- 为普通 AI 检查提供有界、可追溯的精简结果。
- 为单类历史问题提供无需全量输出的精确查询。
- 保持现有完整 CLI 和导出函数兼容。
- 让 AI 默认避开与当前任务无关的大体积运行时、输出和归档。

**Non-Goals:**

- 不删除历史诊断或改变其分类与信任边界。
- 不改变项目检查的读取范围、错误判定和退出码。
- 不迁移蓝湖证据或五平台浏览器资产。

## Decisions

### 1. 输出格式化与项目检查事实分离

新增 `check-project-output.mjs`，只把完整 `checkProject()` 结果投影为精简或诊断查询结果。检查事实、历史审计和错误判定继续由原模块产生，避免两套检查逻辑漂移。（D-02～D-04；A-02～A-04）

### 2. 精简模式保留完整依赖画像

`dependencyProfile.packages` 是根直接依赖的完整事实，不能为了节省输出而截断。精简模式只压缩可按需恢复的历史 diagnostics 和静态 observations：前者保留 counts，后者保留总数、按 code 计数、最多 5 项样例和遗漏数。（D-03；A-02）

### 3. 诊断查询使用稳定 code

`--diagnostic-code` 返回独立的 `mode=diagnostics` 结果，不要求调用方解析中文 warning。结果默认每页 20 项，支持显式 offset 和 1～100 的 limit，并返回 totalCount、nextOffset 与 remainingCount；未知 code 返回零 count、空 diagnostics 和排序后的 availableCodes，不自动回退到全量结果。（D-04、D-11；A-03）

### 4. 新模式保持显式且互斥

无参数仍输出完整结果。`--summary` 与 `--diagnostic-code` 同时出现时在调用 `checkProject()` 前失败，防止调用方误解结果形状，也证明参数错误没有读取或写入目标项目。（D-02、D-11；A-04）

### 5. Skill 与仓库规则采用渐进读取

Skill 首次调用固定使用 `--summary`，只有 counts 中目标 code 非零且用户问题需要精确路径时才运行 `--diagnostic-code`。根 AGENTS 只保留强约束、目录职责、读取路由和验证入口，详细跨平台规则仍由 checklist 按触发条件读取。（D-05、D-06；A-05）

### 6. 单平台安装与源码仓库解耦

源码仓库继续保存五个平台规范源；本机安装通过现有确定性打包入口生成当前平台 marketplace，只把当前平台浏览器复制到安装缓存。版本使用官方 cachebuster helper 刷新，避免同时加载源码全平台副本和旧版成品。（D-07、D-08、D-10；A-07、A-08）

## Risks / Trade-offs

- 精简模式可能隐藏需要处理的具体历史路径。→ counts 始终可见，并提供按 code 查询和完整兼容入口。
- 输出新增 mode 可能被误当成完整结果。→ Skill 明确分支；模式使用稳定 schema 和测试覆盖。
- 观察样例只保留前 5 项。→ 同时返回 total、codeCounts 和 omitted，完整模式仍可读取全部。
- 本地平台成品需要重新生成才能看到源码更新。→ 更新流程固定为验证、cachebuster、打包、安装和新任务加载。
- 真实跨平台行为不能由本机证明。→ 本地只记录聚焦和统一验证，五平台矩阵保持待执行。

## Migration Plan

1. 先增加格式化模块和专用测试，不改变无参数 CLI。
2. 接入新参数并扩展参数安全测试。
3. 更新 Skill、AGENTS、README 与版本。
4. 运行聚焦、全量、结构、OpenSpec 和官方 validators。
5. 生成当前平台成品并安装；新任务验证技能加载。回滚时卸载成品并恢复旧版本文件即可。
