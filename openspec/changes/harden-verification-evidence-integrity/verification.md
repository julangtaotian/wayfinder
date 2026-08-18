# 验证记录：验证证据完整性与归档可追溯性

## 当前结论

- R-04 正在修复真实矩阵发现的 `actions/upload-artifact@v4` Node.js 20 弃用警告；目标版本为官方当前 v7，现有产物名称、路径和失败语义保持不变。
- V-05 已通过：`npm run verify` 的 8 个阶段全部完成，包含 `npm test` 196/196、结构校验、当前严格 OpenSpec 28/28、归档严格 OpenSpec 37/37、运行时完整性与本机浏览器启动；9 个 Skill 和插件清单另由官方 validators 校验通过。
- V-06 已重新打开：Validate #31 仍作为旧提交历史基线，但不能证明 R-04；升级后的同一提交尚未完成五平台复验。
- 先前 precomplete 与完成预览只适用于 R-03，R-04 完成新的本地证据与真实矩阵前不具备归档条件。

## 已执行证据

| 验证 | 结果 | 机器证据 | 关键断言 |
| --- | --- | --- | --- |
| V-01 | 通过 | `evidence/V-01.json` | 命令退出 0，精确命中 TC-01；预览零写入、零测试与失败覆盖保护通过 |
| V-02 | 通过 | `evidence/V-02.json` | 命令退出 0，精确命中 TC-02；schema、需求/V 身份、路径和新鲜度通过 |
| V-03 | 通过 | `evidence/V-03.json` | 命令退出 0，精确命中 TC-04；归档改写、幂等、危险目标和恢复通过 |
| V-04 | 通过 | `evidence/V-04.json` | 命令退出 0，精确命中 TC-05；UI 报告身份字段通过，UI 全量回归 30/30 |
| V-05 | 通过 | `evidence/V-05.json` | `npm run verify` 退出 0，精确命中 TC-06 两次；统一验证 8 阶段全部完成 |
| V-06 | 待复验 | `evidence/V-06.json` | 当前文件保留 Validate #31 的旧提交历史基线；R-04 完成后必须用新运行覆盖并重新远程复查 |
| V-07 | 通过 | `evidence/V-07.json` | 命令退出 0，精确命中 TC-03；严格/历史/外部边界与项目只读审计通过 |

## 历史 CI 矩阵基线

- 运行：`https://github.com/julangtaotian/wayfinder/actions/runs/32105343499`
- 提交：`fff45089c22b9718ec6afb86321248719865312e`
- 结果：`darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64`、`win32-x64` 全部通过。
- 产物：五个平台分别生成 `plugin-package-report-<platform>`，与矩阵任务一一对应。
- 待修复警告：五个平台均提示 `actions/upload-artifact@v4` 的 Node.js 20 已弃用并被 GitHub 强制使用 Node.js 24；R-04 升级到 v7 后必须由新矩阵确认该警告消失。

## 其他本地回归

- R-04 聚焦回归：`node --test --test-name-pattern="统一验证固定阶段顺序、短路失败并由 CI 单一调用" tests/workflow.test.mjs`，1/1 通过；已断言 `actions/upload-artifact@v7` 存在且 v1～v6 均不存在。
- R-04 结构校验：`npm run validate` 通过；工作流继续保留五平台矩阵、单一 `npm run verify` 入口、平台包构建、唯一产物名称和 `if-no-files-found: error`。
- R-04 本地机器证据：V-01～V-05、V-07 已按新工作区指纹重新生成；`npm run verify` 的 8 个阶段全部完成，其中 `npm test` 196/196、当前严格 OpenSpec 28/28、归档严格 OpenSpec 37/37。
- R-03 `check-change --stage precomplete`：曾通过；R-04 已重新打开跨平台验收，因此该历史结果不作为当前完成结论。
- R-03 `finalize-change` 完成预览：曾通过且未写入；R-04 取得新 V-06 前不重新执行完成预览。
- 官方 Skill validator：9/9 通过；原始日志位于 `outputs/verification-evidence-integrity/official-skill-validator.log`。
- 官方 Plugin validator：通过；原始日志位于 `outputs/verification-evidence-integrity/official-plugin-validator.log`。
- `node --test tests/frontend-test-workflow.test.mjs`：14/14 通过，真实 Vue 3 + Vite + Vitest fixture 覆盖测试发现、零测试失败和重复执行稳定性。
- `node --test tests/ui-review-automation.test.mjs`：30/30 通过；沙箱内首次失败的 6 项均为 Chromium/127.0.0.1 权限限制，在授权环境复验后全部通过。
- 根目录清洁与 AI 标记禁入检查通过；`node_modules`、`outputs/frontend-test-runtime`、`outputs/verify-runtime`、`outputs/validator-runtime` 均不存在，日志位于 `outputs/verification-evidence-integrity/root-cleanliness.log`。

## 证据边界

- `outputs/verification-evidence-integrity/` 保存本次验证日志，`outputs/verification-evidence/` 保存机器清单引用的完整 stdout/stderr；二者均为临时验证资产，不进入项目根依赖或持久变更目录。
- 持久可信入口是当前变更的 `evidence/V-*.json`。清单记录工作区指纹、命令 argv、定位命中、退出码、Git 来源和日志摘要；完成校验不会重跑命令。
- V-06 是远程复查后的 `external-ci` 证据，不冒充插件本地命令捕获；完成门禁只消费该持久清单，不联网重跑或重新查询 CI。
