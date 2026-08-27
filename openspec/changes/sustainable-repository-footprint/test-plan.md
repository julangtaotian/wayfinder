# 测试方案：仓库持续瘦身与生命周期治理

## 基本信息

- 状态：已实现
- 需求：`requirements/REQ-2026-032-sustainable-repository-footprint.md`
- 变更：sustainable-repository-footprint
- 需求修订基线：R-01
- 默认聚焦命令：`npm run test:repository`

## 测试上下文

- 测试命令状态：detected
- 测试命令：`npm test`
- 测试运行器：Node Test Runner
- 测试目录：`tests`
- Git 基线：available；`tests/workflow.test.mjs`、`tests/ui-review-platform-runtime.test.mjs`、`tests/repository-hygiene.test.mjs` 已受跟踪；`tests/repository-footprint.test.mjs`、`tests/requirement-archive.test.mjs`、`tests/lanhu-ai-spec.test.mjs` 在规划时不存在。
- 兼容说明：只使用 Node.js 标准库；测试 fixture 必须位于 `outputs/<本变更测试主题>/` 并隔离父 Git；拆分后原 CLI、导出、code、target、status 和参数保持兼容。
- 跨平台高风险：是；命中 CI、路径、临时目录、子进程、环境变量和机器可读诊断。确定性回归同时覆盖 Git 风格 `D:/...` 与 Node 风格 `D:\\...` 的双侧规范化；真实五平台证据只由同一提交的 CI 矩阵提供。

## 测试用例

### TC-01：既有已验收需求迁移生成稳定存根与索引

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-03、D-04、D-13
- 关联验收：A-02
- 关联规格：verifiable-change-delivery / 完成流程必须分层归档已验收需求
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态
- 前置条件：隔离 Git fixture 含活跃需求、已验收完整需求、已有存根和冲突候选
- 测试数据：2026 年需求、空目录、重复执行、符号链接/越界目标和同 ID 多正文
- 测试替身：使用仓库内隔离 fixture，不读取真实用户主目录
- 操作：分别运行迁移预览与写入，再重复运行并制造冲突
- 可观察断言：完整正文仅进入年度目录；根存根短小且可定位；索引排序、SHA-256、路径稳定且无时间戳/绝对路径；重复无 diff；冲突非零失败
- 目标测试：`tests/requirement-archive.test.mjs`
- 测试定位：`[V-02] 需求生命周期分层合同`
- 聚焦命令：`node --test tests/requirement-archive.test.mjs`
- 关联验证：V-02
- 结果分类：通过
- 证据：`openspec/changes/sustainable-repository-footprint/evidence/V-02.json`

### TC-02：完成与恢复流程自动归档需求且保持幂等

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-03、D-04
- 关联验收：A-02、A-07
- 关联规格：verifiable-change-delivery / 需求归档恢复必须保持幂等
- 状态矩阵：用户操作、刷新、错误态
- 前置条件：完成门禁通过的 fixture 和可注入的原子写入/归档后审计服务
- 测试数据：正常完成、正文写入失败、存根失败、索引失败、已迁移恢复和多候选恢复
- 测试替身：不执行真实项目命令；注入确定性 OpenSpec 归档响应
- 操作：执行完成预览、写入及恢复
- 可观察断言：预览零写入；成功响应包含 stub/archive/index；部分失败保留真实目标；恢复不二次移动、不重跑验证
- 目标测试：`tests/requirement-archive.test.mjs`
- 测试定位：`[V-02] 需求生命周期分层合同`
- 聚焦命令：`node --test tests/requirement-archive.test.mjs`
- 关联验证：V-02
- 结果分类：通过
- 证据：`openspec/changes/sustainable-repository-footprint/evidence/V-02.json`

