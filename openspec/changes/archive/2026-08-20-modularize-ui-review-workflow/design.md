## Context

参见 `proposal.md` 的动机。当前入口包含从基础校验到 CLI 的完整实现，函数顺序已经形成隐含分层，但共享私有 helper 让直接机械切段容易产生循环依赖。两个消费者只从原入口导入公共 API，30 个专用测试也把该入口视为稳定合同，因此重构必须先固化导出和测试发现边界。

## Goals / Non-Goals

**Goals:**

- 建立单向依赖的 UI Review 内部模块，保证 D-03、D-04 的兼容入口和安全合同。
- 让生产逻辑、测试 fixture 和领域用例分别只有一个事实源。
- 用确定性结构校验落实 D-06 的行数上限，而不是只在本次人工观察。
- 保持聚焦命令 `node --test tests/ui-review-automation.test.mjs` 仍发现全部既有测试。

**Non-Goals:**

- 不重新设计状态机、配置 schema、比较算法、浏览器适配器或公开错误模型。
- 不以压缩格式、删除中文说明或复制 helper 的方式降低表面行数。
- 不在同一批次拆分 `workflow.test.mjs` 和蓝湖验收测试。

## Decisions

### 1. 原文件收敛为兼容门面

`ui-review-workflow.mjs` 只负责从领域模块重新导出当前 18 个公共符号、导出 CLI 函数以及保留直接运行检测。`ui-review-runner.mjs` 与 `playwright-adapter-runner.mjs` 不修改导入路径。

选择该方案是为了保持 D-04 和历史文档合同。备选方案是让消费者直接导入领域模块，但会把内部布局变成新公共 API，并增加后续迁移成本。

### 2. 使用单向六层模块

生产代码按以下方向组织：

1. `ui-review-contract.mjs`：共享常量、基础值校验、稳定序列化与摘要 helper。
2. `ui-review-config.mjs`：安全项目路径、配置/场景规范化、配置读取、内置适配器路径。
3. `ui-review-plan.mjs`：运行 ID、产物路径、采集模板展开、采集计划和 review 初始状态。
4. `ui-review-state.mjs`：finding/assessment 规范化、review/repair/verify 状态迁移。
5. `ui-review-storage.mjs`：状态 JSON 读取与原子写入，只依赖安全路径解析。
6. `ui-review-workflow-cli.mjs`：参数解析与命令调度，直接从上述领域模块组合能力。

兼容门面位于最外层，可导入所有领域模块；领域模块不得反向导入兼容门面。该布局把通用 helper 集中在合同层，避免为规避循环依赖而复制验证逻辑。

备选方案是按原行号切成少数大文件，但配置规范化仍可能超过 500 行且职责边界模糊；也考虑过引入类或依赖注入容器，但会改变当前函数式 API 并增加无必要抽象。

### 3. 测试使用稳定聚合入口

保留 `tests/ui-review-automation.test.mjs`，它只导入以下非默认发现后缀的测试单元：

- `tests/ui-review-automation/config.cases.mjs`
- `tests/ui-review-automation/state.cases.mjs`
- `tests/ui-review-automation/comparison.cases.mjs`
- `tests/ui-review-automation/runtime-capture.cases.mjs`
- `tests/ui-review-automation/cli-contract.cases.mjs`

共享 fixture 放入 `tests/ui-review-automation/fixtures.mjs`。`.cases.mjs` 不匹配根 `package.json` 的 `tests/*.test.mjs`，因此只由聚合入口加载，不会在默认测试中重复注册。每个既有 `test()` 块整体移动，名称和断言不改。

备选方案是创建多个根级 `.test.mjs`，但历史需求和聚焦命令只引用原文件，且默认测试会改变执行分组；聚合方式能够同时保持可追溯性和职责拆分。

### 4. 结构校验固化文件清单与规模

`validate-structure.mjs` 把新增生产模块加入 UI Review 发布资产清单，并对兼容门面、六个领域模块、测试聚合入口、fixture 和五个测试单元执行精确行数检查。门面上限 120 行、测试入口上限 80 行，其余范围文件上限 500 行。校验使用物理行数，不接受压缩代码规避。

行数是维护预警而非通用仓库标准，因此只约束本次明确拆分的文件，不给所有历史文件设置全局阈值。

### 5. 基线驱动的等价迁移

实施前记录 18 个导出名称、30 个测试名称及聚焦测试结果。迁移顺序为合同/配置、计划、状态、存储、CLI、门面，随后再拆测试。每完成一层就运行聚焦测试，最后运行 D-08 的发布级验证。

插件源发生变化后按 D-09 使用官方 cachebuster helper；确认 repository marketplace 的真实名称和本地来源后重装，不手改 marketplace。

## Risks / Trade-offs

- [遗漏私有 helper 或改变执行顺序] → 以原测试为基线，逐层移动而非重写，并保持原函数体和错误文案。
- [领域模块形成循环依赖] → 固定合同 → 配置 → 计划 → 状态/存储 → CLI → 门面的单向方向，并用导入扫描复核。
- [测试被重复发现] → 子文件使用 `.cases.mjs`，只有根聚合入口匹配项目测试脚本。
- [历史证据路径失效] → 保留原测试文件和聚焦命令，测试名称不变。
- [行数目标诱导低可读性格式] → 结构校验只作为职责边界补充，评审同时检查中文说明、单语句格式和 helper 去重。
- [本地重装更新当前任务运行时] → 重装放在所有源码验证完成后；最终提示用户使用新任务加载新版插件。

## Migration Plan

1. 建立导出、测试名称和聚焦测试基线。
2. 新增内部模块并逐段迁移原实现，暂时通过原入口重新导出。
3. 将 CLI 调度移入独立模块，保留原入口直接运行行为。
4. 拆分测试 fixture 和五组领域用例，保持原聚合入口。
5. 更新结构资产与行数门禁，完成聚焦和发布级验证。
6. 使用官方 helper 更新 cachebuster、运行插件校验并从当前本地 marketplace 重装。

回滚时恢复原生产入口、原测试文件和 manifest cachebuster，并移除本次新增内部模块；不涉及数据迁移。
