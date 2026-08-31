## Why

源码仓库当前直接跟踪五个平台约 1.3GB 的 Playwright 浏览器资产，带来克隆、索引、磁盘和 Git LFS 成本，而同一安装实际只需要当前平台的一套运行时。CI 已证明固定 Playwright 1.62.1 可以在五个平台从官方源重建并生成离线单平台成品，现在可以把大型平台资产从规范源码中解耦，同时保持插件安装后的离线稳定性。（D-01、D-02、D-03、D-05；A-02、A-06）

## What Changes

- 新增默认预览、显式写入的平台准备链，在安装或升级阶段从固定官方源下载当前原生平台资产，并在源码目录之外生成内置运行时的本地 marketplace 成品。（D-04、D-05、D-08、D-09；A-01、A-02）
- 下载最多三次、单次最多十分钟，继承已有代理环境但不记录凭据；失败清理暂存并保留旧插件，已验证的同平台同版本成品支持复制到离线环境安装。（D-13；A-03、A-05）
- 普通 push/PR 继续执行一次共享验证和五平台原生矩阵，只上传小型报告，不依赖 LFS 指针、不上传大型平台包、不增加缓存或定时任务。（D-07、D-11、D-12；A-04）
- 采用两阶段迁移：先交付并验证新链路，五个平台安装、加载、真实 Chromium 冒烟和断网运行全部通过后，再从仓库 HEAD 移除平台二进制、LFS 规则和旧占位替换路径。（D-02、D-06、D-10；A-05、A-06）
- **BREAKING**：源码 marketplace 不再直接携带五个平台浏览器；安装或升级需要先准备当前平台成品，或使用已经验证的离线成品。本变更不改写 Git 历史，也不自动清理远端 LFS 对象。（D-02、D-04、D-05；A-02、A-06）

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `plugin-ui-review-automation`：平台发布入口从复制源码内资产改为在外部暂存中准备唯一平台运行时和完整本地 marketplace 成品，并增加网络降级、旧包保留与离线成品复用合同。（D-03、D-04、D-05、D-08、D-09、D-13；A-01、A-02、A-03、A-05）
- `repository-verification-gate`：五平台 CI 不再替换 LFS 指针，而是在源码外暂存构建目标运行时与平台成品，继续验证完整性、许可、真实浏览器和小型报告。（D-07、D-09、D-11、D-12；A-04）
- `repository-hygiene`：源码 HEAD 退役平台二进制和 LFS 跟踪规则，共享运行时源码与实际平台成品使用不同完整性边界。（D-02、D-06、D-10；A-05、A-06）
- `repository-footprint-governance`：体积门禁增加平台资产退役路径和受跟踪平台二进制零容忍合同，不允许通过放宽预算回退。（D-02、D-06、D-10；A-06）

## Impact

- 主要代码：`plugins/frontend-ai-workflow/scripts/build-playwright-platform.mjs`、`package-plugin-platform.mjs`、`playwright-runtime.mjs`、`validate-structure.mjs` 及平台准备入口。
- 测试：复用 `tests/ui-review-platform-runtime.test.mjs`、`tests/repository-hygiene.test.mjs`、`tests/repository-footprint.test.mjs`，覆盖路径、子进程、环境变量、网络失败、Windows 重试、离线安装和 LFS 退役。
- CI 与交付：修改 `.github/workflows/validate.yml` 的平台准备方式，保持现有六任务结构、只读权限、push/PR、同引用取消和五平台矩阵。
- 仓库：第二阶段删除 `plugins/frontend-ai-workflow/runtime/playwright/platform-assets/` 的受跟踪内容和 `.gitattributes` LFS 规则；不改写历史、不自动删除远端 LFS 对象。
- 依赖与权限：只使用 Node.js 标准库和仓库已固定的 Playwright CLI，不新增 npm 依赖、第三方 action、cache、schedule、密钥或写权限。
