# 测试方案：健康检查识别插件仓库

## 基本信息

- 状态：已验证
- 需求：`requirements/archive/2026/REQ-2026-036-plugin-repository-health-recognition.md`
- 变更：2026-08-31-recognize-plugin-repository-health
- 需求修订基线：R-02
- 默认聚焦命令：`node --test tests/plugin-repository-health.test.mjs`

## 测试上下文

- 测试命令状态：detected
- 测试命令：`npm test`
- 测试运行器：Vitest（项目配置证据）；插件回归使用 Node Test Runner
- 测试目录：`tests`
- Git 基线：available；`tests/plugin-repository-health.test.mjs` 在规划基线尚不存在，将作为新建的职责单一手写测试；`tests/workflow-project.test.mjs` 已受跟踪且为 592 行，不继续承载此独立识别能力。
- 兼容说明：只使用 Node.js 标准库和仓库现有 Node Test Runner；不安装依赖、不读取运行时或外部网络。Vue 3 + Vite + Vitest fixture 仅作为既有工作流兼容回归，不将本次插件仓库能力描述为该 fixture 已认证的产品能力。
- 跨平台高风险：是；命中路径、机器可读诊断。受影响平台为 macOS ARM64/x64、Linux ARM64/x64、Windows x64；聚焦回归断言稳定 `code/status/target`，外平台路径显式使用 `path.win32` 与 `path.posix`，真实 CI 只接受同一精确 SHA 的现有五平台矩阵。
- 状态矩阵覆盖：初始（已有数据）由 TC-01/TC-02 覆盖；用户操作由 TC-01/TC-06 覆盖；刷新由 TC-03 覆盖；空态与错误态由 TC-04/TC-05 覆盖；卸载不适用，健康检查是一次性只读 Node 进程。

## 测试用例

### TC-01：有效插件仓库得到专属健康结果

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-01、D-02、D-04、D-05
- 关联验收：A-01、A-02
- 关联规格：`plugin-repository-health / 健康检查必须识别有效本地插件仓库`
- 状态矩阵：初始（已有数据）、用户操作
- 前置条件：隔离 fixture 包含根 marketplace、一个安全本地插件目录、有效 manifest、技能目录和根级 test/validate 命令
- 测试数据：当前仓库形状的 `./plugins/frontend-ai-workflow` 条目、manifest 名称/版本/技能目录、无 Wayfinder 的根规则文件
- 测试替身：使用临时隔离 fixture 和真实 Node 文件系统；不调用完整结构校验、网络、浏览器或安装入口
- 操作：分别调用 `checkProject()`、完整 CLI 与 `--summary` CLI
- 可观察断言：`ok=true`、`repositoryKind=plugin-repository`；完整与 summary 均含插件仓库事实；不出现 Wayfinder/业务受管标记或 build/lint/typecheck 误报；`layout` 与既有字段保持兼容
- 目标测试：`tests/plugin-repository-health.test.mjs`
- 测试定位：`[TC-01] 有效插件仓库得到专属健康结果`
- 聚焦命令：`node --test --test-name-pattern="TC-01" tests/plugin-repository-health.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-08-31-recognize-plugin-repository-health/verification.md`

### TC-02：多插件 summary 有界且完整结果保留全部事实

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-02、D-03、D-05
- 关联验收：A-01、A-02
- 关联规格：`plugin-repository-health / 健康检查必须识别有效本地插件仓库`、`ai-context-efficiency / 插件 marketplace 包含大量本地条目`
- 状态矩阵：初始（已有数据）、用户操作
- 前置条件：隔离 marketplace 含超过 summary 上限的有效本地插件条目
- 测试数据：稳定但乱序的多插件名称、全部有效 manifest、状态与诊断样本
- 测试替身：使用受控 fixture；不扫描真实 runtime 或归档目录
- 操作：比较 `checkProject()` 完整结果与 `summarizeProjectCheck()` 的投影
- 可观察断言：完整结果保留全部条目；summary 稳定排序且只展示固定上限，同时准确报告总数、显示数、遗漏数、状态计数与诊断计数
- 目标测试：`tests/plugin-repository-health.test.mjs`
- 测试定位：`[TC-02] 多插件 summary 有界且完整结果保留全部事实`
- 聚焦命令：`node --test --test-name-pattern="TC-02" tests/plugin-repository-health.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-08-31-recognize-plugin-repository-health/verification.md`

