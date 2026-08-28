# 验证记录：CI 验证成本分层与在途任务治理

## 当前结论

- 本地实现验证：通过。
- 真实五平台 CI：待 WebStorm 提交并推送后，按最终精确提交复核。
- 完成与归档：待 V-05 通过后执行；当前不宣称跨平台发布完成。

## 本地证据

| 证据 | 内容 | 结果 |
| --- | --- | --- |
| V-01 | 作用域分区、无效参数、失败短路和运行时生命周期 | schema v2 机器证据通过且工作区指纹新鲜 |
| V-02 | 共享前置任务、五平台合同、并发取消和触发边界 | schema v2 机器证据通过且工作区指纹新鲜 |
| V-03 | 完整九阶段统一验证 | 177 个测试中 174 个通过、3 个按环境约定跳过、0 个失败；OpenSpec、运行时完整性和当前平台 Chromium 冒烟通过 |
| V-04 | Vue 3 + Vite fixture 与共享验证 | 127 个测试中 124 个通过、3 个按环境约定跳过、0 个失败；初始化、重复执行、升级、检查和真实 Vitest 回归通过 |

补充门禁：`npm test`、`npm run validate`、`npm run verify`、`npm run verify:shared`、`npm run verify:platform` 均通过；9 个自定义 Skill 和 1 个插件 manifest 均通过官方 validator。根目录没有 `node_modules`，Vitest、统一验证、官方 validator 和测试 fixture 的本次临时目录已清理。

## 未覆盖边界

- 本阶段只对 Vue 3 + Vite + Vitest fixture 做了专项真实工作流复验，没有新增 React、Next.js、Nuxt、Svelte、Angular、uni-app 或微信小程序的专项 fixture 证据；这些框架的既有通用回归不能替代对应真实项目验证。
- GitHub Actions 的共享任务、五个平台 runner、远端 Git LFS 拉取、平台打包上传和 concurrency 取消行为属于外部依赖，必须由最终精确提交的真实工作流证明。
- 本地当前平台浏览器冒烟不能替代 macOS x64、Linux x64/ARM64 和 Windows x64 的真实浏览器证据。

## V-05 待办

推送后记录最终提交 SHA、Actions URL、共享任务与 macOS ARM64/x64、Linux ARM64/x64、Windows x64 五个平台任务的状态和可见耗时。只有六项任务属于同一精确提交且全部成功，旧同引用运行按 concurrency 规则取消，V-05 才可标记通过。不得根据未确认的仓库可见性、套餐和 runner 计费规则推算具体金额，也不得创建定时优化、清理或监控任务。
