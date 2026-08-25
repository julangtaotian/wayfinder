# 测试方案：六项目真实验证矩阵

## 基本信息

- 状态：就绪
- 需求：`requirements/REQ-2026-030-real-project-validation-matrix.md`
- 变更：validate-real-project-matrix
- 需求修订基线：R-02
- 默认聚焦命令：`node --test tests/real-project-validation.test.mjs`

## 测试上下文

- 测试命令状态：detected
- 测试命令：`npm run test`
- 测试运行器：Node Test Runner
- 测试目录：`tests`
- Git 基线：available；基线提交 `3431fdba861a17d2a017cc1b0e7b0c64a926fc00`，专用目标 `tests/real-project-validation.test.mjs` 在规划时不存在且未被 Git 跟踪
- 兼容说明：确定性回归只使用 Node.js 标准库和隔离 fixture；真实 P1～P6 命令仅在本机 macOS ARM64 的精确提交隔离副本中执行。Vue 3 + Vite + Vitest 是首版认证组合；Jest、老版本工具链、uni-app 和原生微信只按实际项目证据记录有限或阻断，不外推为全平台与同类项目完整认证。

## 测试用例

### TC-01：固定基线并在项目漂移时失败关闭

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-01、D-03、D-05、D-13
- 关联验收：A-01、A-08
- 关联规格：real-project-validation / 真实项目验证必须固定可追溯基线
- 状态矩阵：初始（已有数据）、刷新、错误态
- 前置条件：隔离 fixture 可创建独立 Git 仓库、固定提交和干净/修改/提交漂移状态，且仓库外哨兵可用于证明零写入
- 测试数据：重复项目 ID、POSIX 与 Windows 风格路径样本、错误 Git 顶层、错误分支/提交、已跟踪修改、未跟踪文件和完全干净项目
- 测试替身：使用仓库内有界 fixture 与真实 Git 子进程；不读取 P1～P6、不联网、不修改业务项目
- 操作：分别预览并执行基线检查，改变提交或工作区状态后重复执行，比较稳定项目 ID、规范化路径、提交、状态和阻断原因
- 可观察断言：只有路径、Git 顶层、分支、提交和干净状态全部符合的项目进入后续阶段；漂移返回 `blocked` 与稳定 code；原根和仓库外哨兵保持不变
- 目标测试：`tests/real-project-validation.test.mjs`
- 测试定位：`[TC-01] 固定基线与漂移失败关闭`
- 聚焦命令：`node --test --test-name-pattern="固定基线与漂移失败关闭" tests/real-project-validation.test.mjs`
- 关联验证：V-06
- 结果分类：通过
- 证据：`openspec/changes/validate-real-project-matrix/evidence/V-06.json`；聚焦回归、`npm test` 与 `npm run verify` 均命中并通过该定位

### TC-02：隔离副本覆盖写入、依赖阻断和全部清理分支

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：端到端
- 关联决策：D-03、D-04、D-05、D-10、D-13
- 关联验收：A-03、A-04、A-08、A-09
- 关联规格：real-project-validation / 可能写入的验证必须与原工作区隔离
- 状态矩阵：用户操作、刷新、错误态、卸载
- 前置条件：干净本地 Git fixture 包含受管与未受管文件、可控依赖目录、父 Git、符号链接、空间预检和成功/失败子进程
- 测试数据：安全副本、越界输出、父 Git 发现、越界依赖链接、依赖缺失、空间不足、命令失败、进程异常与模拟清理失败
- 测试替身：替换磁盘可用量和异常注入边界；真实执行副本创建、Git 隔离、文件检查和有界清理，不替换被测路径守卫
- 操作：创建精确提交副本，执行预览、写入、重复执行、升级、检查与清理，并分别注入依赖、命令和清理失败
- 可观察断言：所有可能写入均位于本轮 outputs；预览零写入、重复幂等、升级保留自定义内容、未受管冲突拒绝覆盖；不安全依赖阻断；清理失败不吞掉原始失败；原项目与其他 outputs 不变
- 目标测试：`tests/real-project-validation.test.mjs`
- 测试定位：`[TC-02] 隔离生命周期与有界清理`
- 聚焦命令：`node --test --test-name-pattern="隔离生命周期与有界清理" tests/real-project-validation.test.mjs`
- 关联验证：V-06
- 结果分类：通过
- 证据：`openspec/changes/validate-real-project-matrix/evidence/V-06.json`；成功、异常依赖、越界链接、失败清理和原工作区保护分支均通过