### TC-03：重复检查只读并反映当前 marketplace 与 manifest

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-01、D-05、D-08
- 关联验收：A-02
- 关联规格：`plugin-repository-health / 插件仓库健康检查必须保持只读和有界`
- 状态矩阵：用户操作、刷新
- 前置条件：有效插件仓库 fixture 可在检查间修改 marketplace 或 manifest
- 测试数据：初始有效条目、修改后的名称失配和恢复后的有效内容、目录快照
- 测试替身：使用文件树快照，不调用写入型 bootstrap/update/migrate 命令
- 操作：连续运行健康检查，在两次之间改写 fixture 配置并再次检查
- 可观察断言：检查前后自身不改写文件；每次只反映当前配置；失配后失败关闭、恢复后通过；不使用缓存、运行时扫描或网络
- 目标测试：`tests/plugin-repository-health.test.mjs`
- 测试定位：`[TC-03] 重复检查只读并反映当前 marketplace 与 manifest`
- 聚焦命令：`node --test --test-name-pattern="TC-03" tests/plugin-repository-health.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-08-31-recognize-plugin-repository-health/verification.md`

### TC-04：空本地条目与损坏 JSON 失败关闭

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-02、D-06
- 关联验收：A-03
- 关联规格：`plugin-repository-health / 插件配置与路径必须失败关闭并可定位`
- 状态矩阵：空态、错误态
- 前置条件：fixture 根存在 marketplace，但分别没有本地条目、marketplace JSON 损坏或 manifest JSON 损坏
- 测试数据：远程条目集合、空 plugins、截断 JSON、无效 manifest JSON
- 测试替身：使用隔离文件内容，不调用任何自动修复或初始化逻辑
- 操作：对每种错误配置执行完整与 summary 健康检查
- 可观察断言：均为 `ok=false` 与非零 CLI 状态；`pluginRepository.diagnostics` 含对应稳定 code/status/target；不回退为成功或自动生成工作流文件
- 目标测试：`tests/plugin-repository-health.test.mjs`
- 测试定位：`[TC-04] 空本地条目与损坏 JSON 失败关闭`
- 聚焦命令：`node --test --test-name-pattern="TC-04" tests/plugin-repository-health.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-08-31-recognize-plugin-repository-health/verification.md`

### TC-05：不安全路径与 manifest 结构失配可定位

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-02、D-06、D-10
- 关联验收：A-03
- 关联规格：`plugin-repository-health / 插件配置与路径必须失败关闭并可定位`
- 状态矩阵：错误态
- 前置条件：fixture 可表达标准 `./` 前缀、绝对路径、`..`、反斜杠、符号链接、缺失 manifest、名称不一致、空版本和缺失技能目录
- 测试数据：POSIX 路径、Windows `D:/workspace` 与 `D:\\workspace` 外平台样本、越界和符号链接路径、错误 manifest 字段
- 测试替身：路径纯函数显式注入 `path.posix`/`path.win32`；文件系统场景使用 fixture 链接，不访问外部卷
- 操作：逐项运行识别器与健康检查，并比较机器诊断
- 可观察断言：所有错误失败关闭；标准 `./` 唯一被安全规范化；`code/status/target` 在不同路径表示下稳定，符号链接与项目外路径不被读取
- 目标测试：`tests/plugin-repository-health.test.mjs`
- 测试定位：`[TC-05] 不安全路径与 manifest 结构失配可定位`
- 聚焦命令：`node --test --test-name-pattern="TC-05" tests/plugin-repository-health.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-08-31-recognize-plugin-repository-health/verification.md`

