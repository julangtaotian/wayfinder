# 测试方案：轻量需求生命周期与证据存储治理

## 基本信息

- 状态：已验证
- 需求：`requirements/REQ-2026-048-compact-lifecycle-storage.md`
- 变更：compact-lifecycle-storage
- 需求修订基线：R-01
- 默认聚焦命令：`node --test tests/lifecycle-history.test.mjs tests/lifecycle-migration.test.mjs tests/stage-context.test.mjs`

## 测试上下文

- 测试命令状态：detected
- 测试命令：`npm test`
- 测试运行器：仓库专用测试使用 Node.js test runner；Vue 3 + Vite fixture 使用固定 Vitest 运行时
- 测试目录：`tests`
- Git 基线：available；三个生命周期专用测试文件在规划时不存在，既有完成、footprint、UI Review、CI 与结构测试已受版本控制
- 兼容说明：本机通过显式 Windows/POSIX、LF/CRLF 与 Git fixture 验证确定性，真实五平台结果必须在最终候选提交上单独执行。

## 测试用例

### TC-01：生命周期事件有界追加并确定性投影

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-02、D-04、D-05、D-08、D-16、D-17、D-18
- 关联验收：A-01、A-02
- 关联规格：compact-lifecycle-history / 生命周期事件必须有界且可确定投影
- 状态矩阵：初始（已有数据）、刷新、空态、错误态
- 前置条件：可注入年度事件、活动目录和 base revision 可见性。
- 测试数据：accepted、cancelled、superseded、reopened、重复 eventId、分叉 revision、未知 supersedes、跨年、超长和控制字符。
- 测试替身：隔离文件系统和 Git 可见性读取器。
- 操作：写入、读取并投影事件，再注入冲突与非法字段。
- 可观察断言：合法事件稳定投影；非法和冲突返回稳定 code；默认事件及 strict capsule 均受预算限制。
- 目标测试：`tests/lifecycle-history.test.mjs`
- 测试定位：`生命周期事件有界追加并确定性投影`
- 聚焦命令：`node --test --test-name-pattern="生命周期事件有界追加并确定性投影" tests/lifecycle-history.test.mjs`
- 关联验证：V-01
- 结果分类：通过
- 证据：`openspec/changes/compact-lifecycle-storage/evidence/V-01.json`

### TC-02：跨平台路径与摘要规范化

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-17、D-18、D-19
- 关联验收：A-07
- 关联规格：compact-lifecycle-history / 生命周期事件必须有界且可确定投影
- 状态矩阵：用户操作、刷新、错误态
- 前置条件：路径与摘要 helper 可接受目标平台样本。
- 测试数据：`D:/workspace`、`D:\workspace`、大小写盘符、NFC/NFD、尾分隔符、LF/CRLF 和超长 scope。
- 测试替身：显式 path.win32/path.posix 样本。
- 操作：双侧规范化路径并计算同义内容摘要。
- 可观察断言：等价输入一致；绝对路径、碰撞和超长值失败且诊断不包含开发机根目录。
- 目标测试：`tests/lifecycle-history.test.mjs`
- 测试定位：`跨平台路径与摘要规范化`
- 聚焦命令：`node --test --test-name-pattern="跨平台路径与摘要规范化" tests/lifecycle-history.test.mjs`
- 关联验证：V-02
- 结果分类：通过
- 证据：`openspec/changes/compact-lifecycle-storage/evidence/V-02.json`

### TC-03：完成事务锁定 Git 特殊状态并可恢复

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-03、D-06、D-07、D-16、D-19
- 关联验收：A-03、A-07
- 关联规格：compact-lifecycle-history / 完成必须作为仓库级可恢复事务执行
- 状态矩阵：用户操作、错误态、卸载
- 前置条件：隔离仓库可模拟 archive 返回、锁竞争和各事务阶段。
- 测试数据：merge/rebase/cherry-pick、unmerged index、sparse checkout、active/archived/event-written 阶段和陈旧锁。
- 测试替身：注入 OpenSpec archive 与文件写入器。
- 操作：预览和写入完成，逐阶段注入失败后恢复。
- 可观察断言：危险状态在零修改前失败；并发返回 busy；恢复不重复 archive、规格同步或事件。
- 目标测试：`tests/lifecycle-history.test.mjs`
- 测试定位：`完成事务锁定 Git 特殊状态并可恢复`
- 聚焦命令：`node --test --test-name-pattern="完成事务锁定 Git 特殊状态并可恢复" tests/lifecycle-history.test.mjs`
- 关联验证：V-03
- 结果分类：通过
- 证据：`openspec/changes/compact-lifecycle-storage/evidence/V-03.json`

