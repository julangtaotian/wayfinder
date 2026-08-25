# 验证记录：六项目真实验证矩阵

## 当前状态

- 执行日期：2026-08-25
- 本机环境：macOS ARM64，Node.js v22.12.0
- 运行 ID：`2026-08-25-p1-p6-run-01`
- 总体状态：执行中；基线通过，只读识别发现 1 个插件缺陷，其余独立影响链继续取证。

## 已执行证据

| 验证 | 结果 | 结论 | 证据 |
| --- | --- | --- | --- |
| V-01 基线与资源预算 | 通过 | P1～P6 均匹配固定分支、提交且工作区干净；六项目依赖树均可读取，无越界链接，磁盘余量满足 512 MiB 保留要求 | `outputs/real-project-validation/2026-08-25-p1-p6-run-01/baseline/results.json` |
| V-02 只读识别 | 失败 | P1/P2/P4/P5/P6 事实匹配；P3 将 Jest 启动器 `scripts/test.js` 误计为测试文件，V-02 未生成通过清单 | `outputs/real-project-validation/2026-08-25-p1-p6-run-01/inspection/results.json`、`defects/DEF-01-p3-test-launcher-false-positive.md` |
| V-03 隔离生命周期 | 通过 | 六项目均完成预览、显式写入、重复执行、升级、检查、冲突保护和清理；全部原工作区复核通过 | `evidence/V-03.json`、`outputs/real-project-validation/2026-08-25-p1-p6-run-01/lifecycle/results.json` |
| V-04 原生测试链 | 通过 | P1 通过 4 个 Vitest 用例；P2 通过 3 个 Jest 用例但认证仍有限；P3 零测试阻断；P4 现有依赖缺平台二进制而有限失败；P5/P6 缺设施阻断 | `evidence/V-04.json`、`outputs/real-project-validation/2026-08-25-p1-p6-run-01/native-test/results.json` |
| V-05 边界人工复核 | 通过 | 混合工具链、嵌套 package、原生微信开发工具、外部能力、敏感信息和未覆盖组合均按证据保持边界 | `evidence/V-05.json`、`outputs/real-project-validation/2026-08-25-p1-p6-run-01/boundaries/results.json` |
| V-06 插件统一验证 | 通过 | `npm test` 214 项零失败、`npm run validate` 通过、`npm run verify` 8/8 通过；官方 plugin validator 与 9 个 skill validator 全部通过 | `evidence/V-06.json`、`outputs/real-project-validation/2026-08-25-p1-p6-run-01/plugin-validation/results.json` |
| V-07 最终边界复核 | 通过 | 矩阵、缺陷、支持等级、未覆盖项和四层证据边界均已复核；结论保持活动状态，不关闭 DEF-01 | `outputs/real-project-validation/2026-08-25-p1-p6-run-01/report/summary.json` |
| V-08 五平台 CI | 通过 | 修复提交 `94bbd015041e41778afaec8562686ffcde41bb28` 的 Validate #44 在 Linux x64/ARM64、Windows x64、macOS Intel/ARM64 五个平台全部成功 | [GitHub Actions Validate #44](https://github.com/julangtaotian/wayfinder/actions/runs/32802503292) |

## 独立影响链决策

P3 的缺陷只影响测试文件事实与支持措辞，不影响六项目 Git 基线、隔离初始化/升级/检查，也不妨碍把 P3 原生命令的实际零测试结果记录为阻断。因此按 D-05 继续 V-03/V-04；后续结果不得覆盖 DEF-01，也不得把 TC-04 或 V-02 标为通过。

## 原工作区保护

截至 V-02 完成，P1～P6 原工作区仍位于固定提交且保持干净；只读识别未向业务项目写入文件。

截至 V-04 完成，六个原工作区仍保持固定提交和干净状态；所有写入、缓存和原生命令均发生在本轮有界隔离目录，逐项目副本已清理。

## 当前支持结论

