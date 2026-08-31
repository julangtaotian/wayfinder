# 测试方案：平台运行时轻量交付

## 基本信息

- 状态：就绪
- 需求：`requirements/REQ-2026-035-platform-runtime-delivery.md`
- 变更：deliver-platform-runtime-on-install
- 需求修订基线：R-04
- 默认聚焦命令：`node --test tests/ui-review-platform-runtime.test.mjs tests/repository-hygiene.test.mjs tests/repository-footprint.test.mjs`

## 测试上下文

- 测试命令状态：detected
- 测试命令：`npm test`
- 测试运行器：Node Test Runner；仓库另有 Vue fixture 的 Vitest 配置，本变更平台与治理用例不切换 runner。
- 测试目录：`tests`
- Git 基线：available；`tests/ui-review-platform-runtime.test.mjs`、`tests/repository-hygiene.test.mjs`、`tests/repository-footprint.test.mjs` 均已受跟踪，分别覆盖平台构建/打包、Git 提交边界和体积退役门禁。
- 测试文件策略：复用上述三个同功能手写专用测试；不修改生成测试，不新增重复平台交付测试文件。
- 兼容说明：只使用 Node.js 标准库和仓库固定 Playwright CLI；自动用例通过服务注入模拟下载、超时、代理和外平台路径，不在聚焦阶段访问真实网络或安装插件。
- 跨平台高风险：是；命中 CI、路径、临时目录、子进程、环境变量、包管理器入口、安装流程和机器可读诊断，影响 macOS ARM64/x64、Linux ARM64/x64、Windows x64。确定性回归优先断言 code/status/target/attempts 和双侧规范化，Windows 外平台样本显式使用 `path.win32`；真实矩阵与五平台安装分别取证。
- 状态矩阵覆盖：初始、用户操作、刷新、空态、错误态由 TC-01～TC-11 覆盖；卸载不适用，因为准备、安装验证与 CI 都是一次性进程，没有订阅、计时器或组件销毁生命周期。

## 测试用例

### TC-01：平台准备预览与安全写入边界

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-04、D-08、D-09、D-12
- 关联验收：A-01
- 关联规格：`plugin-ui-review-automation / 预览平台成品不产生写入`、`输出越界、已存在或成品超预算`
- 状态矩阵：初始（已有数据）、用户操作、空态、错误态
- 前置条件：平台准备服务可注入当前平台、输出根和文件系统观察器
- 测试数据：五个支持平台、未知平台、非原生目标、仓库根、用户主目录、符号链接越界、已存在目标和 Windows/POSIX 路径样本
- 测试替身：注入平台和安全路径服务，不下载资产、不执行 Codex 命令
- 操作：分别执行默认预览、危险路径预览和显式非原生写入
- 可观察断言：预览返回 planned/code/platform/version/output/steps 且零写入；危险、越界、已存在、未知和非原生写入以稳定字段与非零状态失败
- 目标测试：`tests/ui-review-platform-runtime.test.mjs`
- 测试定位：`[TC-01] 平台准备预览与安全写入边界`
- 聚焦命令：`node --test --test-name-pattern="TC-01" tests/ui-review-platform-runtime.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/deliver-platform-runtime-on-install/evidence/V-01.json`

### TC-02：下载重试、超时、清理与代理凭据保护

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-05、D-08、D-12、D-13
- 关联验收：A-03
- 关联规格：`plugin-ui-review-automation / 网络超时或下载失败`、`使用既有代理环境`
- 状态矩阵：用户操作、刷新、空态、错误态
- 前置条件：下载执行器、时钟、清理器和环境变量可以注入
- 测试数据：前两次失败第三次成功、连续三次失败、十分钟超时、清理失败、带用户名密码的 HTTP/HTTPS 代理、NO_PROXY
- 测试替身：注入 spawn 结果和虚拟时间，不访问官方源；代理值使用无真实凭据的 fixture
- 操作：执行成功重试、耗尽、超时与清理失败路径，并读取返回对象、日志和报告
- 可观察断言：最多三次且每次 timeout=600000；每次失败清理独立目录；最后错误保留退出码/信号/超时、attempts 和 cleanup；子进程继承代理但全部持久输出不含代理原值或 fixture 凭据
- 目标测试：`tests/ui-review-platform-runtime.test.mjs`
- 测试定位：`[TC-02] 平台下载重试超时与代理脱敏`
- 聚焦命令：`node --test --test-name-pattern="TC-02" tests/ui-review-platform-runtime.test.mjs`
- 关联验证：V-07
- 结果分类：通过
- 证据：`openspec/changes/deliver-platform-runtime-on-install/evidence/V-07.json`

