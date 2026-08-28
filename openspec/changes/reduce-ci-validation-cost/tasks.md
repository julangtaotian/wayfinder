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

## 5. 精确提交外部证据与完成

- [ ] 5.1 使用 WebStorm 提交并推送实现提交，记录精确 SHA 与 Actions URL；确认旧同引用运行按 concurrency 取消，且最终运行的 shared 与 macOS ARM64/x64、Linux ARM64/x64、Windows x64 五个平台任务全部成功后更新 V-05。（D-04、D-06、D-08；A-03、A-04、A-05、A-06）
- [ ] 5.2 复核工作流任务数和可见耗时，只报告共享验证由五次降为一次、平台验证保持五次及实际运行事实，不推算未确认套餐下的金额。（D-06；A-06）
- [ ] 5.3 将 REQ-2026-034 更新为待验证/已验收所需的实际 V-*、A-* 与 TC-* 映射，完成测试方案，预览并执行规格同步与变更归档；不得创建定时优化任务。（D-01、D-04、D-08；A-01、A-02、A-03、A-04、A-05、A-06）
