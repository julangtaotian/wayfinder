# 阶段验证记录

## 本地自动验证

- 日期：2026-08-31
- 环境：macOS ARM64，Node.js 22.12.0；仓库交付合同仍以 Node.js 20.19.0 和真实五平台 CI 为最终外部证据。
- 聚焦测试：TC-01～TC-05 与 TC-12 均通过，分别记录为 V-01、V-07～V-10、V-12 的 schema v2 机器证据。
- 全量测试：189 项测试中 186 项通过、3 项按既定外部项目条件跳过、0 项失败。
- 统一验证：9 个阶段全部通过，包含体积门禁、全量测试、结构、活动/归档 OpenSpec、两套固定运行时完整性和真实 Chromium 冒烟；记录为 V-03。
- Vue 3 + Vite fixture：初始化、重复执行、升级、检查和真实 Vitest 发现通过；记录为 V-04。
- 官方校验器：插件 manifest 通过官方 plugin validator；9 个自定义 Skill 全部通过官方 skill validator。临时 PyYAML 只安装于 `outputs/validator-runtime/`，验证后已精确清理。

## 当前平台真实成品

- 平台：darwin-arm64。
- 官方下载：Playwright 1.62.1，一次尝试成功；没有代理配置，没有清理错误。
- 成品路径：`dist/frontend-ai-workflow-darwin-arm64/`，属于被忽略的本地交付物，不进入候选提交。
- 成品体积：237,552,629 字节；预算 272,629,760 字节；余量 35,077,131 字节。
- 自动检查：唯一平台目录、共享/平台完整性、许可、结构和真实 Chromium 冒烟均通过。
- Marketplace 安装：先移除同名旧 marketplace 配置，再从本次 `dist/frontend-ai-workflow-darwin-arm64/` 添加本地 marketplace；`codex plugin list` 显示 `frontend-ai-workflow@frontend-ai-workflow-darwin-arm64` 为 `installed, enabled`，实际插件路径指向本次成品。
- 新启动上下文加载：以只读、临时、不保存会话的 Codex 启动检查确认 `frontend-ai-workflow:frontend-ui-review` 可见，最终输出 `LOADED`；本机结果摘要 SHA-256 为 `93cec44406db6fc682d38beb83bc6b74b7104f50329c72913c4b5f3d48b69bb7`。
- 真实 UI Review：使用成品内 `ui-review-runner.mjs`、受信适配器和本地静态页面执行 `runtime-delivery-smoke`。预览返回 `readyToWrite: true`、`bundled-adapter`、Playwright 1.62.1、darwin-arm64、`integrityOk: true`；原生权限运行 `mac-arm64-online-native-2` 为 `passed`，2 项 DOM 观察全部 `matched`、0 个 finding。状态与实际截图 SHA-256 分别为 `016729154e387ef74fab7aaaeb10450cac5e9c2db2bbc84727d41cceac60cec7`、`0b7bd8c106d67c609cb57154776fd97c05019190500b4686428098d8e07935ff`。
- 断网使用复核：把 HTTP/HTTPS/ALL proxy 与 Playwright 下载地址全部指向不可达的 `127.0.0.1:9`，只通过 `NO_PROXY` 放行本地验收页；`mac-arm64-offline` 仍为 `passed`，2 项观察全部 `matched`、0 个 finding，且实际截图与联网运行完全相同。状态与截图 SHA-256 分别为 `08453aa129416a0c92a3d9562b03a612f6399f6fe662501950e28af25ea14a3e`、`0b7bd8c106d67c609cb57154776fd97c05019190500b4686428098d8e07935ff`。
- 环境边界：普通工作区沙箱首次启动 Chromium 被 macOS Mach 端口权限阻断，切换到本机原生权限后通过；这不是包缺失或完整性问题。第二次原生启动因临时本地页面尚未成功监听而返回连接拒绝，启动受控本地服务后通过。失败运行保留独立运行 ID，没有覆盖通过证据。
- 本机证据路径：`outputs/platform-runtime-delivery/mac-arm64-ui-review/`，共约 160KB，已被精确忽略，防止临时截图和运行状态进入候选提交。平台包报告 SHA-256 为 `43f854e489f08321efd1833edd00abed192e0a68f5481ff862edf6546a6ba80c`。
- 当前结论：任务 3.3 完成；V-05 与 TC-10 仅标记“macOS ARM64 部分通过”，不能冒充五平台完成。

## 外部与第二阶段门禁