- 已认证：P1 代表的 Vue 3 + Vite + Vitest 最窄测试闭环，以及六项目上的初始化、重复执行、升级、检查与内容保护生命周期。
- 有限支持：P2 Jest 命令真实通过但不提升为 Jest 全面认证；P4 是 Vite/Webpack 混合项目，原生命令因现有依赖缺少平台二进制未发现测试，不能记为测试通过。
- 正确阻断：P3 原生命令明确发现 0 个测试；P5/P6 缺少可认证的通用测试设施。
- 插件缺陷：P3 的测试启动器被误识别为测试文件，见 DEF-01；本变更保持活动，不宣称只读识别闭合。
- 未覆盖：后端与真实账号、远程 Figma/蓝湖、pnpm、React + Vite、真实 workspace/Monorepo/多应用编排、微信开发者工具发布链，以及 Linux/Windows/macOS Intel 上的真实业务项目执行。

## 本地统一验证失败与修正记录

首次直接运行 `npm test` 得到 8 个失败：1 个因为没有先准备仓库规定的 Vitest 临时运行时，其余为受限执行环境禁止 `127.0.0.1` 监听和 Chromium 的 macOS 进程注册。稳定复现条件分别是“跳过 `npm run prepare:test-runtime`”与“在不允许本地端口/浏览器进程的沙箱内运行”。

根因不是断言或产品逻辑回归，而是验证前置和执行权限不符合仓库合同；本地漏检原因是首次没有遵循 `AGENTS.md` 的运行时准备顺序。修正后先把锁定的 Vitest 3.2.4 安装到 `outputs/frontend-test-runtime/`，再在允许本地端口与内置 Chromium 的环境执行同一命令，214 项测试为 211 通过、3 个真实项目用例按设计跳过、0 失败。随后 `npm run verify` 8/8 通过并自动清理临时运行时。回归定位为 `tests/frontend-test-workflow.test.mjs` 的 Vitest fixture、UI Review 本地监听/Chromium 用例以及统一验证入口本身。

官方校验器首次也因系统 Python 缺少 PyYAML 未能启动；随后仅在忽略目录 `outputs/validator-runtime/` 临时安装 PyYAML 6.0.2，官方 plugin validator 与 9 个 skill validator 全部通过，临时依赖已清理。该启动失败没有被记为插件校验失败，也没有被省略。

## Windows CI 失败与回归定位

提交 `a3307e58242f7287c639eb6e1db2450e0fcc4c83` 触发的 Validate #43 在 Windows x64 的 `npm run verify` 阶段失败；稳定失败为 `[TC-02] 隔离生命周期与有界清理` 对独立 Git 根目录执行字符串严格比较时，Git 返回 `D:/...`，Node.js `path.join` 生成 `D:\...`。同一轮 macOS Intel/ARM64、Linux x64/ARM64 四个平台均通过，失败与真实业务项目、插件写入逻辑和原生测试执行无关。

根因是测试只验证了单个反斜杠样例的规范化函数，却没有在独立 Git 根目录断言中同时规范化实际值和期望值；本地 macOS 的两侧都使用 `/`，因此未暴露 Windows 分隔符差异。回归定位为 `tests/real-project-validation.test.mjs` 的 `[TC-02]`：比较前对 Git 输出与工作区路径都调用 `normalizeMachinePath`，继续保留真实 `git rev-parse --show-toplevel` 证据，不放宽为包含判断或平台特判。修正后必须重新运行本地统一验证与五平台 CI，新的精确提交全部成功前，V-08 和任务 5.3 继续保持未通过。

修正后聚焦 `[TC-02]` 通过，本地 `npm run verify` 再次取得 214 项测试中 211 通过、3 项按设计跳过、0 失败及统一验证 8/8 通过。提交 `94bbd015041e41778afaec8562686ffcde41bb28` 触发的 Validate #44 随后在 Windows x64、Linux x64/ARM64、macOS Intel/ARM64 五个平台全部成功，Windows 已真实覆盖原失败断言；V-08 和任务 5.3 据此通过。该结论只关闭验证代码的跨平台回归，不关闭 P3 的 DEF-01，也不把六项目本机业务执行外推为全平台业务项目认证。
