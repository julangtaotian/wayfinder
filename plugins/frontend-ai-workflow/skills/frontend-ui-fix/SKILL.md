---
name: frontend-ui-fix
description: Apply explicitly authorized frontend source fixes from a completed UI review while enforcing branch, dirty-worktree, source-target, anchor, allowed-scope, forbidden-scope, and verification gates. Use only when the user directly asks to apply or automatically fix findings from a recorded UI review; do not trigger for inspection, suggestions, or general UI questions.
---

# 前端 UI 修复

只处理一次已完成验收中具备完整安全上下文的问题。配置允许修复不等于允许提交、推送或创建 PR。

## 强制门禁

1. 定位本 Skill 所在目录，并读取 `../../references/ui-review-workflow.md`。
2. 读取用户指定的版本 2 review `state.json`，确认状态为 `needs-fix` 且 `repairCandidates` 非空，再用 `repair-gate` 检查当前配置与场景指纹。仅报告的图片差异或缺少源码上下文的问题不能进入修复。
3. `blocked` 时停止；`suggest` 时只交付建议。只有 `apply` 才能继续。默认 `suggest` 模式必须由用户在当前任务明确要求应用修复，并向命令传入 `--explicit-approval`。
4. 检查 Git 当前分支与工作区：
   - 当前分支为 `main` 或 `master` 时停止，要求切换到工作分支。
   - 报告目标文件包含用户未提交改动且会与修复范围重叠时停止并请求方向。
   - 不清理、不覆盖、不回退用户已有改动。
5. 对每个问题确认高置信度、仓库相对源码文件、稳定锚点、允许修改范围、禁止修改范围和至少一条复验断言均存在。缺一项就停止该问题。
6. 把验收采集来源仅视为证据元数据；无论证据来自项目 Playwright 还是 Browser 视觉兜底，都不得扩大报告声明的源码文件、修改范围或外部权限。
7. 把适配器摘要不匹配、页面环境未准备、配置迁移和受控故障注入视为验收环境事实，不得将其加入业务源码 `repairCandidates`，也不得通过修改业务源码让验收环境通过。只有真实源码当前态验收产生且通过完整门禁的问题才能进入应用修改。

## 应用修改

1. 只读取报告列出的目标源码和必要上下文；确认稳定锚点仍唯一可定位。
2. 只修改 `changeScope` 允许的最小连续范围，遵守 `forbiddenChanges`，并保留项目原有风格和中文维护注释要求。
3. 每完成一个问题就检查实际 diff，确认没有触碰未声明文件或相邻业务行为。
4. 运行报告中安全、局部且与当前项目一致的验证命令。命令缺失、失效或需要新依赖时停止，不擅自安装。
5. 只有实际修改和局部验证成功的问题才能列入 `complete-repair --finding-ids`。先预览，再用 `--write` 把状态更新为 `ready-to-verify`；不得直接标为通过。

## 完成方式

交付已修改问题、未修改问题、源码文件、验证结果和待复验状态路径。若当前请求包含完整闭环，继续按 `$frontend-ui-verify` 的规则复验；否则明确下一步是复验。除非用户另行要求，不提交、不推送、不创建 PR。
