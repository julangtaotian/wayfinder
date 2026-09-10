## Context

参见 `proposal.md`。当前两份基准模块同时承担兼容入口与多类内部职责；现有消费者和测试直接从原路径导入，不能通过迁移调用方或改成动态加载来缩小文件。新增静态检查会由根 package script 和 `scripts/verify.mjs` 调用，必须在 macOS、Linux 与 Windows 上使用相同的 Node 入口和参数边界。

本变更依据 REQ-2026-047 D-01 不改变可观察行为，并在 `.openspec.yaml` 中声明 `skip_specs: true`。由于命中路径、子进程、包管理器入口、机器诊断与 CI 使用链，按 D-06 作为跨平台高风险处理。

## Goals / Non-Goals

**Goals:**

- 让原基准入口继续作为稳定公共边界，同时把局部维护所需读取量降到 500～600 行以内。
- 形成 contract、foundation、cases、execution 与 orchestration 的单向依赖。
- 用当前 Node 的语法解析能力提供快速、确定性、零依赖静态检查。
- 让独立检查和统一验证共享同一实现、稳定机器结果与失败停止语义。

**Non-Goals:**

- 不重新设计基准流程、错误类型、JSON schema、提示词或指标。
- 不引入代码风格、未使用变量、类型或跨文件语义规则。
- 不扫描发布运行时、构建输出或外部项目，也不修改 CI 矩阵定义。

## Decisions

### 1. 用共享 contract 消除基础门面与用例模块之间的循环依赖

新增 `developer-effectiveness-benchmark-contract.mjs`，承载常量、错误类型、断言、摘要和通用路径规范化。`foundation` 与 `cases` 都只向 contract 依赖；原 `foundation` 静态重导出 contract 和 cases，同时保留 Git、工作区与持久化职责。

如果让 cases 反向导入 foundation，而 foundation 又重导出 cases，会形成初始化顺序敏感的循环；复制帮助函数则会让错误类型和摘要算法产生漂移，因此采用独立 contract。

### 2. 按“单次代理执行”抽取 execution，而不是搬走整轮编排

新增 `developer-effectiveness-benchmark-execution.mjs`，承载 Codex 轮次、提示词、验收、澄清/返工和 `executeCaseRun`。原主模块保留预览、用例生成/预检、恢复状态、整轮阶段推进与 CLI，并静态重导出 `executeCaseRun`。

整轮状态推进依赖主模块已有的生成和预检流程，把它与单次执行一起抽取会产生更大的内部文件；只拆 CLI 又无法显著降低主要维护路径，因此选择单次执行边界。

### 3. 保留原入口并用结构与专用测试锁定边界

原两个入口继续承载所有既有公开导出，消费者无需迁移。结构校验要求 contract、cases、execution 三个资产存在，并限制主入口 500 行、execution 500 行、foundation 600 行、cases 350 行、contract 220 行。基准专用测试同时核对导入方向不形成回边。

行数门禁不是质量证明，但能防止拆分后逻辑重新堆回兼容入口；行为兼容仍由既有 TC-01～TC-08 负责。

### 4. 静态检查只复用 `node --check`

新增根 `scripts/static-check.mjs`，确定性递归发现三个固定根中的 `.js`、`.mjs` 和 `.cjs`，逐个以 `spawnSync(process.execPath, ['--check', absoluteFile], { shell: false })` 执行。发现顺序按仓库相对路径排序；成功返回检查数，失败返回 `code`、相对 `target`、真实 `status` 与已脱敏诊断。

不使用 shell glob，避免 Windows 展开差异；不引入 ESLint，避免把本轮扩大为规则选型和依赖治理。零文件失败关闭，防止目录配置漂移后静默通过。

### 5. 静态检查进入统一验证但保持独立入口

package 新增 `check:static`，`scripts/verify.mjs` 在 footprint 之前加入同一脚本步骤。独立入口便于快速运行；统一入口保证 CI 和交付验证不会遗漏。失败沿用现有 `verification_step_failed` 顶层语义，并把 `failedStep` 标记为 `static`。

不把两个命令用 `&&` 拼进 package script，避免跨平台 shell 差异，也避免修改插件发布态的 `validate-structure.mjs` 去反向依赖仓库根脚本。

### 6. 测试与证据按职责分层

- `tests/developer-effectiveness-benchmark.test.mjs`：复用，运行全部既有基准行为并新增兼容门面、依赖方向和行数断言。
- `tests/static-check.test.mjs`：新建，覆盖确定性发现、排除目录、空格/非 ASCII 路径、零发现、真实语法错误、诊断脱敏和 verify 步骤。
- 本地统一验证：证明新增检查与共享链协作；真实五平台 CI 在最终候选提交后单独复核，不由本机模拟替代。

## Risks / Trade-offs

- [移动私有函数遗漏闭包依赖] → 先按符号和调用链拆分，保留静态导出，再运行完整基准专用测试。
- [错误类或摘要实现出现双份] → 统一放入 contract，其他模块只导入，不复制。
- [静态检查耗时随文件数增长] → 限定三个自有源码根并排除 runtime、outputs 与 dist；当前规模只做语法解析。
- [Node 诊断泄露绝对 fixture 路径] → 持久结果只返回仓库相对 target，诊断在返回前替换仓库根。
- [Windows 路径或 shell 行为差异] → 使用 `process.execPath`、参数数组、`shell: false` 和正斜杠机器 target，fixture 覆盖空格与非 ASCII 名称。
- [本地通过被误写成跨平台完成] → V-04 保持计划，直到同一最终提交的五平台任务全部成功。

## Migration Plan

1. 增加静态检查和模块边界回归，使当前兼容行为可观测。
2. 提取 contract 与 cases，保留 foundation 的静态兼容导出。
3. 提取 execution，保留主模块的静态兼容导出和 CLI。
4. 把静态检查接入 package 与统一验证，运行聚焦和本地完整门禁。
5. 最终候选提交运行五平台 CI；若失败，按稳定步骤和 target 定位后只修正对应边界。

回滚时同时移除三个内部模块、静态检查脚本和统一验证步骤，并恢复两个原模块；不涉及数据迁移或历史输出改写。
