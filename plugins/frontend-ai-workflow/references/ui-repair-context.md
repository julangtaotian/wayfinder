# UI 修复上下文补齐

仅在用户要求修复已记录 UI 问题时读取。运行基线须为版本 2、review / needs-fix；不可用截图、环境注入或配置问题不得冒充源码缺陷。

## 定位与提案

从原始 findings 选择高置信度问题，读取相关源码和必要调用链。核对选择器、目标值与源码的因果关系，填写唯一锚点、允许和禁止范围、现有局部验证命令与断言。范围与源码因果关系仍需审查，机器检查不等于自动证明 diff 安全。

将提案保存在项目规则允许的验证目录，不能在运行目录加入未知文件。JSON 结构如下；示例中的身份和摘要必须从真实 state 与源码取得，不能直接照抄：

```json
{
  "runId": "review-run",
  "scenarioFingerprint": "从 state 原样读取",
  "candidates": [{
    "findingId": "UI-001",
    "findingFingerprint": "从原始 finding 原样读取",
    "sourceSha256": "读取源码原始字节计算的 SHA-256",
    "sourceTarget": { "file": "src/main.css", "anchor": "main {", "styleSource": "页面主样式" },
    "changeScope": "只修改 main 的 color 声明",
    "forbiddenChanges": "不修改其他选择器或业务行为",
    "verification": {
      "workingDirectory": "src",
      "commands": ["项目现有且经过核对的局部验证命令"],
      "page": "/",
      "assertions": ["main 计算颜色与原始发现的目标值相同"]
    }
  }]
}
```

候选列表是本次完整修复集合；补充或调整时重新提交所有仍需修复的候选。只允许项目内真实文件、正斜杠相对路径和唯一锚点。摘要绑定原始字节，锚点兼容 LF / CRLF；候选命令只保存，不由此入口执行。

## 预览、写入与修复

从插件根目录执行，state 和 result 参数为目标项目相对路径：

```text
node scripts/ui-review-workflow.mjs prepare-repair --target <项目> --state <state.json> --result <提案.json>
node scripts/ui-review-workflow.mjs prepare-repair --target <项目> --state <state.json> --result <提案.json> --write
node scripts/ui-review-workflow.mjs repair-gate --target <项目> --state <state.json> [--explicit-approval]
```

先审查预览的候选，确认范围符合当前授权后写入。候选写入不修改 findings、截图或报告，不等于源码修改授权；off / suggest / apply、分支、用户改动重叠门禁仍按 frontend-ui-fix 执行。新候选在 repair-gate 中再次校验基线、源码摘要与锚点；源码变动后必须重新核对，不静默刷新摘要。历史 v2 候选保持既有门禁，v1 状态只读。

失败退出码仍为 1，结构化诊断使用 status、code、target；UI_REPAIR_BASELINE_STALE 表示场景变化，UI_REPAIR_FINDING_STALE 表示发现身份失效，UI_REPAIR_SOURCE_STALE 表示源码变化，UI_REPAIR_ANCHOR_INVALID 表示锚点不唯一，路径错误沿用共享路径 code。失败和预览不写状态。

实际修复并局部验证成功后才 complete-repair；复验继续使用原基线和原始 findings 身份，不能通过补齐上下文把遗留问题变成已解决。
