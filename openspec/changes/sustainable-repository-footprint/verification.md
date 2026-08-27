# 仓库持续瘦身与生命周期治理验证记录

## 本地自动验证

- 2026-08-26：`npm run test:repository` 通过。
- 2026-08-26：`npm run test:workflow` 通过，99 项测试中 96 项通过、3 项因未配置外部真实项目矩阵而按合同跳过。
- 2026-08-26：`npm run test:platform` 通过，16 项全部通过，当前平台 Chromium 真实启动并完成截图。
- 2026-08-26：`npm test` 通过，170 项测试中 167 项通过、3 项按合同跳过。
- 2026-08-26：`npm run validate` 通过。
- 2026-08-26：`npm run verify` 的 9 个阶段全部通过；体积门禁记录 45 个受跟踪 outputs 文件、280186 字节、1 份活跃全文需求。
- 2026-08-26：9 个自定义 Skill 与插件 manifest 的官方 validator 全部通过。
- 2026-08-26：darwin-arm64 原生平台成品通过结构、完整性、体积和真实浏览器冒烟；237514465 字节，低于 272629760 字节预算，截图 3509 字节。

## 人工结构核对

- 2026-08-26：V-08 在 WebStorm 项目树中人工通过。`requirements/` 同时显示根入口、`archive/2026/` 和 `index.json`；打开 REQ-2026-001 根文件确认其为轻量存根并指向年度正文。
- 2026-08-26：WebStorm 文件搜索可定位 `outputs/lanhu-ai-ui-spec/README.md`，搜索 `outputs/lanhu-design-spec/README.md` 无结果；根 AGENTS 可直接看到持续体积治理规则和“不再依赖定期人工瘦身”约束。

## 外部五平台边界

- V-07 当前保持待执行。只有本次实现提交推送后，同一提交上的 Linux x64、Linux ARM64、Windows x64、macOS Intel、macOS ARM64 五项 GitHub Actions 全部成功，才能将 V-07 更新为通过。
- 本地路径归一化、LFS 指针/缺失失败和 CI YAML 合同测试已经通过，但这些证据不冒充远端 runner 回执。
