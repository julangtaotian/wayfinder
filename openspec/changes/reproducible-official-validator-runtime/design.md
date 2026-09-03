## Context

动机和范围见 `proposal.md`，行为合同见 `specs/official-validator-runtime/spec.md`。

当前自定义结构校验已经稳定。真实 Creator validators 的重复阻碍来自 Python 环境：脚本会导入 `yaml`，系统 Python 缺少 PyYAML 时会在读取仓库内容前退出。历史验证已经证明，把 PyYAML 临时准备到 `outputs/` 并显式注入模块路径后，当前 Skill/Plugin Creator validators 可以真实执行。

本次只把这条已验证路径产品化为一个显式预检命令。当前 Creator validator 仍属于 Codex 开发环境的外部输入；仓库记录实际脚本摘要，但不复制、维护或再分发脚本。普通验证和 CI 不需要为低频元数据检查重复承担外部环境依赖。

本变更命中路径、临时目录、子进程、环境变量和机器可读诊断等跨平台高风险项。实现使用 Node.js 标准库、平台路径 API 和无 shell 子进程；真实 Creator validator 只证明实际运行平台，跨平台自动回归使用受控替身。

## Goals / Non-Goals

**Goals:**

- 用一个显式命令真实执行当前环境的全部 Skill 与 Plugin Creator validators。
- 首次按固定版本和摘要准备 PyYAML，后续复用有效缓存，避免重复安装。
- 清楚区分外部 validator 不可用、依赖不可用、启动失败和内容失败。
- 只清理本次临时运行时，缓存由独立命令管理，不触碰其他输出。
- 输出实际 validator、Python 和 PyYAML 身份，并保持结论边界诚实。

**Non-Goals:**

- 不把官方 validator 源码、许可证或快照清单提交进仓库。
- 不建设快照发现、差异预览、自动升级、原子替换或回滚系统。
- 不修改普通 `validate`、`verify`、CI 或五平台任务。
- 不承诺冷缓存离线可准备，也不建设五平台真实 Creator validator 矩阵。
- 不把本地预检称为最新上游规则、Skill 行为质量或公共目录最终审核。

## Decisions

### 1. 读取当前 Codex 环境中的 Creator validators

运行器从当前 Codex 开发环境解析 Skill Creator 和 Plugin Creator validator。默认解析只服务常见安装位置；测试和非标准安装可通过显式参数提供路径。路径不存在、文件不可读或目标集合为空时立即失败，不回退项目自写校验器。

每次执行记录不含开发机绝对路径的来源标识和脚本 SHA256，使结果能够说明“实际运行了哪份脚本”，但不把摘要解释为上游真实性或版本固定证明。仓库不复制外部脚本，因此也不需要建立快照许可与升级供应链。（D-01、D-02、D-06；A-01、A-03、A-05）

### 2. 使用有界 PyYAML 缓存

仓库锁定 PyYAML 精确版本和发布包摘要。缓存位于 `outputs/official-validator-cache/`，准备动作使用当前 Python 的模块安装能力和摘要校验，只写入该目录，不创建根 `node_modules`、Python venv 或用户级包。

流程先核验现有缓存：有效时直接复用；缺失或无效时才准备。首次准备可能需要访问依赖源，依赖不可取得或摘要不符时返回 `official_validator_dependency_unavailable`。暖缓存可以离线执行。缓存不随每次预检删除，独立清理命令只删除这一专属目录。（D-03、D-04、D-06；A-02、A-03）

### 3. 保持执行器最小化

新增一个 Node.js 运行器负责安全路径、目标发现、缓存核验、子进程执行、结果聚合和清理；只在确有必要时增加一个小型 Python 启动适配，用于把有界缓存加入当前进程模块搜索路径后执行外部原始 validator。

运行器不通过 shell 拼接命令。全部 Skill 以仓库相对路径稳定排序并各执行一次，Plugin validator 对插件根执行一次。Plugin validator 的内部遍历不能替代逐 Skill 结果。（D-01、D-08；A-01、A-03）

