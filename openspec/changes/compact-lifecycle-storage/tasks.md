## 1. 生命周期事实层

- [x] 1.1 建立 v2 配置、统一路径规范化、LF 摘要、事件 schema 校验与年度存储，覆盖字段、数量、长度、控制字符和绝对路径限制（D-02、D-08、D-16、D-17、D-18；A-01、A-07）。
- [x] 1.2 实现 accepted、cancelled、superseded、reopened 事件 DAG 投影，区分 active、accepted-local、accepted-merged、冲突和可恢复残留（D-02、D-08、D-17；A-02）。
- [x] 1.3 增加事件追加和 strict 单一证据包预算，默认事件只保留状态、能力、检查、摘要和信任边界（D-04、D-05；A-01、A-04）。

## 2. 完成事务和 Git 保护

- [x] 2.1 实现仓库级锁、prepare/archived/event-written/cleaned 事务状态和显式陈旧事务恢复（D-06；A-03）。
- [x] 2.2 增加 merge、rebase、cherry-pick、未合并 index、相关 sparse checkout 与 scope/path 前置检查（D-07、D-17；A-03、A-07）。
- [x] 2.3 改造完成入口，在 v2 模式复用 OpenSpec 原生 archive 同步规格，随后追加事件并安全清理活动需求、活动变更、临时归档和普通证据，不修改内置运行时（D-01、D-03、D-04；A-01、A-03、A-04）。
- [x] 2.4 保留 legacy-readonly 读取与旧完成兼容入口，版本不匹配、混合写入和重复完成失败关闭（D-16；A-02、A-06）。

## 3. 差异门禁和仓库治理

- [x] 3.1 实现 base revision 生命周期 diff，校验活动变更删除与终态事件配对、旧事件只追加和基线 unavailable 语义（D-09；A-06）。
- [x] 3.2 扩展 footprint，以零上限拒绝 tracked runtime、UI Review runs、普通 outputs 和 v2 下的旧归档路径，防止 ignore 被 `git add -f` 绕过（D-01、D-10、D-16；A-01、A-04、A-06）。
- [x] 3.3 增加正式规格重复标题、退役状态、总字节软预算以及测试总行数与裸 TC 歧义诊断（D-12、D-13；A-05、A-06）。

## 4. 阶段上下文和运行时产物

- [x] 4.1 实现 plan/implement/verify/complete 阶段上下文编译器、参数前置校验和有界分页，不创建持久副本（D-11；A-05、A-09）。
- [x] 4.2 建立 `.frontend-ai-workflow/runs`、`cache`、`transactions` 布局 helper，迁移验证运行时、官方 validator、benchmark 与真实项目矩阵默认路径（D-10、D-19；A-04、A-07、A-09）。
- [x] 4.3 把 UI Review 运行状态和截图迁到统一 runs 命名空间，配置与适配器保持原路径，失败清理只作用于本次 run（D-10；A-04、A-09）。

## 5. 存量迁移

- [x] 5.1 实现 v1 archive、需求 archive、tracked outputs 和 UI Review runs 的只读清单与历史事件构造（D-15；A-08）。
- [x] 5.2 实现反向引用、符号链接、未知文件、未跟踪内容、事件冲突和 Git 状态阻断，显式写入只删除精确受跟踪目标并支持幂等恢复（D-15；A-08）。
- [x] 5.3 输出正式规格 D/A 悬空引用与测试裸 TC 歧义清单，只把真正长期决策提升为全局 DEC，不自动猜测或批量改写语义（D-12、D-13、D-15；A-05、A-08）。

## 6. CI、文档和兼容入口

- [x] 6.1 接入共享验证的 lifecycle diff/格式门禁，读取 PR base SHA 或 push 父提交并保持外部 CI 不回写（D-09、D-14、D-16；A-06）。
- [x] 6.2 为普通平台报告设置 14 天保留期，仅在手动输入开启时要求和上传完整安装证据（D-14；A-06）。
- [x] 6.3 更新 frontend-change、frontend-test、UI Review、bootstrap/upgrade 模板、README 与 AGENTS，统一 v2 状态和临时目录语义（D-01、D-02、D-04、D-05、D-10、D-11、D-12、D-13、D-16；A-09）。

## 7. 回归与交付

- [x] 7.1 新增生命周期事件、投影、跨年、LF/CRLF、Windows/POSIX、Unicode、长度和冲突测试（D-08、D-17、D-18、D-19；A-01、A-02、A-07）。
- [x] 7.2 新增完成并发、Git 特殊状态、sparse checkout、崩溃恢复和重复事件测试（D-03、D-06、D-07、D-19；A-03、A-07）。
- [x] 7.3 新增迁移预览/写入/阻断/幂等、阶段上下文、footprint、UI Review 和 CI 文本合同测试（D-09、D-10、D-11、D-12、D-13、D-14、D-15、D-16；A-04、A-05、A-06、A-08、A-09）。
- [x] 7.4 运行聚焦测试、本地全量、结构、官方 Skill/Plugin validators、统一验证和 Vue 3 + Vite 初始化/重复/升级/检查；更新 V-* 机器证据，不将本地结果冒充真实矩阵（D-19；A-10）。
- [x] 7.5 本地全部通过后运行存量迁移预览；只有零阻断时才显式迁移并把配置切换至 v2，真实五平台矩阵继续保持待执行（D-15、D-16、D-19；A-08、A-10）。