### TC-03：历史需求默认不展开且显式审计可定位

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-03、D-05
- 关联验收：A-02、A-07
- 关联规格：ai-context-efficiency / 历史需求正文必须按生命周期渐进读取
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态
- 前置条件：fixture 含活跃全文、历史存根、索引和归档正文
- 测试数据：默认 summary、显式历史模式、按 code 查询、缺失索引和指纹漂移
- 测试替身：记录文件读取目标，证明默认路径未读取归档正文
- 操作：运行默认检查和显式历史审计
- 可观察断言：默认只读根入口；显式模式只读索引目标；错误映射返回稳定 code；输出分页保持有界
- 目标测试：`tests/requirement-archive.test.mjs`
- 测试定位：`[V-02] 需求生命周期分层合同`
- 聚焦命令：`node --test tests/requirement-archive.test.mjs`
- 关联验证：V-02
- 结果分类：通过
- 证据：`openspec/changes/sustainable-repository-footprint/evidence/V-02.json`

### TC-04：仓库体积预算稳定通过并阻断各类回归

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-06、D-13
- 关联验收：A-03、A-07
- 关联规格：repository-footprint-governance / 仓库必须提供版本化体积预算审计
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态
- 前置条件：隔离 Git fixture 可提交不同路径和文件规模
- 测试数据：预算内、退役路径、201 个 outputs、超过 10MiB、6 份活跃全文、1001 行测试和 801 行脚本
- 测试替身：真实 Git 索引；文件内容使用小型稀疏/注入大小策略避免制造大临时垃圾
- 操作：运行人类模式和 JSON 模式审计
- 可观察断言：通过时零诊断；每类违规返回唯一稳定 code/target/actual/limit 和非零退出；命令不写文件、不抬高预算
- 目标测试：`tests/repository-footprint.test.mjs`
- 测试定位：`[V-03] 仓库体积与统一验证治理合同`
- 聚焦命令：`node --test tests/repository-footprint.test.mjs`
- 关联验证：V-03
- 结果分类：通过
- 证据：`openspec/changes/sustainable-repository-footprint/evidence/V-03.json`

### TC-05：精简蓝湖 AI 规范独立完整且重资产退役

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-01、D-02
- 关联验收：A-01
- 关联规格：lanhu-design-spec-contract / 精简 AI 规范必须成为唯一活动蓝湖交付
- 状态矩阵：初始（已有数据）、刷新、错误态
- 前置条件：`outputs/lanhu-ai-ui-spec/` 保留，重资产删除
- 测试数据：README、全部 Markdown、场景 ID、相对链接和禁止词/路径
- 测试替身：不适用；直接读取受跟踪精简规范
- 操作：解析索引、链接和场景，检查 Git 跟踪路径
- 可观察断言：本地链接存在、场景唯一、规范可发现；不包含验证外壳/证据路径；`outputs/lanhu-design-spec/` 无跟踪文件
- 目标测试：`tests/lanhu-ai-spec.test.mjs`
- 测试定位：`蓝湖 AI 规范是唯一、轻量且自包含的正式输入`
- 聚焦命令：`node --test tests/lanhu-ai-spec.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/sustainable-repository-footprint/evidence/V-01.json`

### TC-06：测试拆分与聚焦入口保持真实发现

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-07、D-08
- 关联验收：A-05、A-06
- 关联规格：repository-footprint-governance / 仓库必须提供职责稳定的聚焦验证入口
- 状态矩阵：用户操作、错误态
- 前置条件：综合测试已经按职责拆分且聚焦分组配置存在
- 测试数据：repository、workflow、platform 三组和人为零文件分组
- 测试替身：对子进程执行器注入记录服务，另有真实命令验证
- 操作：运行三组聚焦入口和零发现分组
- 可观察断言：目标文件存在且测试数非零；零发现非零退出；全量发现仍包含全部根级 `.test.mjs`
- 目标测试：`tests/test-entrypoints.test.mjs`
- 测试定位：`[V-05] 聚焦入口与核心脚本兼容合同`
- 聚焦命令：`node --test tests/test-entrypoints.test.mjs tests/repository-footprint.test.mjs`
- 关联验证：V-05、V-06
- 结果分类：通过
- 证据：`openspec/changes/sustainable-repository-footprint/evidence/V-05.json`