### 4. 临时运行时与持久缓存分离

单次运行产生的中间文件只进入 `outputs/official-validator-runtime/`。成功、内容失败、启动失败和异常出口都在 `finally` 中精确清理该目录，并保留其他 `outputs` 内容及有效缓存。

缓存清理必须显式执行，且只作用于 `outputs/official-validator-cache/`。实现对仓库根、用户主目录、越界目标和符号路径异常失败关闭。（D-04、D-08；A-02、A-03）

### 5. 使用四类稳定失败 code

包装层保持最少且足够的分类：

- `official_validator_unavailable`：外部 validator、Python 或必要目标不可用。
- `official_validator_dependency_unavailable`：缓存无效且固定依赖无法准备或核验。
- `official_validator_start_failed`：已解析的 validator 子进程未能真实启动或异常终止。
- `official_validator_validation_failed`：官方脚本已启动并对 Skill 或 Plugin 返回内容失败。

结果同时包含 `status`、`validator`、仓库相对 `target`、validator SHA256、Python/PyYAML 版本、真实退出码、stdout、stderr 和 Skill 计数。机器断言依赖稳定字段，不依赖平台绝对路径或外部脚本文案。（D-06、D-08；A-03、A-05）

### 6. 只提供显式预检入口

根 `package.json` 新增 `validate:official` 和独立缓存清理命令。普通 `npm run validate`、`npm run verify`、共享/平台作用域和 GitHub Actions 保持不变。

README 把建议触发条件限定为 Skill 或插件元数据变化以及发布前预检。仓库根 `AGENTS.md` 已要求完成相关工作时使用官方 validators，不需要再在每次普通提交的六个任务中重复执行。（D-05、D-07；A-04、A-05）

### 7. 聚焦测试替代外部环境矩阵

新建 `tests/official-validator-preflight.test.mjs`。测试注入受控 validator、Python/依赖准备结果与 POSIX/Windows 路径样本，验证目标稳定排序、缓存首次准备与复用、四类失败、真实退出状态、输出保留和精确清理。

同一测试还静态确认普通 `validate`、`verify` 和 CI 配置未接入真实官方预检，开发缓存与外部脚本不属于插件发布目录。一次当前 Codex 环境真实执行作为人工证据记录，不把本机结果扩张为多平台结论。（D-05、D-07、D-08；A-04、A-05）

## Risks / Trade-offs

- [首次运行可能需要网络] → 明确报告冷缓存依赖失败；缓存准备成功后重复使用，不伪造离线能力。
- [当前 Codex validator 会随环境变化] → 每次记录脚本摘要和执行环境；结果只对应实际脚本，不承诺固定或最新。
- [非标准安装位置无法自动发现] → 提供显式路径参数；默认发现失败时给出稳定错误和修复提示。
- [外部脚本输出可能变化] → 只把真实输出用于诊断，自动断言依赖包装层稳定字段。
- [显式入口可能被忘记] → README 与完成规则列出准确触发条件，不通过加入每次 CI 制造重复成本。
- [公共目录审核可能更严格] → 文案明确这是本地 Creator validator 预检，不是提交审核承诺。

## Migration Plan

1. 先新增聚焦测试，固定目标编排、缓存、失败和边界行为。
2. 实现最小运行器、必要启动适配和有界缓存生命周期。
3. 在 `package.json` 增加显式预检与缓存清理命令，更新 README。
4. 运行聚焦测试、仓库现有门禁和一次当前 Codex 环境真实预检，记录 V-01～V-03。

回滚只需删除新增脚本、命令、测试和文档说明；缓存由独立清理入口精确移除，不迁移业务数据，不修改现有验证或 CI。

## Open Questions

无。PyYAML 的具体锁定版本和摘要在实施时依据当前官方脚本兼容性确认，不改变本设计边界。
