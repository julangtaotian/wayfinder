## Context

参见 `proposal.md` 的动机和 `specs/repository-verification-gate/spec.md` 的行为合同。当前 `scripts/verify.mjs` 动态发现全部 `tests/*.test.mjs` 并串行执行九个阶段；`.github/workflows/validate.yml` 在五个平台上调用同一个完整入口，因此共享校验和 `outputs/frontend-test-runtime/` 的准备均重复五次。

实现中的共享入口证明 `tests/ui-review-automation.test.mjs` 会真实启动内置 Chromium 和本地服务，必须与 `tests/ui-review-platform-runtime.test.mjs` 共同归入五平台集合；其余 19 个测试属于跨平台无差异的仓库或工作流验证。两个平台文件覆盖 UI 采集、目标资产、完整性、真实浏览器、平台打包和五平台工作流合同。实现必须继续只使用 Node.js 标准库，临时目录位于 `outputs/`，Windows 不直接启动 `.cmd`，外平台路径测试显式选择对应路径语义。

设计依据 REQ-2026-034 的 D-01～D-08；技术取舍不得扩大其已确认或项目默认边界。

## Goals / Non-Goals

**Goals:**

- 用同一编排的确定性作用域消除共享验证在五平台的重复执行，同时保留完整本地入口。
- 让共享失败在昂贵平台 runner 启动前失败关闭，并保持每个平台故障可定位。
- 让测试分区具备“非空、无遗漏、无意外重叠”的回归合同。
- 通过稳定机器字段、工作流静态断言和真实同 SHA 矩阵分别证明本地、配置和外部行为。

**Non-Goals:**

- 不重写单项校验器、测试运行器、Playwright 或平台打包实现。
- 不合并 push 与 pull request 的不同 Git 引用，不改变事件覆盖范围。
- 不在本阶段评估或引入缓存、路径忽略、runner 规格调整、Git LFS 存储迁移和具体费用换算。
- 不创建 schedule、定时清理、定时复验或自动费用监控。

## Decisions

### 1. 同一 `verify.mjs` 承载三个显式作用域

`scripts/verify.mjs` 接受严格的 `--scope all|shared|platform`，默认值为 `all`。`buildVerificationSteps` 和 `runVerification` 均接收并返回作用域，结果保持 `ok`、`completed`、`failedStep`、`status`，增加 `scope`；参数错误增加稳定 `code`。CLI 未知参数、缺失值和未知作用域直接返回非零，不静默回退。

- `all`：现有九阶段和顺序完全不变。
- `shared`：`footprint`、共享测试、`structure`、`openspec`、`openspec-archived`、`runtime-version`、`runtime-integrity`。
- `platform`：平台测试、`playwright-integrity`、`playwright-smoke`。

选择同一脚本而不是新增两个编排文件，是为了让环境、失败短路、日志、退出码和清理生命周期只有一个事实源。备选方案是 CI 直接拼接多条 Node 命令；该方案会复制阶段知识并重新产生本地/CI 漂移，因此不采用。

### 2. 测试集合从完整集合中确定性分区

`scripts/test-groups.mjs` 增加共享分组语义：平台集合显式包含 UI 自动化和平台运行时两个手写测试；共享集合由完整受跟踪测试集合排除平台集合得到，而不是复制一份容易漏加新测试的长列表。构建分组时校验完整集合、共享集合和平台集合均非空，平台必须是完整集合子集，共享与平台不得重叠，并断言二者并集等于完整集合。

平台集合未来若扩展，必须显式修改平台分组并使上述合同测试同步变化。备选方案是固定列出当前 20 个共享测试；新增测试时可能没有进入 CI 共享作用域，虽然本地 `npm test` 可见，仍存在漏验窗口，因此不采用。

### 3. 临时 Vitest 运行时只服务需要它的作用域

`all` 与 `shared` 继续在最外层准备并回收 `outputs/frontend-test-runtime/`；`platform` 不准备 Vitest，因为平台专属文件只使用 Node Test Runner 和内置 Playwright 运行时。三个作用域仍创建自己的 `outputs/verify-runtime/tmp`，统一注入 `TMPDIR`、`TMP`、`TEMP`、`GIT_CEILING_DIRECTORIES`、OpenSpec 无更新检查和无遥测变量，并在成功、阶段失败或异常时清理本次目录。

保留嵌套运行时所有权判断，避免共享验证中的测试再次调用验证入口时删除外层资源。备选方案是在 Actions YAML 中单独准备/清理依赖；它会把生命周期分散到 CI 并削弱本地复现，因此不采用。

