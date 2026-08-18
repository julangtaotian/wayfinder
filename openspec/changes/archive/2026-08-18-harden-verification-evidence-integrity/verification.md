# 验证记录：验证证据完整性与归档可追溯性

## 当前结论

- R-05 实施与三层验证已完成：首次真实归档暴露的测试方案变更名、证据路径和重复恢复问题已有确定性回归保护，部分归档已安全撤回，活动变更恢复完整。
- 完成器现已同时迁移需求与归档测试方案，并在正常归档和重复恢复中共用同一改写逻辑；测试方案写入失败使用稳定 `failedStage: test-plan-write`，恢复不重跑项目命令。
- TC-04 聚焦回归、验证证据测试 6/6、统一验证 8/8 和官方 validators 均通过；V-03、V-05 已刷新为当前工作区证据。
- R-04 已完成：`actions/upload-artifact` 升级到官方当前 v7，现有产物名称、路径和失败语义保持不变，Node.js 20 action 弃用警告已在 Validate #32 中消失；该运行只作为 R-04 历史证据，不证明 R-05 修复。
- V-05 已通过：`npm run verify` 的 8 个阶段全部完成，包含 `npm test` 196/196、结构校验、当前严格 OpenSpec 28/28、归档严格 OpenSpec 37/37、运行时完整性与本机浏览器启动；9 个 Skill 和插件清单另由官方 validators 校验通过。
- V-06 已远程复查：Validate #33 精确对应修复提交 `7ec96ac786485e44b0e074ed90e7099280ce8c73`，五个平台任务和五份平台包全部成功，任务 annotations 均为空。
- 当前任务进度 26/26；正式归档已完成，需求状态为“已验收”，归档后 requirement complete 与 test-plan complete 审计均通过。

## 已执行证据

| 验证 | 结果 | 机器证据 | 关键断言 |
| --- | --- | --- | --- |
| V-01 | 通过 | `evidence/V-01.json` | 命令退出 0，精确命中 TC-01；预览零写入、零测试与失败覆盖保护通过 |
| V-02 | 通过 | `evidence/V-02.json` | 命令退出 0，精确命中 TC-02；schema、需求/V 身份、路径和新鲜度通过 |
| V-03 | 通过 | `evidence/V-03.json` | 命令退出 0，精确命中 TC-04；归档改写、幂等、危险目标和恢复通过 |
| V-04 | 通过 | `evidence/V-04.json` | 命令退出 0，精确命中 TC-05；UI 报告身份字段通过，UI 全量回归 30/30 |
| V-05 | 通过 | `evidence/V-05.json` | `npm run verify` 退出 0，精确命中 TC-06 两次；统一验证 8 阶段全部完成 |
| V-06 | 通过 | `evidence/V-06.json` | Validate #33 精确对应修复提交；五个平台任务和平台包全部成功，annotations 为空 |
| V-07 | 通过 | `evidence/V-07.json` | 命令退出 0，精确命中 TC-03；严格/历史/外部边界与项目只读审计通过 |

## 当前真实 CI 矩阵（R-05）

- 运行：`https://github.com/julangtaotian/wayfinder/actions/runs/32112159467`
- 提交：`7ec96ac786485e44b0e074ed90e7099280ce8c73`
- 结果：`darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64`、`win32-x64` 全部通过。
- 产物：五个平台分别生成未过期的 `plugin-package-report-<platform>`，与矩阵任务一一对应。
- 警告复核：五个平台 check-run annotations 均为空；上传步骤使用仓库固定的 `actions/upload-artifact@v7` 并全部成功。

## 正式归档结果

- 归档目标：`openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity`。
- 规格同步：新增 `verification-evidence-integrity`，并同步更新 `verifiable-change-delivery` 与 `plugin-ui-review-automation`，OpenSpec 返回 9 条新增需求。
- 引用迁移：需求中的测试方案、验证说明和 V-01～V-07 路径全部指向实际归档目录；归档测试方案使用完整归档变更名并迁移 6 条本地证据引用。
- 归档后审计：requirement complete 与 test-plan complete 均通过，14 个持久证据文件有效，错误和警告均为空；完成阶段没有重跑项目测试、构建、浏览器或外部 CI。
- 归档后统一验证：授权环境执行 `npm run verify`，196/196 测试与 8/8 阶段全部通过，当前严格 OpenSpec 28/28、归档 OpenSpec 38/38、运行时完整性和本机浏览器启动均成功，Vitest 运行时随后清理。
- 环境差异说明：一次直接 `npm test` 因绕过 `prepare:test-runtime` 且沙箱禁止本地端口与 Chromium 启动而失败，不作为交付证据；同一工作区使用仓库规定的自包含统一入口后全部通过。

## 历史真实 CI 矩阵（R-04）

