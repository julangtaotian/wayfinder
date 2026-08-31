# 阶段验证记录

## 本地自动验证

- 日期：2026-08-31
- 环境：macOS ARM64，Node.js 22.12.0；仓库交付合同仍以 Node.js 20.19.0 和真实五平台 CI 为最终外部证据。
- 聚焦测试：TC-01～TC-05 与 TC-12 均通过，分别记录为 V-01、V-07～V-10、V-12 的 schema v2 机器证据。
- 规范源码共享测试：134 项测试中 131 项通过、3 项按既定外部项目条件跳过、0 项失败。
- 共享统一验证：7 个阶段全部通过，包含体积门禁、共享测试、结构、活动/归档 OpenSpec 与固定 OpenSpec 运行时完整性；记录为 V-03。源码已经退役平台二进制，平台完整性与真实 Chromium 冒烟由准备后的五个平台成品分别执行，不能再把源码目录当作平台成品运行完整验证。
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
- 最终提交 `1c1309dcdf3ac7254f7c243b2a27f35ba0914eac` 的普通 GitHub Actions [run #70](https://github.com/julangtaotian/wayfinder/actions/runs/33352309048) 通过；随后人工证据 [run #71](https://github.com/julangtaotian/wayfinder/actions/runs/33352448361) 的 shared 与 macOS ARM64/x64、Linux ARM64/x64、Windows x64 五个平台全部通过。五个平台均使用固定 `@openai/codex@0.150.0-alpha.8`，从本地 marketplace 复制安装，确认插件已安装启用、新任务可见 `frontend-ai-workflow:frontend-ui-review`，并在不可达代理下从安装缓存启动真实 Chromium；任务 4.1、V-05 与 A-05 完成。
- 五份安装报告复核结果：darwin-arm64 截图 3506B、SHA-256 `1ac8c66eb15a94ceb77a031917da85dfea9e1502ef05d3b1814843e54d3edbc0`；darwin-x64 3506B、`c9a7384db8fd6af548de8758e694fdc30c4c65af1725ad6d401fcb93bafa3de0`；linux-arm64 2814B、`7b1e9aab29f9c42ecea76a3ab5f0b8af677faacaa0ba1f3dbeaabb00dd3a5cde`；linux-x64 3017B、`192fa4fd2cf6954ed7ca742fe61c5517ba612fd3c4d82ce3ee43472bede30b2e`；win32-x64 1909B、`89d44df4614626a5ddc955fa89f0afd952cffa840bf18ae819226ef6d8a533f5`。前四个平台使用 `installed-path`，Windows 使用 `installed-junction`；五份报告的安装、平台身份、固定 CLI、插件状态、Skill 加载、断网冒烟、初始包冒烟和清理字段全部通过。
- 任务 4.1 的本机入口验证使用 CI 同版官方 `@openai/codex@0.150.0-alpha.8`，在隔离 Codex home 中从复制后的本地 marketplace 安装并启用插件；通过 `debug prompt-input` 确认新会话可见 `frontend-ai-workflow:frontend-ui-review`，再把全部代理与 Playwright 下载地址指向不可达的 `127.0.0.1:9`，从安装缓存启动真实 Chromium 并生成 3509 字节截图。过程未读取用户插件配置、未保留 API 密钥、未认证、未调用模型，结束后隔离缓存清理成功。
- `[TC-12]` 的 5 项自动回归和既有平台聚焦回归共 33 项通过；它们固定验证预览零写入、成功与失败清理、非原生写入拒绝、Windows 路径预算、普通 push/PR 不下载 Codex，以及人工证据开关只复用原五平台矩阵并上传小型 JSON 报告。V-12 只证明入口与成本合同，五个平台真实报告由 run #71 和最终实现 SHA 的 run #76 独立提供。
- 安装门禁首个提交 `7303b73230ff46c5cec4f6818f34870b2b5f1081` 对应 GitHub Actions [run #65](https://github.com/julangtaotian/wayfinder/actions/runs/33349852906)，shared 在 TC-12 的两条测试夹具上失败：夹具把 `platformKey` 固定为 `darwin-arm64`，因此 Linux runner 在真实原生平台保护前失败。修复改为从 `process.platform` 与 `process.arch` 生成夹具身份，并新增独立非原生拒绝回归；生产门禁没有放宽。修复后的本地 `verify:shared` 共 132 项测试，129 项通过、3 项既定跳过、0 项失败；只有修复提交的精确 SHA 通过 normal CI 后才启动人工五平台证据收集。
- 修复提交 `d1cef92742958109ee9f9bd582c8143e4e0adbff` 的普通 GitHub Actions [run #66](https://github.com/julangtaotian/wayfinder/actions/runs/33351017037) 已通过。随后只触发一次人工证据 [run #67](https://github.com/julangtaotian/wayfinder/actions/runs/33351176003)：shared、macOS ARM64/x64、Linux ARM64/x64 全部通过，Windows x64 在安装、加载与平台验证均通过后，断网 Chromium 启动因 Codex 缓存中的可执行文件路径超过传统 MAX_PATH 而返回 `ENOENT`。修复仅把 Windows 浏览器启动路径转换为系统扩展长度命名空间，保持实际安装缓存、完整性校验和其他平台路径不变；任务 4.1 继续等待修复 SHA 的五平台报告。
- 扩展长度路径提交 `27686d82a2f0d36a64353a1db232ad85f626aae1` 的普通 GitHub Actions [run #68](https://github.com/julangtaotian/wayfinder/actions/runs/33351699912) 已通过；人工证据 [run #69](https://github.com/julangtaotian/wayfinder/actions/runs/33351867600) 再次确认其他四平台通过。Windows 已使用 `\\?\\D:\\...` 成功创建 Chromium 进程，但 Chromium 自身无法从扩展长度模块路径加载 ICU 数据并退出。下一处修复改为在隔离 `outputs` 暂存目录内创建指向已安装插件的 Windows 目录联接，用低于 260 字符的普通路径运行同一份缓存文件；完整性仅对该受控入口保留联接路径，默认真实路径校验不变，不复制大型运行时。
- 五平台安装证据已经齐全，可以进入任务 4.2～4.5；当前提交仍保留仓库 HEAD 中的 LFS 平台资产和 `.gitattributes` 规则，只有退役回归与零预算门禁先完成后才执行任务 4.4。
- 第二阶段先增加 TC-06 与 TC-07，再从工作树精确移除 659 个受跟踪平台文件（约 1.3GB）、5 份平台生成完整性清单和对应 LFS 规则；旧 `--replace-lfs-pointers` 参数、占位树安全替换、备份恢复字段及两条旧回归同步退役。Git 历史和远端 LFS 对象均未修改。
- 仓库体积审计当前报告平台资产文件、平台生成清单和平台 LFS 规则均为 `actual=0/limit=0`；TC-06、TC-07 与平台聚焦相关测试 38/38 通过，仓库治理聚焦 25/25 通过，结构校验与活动/归档 OpenSpec 严格校验通过。规范源码的统一验证不再执行平台完整性和 Chromium 冒烟，真实平台检查只在 `verify:platform` 对准备后的成品执行。
- 早期本机全量验证曾因沙箱 DNS 和回环监听权限中断，失败记录没有改写为通过。最终收尾在允许固定依赖下载的环境刷新 V-03，并按源码/平台职责执行 `verify:shared`；134 项共享测试、7 个共享阶段全部通过。V-04 的 Vue 3 + Vite 真实 fixture 同步刷新通过，临时 Vitest 运行时随后由 `cleanup:test-runtime` 精确清理。平台部分由同一实现 SHA 的真实五平台 runner 补齐。
- 退役提交 `4a340c3dea5a20fe3e02cb69c89e3016f8d06977` 对应 GitHub Actions [run #73](https://github.com/julangtaotian/wayfinder/actions/runs/33355359676)：shared 在 44 秒内通过，五个平台均完成外部 marketplace 准备，但 `verify:platform` 的同一条源码分发测试失败。根因是平台 CI 注入的 `UI_REVIEW_RUNTIME_ROOT` 改变了测试默认检查对象；修复让该用例显式传入仓库源码运行时与完整性目录，生产准备、安装和运行逻辑未变。
- 最终实现提交 `eb57c88dee473c241dad50d6e8647cd0027e1e0f` 的普通 GitHub Actions [run #74](https://github.com/julangtaotian/wayfinder/actions/runs/33363889239) 已通过：一次 shared 与 darwin-arm64、darwin-x64、linux-arm64、linux-x64、win32-x64 五个平台任务全部成功，普通运行只上传五份小型 `package-report.json`，没有执行 Codex 安装证据步骤。
- 同一精确提交的人工 GitHub Actions [run #76](https://github.com/julangtaotian/wayfinder/actions/runs/33370526419) 用时 2 分 20 秒并全部成功。五个平台均实际执行固定 Codex CLI 安装、插件加载与断网 Chromium 验证；对应 artifact 大小为 darwin-arm64 1.12KB、darwin-x64 1.11KB、linux-arm64 1.17KB、linux-x64 1.10KB、win32-x64 1.11KB，仅包含包报告和安装证据。五份 artifact SHA-256 依次为 `135e81ba2732abc908fdfa57bdca72eacdeda48ce403034122fe92a2db4b55d2`、`000988ca108171c2deabfb859afdc70163e9569cc89d04b988cdecf34818392b`、`ca897973e33ac4ad282e724c30601f4a00bedcbd76b30e717c436e39ef9e4268`、`0eccd3f09a1b1942c3af479a52dedc1d9738e719285496d9c0eec0e487255986`、`006558f3a8a365c6f43964d8bc98d0f6f4f859b295dc1ad8b53f10d190ddf719`。
- V-05、V-06、TC-10、TC-11 与 A-01～A-06 均已满足；当前实现提交完成普通成本边界和人工安装证据两类独立验证，可以进入规格同步与归档。
- 本变更没有创建 schedule、定时优化、定时清理或定时发布任务。