### TC-03：状态分类、敏感信息和跨平台机器证据保持稳定

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-06、D-07、D-10、D-11、D-12、D-13
- 关联验收：A-02、A-04、A-06、A-09、A-10
- 关联规格：real-project-validation / 真实项目矩阵必须分层执行并保持真实结果分类；real-project-validation / 真实项目证据必须有界且不包含敏感内容；real-project-validation / 缺陷和支持结论必须与验证执行解耦
- 状态矩阵：初始（已有数据）、用户操作、空态、错误态、卸载
- 前置条件：可控子进程能够产生成功、有限、正确阻断、启动失败、非零退出、零测试、产品缺陷、超时和清理失败，并输出安全与敏感日志样本
- 测试数据：稳定 code/status/target、POSIX `/` 与 Windows `\\` 路径、CRLF/LF、中文/英文摘要、疑似令牌/Cookie/环境值、普通附件和越界附件
- 测试替身：使用最小可控子进程与临时附件；不执行外部包管理器、后端或远程服务
- 操作：运行各类子进程结果，生成机器摘要与附件描述，再尝试持久化安全、敏感和越界数据
- 可观察断言：四类状态语义稳定；启动失败、非零退出、零测试和断言失败不合并；正确阻断不变成能力通过；敏感原文和越界附件不持久化；附件使用相对路径、大小和 SHA-256；路径、换行和中文文案不作为唯一断言
- 目标测试：`tests/real-project-validation.test.mjs`
- 测试定位：`[TC-03] 结果分类与证据安全边界`
- 聚焦命令：`node --test --test-name-pattern="结果分类与证据安全边界" tests/real-project-validation.test.mjs`
- 关联验证：V-06
- 结果分类：通过
- 证据：`openspec/changes/validate-real-project-matrix/evidence/V-06.json`；四类状态、零测试、非零退出、敏感输出、路径脱敏、附件边界和 Windows/POSIX 样本均通过

### TC-04：六项目基线与只读识别逐字段符合真实文件

- 状态：失败
- 优先级：P0
- 验证类型：自动
- 测试层级：端到端
- 关联决策：D-01、D-02、D-03、D-06、D-09、D-10
- 关联验收：A-01、A-02、A-07、A-08
- 关联规格：real-project-validation / 真实项目验证必须固定可追溯基线；real-project-validation / 真实项目矩阵必须分层执行并保持真实结果分类；supported-project-matrix / 支持矩阵结论必须区分证据层级
- 状态矩阵：初始（已有数据）、刷新、空态、错误态
- 前置条件：`outputs/real-project-validation/local-matrix.json` 记录 P1～P6 的真实根、精确提交和角色；六原工作区保持干净；执行入口处于只读 inspection 模式
- 测试数据：六项目 Git、根 package、构建配置、锁文件、测试配置/目录/文件，以及 P4 混合工具链和 P5 嵌套 package 事实
- 测试替身：不适用；使用真实业务项目只读文件和插件当前检查入口，不读取未跟踪源码正文
- 操作：对 P1～P6 执行 Git baseline、inspect、dependency profile 和 test context，并把稳定机器字段逐项与真实文件事实比较
- 可观察断言：六项目路径/提交/干净状态正确；框架、构建工具、包管理器、直接依赖、命令、运行器和测试文件均可追溯；detected 保持 `executed=false`；P4/P5 边界不被单一 preset 或根 package 画像掩盖；重复结果稳定
- 目标测试：`tests/real-project-validation.test.mjs`
- 测试定位：`[TC-04] 六项目基线与只读识别`
- 聚焦命令：`node --test --test-name-pattern="六项目基线与只读识别" tests/real-project-validation.test.mjs`
- 关联验证：V-01、V-02
- 结果分类：产品实现缺陷
- 证据：`outputs/real-project-validation/2026-08-25-p1-p6-run-01/inspection/results.json`；P1/P2/P4/P5/P6 符合预期，P3 将测试启动脚本 `scripts/test.js` 计入测试文件，稳定复现为 `inspection_expectation_mismatch`