### TC-03：源码外唯一平台 marketplace 成品

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：端到端
- 关联决策：D-03、D-04、D-05、D-08、D-09、D-10
- 关联验收：A-02、A-05
- 关联规格：`plugin-ui-review-automation / 生成只包含一个平台的完整成品`、`离线环境安装已验证成品`
- 状态矩阵：初始（已有数据）、用户操作、空态、错误态
- 前置条件：共享源码运行时可能仍含第一阶段 LFS 平台资产，下载器能够在全新外部运行时根生成确定性 fixture
- 测试数据：darwin-arm64 目标、win32-x64 源码平台资产哨兵、GitHub Windows runner 根路径样本、其他平台元数据样本、固定版本、许可、完整性、体积和 screenshot bytes
- 测试替身：使用 `outputs/platform-runtime-delivery/test-fixtures/` 下的有界运行时 fixture 和注入冒烟，不访问网络
- 操作：从共享源码和外部平台运行时生成完整 marketplace，再从复制后的目录执行结构、分发描述和完整性检查
- 可观察断言：源码没有被修改；外部复制明确排除源码 `platform-assets`、`integrity` 和 `distribution.json`；Windows 准备与打包暂存启动路径低于 260 字符；成品只含目标平台；distribution/version/license/shared+platform integrity/预算/冒烟均通过；复制完整目录后无需下载仍能通过同一结构与运行时检查
- 目标测试：`tests/ui-review-platform-runtime.test.mjs`
- 测试定位：`[TC-03] 源码外唯一平台 marketplace 成品`
- 聚焦命令：`node --test --test-name-pattern="TC-03" tests/ui-review-platform-runtime.test.mjs`
- 关联验证：V-08
- 结果分类：通过
- 证据：`openspec/changes/deliver-platform-runtime-on-install/evidence/V-08.json`

### TC-04：重复准备、原子升级和旧包保留

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-06、D-08、D-12、D-13
- 关联验收：A-03
- 关联规格：`plugin-ui-review-automation / 重复准备和升级失败`
- 状态矩阵：用户操作、刷新、错误态
- 前置条件：同平台旧 marketplace 已通过校验，发布和清理服务可注入
- 测试数据：同版本重复、显式升级成功、结构失败、冒烟失败、Windows EPERM/EBUSY 后成功及重试耗尽
- 测试替身：注入 rename/remove/wait 服务，不访问真实 Codex 缓存
- 操作：依次执行普通重复准备、受控升级成功和各失败路径
- 可观察断言：普通准备拒绝覆盖；升级在独占 stage 完成检查后发布；Windows 按有界退避；任一失败旧目录内容和摘要不变，无半成品，清理失败单独定位
- 目标测试：`tests/ui-review-platform-runtime.test.mjs`
- 测试定位：`[TC-04] 平台 marketplace 原子升级与旧包保留`
- 聚焦命令：`node --test --test-name-pattern="TC-04" tests/ui-review-platform-runtime.test.mjs`
- 关联验证：V-09
- 结果分类：通过
- 证据：`openspec/changes/deliver-platform-runtime-on-install/evidence/V-09.json`

### TC-05：CI 五平台使用新准备入口且只上传报告

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-07、D-09、D-11、D-12
- 关联验收：A-04
- 关联规格：`repository-verification-gate / CI 重建目标平台资产`、`普通 CI 控制大型产物成本`
- 状态矩阵：初始（已有数据）、用户操作、刷新、错误态
- 前置条件：Validate 工作流和平台准备 CLI 可读
- 测试数据：shared job、五个平台矩阵、新 CLI、dist 报告路径、upload-artifact v7、concurrency、push/PR、contents read
- 测试替身：静态解析工作流，不请求 GitHub API
- 操作：统计 jobs、矩阵、命令和上传路径，并搜索退役/禁止字段
- 可观察断言：共享一次且平台 needs shared；五平台无删减；新准备入口只出现于平台 job；无 git lfs pull、replace-lfs-pointers、cache、schedule、paths-ignore、写权限或完整目录上传；每个平台只上传报告
- 目标测试：`tests/ui-review-platform-runtime.test.mjs`
- 测试定位：`[TC-05] CI 平台 marketplace 准备与小型报告合同`
- 聚焦命令：`node --test --test-name-pattern="TC-05" tests/ui-review-platform-runtime.test.mjs`
- 关联验证：V-10
- 结果分类：通过
- 证据：`openspec/changes/deliver-platform-runtime-on-install/evidence/V-10.json`