### TC-07：核心脚本拆分保持导出与 CLI 兼容

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-07
- 关联验收：A-05
- 关联规格：repository-footprint-governance / 预算变化必须经过显式规划
- 状态矩阵：用户操作、刷新、空态、错误态
- 前置条件：证据与真实项目验证脚本已拆分
- 测试数据：现有历史诊断、manifest、矩阵预览、失败分类和 CLI 参数 fixture
- 测试替身：沿用现有专用测试注入服务，不访问外部业务项目
- 操作：运行原有 verification/real-project 专用测试及公开导出快照
- 可观察断言：导出名、参数、code/status/target、顺序和退出状态兼容；入口文件均在行数预算内
- 目标测试：`tests/repository-footprint.test.mjs`
- 测试定位：`[V-05] 聚焦入口与核心脚本兼容合同`
- 聚焦命令：`node --test tests/verification-evidence-integrity.test.mjs tests/real-project-validation.test.mjs tests/repository-footprint.test.mjs`
- 关联验证：V-05
- 结果分类：通过
- 证据：`openspec/changes/sustainable-repository-footprint/evidence/V-05.json`

### TC-08：目标平台 LFS 资产准备与指针失败关闭

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-09、D-10、D-11、D-13
- 关联验收：A-04
- 关联规格：repository-hygiene / 平台资产必须支持按目标检出且保持完整性
- 状态矩阵：用户操作、刷新、空态、错误态
- 前置条件：平台运行时 fixture 包含真实文件、LFS v1 指针和缺失目标
- 测试数据：五个平台、Git 风格 `D:/workspace`、Node 风格 `D:\\workspace`、指针头和错误平台
- 测试替身：小型 fixture 代替真实浏览器二进制
- 操作：生成平台拉取计划并运行完整性检查
- 可观察断言：include 只命中目标平台；两类 Windows 路径双侧归一化一致；真实文件通过；指针/缺失/错误平台返回稳定 code/target
- 目标测试：`tests/ui-review-platform-runtime.test.mjs`
- 测试定位：`[V-04] 平台资产与 CI 按需拉取合同`
- 聚焦命令：`npm run test:platform`
- 关联验证：V-04
- 结果分类：通过
- 证据：`openspec/changes/sustainable-repository-footprint/evidence/V-04.json`

### TC-09：CI 每个矩阵只拉取目标平台并保留真实门禁

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-09、D-10、D-13
- 关联验收：A-04、A-08
- 关联规格：repository-hygiene / 平台资产必须支持按目标检出且保持完整性
- 状态矩阵：初始（已有数据）、刷新、错误态
- 前置条件：`.github/workflows/validate.yml` 声明五平台矩阵
- 测试数据：checkout LFS 配置、matrix.platform include、verify 与 package 步骤
- 测试替身：解析受跟踪 YAML 文本；不在本地伪造 runner
- 操作：检查每个矩阵共享的准备和验证链
- 可观察断言：checkout 不全量 smudge；pull include 使用平台变量；五平台不减少；每项仍执行 verify、真实包和报告上传
- 目标测试：`tests/ui-review-platform-runtime.test.mjs`
- 测试定位：`[V-04] 平台资产与 CI 按需拉取合同`
- 聚焦命令：`npm run test:platform`
- 关联验证：V-04、V-07
- 结果分类：通过
- 证据：`openspec/changes/sustainable-repository-footprint/evidence/V-04.json`；远端 URL 待生成

### TC-10：统一验证、版本与长期治理规则保持一致

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：端到端
- 关联决策：D-06、D-08、D-12、D-13
- 关联验收：A-03、A-06、A-07、A-08
- 关联规格：repository-verification-gate / 仓库必须提供统一完整验证入口
- 状态矩阵：初始（已有数据）、用户操作、刷新、错误态
- 前置条件：全部实施任务和聚焦测试通过
- 测试数据：根 package、manifest、AGENTS、README、verify 阶段、官方 validators 和当前平台包
- 测试替身：无；执行真实本地验证并解析受跟踪规则与版本文件
- 操作：运行 `npm test`、`npm run validate`、`npm run verify`、官方 validators、当前平台冒烟/打包并检查工作区
- 可观察断言：本地门禁通过；版本为 0.18.0；体积阶段存在；规则明确无需定期清理；外部矩阵未运行时仍保持待执行
- 目标测试：`tests/repository-footprint.test.mjs`
- 测试定位：`[V-03] 仓库体积与统一验证治理合同`
- 聚焦命令：`node --test tests/repository-footprint.test.mjs`
- 关联验证：V-03、V-04、V-05、V-06、V-08
- 结果分类：通过
- 证据：V-03～V-06 schema v2 JSON 与 `verification.md`

