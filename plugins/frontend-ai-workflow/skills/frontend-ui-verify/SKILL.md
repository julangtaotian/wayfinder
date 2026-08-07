---
name: frontend-ui-verify
description: Re-run a recorded frontend UI review after fixes using the exact baseline page, viewport, design content, target nodes, interactions, and actual capture method, without switching between project Playwright and Browser fallback, then classify resolved, remaining, and new findings. Use when the user asks to verify, recheck, regress, or close UI findings from an existing review run.
---

# 前端 UI 复验

复验不是新的自由检查；它必须复用基线场景，只有原问题消失且没有新增高置信度问题时才通过。

## 创建复验

1. 定位本 Skill 所在目录，并读取 `../../references/ui-review-workflow.md`。
2. 读取用户指定的基线 `state.json` 和当前 `.frontend-ui-review/config.json`。
3. 用 `start-verify` 预览复验运行。场景指纹、采集计划或基线实际采集器不一致时停止，并要求重新开始一次独立验收；不能通过调整配置绕过。
4. 确认运行 ID 和独立产物目录后再加 `--write`。

## 重新采集

1. 读取复验状态的 `capture` 并严格复用：基线实际使用 `project-playwright` 时执行采集计划中的插件内置适配器或兼容项目命令，基线实际使用 `browser` 时才调用视觉能力；即使另一采集器当前更方便也不得切换。
2. 内置适配器产生 `analysisPending` 证据时，必须重新比较同一设计依据与实际截图并补齐视觉结论；不得把仅完成截图采集当成复验通过。
3. 复用相同页面、视口、DPR、设计内容、目标节点和交互步骤，重新生成实际截图和结构化检查结果。
4. 调用 `ui-review-report.mjs` 生成本次标注 PNG 与 Markdown。采集或报告失败时保持未完成，不写通过。
5. 执行 `complete-verify` 预览，核对稳定问题指纹形成的 `resolved`、`remaining` 和 `new`，再加 `--write`。

## 复验结论

- `remaining` 与 `new` 都为空：本次声明范围通过。
- 任一集合非空：复验失败，分别列出未解决与新增问题；不要把“数量减少”表述为通过。
- 交付基线运行 ID、复验运行 ID、三类问题、验证命令结果和全部产物路径。
- 本 Skill 不修改源码、不提交、不推送、不创建 PR。
