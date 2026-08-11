---
name: frontend-ui-verify
description: Re-run a recorded frontend UI review after fixes using the exact baseline page, viewport, design content, target nodes, interactions, and actual capture method, without switching between project Playwright and Browser fallback, then classify resolved, remaining, and new findings. Use when the user asks to verify, recheck, regress, or close UI findings from an existing review run.
---

# 前端 UI 复验

复验不是新的自由检查；它必须复用基线场景，只有原问题消失且没有新增高置信度问题时才通过。

## 创建复验

1. 定位本 Skill 所在目录，并读取 `../../references/ui-review-workflow.md`。
2. 读取用户指定的基线 `state.json` 和当前 `.frontend-ui-review/config.json`。
3. 版本 2 Playwright 基线优先执行 `node scripts/ui-review-runner.mjs verify --target <项目> --scenario <场景> --run-id <运行ID> --baseline <基线状态路径>` 预览；版本 1 或 Browser 基线继续使用 `start-verify` 细粒度入口。
4. 场景指纹、采集计划或基线实际采集器不一致时停止，并要求重新开始一次独立验收；不能通过调整配置绕过。确认运行 ID 和独立产物目录后再加 `--write`。

## 重新采集

1. 读取复验状态的 `capture` 并严格复用：基线实际使用插件内置 `project-playwright` 时由统一入口重新执行相同结构化交互和确定性比较；基线实际使用 `browser` 时才调用视觉能力。即使另一采集器当前更方便也不得切换。
2. `inconclusive` 必须保持不确定，原问题不能记为已解决；只有配置已声明兜底时才返回 `fallbackRequired`。不得把仅完成截图采集当成复验通过。
3. 复用相同页面、视口、DPR、设计内容、目标节点、交互步骤、`structure/visual` 范围、几何容差和图片阈值，等待相同的字体、有限动画与双帧稳定条件后，重新生成实际截图和结构化检查结果。
4. 统一入口生成本次实际 PNG、差异图、证据副本、Markdown 与状态。采集或报告失败时返回阻塞，不写通过。
5. 核对稳定问题指纹形成的 `resolved`、`remaining` 和 `new`；统一入口退出码分别为通过 0、失败 1、不确定 2、阻塞 3。

## 复验结论

- `remaining` 与 `new` 都为空：本次声明范围通过；结构范围不得扩写为视觉还原通过。
- 任一集合非空：复验失败，分别列出未解决与新增问题；不要把“数量减少”表述为通过。
- 交付基线运行 ID、复验运行 ID、三类问题、验证命令结果和全部产物路径。
- 本 Skill 不修改源码、不提交、不推送、不创建 PR。
