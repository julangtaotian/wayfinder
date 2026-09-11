## Context

现有完成入口把 OpenSpec archive、需求状态改写、证据引用迁移、需求年度归档和归档后审计串成永久文件搬运链。该链路安全但每次完成都会增加历史文件，且 `outputs` 与 UI Review runs 形成旁路。具体行为合同见 proposal 与五份 delta spec；本设计依据 D-01～D-19，只说明如何在不修改内置 OpenSpec 运行时的前提下切换到轻量生命周期。

仓库只允许 Node.js 标准库，初始化默认预览，所有目标路径必须经过安全解析。此次命中真实五平台 CI 的路径、临时目录、子进程、环境变量、Git 和机器诊断风险。

## Goals / Non-Goals

**Goals:**

- 用一个小型、稳定、追加式事件层替代三套永久归档与普通证据树。
- 保留原生 OpenSpec 的严格校验、规格合并、TOCTOU 检查和归档回滚，不分叉 vendored runtime。
- 让完成、恢复、取消、替代、重开、分支状态和存量迁移均可机器判断。
- 从产生端统一临时目录，硬门禁只检查 Git 索引，不遍历本地大目录。
- 先兼容读取、再切换写入、最后迁移存量，任何阶段均可停止而不丢失现有历史。

**Non-Goals:**

- 不提供不可抵赖审计系统；默认事件是仓库内状态声明。
- 不从本地自动查询或回写 GitHub Actions 结果。
- 不批量重命名所有历史测试用例，也不修改 OpenSpec 内部 archive 布局。
- 不在本变更中重写 Git 历史或清理用户未跟踪输出。

## Decisions

### 1. 配置、事件和运行时使用三个独立边界

仓库配置使用 `.frontend-workflow.json`，只保存 schemaVersion、minimumWriterVersion、事件目录和预算；事件默认写入 `.workflow-history/<year>.jsonl`；运行时使用 `.frontend-ai-workflow/{runs,cache,transactions}`。事件目录与运行时目录分离，避免 ignore 规则误伤持久事实。

备选方案是全部放进 `.frontend-ai-workflow/`，但一条宽泛 ignore 就可能隐藏历史事件，因此放弃。

### 2. 事件逐条文件化写入，而非所有进程追加同一 JSONL

规范逻辑以“事件流”建模，默认物理格式使用年度 JSONL 以降低文件数；写入必须在仓库级锁内把完整新内容写入同目录临时文件并原子替换。每行都有 eventId、revision 与 supersedes，投影不依赖行顺序。严格证据包使用 `.workflow-history/evidence/<eventId>.json`，并受零或一文件及 4KB 默认预算约束。

备选方案是每事件一个 JSON 文件，合并冲突较少但文件数重新线性膨胀；SQLite 会新增二进制状态与依赖，不适合 Git。

### 3. 完成事务分为 prepare、archived、event-written、cleaned

事务文件先记录输入摘要、预期原生归档名、活动路径和 baseRevision。取得仓库锁并完成 Git 前置检查后调用现有 OpenSpec archive；确认主规格摘要与实际归档路径后，原子追加事件；随后只删除已核对的需求、归档和活动残留，最后删除事务文件和释放锁。

若在 `archived` 阶段中断，恢复读取实际归档并继续写事件；若已 `event-written`，恢复只做校验与清理。任何摘要不一致或未知文件都停止。锁文件包含 pid、startedAt、transactionId；仅当进程不存在、事务可解析且显式 recovery 时处理陈旧锁。

备选方案是先写事件再 archive，但规格同步可能失败并留下虚假 accepted，因此放弃。

### 4. Git 前置检查只检查会破坏确定性的状态

完成拒绝 `.git/MERGE_HEAD`、rebase-merge/rebase-apply、CHERRY_PICK_HEAD、`git ls-files -u` 非空以及相关规格/变更未被 sparse checkout 包含。它不要求整个工作树干净，因为活动实现本来可能尚未提交；但会记录并核对完成涉及路径的索引/工作树摘要。

路径通过统一的 NFC、斜杠、尾分隔符和 Windows 盘符规范化函数处理；ID 限制为安全 ASCII slug，scope 最大 240 字符。摘要把 CRLF 转换为 LF 后计算 SHA-256。

### 5. 状态投影显式处理活动、终态与重开

投影先读取活动目录，再解析同 scope/changeId 的事件 DAG。`accepted/cancelled/superseded` 是终态，`reopened` 必须 supersede 一个终态并提升 revision。活动目录与无重开关系的旧终态同时存在时报告 conflict；分支状态通过“事件是否存在于指定 baseRevision”区分 local/merged。