- 第一阶段已通过 WebStorm 提交并推送，提交 SHA 为 `5f0d3fb9b3f08557e38f56d4ece441618c5c1153`，对应 GitHub Actions [run #61](https://github.com/julangtaotian/wayfinder/actions/runs/33345203213)。shared 任务通过，但 `win32-x64` 在 `Prepare platform marketplace outside source runtime` 步骤失败，因此 V-06 与任务 3.4 保持未完成。
- Windows 稳定失败字段：`status=failed`、`code=playwright_platform_build_failed`、`target=win32-x64`、`attempts=0`。失败发生在下载前，外部暂存运行时错误保留了源码 `platform-assets/win32-x64`，递归构建因目标已存在而按安全规则拒绝覆盖。
- 修复定位：`build-playwright-platform.mjs` 的外部运行时复制改为显式顶层白名单复制；`tests/ui-review-platform-runtime.test.mjs` 的 `[TC-03] Windows 外部运行时复制排除源码平台资产` 固定验证 Windows 平台资产哨兵、旧完整性目录和旧发布描述均不会进入外部运行时。只有修复提交的同一精确 SHA 在 shared 与五个平台全部成功后，任务 3.4 才能完成。
- 第一处修复通过 WebStorm 提交并推送为 `791b6c530328510828fcf2b6527e09a929811cd6`，对应 GitHub Actions [run #62](https://github.com/julangtaotian/wayfinder/actions/runs/33345902625)。shared 与四个非 Windows 平台完成，Windows 已越过旧的目录覆盖错误并完成下载，但在同一步骤的真实 Chromium 冒烟中返回 `status=failed`、`code=platform_marketplace_prepare_failed`、`target=win32-x64`、`attempts=0`，启动 `.exe` 时为 `ENOENT`。
- 第二处根因是准备目录和打包目录连续叠加后，Windows CI 的浏览器启动路径达到 297 字符；最终交付路径只有 233 字符。修复把准备、打包和升级备份改为同级短暂存名，并以 `path.win32` 固定 GitHub runner 样本的启动路径低于 260 字符；路径安全校验、独占标识、失败清理和原子发布合同保持不变。
- 第一阶段最终提交 `de6c73f1300aa88f4885f7eef68fbb3e73c21f83` 对应 GitHub Actions [run #63](https://github.com/julangtaotian/wayfinder/actions/runs/33346473461)，总耗时 2 分 25 秒。shared 与 darwin-arm64、darwin-x64、linux-arm64、linux-x64、win32-x64 五个平台全部成功，分别上传 388B、390B、441B、388B、387B 的 `package-report.json`；Windows 已完成真实 Chromium 冒烟。任务 3.4 完成，TC-11 仅记第一阶段部分通过，V-06 继续等待第二阶段最终 SHA。
- 其他四个平台的本地 marketplace 安装、插件加载、真实 Chromium 冒烟和断网运行记录尚未收集，任务 4.1 与 A-05 保持未完成。
- 任务 4.1 的本机入口验证使用 CI 同版官方 `@openai/codex@0.150.0-alpha.8`，在隔离 Codex home 中从复制后的本地 marketplace 安装并启用插件；通过 `debug prompt-input` 确认新会话可见 `frontend-ai-workflow:frontend-ui-review`，再把全部代理与 Playwright 下载地址指向不可达的 `127.0.0.1:9`，从安装缓存启动真实 Chromium 并生成 3509 字节截图。过程未读取用户插件配置、未保留 API 密钥、未认证、未调用模型，结束后隔离缓存清理成功。
- `[TC-12]` 的 5 项自动回归和既有平台聚焦回归共 33 项通过；它们固定验证预览零写入、成功与失败清理、非原生写入拒绝、Windows 路径预算、普通 push/PR 不下载 Codex，以及人工证据开关只复用原五平台矩阵并上传小型 JSON 报告。V-12 仅证明入口与成本合同，不能替代尚待收集的五个平台真实报告。
- 安装门禁首个提交 `7303b73230ff46c5cec4f6818f34870b2b5f1081` 对应 GitHub Actions [run #65](https://github.com/julangtaotian/wayfinder/actions/runs/33349852906)，shared 在 TC-12 的两条测试夹具上失败：夹具把 `platformKey` 固定为 `darwin-arm64`，因此 Linux runner 在真实原生平台保护前失败。修复改为从 `process.platform` 与 `process.arch` 生成夹具身份，并新增独立非原生拒绝回归；生产门禁没有放宽。修复后的本地 `verify:shared` 共 132 项测试，129 项通过、3 项既定跳过、0 项失败；只有修复提交的精确 SHA 通过 normal CI 后才启动人工五平台证据收集。
- 在五平台安装证据齐全前，不删除仓库 HEAD 中的 LFS 平台资产、不移除 `.gitattributes` 规则，也不开始第二阶段退役任务。
- 本变更没有创建 schedule、定时优化、定时清理或定时发布任务。
