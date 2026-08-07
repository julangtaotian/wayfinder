# 验证记录

## 自动验证

- `node --test tests/ai-ui-review.test.mjs`：6/6 通过，覆盖新增 Markdown 字段、绝对路径、路径穿越、缺少断言和同节点修复上下文冲突。
- `npm test`：121/121 通过，包含代码标记策略和全部仓库测试。
- `npm run validate`：插件与技能结构有效。
- `node plugins/frontend-ai-workflow/scripts/openspec-cli.mjs validate enhance-ai-ui-review-source-guidance --strict --json`：1/1 通过。
- `git diff --check`：通过。

## 双项目报告复核

- Element Plus 报告目标文件 `outputs/lanhu-design-spec/validation-element-plus/src/theme.css` 存在，稳定锚点 `.scenario-demo .el-button` 位于第 308 行附近。
- Element UI 报告目标文件 `outputs/lanhu-design-spec/validation-element-ui/src/theme.css` 存在，稳定锚点 `.scenario-demo .el-button` 位于第 271 行附近。
- 两份报告均包含当前样式来源、允许修改作用域、禁止修改范围、精确建议、复验工作目录、命令、页面和四条通过断言。
- 两个项目结果目录仍分别只有 `ui-review.png` 和 `ui-review.md`；本次只修改 Markdown，PNG 未重新生成。
- Element Plus PNG SHA-256：`26a8308d46b2d409705b683c447790b019a00c6128d3f860ad2a3e384c2bad70`。
- Element UI PNG SHA-256：`184a6c0ed0f33d18e4e201e807a52bc58d17854f167e7f00e134c71b65fb8c41`。

## 验证边界

本次没有修改两套项目的 UI 源码，因此没有重新执行生产构建或声称行高问题已修复。报告中的 `npm run build`、页面入口与计算样式断言用于后续 AI 或开发人员实际修复后的复验。