需求正文仍按旧四个活动阶段工作，完成后由清理移除；事务残留的待验证正文只报告 recoverable residue，不会触发重新实施。

### 6. 差异门禁和格式门禁独立于 ignore

新增 lifecycle audit：格式模式检查当前文件，diff 模式比较 baseRevision。diff 模式验证归档/活动删除与新事件配对，旧 JSONL 只能在尾部增加完整合法行，不能改写前缀。无法取得基线返回 unavailable，并由 CI 视为失败；本地普通健康检查可显示 warning。

仓库 footprint 对退役持久路径使用零上限，防止 `git add -f`。存量迁移期间通过配置 `migrationState: legacy-readonly` 允许旧内容存在；切换为 `v2` 后旧受跟踪路径立即阻断。

### 7. 存量迁移是单独入口，不嵌入普通完成

迁移预览只扫描已知 v1 结构和 Git 索引，构造历史事件、反向引用和删除候选。任何未跟踪目标、符号链接、未知文件类型、事件冲突或活动引用都会阻断。写入先生成事件与迁移清单，再按精确受跟踪文件列表删除，不使用递归目录删除；中断后可以从事务恢复。

迁移不会把历史 D/A/TC 关系复制进事件。规格仍含局部引用时，先由治理诊断列出；真正仍有长期意义的决策人工提升为 `DEC-<scope>-<id>`，其余定位标记从正式规格移除。

### 8. 阶段上下文在内存中抽取

新命令解析需求表格、OpenSpec 状态、任务复选框、delta 规格标题和证据清单，根据阶段选择字段，并对 diagnostics 分页。它只返回 JSON，不写 cache；运行时 cache 仅用于可重建工具依赖和昂贵的本地操作，不保存业务事实。

### 9. 先迁移产物产生端，再打开零上限门禁

验证运行时、官方 validator、benchmark、真实项目矩阵和 UI Review 分批改为统一 runtime root。CLI 参数继续接受旧 outputs 路径作为显式兼容输入，但默认值和文档改用新根。所有创建函数复用同一 layout helper，清理只接受包含 run-id 的受管子路径。

### 10. CI 产物与仓库证据解耦

普通五平台 package-report 上传保留 14 天；手动安装证据只有输入为 true 时才要求和上传。CI 不修改事件。最终候选的真实矩阵状态由宿主 Git 提供，仓库事件最多保存 pending/recorded 引用。

## Risks / Trade-offs

- [默认事件不能还原完整需求讨论] → 正式规格承载当前产品合同；高风险需求使用单一 strict capsule；Git 分支保留可选过程历史。
- [年度 JSONL 并发合并冲突] → 仓库锁和原子替换解决本机并发；跨分支依靠 eventId/revision 冲突诊断而非最后写入胜出。
- [旧插件仍可写 v1] → minimumWriterVersion 与混合结构门禁失败关闭，文档明确升级顺序。
- [原生 archive 成功后插件崩溃] → 事务阶段、实际归档名和内容摘要支持幂等恢复。
- [零上限启用过早阻断当前仓库] → 配置先处于 legacy-readonly，产生端迁移和存量迁移通过后才切换 v2。
- [规格中的 D/A 引用失去正文] → 迁移前输出悬空引用报告，先提升长期 DEC 或移除局部追踪标识。
- [squash 后无法恢复分支过程] → 只承诺合入的最终事件；状态区分 local/merged，不声称完整过程历史。
- [Windows 原子替换和路径碰撞] → 临时文件同目录、关闭句柄后 rename，测试盘符/大小写/NFC/长度和失败清理，真实矩阵单独验收。

## Migration Plan

1. 建立 schema、路径规范化、事件解析/投影、阶段上下文和只读审计；配置保持 `legacy-readonly`。
2. 增加仓库锁、Git 前置检查与事务模块，使用 fixture 验证失败前零修改和恢复幂等。
3. 改造完成入口：先保留旧完成兼容路径，通过显式 v2 配置选择新写入器；完成回归稳定后移除默认旧写入。
4. 迁移所有默认运行产物到统一 runtime root，更新 ignore、UI Review、验证脚本和 CI 上传路径。
5. 增加 tracked runtime、生命周期混写、事件 diff、规格/测试上下文门禁；legacy-readonly 只警告旧历史。
6. 运行存量迁移预览，处理悬空 D/A/TC 引用、未知文件和仍被引用证据；确认零阻断后显式写入。
7. 切换配置为 `v2`，运行聚焦、全量、结构、官方 validator 和统一验证；保留外部五平台为待执行。
8. 回滚时在迁移提交尚未合并前恢复文件并切回 `legacy-readonly`；合并后只通过新的正式变更追加纠正事件，不改写已有历史行。