### TC-04：生命周期 Git 差异保护追加历史

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-09、D-16
- 关联验收：A-06
- 关联规格：compact-lifecycle-history / Git 差异必须保护追加历史
- 状态矩阵：用户操作、空态、错误态
- 前置条件：隔离 Git 仓库具有基线和工作树差异。
- 测试数据：配对删除、漏事件、旧行修改/删除、合法尾部追加和无法解析 base。
- 测试替身：真实本地 Git fixture，不使用网络。
- 操作：对各差异运行 lifecycle audit。
- 可观察断言：配对通过；漏写与篡改稳定失败；base 不可用不冒充通过。
- 目标测试：`tests/lifecycle-history.test.mjs`
- 测试定位：`生命周期 Git 差异保护追加历史`
- 聚焦命令：`node --test --test-name-pattern="生命周期 Git 差异保护追加历史" tests/lifecycle-history.test.mjs`
- 关联验证：V-04
- 结果分类：通过
- 证据：`openspec/changes/compact-lifecycle-storage/evidence/V-04.json`

### TC-05：运行时路径与 UI Review 产物保持隔离

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-05、D-10、D-19
- 关联验收：A-04、A-07
- 关联规格：ai-ui-review-artifacts / UI Review 配置与运行产物必须分离
- 状态矩阵：用户操作、刷新、错误态、卸载
- 前置条件：可建立配置、适配器和多个 run-id。
- 测试数据：成功、捕获失败、两个相邻 run、越界与符号链接路径。
- 测试替身：现有 UI Review 注入捕获器。
- 操作：执行和清理不同 run。
- 可观察断言：受管运行时和旧 UI runs 不改变证据指纹；持久配置变化使证据过期；tracked runtime 仍被 footprint 阻断。
- 目标测试：`tests/verification-evidence-integrity.test.mjs`
- 测试定位：`[TC-02] 证据安全与工作区新鲜度`
- 聚焦命令：`node --test --test-name-pattern="证据安全与工作区新鲜度" tests/verification-evidence-integrity.test.mjs`
- 关联验证：V-05
- 结果分类：通过
- 证据：`openspec/changes/compact-lifecycle-storage/evidence/V-05.json`

### TC-06：阶段上下文有界且不落盘

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-11
- 关联验收：A-05
- 关联规格：ai-context-efficiency / 活动变更必须支持阶段化上下文编译
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态
- 前置条件：fixture 包含需求、proposal、design、tasks、delta specs 和大量 diagnostics。
- 测试数据：四个阶段、offset/limit 边界、未知阶段、缺失活动变更。
- 测试替身：注入状态与诊断读取器。
- 操作：逐阶段请求上下文并比较文件树前后。
- 可观察断言：字段随阶段收敛、分页准确、参数错误提前失败且没有新增持久文件。
- 目标测试：`tests/stage-context.test.mjs`
- 测试定位：`阶段上下文有界且不落盘`
- 聚焦命令：`node --test tests/stage-context.test.mjs`
- 关联验证：V-06
- 结果分类：通过
- 证据：`openspec/changes/compact-lifecycle-storage/evidence/V-06.json`

