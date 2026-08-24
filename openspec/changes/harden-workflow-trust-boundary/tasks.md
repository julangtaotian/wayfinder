## 1. 安全边界测试与共享基础

- [x] 1.1 按 `test-plan.md` 在 `tests/workflow-trust-boundary.test.mjs` 建立 `[TC-01]`、`[TC-02]`、`[TC-03]` 稳定定位和隔离 fixture，先覆盖项目外哨兵、普通路径、历史证据与结构化诊断基线；只对既有证据测试做 schema/信任预期兼容更新，不追加新场景（D-01、D-04、D-08、D-09、D-10、D-11、D-12；A-01、A-05、A-06、A-07）
- [x] 1.2 实现共享目标项目路径安全模块：真实根规范化、项目相对路径校验、逐段 `lstat`、内部符号链接拒绝、普通未存在目标解析和稳定 code/status/target（D-02、D-03、D-09、D-10；A-01、A-06）
- [x] 1.3 实现共享安全 mutation 辅助，覆盖紧邻操作复核、安全建目录、独占临时文件、同目录原子替换、普通文件删除和失败清理，并保留原始错误（D-03、D-11；A-01、A-02）

## 2. 目标项目写入入口迁移

- [x] 2.1 将 bootstrap 与 update 的 create/update 调用迁移到共享安全 mutation，同时保持默认 dry-run、受管标记保护和重复执行结果（D-02、D-03、D-11；A-01、A-02）
- [x] 2.2 将 Wayfinder migration 的新文件写入与旧文件删除迁移到同一边界，验证新文档成功前不删旧内容、链接或冲突失败时项目外哨兵不变（D-02、D-03、D-11；A-01、A-02）
- [x] 2.3 将 verification evidence 与 UI Review 的状态、日志、报告、截图、比较结果和临时文件写入接入共享边界；保留现有 UI 路径导出兼容（D-02、D-03、D-06、D-07、D-11；A-01、A-02、A-03、A-04）
- [x] 2.4 在 finalize 调用内置 OpenSpec 前后预检需求、活动变更、archive、delta/main spec 和实际归档目标，并让需求/test-plan 改写与恢复继续使用安全原子写入（D-02、D-03、D-11；A-01、A-02、A-06）
- [x] 2.5 搜索并复核所有目标项目直接 mutation 调用，证明计划内入口已迁移、插件构建/打包等仓库自身操作未被误改（D-01、D-02、D-12；A-01、A-02、A-07）

## 3. schema v2 与语义完整性

- [x] 3.1 从当前需求和测试方案构造稳定语义快照，绑定最新 R-*、当前 V-*、关联 D/A 与对应 TC，并明确排除日期、结果、证据路径和勾选状态（D-04、D-05；A-03、A-06）
- [x] 3.2 将本地受控取证升级为 schema v2，写入 semanticBinding、工作区指纹和统一 logs/artifacts 文件描述符；生成前后的路径、大小与 SHA-256 使用同一规则（D-04、D-05、D-06；A-03、A-06）
- [x] 3.3 为 schema v2 严格校验重新计算语义摘要、工作区指纹及每个日志/附件的范围、普通文件、大小和 SHA-256，任一不一致返回 evidenceId 与具体 target 且不重跑命令（D-05、D-06、D-09；A-03、A-06）
- [x] 3.4 保留 schema v1 的历史只读分支与迁移提示，并让 `verification_evidence: required` 的活动变更明确阻断 v1，不批量改写归档清单（D-04、D-09、D-11；A-06）

## 4. UI 与外部信任闭环

- [x] 4.1 校验 UI Review 状态 JSON 的 schema、runId、scenarioId、scenarioFingerprint、actualCapture、状态文件身份和 passed 结果，并双向核对状态要求的关键产物描述符（D-06、D-07；A-04、A-06）
- [x] 4.2 将无可信远程回执的 external-ci 固定为 external-recorded，忽略本地 `remotelyVerified` 的信任提升，并保留人工复核记录语义（D-08、D-09、D-12；A-05、A-06）
- [x] 4.3 统一 requirement/test-plan/check/precomplete/complete/finalize 的聚合规则，只有全部必需证据可信 passed 才允许顶层 passed，其余状态透传 code/status/target/trust/evidenceId（D-08、D-09；A-03、A-04、A-05、A-06）
- [x] 4.4 同步受影响的 Skill、参考说明、模板或机器字段文档，只描述本次安全与证据合同，并明确动态识别、Monorepo、非 Vitest 完整认证和远程平台仍不在范围内（D-01、D-08、D-12；A-05、A-07）

## 5. 分层验证与交付

- [x] 5.1 通过 implement 阶段需求与测试方案校验，完成 `[TC-01]` 后运行聚焦命令并由受控入口生成 V-01，确认所有 mutation 入口的链接边界、dry-run、幂等和失败恢复（D-02、D-03、D-10、D-11；A-01、A-02、A-06）
- [x] 5.2 完成 `[TC-02]` 后运行聚焦命令并生成 V-02，覆盖语义变化、v1/v2、日志附件、UI 状态与产物、external-recorded 和非通过聚合（D-04、D-05、D-06、D-07、D-08、D-09；A-03、A-04、A-05、A-06）
- [x] 5.3 完成 `[TC-03]` 后运行 `npm test`、`npm run validate`、`npm run verify`、官方 Skill/Plugin validators 和 Vue 3 + Vite 初始化/重复执行/升级/检查，并生成 V-03 持久证据（D-03、D-09、D-10、D-11、D-12；A-02、A-06、A-07）
- [x] 5.4 完成 V-04 人工复核，确认预览、阻断、恢复、历史兼容与支持范围文案没有把 warning、recorded、inconclusive、blocked 或有限威胁模型描述为 passed/无漏洞（D-01、D-08、D-09、D-12；A-02、A-05、A-06、A-07）
- [ ] 5.5 更新 requirement、test-plan 与 verification.md 的真实结果，在 WebStorm 提交最终改动并推送；人工复核精确提交的 Linux x64/ARM64、Windows x64、macOS Intel/ARM64 矩阵，全部成功后才完成 V-05（D-10、D-12；A-07）
