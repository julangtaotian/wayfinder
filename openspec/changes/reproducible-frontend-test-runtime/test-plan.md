# 测试方案：可复现的前端测试验证运行时

## 基本信息

- 状态：已验证
- 需求：`requirements/REQ-2026-037-reproducible-frontend-test-runtime.md`
- 变更：reproducible-frontend-test-runtime
- 需求修订基线：R-02
- 默认聚焦命令：`node --test tests/frontend-test-workflow.test.mjs tests/ui-review-platform-runtime.test.mjs`

## 测试上下文

- 测试命令状态：detected
- 测试命令：`npm run test`
- 测试运行器：Vitest（仓库 Node 测试入口 + Vue 3/Vite/Vitest fixture）
- 测试目录：`tests`
- Git 基线：available（`tests/frontend-test-workflow.test.mjs`、`tests/ui-review-platform-runtime.test.mjs` 已受跟踪）
- 兼容说明：自动测试以 Node 内建测试模拟 npm 参数、跨平台入口和 CI 工作流合同；真实 CI 矩阵单独证明五个平台 runner，不以本机结果替代。

## 测试用例

### TC-01：锁定输入与缓存路径

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-01、D-02
- 关联验收：A-01
- 关联规格：frontend-test-workflow / 已缓存的离线验证运行时
- 状态矩阵：初始（已有数据）、刷新
- 前置条件：临时项目根可写入 outputs
- 测试数据：受版本控制的运行时清单和锁文件
- 测试替身：模拟 npm 子进程
- 操作：准备验证运行时并检查复制文件、npm 参数和缓存目录
- 可观察断言：使用 `npm ci`，缓存不在临时运行时或根目录，运行时入口存在后才返回成功
- 目标测试：`tests/frontend-test-workflow.test.mjs`
- 测试定位：`[TC-01] 锁定输入与缓存路径`
- 聚焦命令：`node --test tests/frontend-test-workflow.test.mjs`
- 关联验证：V-01、V-05
- 结果分类：通过
- 证据：`openspec/changes/reproducible-frontend-test-runtime/evidence/V-01.json`

### TC-02：显式离线模式失败关闭

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-01、D-02、D-03
- 关联验收：A-02
- 关联规格：frontend-test-workflow / 离线缓存缺失或不完整
- 状态矩阵：空态、错误态
- 前置条件：受控缓存可用或为空
- 测试数据：`--offline` 与模拟 npm 失败结果
- 测试替身：模拟 npm 子进程
- 操作：以离线模式准备，并分别模拟缓存可用和子进程失败
- 可观察断言：npm 获得离线参数；失败返回稳定 code、target、status，且不会回退网络
- 目标测试：`tests/frontend-test-workflow.test.mjs`
- 测试定位：`[TC-02] 显式离线模式失败关闭`
- 聚焦命令：`node --test tests/frontend-test-workflow.test.mjs`
- 关联验证：V-02
- 结果分类：通过
- 证据：`openspec/changes/reproducible-frontend-test-runtime/evidence/V-02.json`

### TC-03：运行时与缓存的分离清理

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-02、D-04
- 关联验收：A-03
- 关联规格：frontend-test-workflow / 分离清理运行时与缓存
- 状态矩阵：用户操作、卸载
- 前置条件：临时运行时、缓存和持久 outputs 样本同时存在
- 测试数据：受控目录与持久证据样本
- 测试替身：不适用
- 操作：依次清理运行时和缓存
- 可观察断言：每次只删除对应受控目录，持久 outputs 样本保持存在
- 目标测试：`tests/frontend-test-workflow.test.mjs`
- 测试定位：`[TC-03] 运行时与缓存的分离清理`
- 聚焦命令：`node --test tests/frontend-test-workflow.test.mjs`
- 关联验证：V-03
- 结果分类：通过
- 证据：`openspec/changes/reproducible-frontend-test-runtime/evidence/V-03.json`

### TC-04：统一验证传播离线选项

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-03、D-04
- 关联验收：A-02、A-04
- 关联规格：frontend-test-workflow / 已缓存的离线验证运行时
- 状态矩阵：用户操作、错误态
- 前置条件：统一验证使用注入的准备和执行替身
- 测试数据：`--offline`、shared 作用域、Windows npm JavaScript 入口样本
- 测试替身：准备函数与验证阶段子进程替身
- 操作：解析离线参数并启动 shared 统一验证
- 可观察断言：离线标记传递给准备过程，作用域、临时目录和稳定失败语义保持兼容
- 目标测试：`tests/frontend-test-workflow.test.mjs`
- 测试定位：`[TC-04] 统一验证传播离线选项`
- 聚焦命令：`node --test tests/frontend-test-workflow.test.mjs`
- 关联验证：V-04
- 结果分类：通过
- 证据：`openspec/changes/reproducible-frontend-test-runtime/evidence/V-04.json`

### TC-06：平台矩阵离线验证工作流合同

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-02、D-03、D-04、D-06
- 关联验收：A-05
- 关联规格：frontend-test-workflow / 真实平台矩阵离线复验
- 状态矩阵：初始（已有数据）、用户操作、刷新、错误态、卸载
- 前置条件：仓库存在五平台 `platform` CI 矩阵与固定 Node.js 准备步骤
- 测试数据：工作流中的预热、清理和离线共享验证命令
- 测试替身：不适用
- 操作：读取平台 job，验证每个矩阵 runner 都先预热缓存、清理运行时、清空平台运行时环境后执行离线共享验证并清理，再生成平台运行时进行专属验证；失败时仍执行两类受控清理
- 可观察断言：平台 job 中的命令顺序稳定，`verify:shared -- --offline` 只出现一次且显式清空两个平台环境变量；运行时与缓存清理均使用 `if: always()`
- 目标测试：`tests/ui-review-platform-runtime.test.mjs`
- 测试定位：`[TC-06] CI 平台矩阵验证运行时离线复验`
- 聚焦命令：`node --test tests/ui-review-platform-runtime.test.mjs`
- 关联验证：V-07
- 结果分类：通过
- 证据：`openspec/changes/reproducible-frontend-test-runtime/evidence/V-07.json`
