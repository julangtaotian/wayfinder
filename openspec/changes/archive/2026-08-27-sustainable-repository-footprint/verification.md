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
- 2026-08-27：`UI_REVIEW_EXPECT_PLATFORM=darwin-arm64 npm run verify` 按 CI 单平台环境通过 9 个阶段；第 8 阶段只校验 darwin-arm64 的 241 个文件，第 9 阶段真实启动 Chromium 并生成 3509 字节截图。
- 2026-08-27：不带平台变量的 `npm run verify` 再次通过 9 个阶段；第 8 阶段继续校验全部五个平台的 880 个文件，证明 CI 收窄没有放宽本地完整性边界。
- 2026-08-27：UI 自动化 30 项和平台专项 18 项全部通过；新增回归直接执行 `playwright-runtime.mjs --check`，断言机器结果只包含矩阵目标平台。

## 人工结构核对

- 2026-08-26：V-08 在 WebStorm 项目树中人工通过。`requirements/` 同时显示根入口、`archive/2026/` 和 `index.json`；打开 REQ-2026-001 根文件确认其为轻量存根并指向年度正文。
- 2026-08-26：WebStorm 文件搜索可定位 `outputs/lanhu-ai-ui-spec/README.md`，搜索 `outputs/lanhu-design-spec/README.md` 无结果；根 AGENTS 可直接看到持续体积治理规则和“不再依赖定期人工瘦身”约束。

## 外部五平台边界

- V-07 已人工复核通过：提交 `1e3d566f9e344e30c4bdb19cfe380dc3a126140d` 的 Linux x64、Linux ARM64、Windows x64、macOS Intel、macOS ARM64 五项 GitHub Actions 在 Validate #53 首次执行全部成功。
- 本地路径归一化、LFS 指针/缺失失败和 CI YAML 合同测试继续由 V-04/V-06 机器证据证明；Validate #53 作为人工复核的外部 runner 事实记录，不冒充插件独立远程读取回执。

### 首次矩阵失败复盘

- 运行：GitHub Actions Validate #50，提交 `cec8a026aab8330c4f0e09f2eb516f7f222f2065`，五个平台任务均在 `npm run verify` 的“插件与技能结构”阶段以退出码 1 失败。
- 根因：CI 已按 `matrix.platform` 只拉取目标平台 LFS 资产，但 `validate-structure.mjs` 仍强制校验全部五个平台；其余平台保留的 LFS 指针被误判为运行时摘要变化。本地完整克隆包含全部真实资产，因此此前本地验证无法复现。
- 修复：`resolvePlaywrightIntegrityScope` 在没有矩阵目标时继续全平台校验；存在 `UI_REVIEW_EXPECT_PLATFORM` 时只校验该目标平台，并拒绝不受支持的平台键。
- 新增回归：`tests/ui-review-platform-runtime.test.mjs` 的 `[V-04] CI 完整性校验只检查已拉取平台，本地仍检查全部平台`，同时验证 CI 单平台成功、本地全平台仍能阻止非目标摘要变化和非法平台失败关闭。
- 首次运行地址：`https://github.com/julangtaotian/wayfinder/actions/runs/33032201305`。

### 第二次矩阵失败复盘

- 运行：GitHub Actions Validate #51，提交 `d6a0d31c52209a76b1a5a3d84f428e083fac8c71`，五个平台任务均失败。
- Linux x64 根因：结构阶段已经使用单平台范围，但统一验证第 8 阶段的 `playwright-runtime.mjs --check` 仍直接传入 `verifyAllPlatforms: true`，因此继续读取未拉取的 Windows 等平台 LFS 指针。
- 其余四个平台根因：`runtime-capture.cases.mjs` 的运行时用例仍额外硬编码检查 linux-x64 Chromium；单平台克隆只拉取自身资产，因此在自动测试阶段失败。
- 此前回归缺口：第一次修复只验证了底层范围解析和结构校验调用，没有直接执行统一验证使用的 CLI，也没有让 UI 自动化额外检查复用矩阵目标；完整本地克隆中的五平台真实资产遮蔽了两个遗漏。
- 修复：新增 `verifyConfiguredPlaywrightIntegrity` 作为结构校验、统一验证 CLI 与 UI 自动化的共同入口；新增 `resolvePlaywrightValidationTarget` 统一 UI 运行时目标，本地无矩阵变量时仍保留 linux-x64 额外检查。
- 新增回归：单平台 LFS 指针 fixture 验证目标平台通过、本地全平台失败；真实 `--check` 子进程断言输出只包含 darwin-arm64；CI 模拟和本地全平台两套完整 `npm run verify` 均通过。
- 第二次运行地址：`https://github.com/julangtaotian/wayfinder/actions/runs/33032788437`；其后第三次运行确认了回归测试仍固定平台的遗漏。

