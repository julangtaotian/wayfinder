# 测试方案：自动化模拟需求与开发者交付效果基准

## 基本信息

- 状态：已实现
- 需求：`requirements/REQ-2026-042-synthetic-developer-effectiveness-benchmark.md`
- 变更：add-synthetic-developer-effectiveness-benchmark
- 需求修订基线：R-02
- 默认聚焦命令：`node --test tests/developer-effectiveness-benchmark.test.mjs`

## 测试上下文

- 测试命令状态：detected
- 测试命令：`npm run test`
- 测试运行器：仓库命令使用 Node.js test runner；检查器同时从 fixture 配置识别到 Vitest，认证等级为 project-evidence-only
- 测试目录：`tests`
- Git 基线：available；提交 `f0953cdd5c26345accfc4b1838b367f6b4ab1929`；`tests/developer-effectiveness-benchmark.test.mjs` 规划前不存在
- 兼容说明：自动测试使用受控 Git 仓库、注入执行器、虚拟时钟和 POSIX/Windows 路径样本，不调用真实 Codex、不读取三个业务项目、不消耗账号额度；真实六需求十二运行由独立人工复核用例承接。

## 测试用例

### TC-01：安全预览固定基线且排除已有未提交内容

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-01、D-02、D-03、D-10
- 关联验收：A-01、A-05
- 关联规格：synthetic-developer-effectiveness-benchmark / 合法配置只产生无写入预览、危险或运行期漂移基线失败关闭、已有未提交内容被排除但保持不变
- 状态矩阵：初始（已有数据）、空态、错误态
- 前置条件：测试可建立含已提交文件和额外未提交文件的三个独立 Git fixture，并注入源摘要漂移。
- 测试数据：合法项目 ID、分支、40 位提交、六需求十二运行规模、危险根路径、非独立 Git 根、已有 dirty 状态和前后不同状态摘要。
- 测试替身：受控 Git fixture 和零调用代理执行器。
- 操作：分别运行无 `--write` 预览、危险配置、已有未提交内容及运行期漂移场景。
- 可观察断言：合法预览返回项目别名、提交、规模和相对输出且零写入、零代理调用；已有未提交内容标记为被排除并不进入副本；危险路径或运行期摘要变化使用稳定错误码失败关闭。
- 目标测试：`tests/developer-effectiveness-benchmark.test.mjs`
- 测试定位：`[TC-01] 安全预览固定基线且排除已有未提交内容`
- 聚焦命令：`node --test --test-name-pattern=TC-01 tests/developer-effectiveness-benchmark.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`evidence/V-01.json`

### TC-02：模拟需求通过双向预检后冻结

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-01、D-02、D-06、D-11
- 关联验收：A-02
- 关联规格：synthetic-developer-effectiveness-benchmark / 六个用例通过冻结预检、不可验收候选不能进入运行
- 状态矩阵：用户操作、空态、错误态
- 前置条件：作者执行器可注入六个合法候选以及重复 ID、空验收器、外部账号依赖和不可通过参考实现样本。
- 测试数据：三项目各两个用例、小中大复杂度各两个、seed/evaluator/reference/clarification 内容及 SHA-256，以及 Windows Git 检出的 CRLF 源码样本。
- 测试替身：假的需求作者、补丁应用器和离线验收器。
- 操作：生成候选，分别验证 seed + evaluator 必须失败、seed + reference + evaluator 必须通过，再触发各类非法候选。
- 可观察断言：合法清单恰好六项、每项目两项、复杂度分布正确且内容摘要冻结；源码语义比较兼容 LF 与 CRLF；非法候选不能进入任何配对运行，不能通过放宽验收继续。
- 目标测试：`tests/developer-effectiveness-benchmark.test.mjs`
- 测试定位：`[TC-02] 模拟需求通过双向预检后冻结`
- 聚焦命令：`node --test --test-name-pattern=TC-02 tests/developer-effectiveness-benchmark.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`evidence/V-01.json`