### TC-06：平台资产与 LFS 规则从 HEAD 退役

- 状态：计划
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-02、D-06、D-10
- 关联验收：A-06
- 关联规格：`repository-hygiene / 平台浏览器资产由 LFS 管理`、`当前跟踪集合接受规则升级`
- 状态矩阵：初始（已有数据）、刷新、空态、错误态
- 前置条件：TC-10 五平台安装证据完成后进入第二阶段
- 测试数据：真实 Git 跟踪集合、`.gitattributes`、共享 node_modules/锁文件/许可/平台元数据、本地 dist/outputs 成品样本
- 测试替身：仓库内忽略 fixture 使用独立 Git 或 ceiling 隔离父仓库
- 操作：读取 Git 跟踪与忽略语义，检查共享保留路径、退役路径和本地成品样本
- 可观察断言：共享生产运行时继续受跟踪；platform-assets 内容、生成清单和 LFS 规则为零；本地成品被忽略；重新引入任一退役目标返回稳定路径诊断
- 目标测试：`tests/repository-hygiene.test.mjs`
- 测试定位：`[TC-06] 平台运行时 LFS 资产退役边界`
- 聚焦命令：`node --test --test-name-pattern="TC-06" tests/repository-hygiene.test.mjs`
- 关联验证：V-02
- 结果分类：未执行
- 证据：待执行；第二阶段通过后写入 `openspec/changes/deliver-platform-runtime-on-install/evidence/V-02.json`

### TC-07：平台资产退役零预算门禁

- 状态：计划
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-02、D-06、D-10
- 关联验收：A-06
- 关联规格：`repository-footprint-governance / 已退役路径重新出现`
- 状态矩阵：初始（已有数据）、刷新、空态、错误态
- 前置条件：体积审计支持声明退役目标
- 测试数据：零目标、一个 platform-assets 文件、一个平台生成清单、LFS 规则回归和试图放宽普通预算的配置
- 测试替身：有界 Git 跟踪服务返回确定性路径集合
- 操作：分别审计零目标和三类回归样本
- 可观察断言：零目标通过且报告 actual=0/limit=0；任一回归返回稳定 code/status/target/actual/limit；普通预算变化不能放行退役目标
- 目标测试：`tests/repository-footprint.test.mjs`
- 测试定位：`[TC-07] 平台运行时退役零预算门禁`
- 聚焦命令：`node --test --test-name-pattern="TC-07" tests/repository-footprint.test.mjs`
- 关联验证：V-11
- 结果分类：未执行
- 证据：待执行；第二阶段通过后写入 `openspec/changes/deliver-platform-runtime-on-install/evidence/V-11.json`

### TC-08：本地发布级共享链保持完整

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：端到端
- 关联决策：D-08、D-10、D-11、D-12、D-13
- 关联验收：A-01、A-02、A-03、A-04、A-06
- 关联规格：`plugin-ui-review-automation / 平台成品必须安全暂存并满足带余量的体积预算`、`repository-verification-gate / 持续集成必须复用统一入口`
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态
- 前置条件：适用聚焦自动用例通过
- 测试数据：全仓测试、插件结构、OpenSpec、运行时完整性、当前平台浏览器和工作区状态
- 测试替身：无；真实本地门禁的临时依赖与 fixture 必须位于 `outputs/`
- 操作：运行 `npm test`、`npm run validate`、`npm run verify` 与官方 Skill/Plugin validators
- 可观察断言：全部门禁通过；源码共享校验不要求平台二进制；实际成品完整性与冒烟通过；根无测试专用 node_modules、平台暂存或其他验证残留
- 目标测试：`tests/ui-review-platform-runtime.test.mjs`
- 测试定位：`[TC-03] 源码外唯一平台 marketplace 成品`
- 聚焦命令：不适用；本用例为需求记录的发布级全量验证
- 关联验证：V-03
- 结果分类：通过
- 证据：`openspec/changes/deliver-platform-runtime-on-install/evidence/V-03.json`