### 4. CI 使用一个共享前置任务和一个五平台任务

`.github/workflows/validate.yml` 增加 `shared` job：在 `ubuntu-24.04`、Node.js 20.19.0 上以 `lfs: false` checkout 后执行 `npm run verify:shared`，并保留 `if: always()` 的 Vitest 兜底清理。`platform` job 通过 `needs: shared` 等待共享成功，再按现有五个平台逐项拉取目标 Git LFS 资产、执行 `npm run verify:platform`、构建平台插件并使用 `actions/upload-artifact@v7` 上传原报告。

矩阵继续 `fail-fast: false`，使已经开始的平台任务各自给出诊断；共享任务失败则矩阵整体不启动。`package.json` 新增两个可审计脚本，根 `verify` 值保持不变。备选方案是在每个平台内用条件只让 Linux x64 执行共享阶段；其他平台仍会先占用 runner，而且依赖和失败关系更难审计，因此不采用。

### 5. concurrency 只以工作流和原始 Git 引用分组

工作流顶层使用 `${{ github.workflow }}-${{ github.ref }}` 作为并发组并启用 `cancel-in-progress: true`。这样同一分支 push 或同一 PR 引用的新提交会替换旧运行，而 push 引用和 PR merge 引用不会被人为归一化成一个组。

备选方案是用 `github.head_ref || github.ref_name` 跨事件合并分支；这可能让 push 运行取消 PR 必需检查或反向取消，增加状态语义歧义，因此不采用。取消只减少过时运行，最终精确提交仍必须取得共享和五平台全部成功证据。

### 6. 首阶段采用可计数合同，不引入缓存或金额承诺

自动测试直接断言每个 CI run 只有一个共享 job、一个五项平台矩阵，共享脚本只出现一次且平台脚本位于矩阵。真实 CI 验证记录补充六个任务状态与可见耗时，但不根据未确认的仓库可见性、套餐额度、舍入和 runner 定价推算金额。

Git LFS 平台资产与 Vitest 依赖缓存需要独立处理缓存键、架构隔离、失效、存储配额和可信边界；本阶段从五次安装降为一次已获得主要重复量收益，缓存留给后续单独需求评估。

## Risks / Trade-offs

- [测试分区错误导致漏验] → 从完整集合动态扣除平台集合，并增加非空、子集、互斥、并集合同；根 `npm run verify` 仍运行完整集合。
- [共享任务增加第六个 job 的启动与分钟舍入] → 共享任务固定在 Linux x64，主要收益来自消除四次共享链和四次 Vitest 安装；只报告实际耗时，不承诺金额。
- [共享 job 的 LFS 指针被测试意外读取] → 真实启动浏览器或本地服务的 UI 自动化测试已归入平台集合；共享作用域聚焦测试确保剩余文件不依赖平台二进制。
- [Windows 参数、路径或环境变量回退] → CLI 使用当前 Node 入口且 `shell: false`；路径双侧规范化，稳定字段优先断言；真实 Windows x64 job 是完成证据。
- [平台失败清理不完整] → `runVerification` 的 `finally` 继续清理 `verify-runtime`，共享 job 另有 Vitest 兜底清理；只删除本次明确目录。
- [concurrency 取消仍在取证的旧提交] → 旧提交状态记录为取消，验收只引用最终精确 SHA；不跨不同 Git 引用合并并发组。
- [静态 YAML 正则过度依赖格式] → 优先断言稳定 job id、`needs`、脚本名、平台键、action 版本和关键字段，不匹配完整人类名称或绝对路径。

## Migration Plan

1. 先补作用域、测试分区和工作流合同的失败回归，确认现状按预期失败。
2. 实现分组与统一验证作用域，运行聚焦测试并确认本地 `all` 行为不变。
3. 增加根共享/平台脚本，改造 Validate jobs 与 concurrency，运行 CI 配置聚焦测试。
4. 执行本地全量、统一验证、validators 和 Vue 3 + Vite fixture，生成 V-01～V-04 机器证据。
5. 使用 WebStorm 提交并推送实现提交；只在同一 SHA 的 shared 与五平台任务全部成功后更新 V-05。
6. 若 CI 结构导致漏验或矩阵异常，回滚工作流到单一五平台 `npm run verify`，保留新增测试以定位问题；不通过删除平台、跳过触发或放宽断言恢复通过。

## Open Questions

无。缓存、平台运行时交付和插件仓库识别属于后续人工显式发起的独立需求。