### 第三次矩阵失败复盘

- 运行：GitHub Actions Validate #52，提交 `7251a9db996a544777cf208129c10c4daa787073`；darwin-arm64 完整通过并产出平台包，darwin-x64、linux-x64、linux-arm64 和 win32-x64 在自动测试阶段失败。
- 根因：新增的 CLI 入口回归固定向子进程注入 `UI_REVIEW_EXPECT_PLATFORM=darwin-arm64`。该断言在完整本地克隆和 darwin-arm64 单平台克隆都通过，但其余四个平台只拉取自身 LFS 资产，因此测试错误地要求读取 darwin-arm64 指针。
- 修复：CLI 子进程回归在 CI 中继承当前 `UI_REVIEW_EXPECT_PLATFORM`，本地无矩阵变量时使用当前 `process.platform-process.arch`；断言结果只能包含该实际目标平台。
- 新增验证边界：五个平台环境值继续逐一执行真实 `--check`；单平台 LFS 指针 fixture 保留“目标通过、非目标失败”的确定性保护，不再用固定的其他平台测试真实 checkout。
- 第三次运行地址：`https://github.com/julangtaotian/wayfinder/actions/runs/33033888961`；该根因修复后由第四次运行确认。

### 第四次矩阵通过

- 运行：[GitHub Actions Validate #53](https://github.com/julangtaotian/wayfinder/actions/runs/33034456332)，精确提交 `1e3d566f9e344e30c4bdb19cfe380dc3a126140d`，总耗时 2 分 15 秒，状态 Success，生成 5 份平台产物。
- 五个平台任务首次执行全部成功：[darwin-arm64](https://github.com/julangtaotian/wayfinder/actions/runs/33034456332/job/98394017252)、[darwin-x64](https://github.com/julangtaotian/wayfinder/actions/runs/33034456332/job/98394017430)、[linux-x64](https://github.com/julangtaotian/wayfinder/actions/runs/33034456332/job/98394017381)、[linux-arm64](https://github.com/julangtaotian/wayfinder/actions/runs/33034456332/job/98394017340)、[win32-x64](https://github.com/julangtaotian/wayfinder/actions/runs/33034456332/job/98394017393)。
- 结论：按平台 LFS 拉取、单平台结构与 CLI 完整性、UI 自动化、统一验证、真实浏览器冒烟、平台打包和产物上传在同一 SHA 上全部闭环；前三次失败及对应回归继续保留，防止重新引入同类范围遗漏。

## 完成归档与恢复

- 首次正式完成已成功同步六项主规格、归档变更并分层归档需求正文，但归档后审计发现测试方案和机器证据仍指向根需求存根，因此返回可重复恢复的 `archive_partial_failure`，没有二次归档或伪造通过。
- 根因修复提取 `finalize-change-references.mjs`：需求正文进入年度目录后，完成流程同步迁移测试方案和全部 `V-*.json` 的需求路径；无独立测试方案的历史变更保持兼容，恢复执行重复运行不产生额外改写。
- 回归覆盖正常完成、部分失败恢复、有/无测试方案和证据清单路径迁移；修复后的统一验证 9/9 阶段通过，174 项测试中 171 项通过、3 项按合同跳过、0 失败。
- 最终恢复返回 `archive_recovered`；归档需求、测试方案和 6 份 schema v2 机器证据的 complete 审计全部通过，错误与警告均为空。
