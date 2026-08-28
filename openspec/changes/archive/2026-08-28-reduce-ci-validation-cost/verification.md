# 验证记录：CI 验证成本分层与在途任务治理

## 当前结论

- 本地实现验证：R-04 已通过。
- 真实五平台 CI：实现提交 `9879756a3f94170070aa1fc15c0423cea3870369` 的运行 `33146231087` 整体成功；一次共享任务与五个平台任务属于同一精确提交并全部通过。
- 完成与归档：V-01～V-07 均已通过，当前可以执行规格同步与变更归档。

## R-03 本地历史证据

| 证据 | 内容 | 结果 |
| --- | --- | --- |
| V-01 | 作用域分区、无效参数、失败短路和运行时生命周期 | schema v2 机器证据通过且工作区指纹新鲜 |
| V-02 | 共享前置任务、五平台合同、并发取消和触发边界 | schema v2 机器证据通过且工作区指纹新鲜 |
| V-03 | 完整九阶段统一验证 | 177 个测试中 174 个通过、3 个按环境约定跳过、0 个失败；OpenSpec、运行时完整性和当前平台 Chromium 冒烟通过 |
| V-04 | Vue 3 + Vite fixture 与共享验证 | 127 个测试中 124 个通过、3 个按环境约定跳过、0 个失败；初始化、重复执行、升级、检查和真实 Vitest 回归通过 |

补充门禁：`npm test`、`npm run validate`、`npm run verify`、`npm run verify:shared`、`npm run verify:platform` 均通过；9 个自定义 Skill 和 1 个插件 manifest 均通过官方 validator。根目录没有 `node_modules`，Vitest、统一验证、官方 validator 和测试 fixture 的本次临时目录已清理。

## R-04 本地证据

- 聚焦回归：TC-01/TC-02 2/2 通过；TC-03～TC-05 5/5 通过。新增回归覆盖纯 LFS 占位替换、真实文件拒绝、下载失败、发布后校验失败恢复、Linux ARM64 临时许可来源和工作流无 `git lfs pull`。
- 全量测试：179 项中 176 项通过、3 项按既有环境约定跳过、0 项失败。
- 统一验证：共享 7/7、平台 3/3、完整 9/9 阶段通过；完整性覆盖 880 个 Playwright 文件，当前 `darwin-arm64` Chromium 冒烟返回 `skipped=false`、`screenshotBytes=3509`。
- 固定官方源仿真：在 `outputs/ci-platform-rebuild/` 构造 24 个 Git 跟踪文件，其中 20 个为 LFS 指针、4 个为零字节占位；构建器从官方 CDN 下载固定 Chromium headless shell revision 1234 与 FFmpeg 1011，返回 `playwright_platform_built/passed/darwin-arm64/replacedLfsPointers=20`，242 个目标+共享文件完整性通过，真实浏览器截图 3509 字节。验证目录已精确清理。
- 其他门禁：`npm run validate`、32 项活动 OpenSpec 严格校验、47 项归档任务、9 个官方 Skill validator 和 1 个官方 Plugin validator 全部通过；验证专用 Vitest、validator 和平台重建目录均已清理。

R-03 证据保留为历史；当前 V-01～V-04 将按 R-04 语义重新生成 schema v2 清单。真实五平台仍只由 V-05 证明。

## 未覆盖边界

- 本阶段只对 Vue 3 + Vite + Vitest fixture 做了专项真实工作流复验，没有新增 React、Next.js、Nuxt、Svelte、Angular、uni-app 或微信小程序的专项 fixture 证据；这些框架的既有通用回归不能替代对应真实项目验证。
- GitHub Actions 的共享任务、五个平台 runner、远端 Git LFS 拉取、平台打包上传和 concurrency 取消行为属于外部依赖，必须由最终精确提交的真实工作流证明。
- 本地当前平台浏览器冒烟不能替代 macOS x64、Linux x64/ARM64 和 Windows x64 的真实浏览器证据。

## CI 失败复盘：运行 33134322421