- 运行：`https://github.com/julangtaotian/wayfinder/actions/runs/32108061059`
- 提交：`444c67a51d66106e6f39d089e9cf70a859992cdf`
- 结果：`darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64`、`win32-x64` 全部通过。
- 产物：五个平台分别生成 `plugin-package-report-<platform>`，与矩阵任务一一对应。
- 警告复核：运行摘要 Annotations 为空；五个平台任务页均未出现 `Node.js 20` 或 `actions/upload-artifact@v4`，原弃用警告已消失。
- 历史边界：该矩阵早于 R-05 归档恢复修复，仅保留为 action 升级的历史证据；当前 V-06 以 Validate #33 为准。

## 其他本地回归

- R-05 TC-04 红灯：首次回归因缺少 `testPlanRewrites` 失败，证明用例能捕获真实缺陷；原始日志位于 `outputs/verification-evidence-integrity/tc04-r05-red.log`。
- R-05 TC-04 绿灯：聚焦回归 1/1 通过，验证真实目录移动、需求与测试方案双文件迁移、`test-plan-write` 部分失败和恢复；原始日志位于 `outputs/verification-evidence-integrity/tc04-r05-green-final.log`。
- R-05 相关回归：`tests/verification-evidence-integrity.test.mjs` 6/6 通过；原始日志位于 `outputs/verification-evidence-integrity/verification-evidence-tests-r05-final.log`。
- R-05 统一验证：`npm run verify` 8/8 阶段通过，包含 `npm test` 196/196、结构校验、当前严格 OpenSpec 28/28、归档严格 OpenSpec 37/37、运行时完整性、Playwright 完整性和本机浏览器启动；V-01～V-05、V-07 使用当前工作区指纹 `1af6767b6f848515e60e854c090a24086f412cd12f1f2362dfe849e3ad9a9c25`。
- R-05 官方 Skill validator：9/9 通过；原始日志位于 `outputs/verification-evidence-integrity/official-skill-validator-r05.log`。
- R-05 官方 Plugin validator：通过；原始日志位于 `outputs/verification-evidence-integrity/official-plugin-validator-r05.log`。

- R-04 聚焦回归：`node --test --test-name-pattern="统一验证固定阶段顺序、短路失败并由 CI 单一调用" tests/workflow.test.mjs`，1/1 通过；已断言 `actions/upload-artifact@v7` 存在且 v1～v6 均不存在。
- R-04 结构校验：`npm run validate` 通过；工作流继续保留五平台矩阵、单一 `npm run verify` 入口、平台包构建、唯一产物名称和 `if-no-files-found: error`。
- R-04 本地机器证据：V-01～V-05、V-07 已按新工作区指纹重新生成；`npm run verify` 的 8 个阶段全部完成，其中 `npm test` 196/196、当前严格 OpenSpec 28/28、归档严格 OpenSpec 37/37。
- R-04 `check-change --stage precomplete`：通过；22/22 项任务完成，7 份证据均有效，门禁只消费持久证据且没有重跑项目命令，错误与警告均为空。
- R-04 `finalize-change` 完成预览：通过且未写入；预览目标为 `openspec/changes/archive/2026-08-18-harden-verification-evidence-integrity`，识别 9 处证据引用改写并包含归档后审计。
- 官方 Skill validator：9/9 通过；原始日志位于 `outputs/verification-evidence-integrity/official-skill-validator.log`。
- 官方 Plugin validator：通过；原始日志位于 `outputs/verification-evidence-integrity/official-plugin-validator.log`。
- `node --test tests/frontend-test-workflow.test.mjs`：14/14 通过，真实 Vue 3 + Vite + Vitest fixture 覆盖测试发现、零测试失败和重复执行稳定性。
- `node --test tests/ui-review-automation.test.mjs`：30/30 通过；沙箱内首次失败的 6 项均为 Chromium/127.0.0.1 权限限制，在授权环境复验后全部通过。
- 根目录清洁与 AI 标记禁入检查通过；`node_modules`、`outputs/frontend-test-runtime`、`outputs/verify-runtime`、`outputs/validator-runtime` 均不存在，日志位于 `outputs/verification-evidence-integrity/root-cleanliness.log`。

## 证据边界

- `outputs/verification-evidence-integrity/` 保存本次验证日志，`outputs/verification-evidence/` 保存机器清单引用的完整 stdout/stderr；二者均为临时验证资产，不进入项目根依赖或持久变更目录。
- 持久可信入口是当前变更的 `evidence/V-*.json`。清单记录工作区指纹、命令 argv、定位命中、退出码、Git 来源和日志摘要；完成校验不会重跑命令。
- V-06 是远程复查后的 `external-ci` 证据，不冒充插件本地命令捕获；完成门禁只消费该持久清单，不联网重跑或重新查询 CI。
