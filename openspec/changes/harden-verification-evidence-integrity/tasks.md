## 1. 测试合同与证据模型

- [x] 1.1 新建 `tests/verification-evidence-integrity.test.mjs`，先写受控执行成功、非零退出、零定位、默认预览零写入和 passed 证据不被失败结果覆盖的失败测试。（D-02、D-03、D-05、A-01、A-02）
- [x] 1.2 补充 schema、V-* 一致性、多证据路径、危险路径、符号链接、工作区正反变化与未知版本的失败测试。（D-04、D-07、D-09、A-02、A-03）
- [x] 1.3 补充新合同严格门禁、历史 Markdown 警告、external-ci 信任边界和项目命令零重跑的集成测试。（D-05、D-06、D-08、A-02、A-06、A-09）

## 2. 机器证据生成与校验

- [x] 2.1 实现集中证据 schema、稳定 JSON、路径拆分/规范化、证据 kind 与结构化错误，不新增第三方依赖。（D-02、D-06、D-09、D-13、A-03、A-08）
- [x] 2.2 实现项目工作区指纹与独立 artifact 摘要，验证实现/测试/package 变化会过期而生命周期文档、evidence 和 outputs 变化不会自我失效。（D-04、A-02、A-03）
- [x] 2.3 实现证据 CLI 的预览与显式写入、无 shell 子进程、流式 outputs 日志、精确 locator 统计、原子清单写入与失败清理。（D-02、D-03、D-13、A-01、A-08）
- [x] 2.4 实现 Node/npm 跨平台调用规范化，Windows 仅使用可追溯 JavaScript 入口并为无法解析入口返回稳定阻断。（D-03、D-14、A-01、A-09）

## 3. 完成门禁与测试链集成

- [x] 3.1 扩展 `.openspec.yaml` 元数据读取并为本变更启用 `verification_evidence: required`，未声明历史变更保持兼容分支。（D-05、D-08、A-02、A-06）
- [x] 3.2 让需求 precomplete/complete 校验逐项消费 V-* 机器证据、多路径、新鲜度和类型边界，并输出稳定 code/status/target 字段。（D-04～D-09、D-14、A-02、A-03、A-06、A-09）
- [x] 3.3 让 `validate-test-plan` 与 `check-change` 复用同一证据校验结果，沿自动 TC-* → V-* → JSON 失败关闭，同时保持项目测试、构建和外部 CI `executed: false`。（D-05、D-07、A-02、A-03）
- [x] 3.4 增加项目只读检查对历史 Markdown-only、失效活动路径和 external-ci 未远程复查状态的结构化警告，不自动改写历史文件。（D-06、D-08、D-15、A-06、A-09）

## 4. 归档引用迁移与恢复

- [x] 4.1 为完成预览生成活动前缀到预计归档前缀的逐项安全改写表，覆盖多个证据、URL、其他变更和无关文本。（D-09、D-10、A-03、A-04）
- [x] 4.2 扩展正式完成入口，以 OpenSpec 实际 `archivedAs` 原子更新需求状态与引用，并从实际归档目录运行 requirement、test-plan 和证据 complete 审计。（D-05、D-10、A-02、A-04）
- [x] 4.3 实现归档目标识别、重复执行幂等和 `archive_partial_failure` 恢复上下文，覆盖需求写入失败与归档后审计失败且不重跑项目验证。（D-10、D-11、A-04、A-05）

## 5. UI Review 报告自识别

- [x] 5.1 建立状态与 Markdown 共用的规范化 report context，包含 schemaVersion、runId、scenarioFingerprint、capture、baselineRunId、statePath、证据路径和摘要。（D-12、A-07）
- [x] 5.2 更新首次验收与复验报告渲染，拒绝缺少必需身份字段，并以自动测试证明 Markdown 与状态 JSON 一致。（D-12、A-07）

## 6. 工作流同步与交付验证

- [x] 6.1 更新 `$frontend-test`、`$frontend-change`、相关规则/模板、README 和结构合同，明确证据执行、完成零重跑、历史/外部边界和 UI 报告字段。（D-01、D-05～D-08、D-12、D-15、A-02、A-06、A-07）
- [x] 6.2 在 `outputs/verification-evidence-integrity/` 运行专用与受影响聚焦测试、`npm test`、`npm run validate`、严格 OpenSpec、官方 Skill/Plugin validators，并检查根目录清洁和 AI 标记禁入。（D-13、D-14、A-08、A-09）
- [x] 6.3 在同一提交上完成 Linux x64/ARM64、Windows x64、macOS Intel/ARM64 真实矩阵；记录运行 URL、精确提交、各任务状态及失败复盘，未完整成功时保持 V-06 未通过。（D-06、D-14、A-09）
- [x] 6.4 按真实结果更新 `test-plan.md`、`verification.md` 与需求 V/A 映射，运行 precomplete 和完成预览；不得以用户确认替代失败门禁。（D-05、D-07、D-10、D-14、A-01～A-09）
- [x] 6.5 把 CI 产物上传 action 从 v4 升级到官方当前 v7，保持名称、路径和缺失产物失败语义，并在 `tests/workflow.test.mjs` 增加 Node.js 24 action 版本回归。（D-14、A-09）
- [x] 6.6 重新生成受影响本地证据并在升级后的同一提交复跑五平台矩阵，确认所有任务、平台包产物和 Node.js 20 action 警告状态，再更新 V-06、precomplete 与完成预览。（D-06、D-14、A-09）

## 7. R-05 真实归档恢复修复

- [x] 7.1 在 TC-04 中复现真实目录移动后归档测试方案仍指向活动变更、首次审计失败且重复恢复无效的问题，并覆盖成功归档、测试方案写入失败和幂等恢复。（D-10、D-11、A-04、A-05）
- [x] 7.2 扩展完成器的改写计划与写入流程，同时迁移需求和归档测试方案的变更名、证据路径，并为测试方案写入失败返回稳定 `failedStage` 与恢复上下文。（D-10、D-11、D-14、A-04、A-05、A-09）
- [x] 7.3 运行 TC-04 聚焦回归、相关验证证据测试、`npm run verify`、结构与官方 validators，刷新 V-03、V-05 并确认根目录清洁。（D-13、D-14、A-04、A-05、A-08、A-09）
- [ ] 7.4 在修复提交上完成五平台真实矩阵并更新 V-06，再运行 complete、precomplete、正式归档和归档后审计。（D-06、D-10、D-14、A-04、A-05、A-09）
