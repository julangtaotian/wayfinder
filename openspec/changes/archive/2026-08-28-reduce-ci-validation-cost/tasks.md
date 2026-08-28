## 1. 先建立失败回归

- [x] 1.1 在 `tests/workflow-project.test.mjs` 复用现有统一验证用例，补充 `all/shared/platform` 阶段集合、完整测试分区、未知/零测试失败、稳定 scope/code/status、失败短路和 Vitest/临时目录生命周期断言。（D-02、D-03、D-07、D-08；A-01、A-02）
- [x] 1.2 在 `tests/ui-review-platform-runtime.test.mjs` 复用现有平台合同用例，补充共享 job、`needs` 依赖、五平台专属脚本、目标 LFS、Node 版本、打包、报告、只读权限和无 cache/path-ignore/schedule 断言。（D-02、D-04、D-05、D-06、D-07、D-08；A-02、A-03、A-04、A-06）
- [x] 1.3 运行上述两个文件的聚焦测试，确认新断言先针对当前单矩阵完整验证结构失败，并记录可稳定定位的失败项。（D-07、D-08；A-01、A-02、A-03、A-04）

## 2. 实现统一验证作用域

- [x] 2.1 扩展 `scripts/test-groups.mjs`，从完整集合确定性扣除非空平台集合生成共享集合，并校验子集、互斥、并集和零测试边界；保留现有 repository/workflow/platform 聚焦入口兼容。（D-02、D-03、D-07；A-01、A-02、A-03）
- [x] 2.2 扩展 `scripts/verify.mjs`，实现默认 `all`、显式 `shared/platform`、严格 CLI 参数、稳定结果字段和对应阶段集合；保持完整九阶段顺序与真实退出码。（D-02、D-03、D-08；A-01、A-02、A-03）
- [x] 2.3 让 `all/shared` 准备并清理 Vitest 临时运行时、`platform` 跳过该准备；三个作用域均保留 `outputs/verify-runtime/` 有界临时目录、Git 隔离、环境变量继承和成功/失败/异常清理。（D-03、D-08；A-01、A-02、A-03）
- [x] 2.4 在 `package.json` 增加 `verify:shared` 与 `verify:platform`，保持 `verify`、Node.js 20.19.0 最低要求和零新增依赖。（D-03、D-05；A-01、A-06）

## 3. 分层 CI 与在途运行

- [x] 3.1 将 `.github/workflows/validate.yml` 建为单个 Linux x64 `shared` job，使用 `lfs: false`、Node.js 20.19.0、`npm run verify:shared` 和始终执行的 Vitest 兜底清理。（D-02、D-03、D-05、D-08；A-02、A-05、A-06）
- [x] 3.2 将现有五平台矩阵迁移为 `needs: shared` 的 `platform` job，继续 `fail-fast: false`，逐平台拉取目标 LFS、运行 `npm run verify:platform`、构建平台插件并以 `actions/upload-artifact@v7` 上传原报告。（D-02、D-05、D-08；A-03、A-05、A-06）
- [x] 3.3 增加 `${{ github.workflow }}-${{ github.ref }}` concurrency 与 `cancel-in-progress: true`，保留 push、pull_request、`contents: read` 和不同引用边界，确认没有 schedule、路径忽略、缓存或新增权限。（D-04、D-05；A-04、A-06）

## 4. 聚焦与本地发布验证

- [x] 4.1 运行作用域、生命周期和 CI 合同聚焦测试；修复时保留每个跨平台根因的稳定回归定位，生成 schema v2 的 V-01、V-02 机器证据。（D-07、D-08；A-01、A-02、A-03、A-04、A-06）
- [x] 4.2 执行 `npm test`、`npm run validate`、`npm run verify` 与官方 Skill/Plugin validators，确认工作区无根 `node_modules`、无临时 fixture 残留并生成 V-03 机器证据。（D-03、D-05、D-08；A-01、A-05、A-06）
- [x] 4.3 在 Vue 3 + Vite fixture 上验证初始化预览/写入、重复执行、升级和检查，生成 V-04 机器证据并记录未覆盖框架与外部依赖。（D-08；A-05）
- [x] 4.4 复盘提交 `69ecedba` 的共享 CI 结构阶段失败，在 `validate-structure.mjs` 增加严格共享范围，只校验共享 Playwright 运行时；根完整校验和五平台目标完整性保持失败关闭。（D-02、D-03、D-05、D-08；A-01、A-02、A-03、A-05、A-06）
- [x] 4.5 在现有 TC-02/TC-03 中补充共享结构参数、平台 LFS 指针样本、共享/完整完整性分界和无效参数回归，重新生成 V-01、V-02。（D-02、D-03、D-07、D-08；A-01、A-02、A-03、A-06）
- [x] 4.6 重新执行全量、结构、统一验证和官方 validators，确认 V-03 新鲜且临时目录清理。（D-03、D-05、D-08；A-01、A-05、A-06）
- [x] 4.7 重新执行 Vue 3 + Vite fixture 与共享验证，生成新鲜 V-04。（D-08；A-05）
- [x] 4.8 复盘提交 `b7b6e224` 的运行 `33137835028`：记录共享任务成功、五平台在测试前因 Git LFS 预算耗尽以状态 2 失败，并把 CI 资产来源修订为固定 Playwright 官方下载。（D-05、D-08、D-09；A-03、A-05、A-06、A-07）
- [x] 4.9 在现有 TC-04 中先补纯 LFS 指针替换、混入真实文件拒绝、下载失败回滚、Linux ARM64 许可来源和工作流无 `git lfs pull` 的确定性失败回归。（D-07、D-08、D-09；A-03、A-05、A-07）
- [x] 4.10 扩展平台构建器：仅在显式模式下安全备份并替换纯 LFS 占位目录，使用固定 Playwright CLI 重建目标平台，失败恢复并输出稳定机器字段；Linux ARM64 从临时同版本 Linux x64 官方包补齐许可。（D-08、D-09；A-03、A-05、A-07）
- [x] 4.11 移除五平台 CI 的 `git lfs pull`，在 Node 设置后逐平台调用安全重建入口；保持 `lfs: false`、无缓存、零新增依赖、五平台完整性/冒烟/打包/报告合同。（D-02、D-05、D-08、D-09；A-02、A-03、A-05、A-06、A-07）
- [x] 4.12 重新执行聚焦、全量、共享、平台、结构、官方 validators 与 Vue 3 + Vite fixture，刷新 V-01～V-04，并确认本次暂存和验证目录清理。（D-03、D-07、D-08、D-09；A-01、A-02、A-03、A-05、A-06、A-07）

## 5. 精确提交外部证据与完成

- [x] 5.1 已使用 WebStorm 提交并推送实现提交 `9879756a3f94170070aa1fc15c0423cea3870369`；运行 `33146231087` 的 shared 与 macOS ARM64/x64、Linux ARM64/x64、Windows x64 五个平台任务全部成功。推送时旧同引用运行已结束，因此没有可取消的旧在途实例，concurrency 取消分支继续由 V-02 静态回归覆盖。（D-04、D-06、D-08；A-03、A-04、A-05、A-06）
- [x] 5.2 已复核同一运行仅有一次共享验证和五次平台验证；整轮 2 分 56 秒，各任务可见耗时记录于 V-05，未推算套餐金额。（D-06；A-06）
- [x] 5.3 已将 REQ-2026-034 更新为待验证所需的实际 V-*、A-* 与 TC-* 映射并完成测试方案；随后预览并执行规格同步与变更归档，且未创建定时优化任务。（D-01、D-04、D-08；A-01、A-02、A-03、A-04、A-05、A-06）
