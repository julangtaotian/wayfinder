# 验证记录：安全写入与机器证据可信度闭环

## 当前结论

- V-01、V-02、V-03 已由插件受控取证入口生成 schema v2 清单，聚焦与统一命令真实执行成功，语义绑定、工作区指纹和日志描述符已写入同 ID 证据。
- V-04 已人工复核：预览、阻断、历史兼容、外部记录和支持范围文案均保留原状态，没有把 `warning`、`external-recorded`、`inconclusive` 或 `blocked` 描述为可信通过。
- V-05 尚未开始：必须等最终提交推送后，人工核对该精确提交的五平台 GitHub Actions 矩阵。

## V-01：安全写入边界

- 日期：2026-08-24
- 命令：`node --test --test-name-pattern="受管写入符号链接边界与兼容性" tests/workflow-trust-boundary.test.mjs`
- 结果：通过；目标用例及 4 个子用例通过。
- 证据：`evidence/V-01.json`；持久日志路径、大小和 SHA-256 由清单记录。
- 覆盖：正常根与根别名、dry-run/写入/重复执行、内部链接阻断、升级/迁移/取证/UI/完成入口、原子失败保护和项目外哨兵不变。

## V-02：机器证据完整性与信任

- 日期：2026-08-24
- 命令：`node --test --test-name-pattern="机器证据语义完整性与信任聚合" tests/workflow-trust-boundary.test.mjs`
- 结果：通过。
- 证据：`evidence/V-02.json`；持久日志路径、大小和 SHA-256 由清单记录。
- 覆盖：D/A/V/TC 语义变化、完成字段与无关变化、日志篡改、UI 状态身份/结果/关键产物、external-recorded 聚合及 schema v1 严格/非严格兼容。

## V-03：本地统一验证

- 日期：2026-08-24
- 受控命令：`npm run verify`。
- 结果：通过；统一入口的自动测试、插件与技能结构、OpenSpec 全量 strict、归档任务、OpenSpec 版本/完整性、Playwright 完整性和真实 Chromium smoke 共 8 个阶段全部完成。
- 独立全量：`npm test` 205/205 通过；包含 Vue 3 + Vite + Vitest 真实发现与重复执行、初始化/升级/检查矩阵及真实浏览器回归。
- 独立结构：`npm run validate` 通过。
- 官方 validators：9/9 个 Skill 及 Plugin manifest 全部通过。
- 证据：`evidence/V-03.json`；受控 stdout 43,307 字节，路径、大小和 SHA-256 由清单记录。

## 兼容与结构校验

- `node --test tests/workflow-trust-boundary.test.mjs tests/verification-evidence-integrity.test.mjs`：13/13 通过。
- `npm test`：205/205 通过。
- `npm run validate`：通过，插件结构有效。
- `npm run verify`：8/8 个统一阶段通过。
- 官方 Skill validator：9/9 个自定义 Skill 通过。
- 官方 Plugin validator：通过。
- `git diff --check`：通过。
- implement 阶段需求、测试方案与 OpenSpec strict 校验：通过；V-01～V-03 当前 schema v2 语义清单可解析。

## 修复过程中发现的真实回归

- 修复前的完整本机测试曾在真实 Chromium 交互链出现 3 个失败。
- 根因：交互截图最终目录被提前创建，而新的安全目录发布合同要求最终目标不存在，导致正常交互流程被误判为冲突。
- 稳定复现条件：使用默认适配器或统一入口执行包含交互截图的 UI Review。
- 回归定位：既有“默认适配器”和“统一入口”真实浏览器测试。
- 修复：只创建隔离临时目录，全部交互成功后再原子发布最终目录；修复后上述聚焦真实浏览器测试 4/4 通过。
- 最终全量复验：205/205 通过。
- 最终全量复验首次还发现 1 个独立回归：安全截图暂存名把 `.png` 放在随机后缀之前，Playwright 无法推断 MIME 类型并返回 `unsupported mime type "null"`。
- 稳定复现条件：零安装适配器直接把受管暂存路径传给 `page.screenshot`。
- 回归定位：既有“内置 Playwright 适配器生成零安装采集计划并注入真实浏览器 API”真实浏览器测试。
- 修复：暂存文件保持同目录独占创建，同时把原扩展名保留为最终扩展；该项聚焦 1/1、最终全量 205/205、统一验证 8/8 通过。

## V-04：人工结论边界复核

- 日期：2026-08-21
- 结果：通过。
- 已核对的状态：`passed` 仅用于可信本地或 UI 状态闭环；`external-recorded` 不能满足严格自动门禁；schema v1 在严格活动变更中阻断，在历史非严格读取中提示迁移；`inconclusive`、`needs-fix`、`failed` 与 `blocked` 不提升为通过。
- 已核对的范围：本次只加固项目受管写入与证据合同，不宣称插件无漏洞，也不宣称已支持动态框架/依赖总结、Monorepo/多应用编排、非 Vitest 完整认证、远程 Figma/蓝湖同步或远程 CI/PR 读写。

## 待完成

- 使用 WebStorm 提交并推送最终改动。
- V-05：人工核对精确提交的 Linux x64/ARM64、Windows x64、macOS Intel/ARM64 五平台 CI；任一平台失败则保留未完成并记录根因与稳定复现条件。
