## 1. 跨平台测试输入

- [x] 1.1 在 `tests/ai-ui-review.test.mjs` 中使用 Node.js 标准库生成有效 PNG，移除固定 Homebrew FFmpeg 路径（D-10，A-06）
- [x] 1.2 为产物编排场景创建临时 FFmpeg 工具替身和字体占位文件，保留两文件、零问题与安全保护断言（D-02、D-03、D-08，A-01、A-02、A-03、A-06）

## 2. 验证与证据

- [x] 2.1 运行 `node --test tests/ai-ui-review.test.mjs`，确认专用回归测试全部通过（A-01、A-02、A-03、A-06）
- [x] 2.2 运行 GitHub Actions 同入口 `npm run verify`、严格变更校验和差异检查（D-10，A-06）
- [x] 2.3 将实际命令与结果写入验证记录，更新 V-05、A-06 和需求状态（A-06）