- 运行地址：`https://github.com/julangtaotian/wayfinder/actions/runs/33134322421`
- 精确提交：`69ecedbab14dd90578821c5a0bb72d3395243588`
- 失败平台与步骤：共享 Linux x64，`npm run verify:shared` 的“插件与技能结构”阶段，稳定退出码 1。
- 稳定失败字段：连续出现 `Playwright <platform> 运行包运行时文件摘要变化`；平台矩阵因 `needs: shared` 跳过。
- 根因：共享 job 使用 `lfs: false`，但结构校验仍执行完整五平台二进制摘要校验，把 checkout 中的 LFS 指针内容与真实二进制清单比较。
- 本地遗漏：本地仓库已经拉取全部 LFS 资产，完整和共享命令看到的文件内容相同，原 TC-03 只断言工作流不拉取 LFS，没有把平台文件替换为指针来验证结构阶段边界。
- 回归定位：TC-02 校验共享结构参数；TC-03 使用平台 LFS 指针样本证明共享结构只验证共享运行时、完整平台校验仍失败关闭。
- 修复边界：不让共享任务拉取全部 LFS，不删除结构阶段，不放宽根完整校验，也不减少五平台目标完整性与浏览器冒烟。
- 修复仿真：从 `69ecedba` 以 `GIT_LFS_SKIP_SMUDGE=1` 建立临时检出，确认 639 个平台文件保持 LFS 指针；覆盖修复后，共享结构模式通过，默认完整结构模式以状态 1 继续报告平台摘要变化。临时检出与日志已按 `outputs/` 边界精确清理。

## CI 失败复盘：运行 33137835028

- 运行地址：`https://github.com/julangtaotian/wayfinder/actions/runs/33137835028`
- 精确提交：`b7b6e224395fe2d66115e057cf64b1eabcdd0456`
- 已证明边界：`Shared validation (linux-x64)` 在 44 秒内成功，说明 R-03 的共享结构范围修复有效。
- 失败平台与步骤：macOS ARM64/x64、Linux ARM64/x64、Windows x64 均在 `Pull target Playwright platform assets` 失败，尚未进入平台测试、完整性、浏览器冒烟或打包。
- 稳定失败事实：`git lfs pull` 返回状态 2；GitHub LFS 服务明确报告仓库已超过 LFS budget，需要增加账户额度后才能恢复访问。
- 根因：平台 CI 把仓库账户的可用 LFS 下载额度作为发布门禁前置依赖；本地真实资产和静态工作流测试无法暴露账户额度耗尽。
- 修复边界：不购买额度、不启用缓存、不删除平台、不跳过完整性或浏览器；平台 runner 改用仓库内固定 Playwright 1.62.1 CLI 从官方源重建唯一目标资产，发布成品运行期继续离线。
- 回归定位：TC-04 增加纯 LFS 占位安全替换、真实文件拒绝、下载失败恢复、Linux ARM64 临时许可来源和工作流无 `git lfs pull` 合同。

## V-05 真实 CI 证据

- Actions：`https://github.com/julangtaotian/wayfinder/actions/runs/33146231087`
- 精确提交：`9879756a3f94170070aa1fc15c0423cea3870369`
- 运行结论：成功；整轮可见耗时 2 分 56 秒；生成 5 份平台报告。
- 执行次数：共享验证 1 次，平台验证 5 次；没有减少平台，也没有用本地模拟替代真实矩阵。
- concurrency：本次推送时旧同引用运行已经结束，没有可取消的旧在途实例；同引用取消配置、不同引用隔离和无 `schedule` 由 V-02 的静态 workflow 回归继续证明。

| 任务 | 结果 | 可见耗时 |
| --- | --- | --- |
| Shared validation (linux-x64) | 成功 | 42 秒 |
| Validate (darwin-arm64) | 成功 | 28 秒 |
| Validate (darwin-x64) | 成功 | 1 分 46 秒 |
| Validate (linux-x64) | 成功 | 28 秒 |
| Validate (linux-arm64) | 成功 | 35 秒 |
| Validate (win32-x64) | 成功 | 53 秒 |

本记录只陈述实际任务数、状态和 GitHub 可见耗时，不根据未确认的仓库可见性、套餐或 runner 规则推算金额。本阶段没有创建定时优化、清理或监控任务。