### TC-05：六项目隔离生命周期不改变原工作区

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：端到端
- 关联决策：D-01、D-03、D-04、D-05、D-07、D-10、D-13
- 关联验收：A-01、A-03、A-04、A-08、A-09
- 关联规格：real-project-validation / 真实项目验证必须固定可追溯基线；real-project-validation / 可能写入的验证必须与原工作区隔离；real-project-validation / 真实项目矩阵必须分层执行并保持真实结果分类
- 状态矩阵：用户操作、刷新、错误态、卸载
- 前置条件：TC-04 的六项目 Git 基线全部通过；已确认的 P3 测试文件识别缺陷不参与 lifecycle 判断，按 D-05 独立影响链继续；六个隔离副本由矩阵精确提交创建，工作目录、缓存和临时目录均位于当前 run，原工作区只保留前后快照
- 测试数据：六项目原始未初始化状态、受管写入、标记外自定义内容、重复执行、升级漂移、未受管冲突和清理失败注入
- 测试替身：使用真实插件 bootstrap/update/check 入口和隔离业务副本；不替换受管写入逻辑，不访问后端或远程服务
- 操作：逐项目执行初始化预览、显式写入、重复写入、升级预览/写入、工作流检查、冲突保护和清理，并复核原项目 Git 快照
- 可观察断言：预览零写入；写入只涉及受管目标；重复执行幂等；升级保留标记外内容；未受管冲突不覆盖；各阶段按四类状态记录；六个原项目提交和工作区前后完全一致
- 目标测试：`tests/real-project-validation.test.mjs`
- 测试定位：`[TC-05] 六项目隔离生命周期`
- 聚焦命令：`node --test --test-name-pattern="六项目隔离生命周期" tests/real-project-validation.test.mjs`
- 关联验证：V-03
- 结果分类：通过
- 证据：`openspec/changes/validate-real-project-matrix/evidence/V-03.json`；六项目均为 `lifecycle_completed`，预览零写入、重复执行幂等、自定义内容保留、冲突保护、检查和清理全部通过，原工作区复核通过

### TC-06：P1～P4 原生测试与 P5/P6 阻断保持真实分类

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：端到端
- 关联决策：D-04、D-05、D-07、D-08、D-12、D-13
- 关联验收：A-05、A-06、A-09、A-10
- 关联规格：real-project-validation / 可能写入的验证必须与原工作区隔离；real-project-validation / 真实项目矩阵必须分层执行并保持真实结果分类；supported-project-matrix / 支持矩阵结论必须区分证据层级
- 状态矩阵：用户操作、空态、错误态、卸载
- 前置条件：TC-04 的 Git 基线与 P1/P2/P4/P5/P6 事实核对通过；P3 已由人工核对确认 `scripts/test.js` 是 Jest 启动器而非测试用例，并作为缺陷输入继续验证零测试分类；P1～P4 的命令、运行器、测试目标和隔离依赖预检均来自真实证据；P5/P6 保留缺命令或运行器现状
- 测试数据：P1 Vitest、P2 Jest、P3 Yarn/Jest、P4 混合链现有测试，以及 P5/P6 空测试入口；包含退出 0/非零、零测试、启动失败、超时和依赖阻塞分类
- 测试替身：不替换项目原生 runner、测试、fixture、mock 或断言；只由验证入口隔离 argv、缓存、超时和证据收集
- 操作：按项目记录的最窄命令执行 P1～P4；对 P5/P6 请求自动测试阶段；核对测试发现、目标定位、退出码、状态和清理
- 可观察断言：P1 只有真实发现目标且退出 0 才闭环；P2/P3/P4 保存实际结果且继续标明有限支持；P5/P6 正确阻断；零测试、启动失败、非零退出和依赖阻塞不记为通过；原工作区不变
- 目标测试：`tests/real-project-validation.test.mjs`
- 测试定位：`[TC-06] 多运行器真实执行与缺链阻断`
- 聚焦命令：`node --test --test-name-pattern="多运行器真实执行与缺链阻断" tests/real-project-validation.test.mjs`
- 关联验证：V-04
- 结果分类：通过
- 证据：`openspec/changes/validate-real-project-matrix/evidence/V-04.json`；P1 发现并通过 4 个 Vitest 用例，P2 发现并通过 3 个 Jest 用例，P3 明确零测试阻断，P4 因本机已有依赖缺少 `@esbuild/darwin-arm64` 有限失败，P5/P6 缺测试设施阻断

