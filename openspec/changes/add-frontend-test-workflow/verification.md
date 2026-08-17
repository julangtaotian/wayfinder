# 验证记录：前端测试用例工作流

## 结论

提交 `ad05ef3` 暴露的两条失败链路已修复：统一验证通过 Git 向上发现边界隔离仓库内临时 fixture，Windows 通过当前 Node 执行 npm JS 入口，不再直接启动 `npm.cmd`。提交 `62ec4d2` 的 GitHub Actions 运行 `32014080607` 已证明 Linux x64/ARM64 与 macOS Intel/ARM64 全部通过；Windows 进一步暴露的测试可移植性问题也已修复：错误根回归现在先解析并断言稳定的 `no_registered_stores` 错误码，再同时接受 `/` 与 `\\` 配置路径。新提交尚未取得五平台复跑结果，A-10 保持未完成。

## 聚焦验证

- `node --test tests/frontend-test-workflow.test.mjs`：14/14 通过，新增 TC-07 验证 Windows npm JS 入口与运行时目录边界。
- 原 CI 四个 Linux/macOS 失败断言在与统一验证相同的临时目录和 Git 边界下聚焦复跑：4/4 通过。
- TC-06 在主仓库被忽略目录中建立未初始化 Git 的 fixture：未隔离时能够复现父仓库继承，注入统一验证环境后 Git 向上发现被阻断。
- TC-08 聚焦验证 1/1 通过，并显式断言 Windows 反斜杠样本；不会再用整段平台相关错误文案作为唯一判定依据。
- Vitest 3.2.4、npm 锁文件和缓存均按需写入 `outputs/frontend-test-runtime/`；项目根目录没有生成 `node_modules/` 或 `package-lock.json`。
- Vue fixture 的 Vitest 聚焦命令连续两次发现并通过 `[TC-03] 两数相加`，测试文件前后内容一致。
- 使用不存在的测试目标运行同一 fixture 时返回非零，未把零测试发现记为通过。
- 当前变更的 implement 测试方案校验通过，8 条自动 TC 均使用安全的专用测试定位。

## 全量与结构验证

- `npm test`：189/189 通过，包含真实 Chromium 冒烟、TC-06 父 Git 隔离与 TC-07 Windows npm 入口；验证后通过清理命令删除按需运行时。
- `npm run validate`：插件、9 个公开 Skill、测试用例资产和 0.15.0 版本一致性通过。
- `npm run verify`：无需预先准备运行时即可完成 8/8 阶段和 189/189 自动断言；严格 OpenSpec 27/27、归档任务 36/36、OpenSpec 1.9.0 与 76 个运行时包完整性、Playwright 880 文件完整性和本机 Chromium 冒烟均通过，最外层在完成后自动回收两个临时运行时。
- 官方 Skill quick validator：9/9 通过。
- 官方 Plugin validator：源码插件通过。
- `git diff --check` 与 AI 计数标记策略：通过。
- CI 已收敛为单独调用自包含 `npm run verify`，并保留 `always()` 兜底清理；本地验证结束后已删除 `outputs/frontend-test-runtime/`、`outputs/verify-runtime/` 和临时官方校验器依赖目录，历史 outputs 证据未被修改。

## 兼容与剩余边界

- 首版认证范围：Vue 3 + Vite + Vitest。
- Node Test Runner、Jest、Playwright Test、Cypress 等仅在目标项目存在真实命令、配置和文件证据时有限支持，未声明完整认证。
- 不自动安装业务测试依赖，不修改业务源码，不默认修改 `.generated.spec.*`，不复制 UI Review 的浏览器与视觉状态机。
- Windows 的 npm 命令构造已通过确定性回归，但真实 Windows runner 仍以修复提交的新一轮 GitHub Actions 为最终发布证据。