### TC-06：非插件项目保持现有工作流行为

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-01、D-07
- 关联验收：A-04
- 关联规格：`plugin-repository-health / 非插件项目必须保持既有健康检查语义`
- 状态矩阵：用户操作、空态、错误态
- 前置条件：存在有效 Wayfinder fixture、旧工作流 fixture、未初始化 fixture，以及仅有局部 `.codex-plugin` 目录的 fixture
- 测试数据：已有工作流辅助 fixture、无 marketplace 根、局部 manifest 和 legacy 文件
- 测试替身：复用既有 fixture 生成方式，不修改其受管内容
- 操作：在四类非插件目标上运行健康检查并比较已有 layout/迁移结论
- 可观察断言：Wayfinder、legacy 与未初始化结论不改变；局部 manifest 不产生 `repositoryKind=plugin-repository`，不获得工作流豁免
- 目标测试：`tests/plugin-repository-health.test.mjs`
- 测试定位：`[TC-06] 非插件项目保持现有工作流行为`
- 聚焦命令：`node --test --test-name-pattern="TC-06" tests/plugin-repository-health.test.mjs`
- 关联验证：V-03
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-08-31-recognize-plugin-repository-health/verification.md`

### TC-07：当前插件仓库的轻量检查与发布链复核

- 状态：人工通过
- 优先级：P1
- 验证类型：人工
- 测试层级：人工
- 关联决策：D-04、D-05、D-08、D-09
- 关联验收：A-01、A-02、A-05
- 关联规格：`plugin-repository-health / 插件仓库健康检查必须保持只读和有界`
- 状态矩阵：初始（已有数据）、用户操作、错误态
- 前置条件：实现提交在当前插件仓库中完成，专用自动回归和本地统一验证已通过
- 测试数据：当前根 marketplace、插件 manifest、summary JSON、验证命令日志与工作区状态
- 测试替身：不适用；使用真实仓库，但不触发安装、打包、浏览器或网络下载
- 操作：人工执行 summary，核对插件类别、条目、误报消失、命令事实和读取边界，再核对 `npm test`、`npm run validate`、`npm run verify`、官方 Skill/Plugin validators 与 Vue fixture 记录
- 可观察断言：当前仓库健康识别准确；检查没有写入或读取无关运行时/输出/归档；完整发布门禁独立通过；无新增依赖、缓存、权限、CI 触发或定时任务
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-02、V-03、V-04
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-08-31-recognize-plugin-repository-health/verification.md`

### TC-08：同一 SHA 的共享与五平台 CI 证据

- 状态：人工通过
- 优先级：P0
- 验证类型：人工
- 测试层级：端到端
- 关联决策：D-08、D-10
- 关联验收：A-05
- 关联规格：`plugin-repository-health / 插件配置与路径必须失败关闭并可定位`
- 状态矩阵：用户操作、刷新、错误态
- 前置条件：实现通过 WebStorm 提交并推送，现有 Validate 工作流已触发
- 测试数据：精确提交 SHA、Actions URL、shared 与五个平台任务状态、失败时的平台/步骤/稳定诊断
- 测试替身：不适用；本地路径样本不能替代真实 CI 矩阵
- 操作：复核同一提交的 shared、macOS ARM64/x64、Linux ARM64/x64、Windows x64 任务，并在失败时记录复盘字段
- 可观察断言：六项任务在同一 SHA 全部通过；若任一失败，不报告跨平台发布通过并记录根因、遗漏回归与复跑链接；未新增 schedule 或第二套 CI
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-05
- 结果分类：通过
- 证据：`openspec/changes/archive/2026-08-31-recognize-plugin-repository-health/verification.md`

## 执行记录

| 用例 | 命令或方式 | 结果 | 证据 |
| --- | --- | --- | --- |
| TC-01～TC-06 | `node --test tests/plugin-repository-health.test.mjs` | 通过（6/6） | V-01；`verification.md` |
| TC-07 | 当前插件仓库 summary、本地全量/结构/统一验证与 Vue fixture 人工复核 | 人工通过 | V-02、V-03、V-04；`verification.md` |
| TC-08 | 使用 WebStorm 推送后复核同一 SHA 的 shared 与五平台 Actions 矩阵 | 通过（shared + 五个平台均成功） | V-05；[GitHub Actions #78](https://github.com/julangtaotian/wayfinder/actions/runs/33377691203) |
