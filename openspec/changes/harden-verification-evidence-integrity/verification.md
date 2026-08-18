# 验证记录：验证证据完整性与归档可追溯性

## 当前结论

- 本地核心实现、受影响回归和当前修订统一验证通过；V-01、V-02、V-03、V-04、V-05、V-07 已由同 ID 机器清单记录。
- V-05 已通过：`npm run verify` 的 8 个阶段全部完成，包含 `npm test` 196/196、结构校验、当前严格 OpenSpec 28/28、归档严格 OpenSpec 37/37、运行时完整性与本机浏览器启动；9 个 Skill 和插件清单另由官方 validators 校验通过。
- V-06 保持计划：尚无同一提交的 Linux x64/ARM64、Windows x64、macOS Intel/ARM64 真实 CI 运行证据。
- 完成与归档门禁尚未满足，不把本地结果替代真实矩阵。

## 已执行证据

| 验证 | 结果 | 机器证据 | 关键断言 |
| --- | --- | --- | --- |
| V-01 | 通过 | `evidence/V-01.json` | 命令退出 0，精确命中 TC-01；预览零写入、零测试与失败覆盖保护通过 |
| V-02 | 通过 | `evidence/V-02.json` | 命令退出 0，精确命中 TC-02；schema、需求/V 身份、路径和新鲜度通过 |
| V-03 | 通过 | `evidence/V-03.json` | 命令退出 0，精确命中 TC-04；归档改写、幂等、危险目标和恢复通过 |
| V-04 | 通过 | `evidence/V-04.json` | 命令退出 0，精确命中 TC-05；UI 报告身份字段通过，UI 全量回归 30/30 |
| V-05 | 通过 | `evidence/V-05.json` | `npm run verify` 退出 0，精确命中 TC-06 两次；统一验证 8 阶段全部完成 |
| V-07 | 通过 | `evidence/V-07.json` | 命令退出 0，精确命中 TC-03；严格/历史/外部边界与项目只读审计通过 |

## 其他本地回归

- `npm run verify`：当前修订统一验证通过，8 个阶段全部完成；其中 `npm test` 196/196、当前严格 OpenSpec 28/28、归档严格 OpenSpec 37/37。
- 官方 Skill validator：9/9 通过；原始日志位于 `outputs/verification-evidence-integrity/official-skill-validator.log`。
- 官方 Plugin validator：通过；原始日志位于 `outputs/verification-evidence-integrity/official-plugin-validator.log`。
- `node --test tests/frontend-test-workflow.test.mjs`：14/14 通过，真实 Vue 3 + Vite + Vitest fixture 覆盖测试发现、零测试失败和重复执行稳定性。
- `node --test tests/ui-review-automation.test.mjs`：30/30 通过；沙箱内首次失败的 6 项均为 Chromium/127.0.0.1 权限限制，在授权环境复验后全部通过。
- 根目录清洁与 AI 标记禁入检查通过；`node_modules`、`outputs/frontend-test-runtime`、`outputs/verify-runtime`、`outputs/validator-runtime` 均不存在，日志位于 `outputs/verification-evidence-integrity/root-cleanliness.log`。

## 证据边界

- `outputs/verification-evidence-integrity/` 保存本次验证日志，`outputs/verification-evidence/` 保存机器清单引用的完整 stdout/stderr；二者均为临时验证资产，不进入项目根依赖或持久变更目录。
- 持久可信入口是当前变更的 `evidence/V-*.json`。清单记录工作区指纹、命令 argv、定位命中、退出码、Git 来源和日志摘要；完成校验不会重跑命令。
- 尚未执行的真实外部 CI 明确保留为计划，不能由已有本地通过推断。
