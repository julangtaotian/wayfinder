# 验证记录：前端测试用例工作流

## 结论

首版实现与自举测试方案已通过。测试上下文检查保持只读，三阶段校验和显式完成门禁能够失败关闭，Vue 3 + Vite + Vitest fixture 真实发现计划 TC；其他 runner 仍只提供基于项目文件的有限支持。

## 聚焦验证

- `node --test tests/frontend-test-workflow.test.mjs`：13/13 通过。
- Vitest 3.2.4、npm 锁文件和缓存均按需写入 `outputs/frontend-test-runtime/`；项目根目录没有生成 `node_modules/` 或 `package-lock.json`。
- Vue fixture 的 Vitest 聚焦命令连续两次发现并通过 `[TC-03] 两数相加`，测试文件前后内容一致。
- 使用不存在的测试目标运行同一 fixture 时返回非零，未把零测试发现记为通过。
- 当前变更的 implement 测试方案校验通过，5 条自动 TC 均使用安全的专用测试定位。

## 全量与结构验证

- `npm test`：187/187 通过；首次沙箱内运行仅因既有 Chromium 与本地端口权限受限失败，使用所需本地权限复跑后全部通过；统一验证器将临时目录固定为 `outputs/verify-runtime/tmp`，嵌套验证复用外层目录，最外层在成功或失败后自动回收。
- `npm run validate`：插件、9 个公开 Skill、测试用例资产和 0.15.0 版本一致性通过。
- `npm run verify`：8/8 阶段通过，其中严格 OpenSpec 27/27、归档任务 36/36、OpenSpec 1.9.0 与 76 个运行时包完整性、Playwright 880 文件完整性和本机 Chromium 冒烟均通过。
- 官方 Skill quick validator：9/9 通过。
- 官方 Plugin validator：源码插件通过。
- `git diff --check` 与 AI 计数标记策略：通过。
- CI 已按“准备 Vitest → 统一验证 → `always()` 清理”串联；本地验证结束后也已通过 `npm run cleanup:test-runtime` 删除 `outputs/frontend-test-runtime/`，`outputs/verify-runtime/` 由统一验证器自动回收，临时 `outputs/validator-runtime/` 已删除；历史 outputs 证据未被修改。

## 兼容与剩余边界

- 首版认证范围：Vue 3 + Vite + Vitest。
- Node Test Runner、Jest、Playwright Test、Cypress 等仅在目标项目存在真实命令、配置和文件证据时有限支持，未声明完整认证。
- 不自动安装业务测试依赖，不修改业务源码，不默认修改 `.generated.spec.*`，不复制 UI Review 的浏览器与视觉状态机。