### TC-11：真实五平台矩阵分层取证

- 状态：三次失败，待最新修复提交复跑
- 优先级：P0
- 验证类型：自动
- 测试层级：端到端
- 关联决策：D-10、D-13
- 关联验收：A-04、A-08
- 关联规格：repository-verification-gate / 聚焦验证与完整验证必须保持证据分层
- 状态矩阵：用户操作、错误态
- 前置条件：实施提交已经推送并触发真实 GitHub Actions
- 测试数据：精确提交 SHA、五个平台任务、LFS 准备、verify、冒烟和包报告
- 测试替身：不适用；本地模拟不能替代
- 操作：读取同一运行的五项任务状态与报告
- 可观察断言：五项全部成功才把 V-07 更新为通过；任一失败记录平台、步骤、稳定 code、根因和新增回归定位
- 目标测试：`tests/ui-review-platform-runtime.test.mjs`
- 测试定位：`[TC-11] 真实五平台矩阵分层取证合同`
- 聚焦命令：`node --test --test-name-pattern="真实五平台矩阵分层取证合同" tests/ui-review-platform-runtime.test.mjs`
- 关联验证：V-07
- 结果分类：未通过（前三次运行）；第三次已证明 darwin-arm64 完整链成功，其余平台的回归测试固定目标已改为继承矩阵目标，真实矩阵待复跑
- 证据：首次运行 `https://github.com/julangtaotian/wayfinder/actions/runs/33032201305`，提交 `cec8a026aab8330c4f0e09f2eb516f7f222f2065`；第二次运行 `https://github.com/julangtaotian/wayfinder/actions/runs/33032788437`，提交 `d6a0d31c52209a76b1a5a3d84f428e083fac8c71`；第三次运行 `https://github.com/julangtaotian/wayfinder/actions/runs/33033888961`，提交 `7251a9db996a544777cf208129c10c4daa787073`；失败复盘见 `verification.md`

### TC-12：人工核对根入口和已退役路径

- 状态：人工通过
- 优先级：P1
- 验证类型：人工
- 测试层级：人工
- 关联决策：D-01、D-03、D-06
- 关联验收：A-01、A-02、A-07
- 关联规格：repository-footprint-governance / 预算变化必须经过显式规划
- 状态矩阵：初始（已有数据）、刷新
- 前置条件：自动迁移、蓝湖退役和体积审计已通过
- 测试数据：WebStorm 项目树、根需求存根、年度归档目录、精简 AI 规范和 AGENTS/README
- 测试替身：不适用
- 操作：在 WebStorm 中核对默认项目树和规则入口，不展开 runtime、outputs 历史或 OpenSpec archive
- 可观察断言：蓝湖重资产路径不存在；根需求均为活跃全文或轻量存根；年度正文与索引可定位；规则明确预算例外走正式规划
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-08
- 结果分类：通过
- 证据：`openspec/changes/sustainable-repository-footprint/verification.md`

## 执行记录

| 用例 | 命令或方式 | 结果 | 证据 |
| --- | --- | --- | --- |
| TC-01～TC-10 | 三个聚焦入口、`npm test`、`npm run validate`、`npm run verify`、官方 validators 与当前平台成品 | 通过 | V-01～V-06 |
| TC-11 | Validate #50/#51/#52、单平台 LFS 指针、真实 CLI 目标范围与 UI 自动化目标回归；最新修复提交待复跑 | 三次失败，待复跑 | V-07、`verification.md` |
| TC-12 | WebStorm 项目树与文件搜索人工核对 | 通过 | V-08 |