### TC-03：插件组和对照组保持配对公平与隔离

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-03、D-04、D-05、D-06
- 关联验收：A-03、A-05
- 关联规格：synthetic-developer-effectiveness-benchmark / 插件组完成工作流准备后开始计时、两组按冻结参数独立执行、执行路线与产物不符时样本无效
- 状态矩阵：用户操作、错误态
- 前置条件：同一冻结用例可建立 plugin 与 baseline 两个工作区，插件准备器和路线事件可注入。
- 测试数据：相同 commit、seed、模型、推理强度、时间预算与验收摘要；快速通道、完整通道、缺失路线和对照组污染样本。
- 测试替身：假的工作流初始化器与 Codex 结构化事件流。
- 操作：准备插件基线后启动配对运行，比较参数和源码起点，再触发路线证据缺失与对照组生成工作流产物。
- 可观察断言：准备耗时不进入任务时间；两组工作区互不可见且运行参数一致；快速与完整路线具有多证据；缺失路线或对照污染被排除为无效样本。
- 目标测试：`tests/developer-effectiveness-benchmark.test.mjs`
- 测试定位：`[TC-03] 插件组和对照组保持配对公平与隔离`
- 聚焦命令：`node --test --test-name-pattern=TC-03 tests/developer-effectiveness-benchmark.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`evidence/V-01.json`

### TC-04：澄清、首次交付和返工在同一会话闭环

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-03、D-06、D-07
- 关联验收：A-04
- 关联规格：synthetic-developer-effectiveness-benchmark / 首次验收通过、验收失败后原会话返工、代理请求必要澄清、超时、启动失败或中断
- 状态矩阵：用户操作、错误态、卸载
- 前置条件：执行器能按顺序返回 needs_clarification、delivered、blocked、启动失败、超时和中断事件，虚拟时钟可控。
- 测试数据：冻结澄清预案、一次通过、一次失败后通过、超过返工上限、未规划问题和四类进程失败。
- 测试替身：假的 Codex exec/resume、虚拟时钟和独立验收器。
- 操作：驱动状态机完成澄清、首次交付、隐藏验收与返工，并逐一注入异常出口。
- 可观察断言：只释放冻结答案；首次交付和总周期使用真实阶段时间；验收失败后恢复同一 session 且返工准确加一；未规划问题和异常出口分类稳定；额度、服务或进程中断暂停整轮且不写成开发失败样本。
- 目标测试：`tests/developer-effectiveness-benchmark.test.mjs`
- 测试定位：`[TC-04] 澄清首次交付和返工在同一会话闭环`
- 聚焦命令：`node --test --test-name-pattern=TC-04 tests/developer-effectiveness-benchmark.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`evidence/V-01.json`

### TC-05：指标保留未知语义并只汇总有效配对

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-07、D-08、D-09
- 关联验收：A-04、A-06
- 关联规格：synthetic-developer-effectiveness-benchmark / 完整运行形成有效样本、不完整运行保持无效、误阻断只有确定性反证时自动成立、六个配对样本完整时生成相对比较、有效配对不足时不形成优劣结论
- 状态矩阵：初始（已有数据）、空态、错误态
- 前置条件：指标计算接收完整运行、不完整运行、零值、阻断和六个配对样本。
- 测试数据：null 与 0 混合字段、首次交付前的证据完整阻断、确定性误阻断反证、review-required 候选、完整六配对和缺一组配对。
- 测试替身：固定运行事件和验收摘要，无外部进程。
- 操作：计算运行、配对和分组汇总，并生成工作簿导入行。
- 可观察断言：未知保持 null、零值保持 0；证据完整的交付或阻断运行有效，首次交付前阻断以带原因的 null 保留且不被排除；确认与待复核误阻断分开；六配对输出描述性比较，不足时固定为 `insufficient-pairs`；所有记录带 synthetic 标记。
- 目标测试：`tests/developer-effectiveness-benchmark.test.mjs`
- 测试定位：`[TC-05] 指标保留未知语义并只汇总有效配对`
- 聚焦命令：`node --test --test-name-pattern=TC-05 tests/developer-effectiveness-benchmark.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`evidence/V-01.json`

### TC-06：证据脱敏、原子恢复和有界清理

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-08、D-10、D-11
- 关联验收：A-04、A-05
- 关联规格：synthetic-developer-effectiveness-benchmark / 持久输出经过脱敏和限长、清理只作用于有界工作区、恢复运行不覆盖既有证据
- 状态矩阵：刷新、错误态、卸载
- 前置条件：测试可在有界 fixture 中创建结构化事件、敏感文本、超长日志、已完成状态、冲突摘要、符号链接和越界路径。
- 测试数据：POSIX/Windows 业务路径、Bearer token、Cookie、密码、私钥头、超长输出、相同与不同输入 SHA-256。
- 测试替身：原子文件写入器、失败清理器和受控文件系统结构。
- 操作：持久化并恢复同一 run ID，触发敏感内容、截断、冲突恢复、正常清理、清理失败和越界清理。
- 可观察断言：路径替换为项目别名，敏感原文不落盘，超长输出限长；输入一致只续跑未完成阶段，冲突不覆盖；清理仅删除本轮非符号链接工作区且保留原始失败。
- 目标测试：`tests/developer-effectiveness-benchmark.test.mjs`
- 测试定位：`[TC-06] 证据脱敏原子恢复和有界清理`
- 聚焦命令：`node --test --test-name-pattern=TC-06 tests/developer-effectiveness-benchmark.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`evidence/V-01.json`