### TC-09：Vue 3 + Vite 真实 fixture 工作流兼容

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：端到端
- 关联决策：D-11
- 关联验收：A-04
- 关联规格：`repository-verification-gate / 持续集成必须复用统一入口`
- 状态矩阵：初始（已有数据）、用户操作、刷新、错误态
- 前置条件：仓库固定 Vue 3 + Vite + Vitest fixture 可用
- 测试数据：未初始化、初始化、重复执行、升级和健康检查
- 测试替身：仓库内真实 fixture，不连接外部项目
- 操作：执行 fixture 初始化预览/写入、重复执行、升级和检查
- 可观察断言：幂等、只替换受管段、不覆盖业务内容，平台交付改造没有破坏前端工作流
- 目标测试：`tests/frontend-test-workflow.test.mjs`
- 测试定位：`[TC-03] Vue Vitest fixture 真实发现 TC，零测试失败且重复执行不改文件`
- 聚焦命令：`node --test tests/frontend-test-workflow.test.mjs tests/workflow-project.test.mjs`
- 关联验证：V-04
- 结果分类：通过
- 证据：`openspec/changes/deliver-platform-runtime-on-install/evidence/V-04.json`

### TC-10：五个平台 marketplace 安装与断网运行

- 状态：计划
- 优先级：P0
- 验证类型：人工
- 测试层级：端到端
- 关联决策：D-03、D-04、D-05、D-06、D-09、D-11、D-12、D-13
- 关联验收：A-02、A-03、A-05、A-06
- 关联规格：`plugin-ui-review-automation / 生成只包含一个平台的完整成品`、`离线环境安装已验证成品`
- 状态矩阵：用户操作、刷新、错误态
- 前置条件：macOS ARM64/x64、Linux ARM64/x64、Windows x64 原生环境各自生成成品；记录精确插件版本与报告摘要
- 测试数据：五个平台成品、本地 marketplace 路径、安装命令、新 Codex 任务、同一 UI Review 冒烟场景和断网环境
- 测试替身：不适用；必须使用原生成品和真实 Codex 安装，CI 结构校验不能替代
- 操作：每个平台添加本地 marketplace、安装插件、打开新任务加载能力、运行 Chromium 冒烟；断网后再次运行；另把同平台同版本完整成品复制到离线位置安装
- 可观察断言：每个平台安装和加载成功；插件只含当前平台；断网运行不下载、不使用系统 Chrome、不修改业务依赖；网络准备失败时旧插件可用；任一平台缺失则 LFS 删除门禁保持关闭
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-05
- 结果分类：未执行
- 证据：`openspec/changes/deliver-platform-runtime-on-install/verification.md`；本机运行产物位于被忽略的 `outputs/platform-runtime-delivery/`

### TC-11：最终精确提交的共享与五平台 CI

- 状态：计划
- 优先级：P0
- 验证类型：人工
- 测试层级：端到端
- 关联决策：D-07、D-09、D-11、D-12
- 关联验收：A-04、A-05、A-06
- 关联规格：`repository-verification-gate / 持续集成必须复用统一入口`
- 状态矩阵：用户操作、刷新、错误态
- 前置条件：使用 WebStorm 推送阶段提交并触发 Validate
- 测试数据：精确 SHA、Actions URL、shared 与五个平台任务、五份报告、工作流可见耗时
- 测试替身：不适用；本地模拟不能替代 GitHub Actions
- 操作：第一阶段复核无 LFS 下载的新准备链；第二阶段复核 HEAD 已无平台资产的最终提交；记录全部任务与报告
- 可观察断言：同一 SHA 的一次 shared 与五个平台任务全部成功；只上传五份报告；无 LFS/cache/schedule；失败时记录平台、步骤、稳定字段、本地遗漏、补充回归和复跑 URL
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-06
- 结果分类：未执行
- 证据：待执行；`openspec/changes/deliver-platform-runtime-on-install/verification.md` 与外部 CI URL

## 执行记录

| 用例 | 命令或方式 | 结果 | 证据 |
| --- | --- | --- | --- |
| TC-01～TC-05 | 按各自精确定位运行平台专用手写测试 | 通过 | V-01、V-07～V-10 已生成 |
| TC-06～TC-07 | 第二阶段运行仓库卫生和体积退役测试 | 未执行 | V-02、V-11 待生成 |
| TC-08 | 执行全量、结构、统一验证和官方 validators | 通过 | V-03 已生成；validators 见 `verification.md` |
| TC-09 | 执行 Vue 3 + Vite fixture | 通过 | V-04 已生成 |
| TC-10 | macOS ARM64 已完成真实本地 marketplace 安装、新上下文加载、Chromium 冒烟和下载源不可达复核；其他四个平台待外部环境 | 部分通过 | V-05 已记录当前平台，五平台结论保持待完成 |
| TC-11 | 计划复核第一阶段与最终第二阶段精确提交的真实 Actions | 未执行 | V-06 待记录 |
