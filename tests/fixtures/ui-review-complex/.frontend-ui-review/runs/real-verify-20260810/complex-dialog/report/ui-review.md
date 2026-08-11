# UI 确定性验收结果

- 场景：`complex-dialog`
- 页面：`http://127.0.0.1:4179/`
- 运行时：`darwin-arm64 / Playwright 1.62.1`
- 比较模式：`dom`
- 结果：通过：已声明的 DOM 与图片比较均满足阈值。
- 观察数：`2`
- 问题数：`0`

## 确定性观察

- `DOM-001`｜dom｜matched｜text：实际 已保存 测试用户，期望 已保存 测试用户
- `DOM-002`｜dom｜matched｜hidden：实际 true，期望 true

## 问题与修复边界

- 未发现超过阈值的问题。

