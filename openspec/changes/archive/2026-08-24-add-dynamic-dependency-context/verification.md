# 验证记录：动态框架与第三方依赖上下文

## 当前结论

- 动态画像只证明根 `package.json` 的合法直接依赖声明、分组、版本说明、稳定顺序和摘要计数，不证明依赖已安装、已使用、兼容、安全、无漏洞或适合升级。
- preset、终端画像和平台画像继续提供有限兼容信号；未知框架、私有包和未预置第三方依赖仍完整进入 `dependencyProfile.packages`，不能因兼容画像未命中而写成不存在。
- Monorepo/workspaces 子应用、传递依赖、registry、漏洞、许可证、远程设计同步和远程 CI/PR 读写仍不在本阶段范围内。
- V-01～V-03 已由受控取证入口生成 schema v2 清单，命令、TC 定位命中、语义绑定、工作区指纹和日志摘要均已持久化；V-04 已人工通过；V-05 已人工复核实现提交 `74182f45164fccc66c9632808f79c0fd2edcea9f` 的首次五平台 GitHub Actions，全部成功且没有失败、取消或重跑任务。

## V-01：动态直接依赖事实合同

- 日期：2026-08-24。
- 命令：`node --test tests/dynamic-dependency-context.test.mjs`。
- 结果：通过；3/3 用例通过，目标定位命中 2 次。
- 证据：`evidence/V-01.json`；stdout 547 字节，路径、大小和 SHA-256 由清单记录。
- 覆盖：四类直接依赖、未知框架、私有包、跨分组版本、空值、非法声明、稳定排序、摘要截断、根项目边界和无绝对路径输出。

## V-02：共享上下文与兼容回归

- 日期：2026-08-24。
- 命令：`node --test tests/dynamic-dependency-context.test.mjs`。
- 结果：通过；3/3 用例通过，目标定位命中 2 次。
- 证据：`evidence/V-02.json`；stdout 547 字节，路径、大小和 SHA-256 由清单记录。
- 覆盖：检查、默认预览、显式写入、依赖漂移、受管升级、重复执行、自定义内容保护、动态摘要和有限兼容信号。

## V-03：本地统一验证

- 日期：2026-08-24。
- `npm test`：在允许真实 Chromium 和本地回环端口的环境中 208/208 通过。
- `npm run validate`：通过，插件结构与 0.17.0 版本合同有效。
- `npm run verify`：8/8 阶段通过；包含 208/208 自动测试、插件与技能结构、OpenSpec 全量 strict、归档任务、OpenSpec 1.9.0 版本与 76 个包完整性、Playwright 880 个文件完整性和本机 `darwin-arm64` Chromium `skipped=false` 冒烟。
- 官方 validators：9/9 个自定义 Skill 和 Plugin manifest 全部通过。官方 Python 校验器最初缺少 PyYAML，依赖只临时安装在 `outputs/official-validator-runtime/`，校验后该子目录已清理，未新增生产依赖。
- 机器证据：`evidence/V-03.json`；目标定位命中 2 次，stdout 43,775 字节，stderr 208 字节，路径、大小和 SHA-256 由清单记录。

## 环境限制诊断

- 首次沙箱内 `npm test` 出现 7 个环境失败；动态依赖及相关场景均已通过。
- 失败平台：本机 macOS ARM64 的受限沙箱，不是 GitHub Actions 平台。
- 稳定复现条件：沙箱禁止 Chromium 注册 macOS Mach 端口并禁止监听 `127.0.0.1`，稳定错误分别为 `bootstrap_check_in ... Permission denied (1100)` 与 `listen EPERM`。
- 定位：真实浏览器启动、结构化交互和统一入口本地服务器用例；不涉及本轮依赖画像实现。
- 复验：同一 `npm test` 在允许浏览器和回环端口的环境中 208/208 通过，随后 `npm run verify` 8/8 通过；因此该次失败归类为环境阻塞，不作为代码通过证据，也不通过跳过测试消除。

## V-04：人工结论边界复核

- 日期：2026-08-24。
- 结果：通过。
- 已核对事实层：脚本只读取根 package 四类直接依赖，完整清单不截断，摘要最多 20 项且明确总数与遗漏数。
- 已核对语义层：AGENTS、Wayfinder、OpenSpec、需求指南、深度分析和相关 Skills 都要求 AI 结合完整画像、配置、入口、导入或调用证据，缺少证据时保留推断或待确认。
- 已核对兼容层：preset、终端和平台画像保留旧字段形状，但文案明确为有限信号；unknown 不表示框架不存在。
- 已核对未覆盖项：没有把根依赖声明提升为安装、运行时、漏洞、许可证、传递依赖、Monorepo 或完整兼容性结论。

## V-05：真实五平台矩阵

- 日期：2026-08-24。
- 精确提交：`74182f45164fccc66c9632808f79c0fd2edcea9f`，提交说明 `feat: add dynamic dependency context`，由 WebStorm 提交并推送至 `origin/codex/dynamic-dependency-context`。
- 运行：[GitHub Actions #32699924656](https://github.com/julangtaotian/wayfinder/actions/runs/32699924656)，`run_attempt=1`，总状态 `completed/success`。
- 结果：Linux x64、Linux ARM64、Windows x64、macOS Intel、macOS ARM64 五个任务全部 `completed/success`；没有失败步骤、取消任务或重跑记录。
- 任务：[Linux x64](https://github.com/julangtaotian/wayfinder/actions/runs/32699924656/job/97349215288)、[Linux ARM64](https://github.com/julangtaotian/wayfinder/actions/runs/32699924656/job/97349215417)、[Windows x64](https://github.com/julangtaotian/wayfinder/actions/runs/32699924656/job/97349215194)、[macOS Intel](https://github.com/julangtaotian/wayfinder/actions/runs/32699924656/job/97349215294)、[macOS ARM64](https://github.com/julangtaotian/wayfinder/actions/runs/32699924656/job/97349215339)。
- 边界：这是对公开 GitHub Actions 状态的人工复核，不表示插件已支持远程 CI/PR 状态读取或回写；矩阵只证明该提交在仓库声明的五个平台发布链通过，不证明任意目标项目、依赖运行时、漏洞或完整兼容性。