### TC-07：人工复核混合工具链、根 package 与外部能力边界

- 状态：人工通过
- 优先级：P0
- 验证类型：人工
- 测试层级：人工
- 关联决策：D-02、D-06、D-09、D-10、D-12、D-14
- 关联验收：A-02、A-06、A-07、A-10
- 关联规格：real-project-validation / 真实项目证据必须有界且不包含敏感内容；real-project-validation / 缺陷和支持结论必须与验证执行解耦；supported-project-matrix / 支持矩阵结论必须区分证据层级
- 状态矩阵：初始（已有数据）、空态、错误态
- 前置条件：TC-04～TC-06 已生成逐项目机器结果和必要摘要，人工检查环境为 macOS ARM64 本机，只读取受控报告和真实项目配置证据
- 测试数据：P4 Vite/Webpack 共存、P5 嵌套 package、P6 原生微信配置与缺开发者工具证据、四层证据、敏感信息扫描和本轮未覆盖组合
- 测试替身：不适用；人工对照真实配置、机器证据、需求 D-06/D-09/D-12/D-14 和支持措辞
- 操作：逐项核对 P4/P5/P6 边界、所有 limited/blocked/defect 原因、日志敏感内容、外部依赖和未覆盖列表
- 可观察断言：P4 不被描述成纯单一工具链；P5 嵌套 package 不等于 Monorepo 认证；P6 不被描述成开发者工具/发布链通过；证据不含敏感正文；后端、远程设计、pnpm、React + Vite、真实 workspace/多应用和未运行平台保持未覆盖
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-05
- 结果分类：通过
- 证据：人工逐项核对 `outputs/real-project-validation/2026-08-25-p1-p6-run-01/boundaries/results.json`、inspection/native-test 机器结果和脱敏日志；确认 P4 为混合工具链、P5 的 8 个嵌套 package 不构成 workspace 认证、P6 未取得开发者工具证据，且本轮未覆盖后端、远程设计、pnpm、React + Vite、真实 Monorepo/多应用与其他平台真实项目运行

### TC-08：人工复核最终矩阵、缺陷转交与证据层级

- 状态：阻断
- 优先级：P0
- 验证类型：人工
- 测试层级：人工
- 关联决策：D-07、D-09、D-11、D-12、D-13、D-14
- 关联验收：A-04、A-07、A-09、A-10
- 关联规格：real-project-validation / 缺陷和支持结论必须与验证执行解耦；supported-project-matrix / 支持矩阵结论必须区分证据层级
- 状态矩阵：用户操作、刷新、错误态、卸载
- 前置条件：六项目矩阵、V-01～V-07 和插件统一验证已完成；若存在验证代码变更，精确提交五平台 CI 已产生真实任务
- 测试数据：每项目/阶段状态、缺陷输入、附件哈希、原工作区前后快照、fixture/本机/本地统一/外部 CI 四层证据与 CI 失败历史
- 测试替身：不适用；由维护者读取真实报告、机器证据、Git 状态和外部 CI 任务，不用本地自声明代替远程状态
- 操作：核对每个 acceptance 的证据、缺陷是否独立转交、清理是否有界、支持等级是否有相应层级，并在有代码变更时复核同一 SHA 五个平台任务
- 可观察断言：报告只使用 passed/limited/blocked/defect；未执行不转成通过；本机证据不外推；缺陷不在验证步骤暗改；原项目干净；只有同一 SHA 五平台全部成功才记录外部通过，否则明确保留未完成或不适用依据
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-07、V-08
- 结果分类：产品实现缺陷
- 证据：`openspec/changes/validate-real-project-matrix/verification.md`、`defects/DEF-01-p3-test-launcher-false-positive.md`；证据层级与支持措辞复核通过，但 P3 识别缺陷仍未修复，且最终提交五平台 CI 尚未产生，因此不得完成归档