### TC-07：跨平台路径和无 shell 子进程保持稳定诊断

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-10、D-12
- 关联验收：A-07
- 关联规格：synthetic-developer-effectiveness-benchmark / Windows 与 POSIX 路径得到一致机器结果、没有真实矩阵证据时只报告本地结果
- 状态矩阵：用户操作、错误态、卸载
- 前置条件：可注入目标平台路径模块、Codex 可执行入口、JavaScript 入口、`.cmd` 样本、空格与非 ASCII cwd、退出码和环境变量。
- 测试数据：`D:/workspace`、`D:\\workspace`、POSIX 路径、尾分隔符、`.cmd`、JS CLI、退出码 7、正常响应终止信号与忽略温和终止信号的超时进程、五平台证据待执行状态。
- 测试替身：记录 argv/cwd/env/shell 的子进程执行器，不启动真实程序。
- 操作：解析与比较跨平台路径，构造 Codex 命令，注入启动失败和非零退出，并汇总仅本地证据。
- 可观察断言：比较双方使用相同路径语义；参数数组不经 shell；JS 入口由当前 Node 启动；Windows 包装器被拒绝；真实退出码保留；超时进程先温和终止、忽略信号时再强制结束；没有五平台结果时不宣称跨平台发布通过。
- 目标测试：`tests/developer-effectiveness-benchmark.test.mjs`
- 测试定位：`[TC-07] 跨平台路径和无 shell 子进程保持稳定诊断`
- 聚焦命令：`node --test --test-name-pattern=TC-07 tests/developer-effectiveness-benchmark.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`evidence/V-01.json`

### TC-08：普通仓库验证不启动真实代理

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-02、D-10、D-12
- 关联验收：A-05、A-07
- 关联规格：synthetic-developer-effectiveness-benchmark / 合法配置只产生无写入预览、没有真实矩阵证据时只报告本地结果
- 状态矩阵：初始（已有数据）、用户操作
- 前置条件：根 package scripts、测试分组和验证入口可读，真实执行必须同时要求 `--write` 与 `--execute-agents`。
- 测试数据：`npm test`、`npm run validate`、workflow 测试分组和新增显式基准命令。
- 测试替身：零调用代理执行器。
- 操作：检查命令调用关系并运行聚焦测试、完整测试和结构校验。
- 可观察断言：普通测试和结构校验只执行确定性测试，不读取业务项目、不运行 Codex、不消耗额度；真实代理入口保持显式且默认预览。
- 目标测试：`tests/developer-effectiveness-benchmark.test.mjs`
- 测试定位：`[TC-08] 普通仓库验证不启动真实代理`
- 聚焦命令：`node --test --test-name-pattern=TC-08 tests/developer-effectiveness-benchmark.test.mjs`
- 关联验证：V-02
- 结果分类：通过
- 证据：`evidence/V-02.json`

### TC-09：官方 validators 和 Vue 3 生命周期保持通过

- 状态：通过
- 优先级：P0
- 验证类型：人工
- 测试层级：集成
- 关联决策：D-04、D-10、D-12
- 关联验收：A-05、A-07
- 关联规格：synthetic-developer-effectiveness-benchmark / 没有真实矩阵证据时只报告本地结果
- 状态矩阵：初始（已有数据）、用户操作
- 前置条件：当前 Codex 开发环境可运行仓库固定的官方 validator 入口，Vue 3 + Vite fixture 可执行初始化、重复执行、升级和检查。
- 测试数据：全部自定义 Skill、插件 manifest 和仓库 Vue 3 + Vite fixture。
- 测试替身：不适用。
- 操作：运行 `npm run validate:official`，再对 Vue 3 + Vite fixture 执行初始化、重复执行、升级和检查。
- 可观察断言：官方 Skill/Plugin validators 真实启动并通过；fixture 生命周期保持幂等；结果只声明本地环境证据。
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-03
- 结果分类：通过
- 证据：`evidence/V-03.json`

### TC-10：三个项目完成六需求十二运行本机试点

- 状态：通过
- 优先级：P0
- 验证类型：人工
- 测试层级：端到端
- 关联决策：D-01、D-02、D-03、D-04、D-05、D-06、D-07、D-08、D-09、D-10、D-11
- 关联验收：A-01、A-02、A-03、A-04、A-05、A-06
- 关联规格：synthetic-developer-effectiveness-benchmark / 六个用例通过冻结预检、两组按冻结参数独立执行、六个配对样本完整时生成相对比较、有效配对不足时不形成优劣结论
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态、卸载
- 前置条件：当前账号具备足够 Codex 额度，三个业务目录可只读访问，聚焦和本地统一验证已通过。
- 测试数据：三个项目各两个冻结模拟需求、插件组和对照组共十二次运行、运行前后源摘要、完整指标和限制。
- 测试替身：不适用；需求和验收由独立作者阶段生成，但必须人工复核质量与泄露边界。
- 操作：先运行单用例 smoke，再显式执行整轮；复核六个公开需求、隐藏验收隔离、路线、误阻断候选、源仓库摘要、清理和汇总。
- 可观察断言：业务项目零变化；六个用例与十二次运行状态完整；有效样本和无效原因可追踪；工作簿导入数据带 synthetic 标记；报告不外推真实开发者效果。
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-04
- 结果分类：通过
- 证据：`evidence/V-04.json`、`outputs/developer-effectiveness-benchmark/synthetic-pilot-frozen-20260907/summary.json`、`outputs/developer-effectiveness-benchmark/synthetic-pilot-frozen-20260907/review.md` 与 `outputs/developer-metrics-pilot/developer-effectiveness-pilot.xlsx`

### TC-11：真实五平台 CI 证据独立于本机试点

- 状态：失败
- 优先级：P1
- 验证类型：人工
- 测试层级：人工
- 关联决策：D-12
- 关联验收：A-07
- 关联规格：synthetic-developer-effectiveness-benchmark / 没有真实矩阵证据时只报告本地结果
- 状态矩阵：用户操作、错误态
- 前置条件：变更已提交，GitHub Actions 对同一精确提交运行五平台 `Validate` 矩阵。
- 测试数据：darwin-arm64、darwin-x64、linux-x64、linux-arm64、win32-x64 五个任务状态和运行 URL。
- 测试替身：不适用。
- 操作：检查同一提交的五个平台任务和失败诊断，记录远程 URL、提交 SHA 与状态。
- 可观察断言：五个平台全部成功后才能声明真实跨平台矩阵通过；任何未运行或失败均保持待执行或失败，不能由本机测试替代。
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-05
- 结果分类：测试代码错误
- 证据：[GitHub Actions Validate #94 / win32-x64](https://github.com/julangtaotian/wayfinder/actions/runs/34101545332/job/101677126650)；提交 `87433d4bced36109de03ecb8470fce91e59d4208`；修复提交的五平台复跑待执行