### TC-07：规格和测试上下文膨胀可定位

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-12、D-13
- 关联验收：A-05、A-06
- 关联规格：repository-footprint-governance / 正式规格和测试上下文增长必须可见
- 状态矩阵：初始（已有数据）、刷新、空态、错误态
- 前置条件：fixture 可创建重复 Requirement、退役 capability、大规格和重复 TC。
- 测试数据：重复标题、合法不同标题、软预算超限和跨文件裸 TC-01。
- 测试替身：受控 tracked files 列表。
- 操作：运行 footprint 上下文治理检查。
- 可观察断言：重复和歧义提供文件/行为定位；软预算只 warning；预算不会自动写回。
- 目标测试：`tests/repository-footprint.test.mjs`
- 测试定位：`重复规格失败而跨文件裸 TC 只告警`
- 聚焦命令：`node --test --test-name-pattern="重复规格失败而跨文件裸 TC 只告警" tests/repository-footprint.test.mjs`
- 关联验证：V-07
- 结果分类：通过
- 证据：`openspec/changes/compact-lifecycle-storage/evidence/V-07.json`

### TC-08：存量迁移预览、阻断和幂等写入

- 状态：通过
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-12、D-13、D-15
- 关联验收：A-05、A-08
- 关联规格：compact-lifecycle-history / 存量迁移必须先预览并失败关闭
- 状态矩阵：初始（已有数据）、用户操作、刷新、空态、错误态、卸载
- 前置条件：隔离 Git fixture 含 v1 archive、需求存根、outputs、UI runs 和活动引用。
- 测试数据：安全历史、未跟踪文件、符号链接、未知扩展、悬空 D/A、重复 TC 与冲突事件。
- 测试替身：真实本地 Git fixture，不使用递归删除。
- 操作：先预览，再尝试阻断写入和合法写入，最后重复执行。
- 可观察断言：预览零修改；阻断项不删除；合法写入只处理精确 tracked files；重复执行为空操作。
- 目标测试：`tests/lifecycle-migration.test.mjs`
- 测试定位：`存量迁移预览阻断和幂等写入`
- 聚焦命令：`node --test tests/lifecycle-migration.test.mjs`
- 关联验证：V-08
- 结果分类：通过
- 证据：`openspec/changes/compact-lifecycle-storage/evidence/V-08.json`

### TC-09：CI 保留期和混合格式门禁

- 状态：通过
- 优先级：P1
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-09、D-14、D-16
- 关联验收：A-06、A-09
- 关联规格：repository-footprint-governance / 仓库必须拒绝持久运行时和退役归档结构
- 状态矩阵：用户操作、错误态
- 前置条件：可读取 CI、package scripts、配置和技能文本。
- 测试数据：普通 push、PR base、手动安装证据 true/false、v1/v2 混写。
- 测试替身：静态工作流合同和 lifecycle audit 注入 base。
- 操作：检查步骤、上传条件、retention-days 和门禁失败语义。
- 可观察断言：普通报告 14 天；完整安装证据仅手动上传；混写与 base 缺失失败关闭；CI 不写仓库。
- 目标测试：`tests/lifecycle-history.test.mjs`
- 测试定位：`CI 保留期和混合格式门禁`
- 聚焦命令：`node --test --test-name-pattern="CI 保留期和混合格式门禁" tests/lifecycle-history.test.mjs`
- 关联验证：V-09
- 结果分类：通过
- 证据：`openspec/changes/compact-lifecycle-storage/evidence/V-09.json`

### TC-10：本地发布门禁与真实矩阵分层

- 状态：人工通过
- 优先级：P0
- 验证类型：人工
- 测试层级：集成
- 关联决策：D-19
- 关联验收：A-10
- 关联规格：compact-lifecycle-history / 完成必须作为仓库级可恢复事务执行
- 状态矩阵：初始（已有数据）、用户操作、错误态、卸载
- 前置条件：聚焦实现完成且形成最终候选提交。
- 测试数据：全部测试、结构、官方 validators、Vue fixture 与五平台矩阵任务。
- 测试替身：本地无；外部使用 GitHub Actions 真实 runner。
- 操作：运行本地全部门禁；候选提交后人工复核共享任务和五个平台。
- 可观察断言：本地门禁通过不自动更新 V-12；只有同一 SHA 真实矩阵全部成功后才标记外部通过。
- 目标测试：不适用
- 测试定位：不适用
- 聚焦命令：不适用
- 关联验证：V-10、V-11、V-12
- 结果分类：通过
- 证据：`openspec/changes/compact-lifecycle-storage/verification.md`
