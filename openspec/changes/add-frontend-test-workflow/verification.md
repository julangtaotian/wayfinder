# 验证记录：前端测试用例工作流

## 结论

提交 `15bdc0f` 的 GitHub Actions 运行 `32015566890` 已在 Linux x64/ARM64、Windows x64、macOS Intel/ARM64 五个平台全部通过，证明前两轮暴露的父 Git 继承、Windows npm 启动和平台路径断言问题均已修复。用户进一步要求将这些失败模式固化为仓库与插件的长期防回归规则；R-07 已完成跨平台高风险标记、共享检查清单、Skill 条件读取、结构门禁和 TC-09，本地发布级验证全部通过。守护规则变更尚未提交，因此无法取得精确对应的新一轮五平台证据，A-10、A-11 保持未完成。

## 聚焦验证

- `node --test tests/frontend-test-workflow.test.mjs`：14/14 通过，新增 TC-07 验证 Windows npm JS 入口与运行时目录边界。
- 原 CI 四个 Linux/macOS 失败断言在与统一验证相同的临时目录和 Git 边界下聚焦复跑：4/4 通过。
- TC-06 在主仓库被忽略目录中建立未初始化 Git 的 fixture：未隔离时能够复现父仓库继承，注入统一验证环境后 Git 向上发现被阻断。
- TC-08 聚焦验证 1/1 通过，并显式断言 Windows 反斜杠样本；不会再用整段平台相关错误文案作为唯一判定依据。
- TC-09 聚焦验证 1/1 通过，仓库规则、受管模板、`frontend-change`、共享清单和结构资产缺少任一关键约束都会失败。
- GitHub Actions `32015566890`：五个平台的 `npm run verify`、运行时清理和平台插件打包均通过。
- Vitest 3.2.4、npm 锁文件和缓存均按需写入 `outputs/frontend-test-runtime/`；项目根目录没有生成 `node_modules/` 或 `package-lock.json`。
- Vue fixture 的 Vitest 聚焦命令连续两次发现并通过 `[TC-03] 两数相加`，测试文件前后内容一致。
- 使用不存在的测试目标运行同一 fixture 时返回非零，未把零测试发现记为通过。
- 当前变更的 implement 测试方案校验通过，9 条自动 TC 均使用安全的专用测试定位。

## 全量与结构验证

- `npm test`：在获准启动本地服务与 Chromium 的环境中 190/190 通过，包含真实 Chromium 冒烟、TC-06 父 Git 隔离、TC-07 Windows npm 入口与 TC-09 规则合同；受限沙箱中的 7 个 `EPERM` 只涉及本地监听和 Chromium 系统端口，未作为代码结果。
- `npm run validate`：插件、9 个公开 Skill、测试用例资产和 0.15.0 版本一致性通过。
- `npm run verify`：无需预先准备运行时即可完成 8/8 阶段和 190/190 自动断言；严格 OpenSpec 27/27、归档任务 36/36、OpenSpec 1.9.0 与 76 个运行时包完整性、Playwright 880 文件完整性和本机 Chromium 冒烟均通过，最外层在完成后自动回收两个临时运行时。
- 官方 Skill quick validator：9/9 通过。
- 官方 Plugin validator：源码插件通过。
- `git diff --check` 与 AI 计数标记策略：通过。
- CI 已收敛为单独调用自包含 `npm run verify`，并保留 `always()` 兜底清理；本地验证结束后已删除 `outputs/frontend-test-runtime/`、`outputs/verify-runtime/` 和临时官方校验器依赖目录，历史 outputs 证据未被修改。

## 兼容与剩余边界

- 首版认证范围：Vue 3 + Vite + Vitest。
- Node Test Runner、Jest、Playwright Test、Cypress 等仅在目标项目存在真实命令、配置和文件证据时有限支持，未声明完整认证。
- 不自动安装业务测试依赖，不修改业务源码，不默认修改 `.generated.spec.*`，不复制 UI Review 的浏览器与视觉状态机。
- 现有修复已取得真实 Windows runner 证据；本轮新增守护规则仍需在提交后的同一精确修订上重新取得五平台 Actions 证据。
