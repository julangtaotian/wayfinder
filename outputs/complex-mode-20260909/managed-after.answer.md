我会先读取指定的 frontend-test 技能和项目规则，再复验 add-fixture-test 的现有用例；只更新测试方案、需求验证记录及当前项目 outputs 中的证据。


已确认现有 `[TC-01] 两数相加` 用例直接验证 `add(1, 2) === 3`，与 A-01 一致，项目原生运行器可用。预览显示插件会将 JSON 证据写入 openspec，但项目规则要求验证产物位于 outputs；我会先检查它是否支持调整证据路径。


插件将机器证据路径写死在变更目录内，无法配置到 outputs。按项目写入范围，我会将原生命令的实际结果和日志保存在 outputs，并据实更新两份文档；严格证据门禁会单独记录为阻塞，不会标记“已验证”。


聚焦复验已通过：1 个测试、1 个通过，精确命中 TC-01，退出码为 0。两份文档已记录这一结果及严格证据路径阻塞；接下来会校验更新后的方案，并核对文件哈希和改动范围。


已执行 `node --test tests/math.test.mjs`：**1/1 通过**，精确命中 TC-01，退出码 0。测试方案和需求验证记录已更新，方案结构校验通过；业务源码、依赖文件和既有测试均未修改。

[复验证据与日志]([repository]/outputs/complex-mode-20260909/workspaces/managed-after/outputs/verification-evidence/add-fixture-test/2026-09-09T03-00-35-910Z/review.md)包含命令、环境、结果和文件哈希。

严格门禁仍阻塞：[frontend-test 技能]([repository]/outputs/complex-mode-20260909/packages/after/skills/frontend-test/SKILL.md)引用的规则要求“自动通过必须由插件证据入口生成同 ID 的 `evidence/<V-ID>.json`”。插件固定写入 openspec，与产物仅存 outputs 的限制冲突，因此保留“已实现”，未标记“已验证”或执行 complete 校验。