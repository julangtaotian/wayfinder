## Context

现有准备脚本每次在 `outputs/frontend-test-runtime/` 生成最小 `package.json` 并运行 `npm install`，npm 缓存与临时运行时同目录，因此统一验证清理后无法离线复用。该链路同时影响 npm 子进程、环境变量、临时目录、机器诊断与 Windows npm 入口。动机与可观察合同见 `proposal.md` 和本变更的 `frontend-test-workflow` delta spec。

## Goals / Non-Goals

**Goals:**

- 让同一 Vitest 依赖树由受版本控制的锁文件确定。
- 将可复用缓存与临时运行时隔离，并保持两个路径都在被忽略的 `outputs/` 内。
- 为准备和统一验证提供一致的显式离线模式、失败关闭和稳定机器诊断。
- 复用既有 Node 内建测试与 Vue 3 + Vite fixture，覆盖 macOS、Linux、Windows 的命令合同。
- 在仓库既有五平台 CI 矩阵上执行在线预热后的离线共享验证，并将同一提交的任务结果作为外部证据。

**Non-Goals:**

- 不在根 `package.json` 添加依赖，不把验证依赖并入插件固定运行时。
- 不修改 Playwright、OpenSpec、插件打包或发布流程。
- 不把本机模拟测试表述为五平台实际 CI 证据。

## Decisions

### 受版本控制的最小安装输入

在 `scripts/fixtures/frontend-test-runtime/` 维护仅含固定 Vitest 版本的 `package.json` 与 `package-lock.json`。准备时将二者复制到临时运行时并执行 `npm ci`。这使 npm 用锁文件和完整性字段验证依赖树；不选择根锁文件，以免把开发验证依赖扩展至业务根目录。

### 分离的受控缓存与清理边界

缓存固定为 `outputs/frontend-test-cache/`，临时运行时固定为 `outputs/frontend-test-runtime/`。运行时清理沿用原有命令且不删除缓存；新增显式缓存清理入口。两者都通过现有路径解析与限定目录检查实现，不能接收任意删除路径。

### 离线传播和稳定失败

准备入口解析唯一的 `--offline`。离线时把 npm 的离线开关加入受控参数，禁止网络回退；npm 执行或入口缺失统一转换为带 `code`、`target`、`status` 的错误。统一验证接受同名参数并将其传给准备函数。默认模式使用缓存优先策略但保留首次下载能力。

### 确定性与真实跨平台回归

沿用现有 Windows JavaScript npm 入口，不直接调用 `.cmd`。测试替身断言 npm 参数、缓存路径、离线传播和错误字段；路径安全测试覆盖 POSIX 与 `path.win32` 表示。每个现有平台 runner 固定 Node.js 后，先运行默认准备以填充该 runner 的受控缓存，再清理运行时，并以清空 `UI_REVIEW_EXPECT_PLATFORM` 与 `UI_REVIEW_RUNTIME_ROOT` 的环境执行 `npm run verify:shared -- --offline`，验证不依赖网络的源码共享链路；无论离线验证成功或失败，均分别清理运行时和缓存，随后再生成平台运行时并以矩阵环境执行平台专属验证。真实 CI 只在同一提交的全部矩阵任务成功后记录为外部通过证据。

## Risks / Trade-offs

- [锁文件过期或与清单漂移] → `npm ci` 失败关闭，并用测试验证复制的清单与锁文件一致。
- [持久缓存占用磁盘] → 缓存处于被忽略的单一路径，提供显式清理命令，不计入受跟踪 outputs。
- [离线模式误回退网络] → 单元测试断言 npm 离线参数；离线失败不进行二次在线重试。
- [npm 在平台间的入口差异] → 保留 JavaScript 入口解析，使用依赖注入测试 Windows 分支。
- [通用替身误继承 Windows 宿主] → 非 Windows 入口契约测试显式注入 Linux 平台；TC-07 单独保留 Windows JavaScript npm 入口覆盖。
- [平台 runner 无法离线复用缓存] → CI 先显式预热，再清理安装目录后离线执行；失败任务保留平台、步骤和退出状态供复盘。
- [源码共享校验与平台成品混用] → 离线共享验证显式清空平台运行时环境，平台成品只在后续专属验证中注入；五平台两次 CI 已分别验证缺少运行时与混用运行时根均会失败。
- [Windows 短路径联接被测试误判为缓存物理路径] → TC-12 先断言运行时仍在隔离 outputs 中且指向 `runtime/playwright`，再只对非 Windows 校验缓存物理路径；Windows 的 `installed-junction` 策略由专属用例覆盖。

## Migration Plan

1. 添加受版本控制的安装清单和锁文件，扩展路径、参数、错误与清理实现。
2. 更新 `package.json`、README、忽略规则与聚焦测试。
3. 先执行聚焦测试，再在线填充缓存并复验显式离线准备与共享验证。
4. 推送同一提交，在五平台 CI 矩阵中执行预热、运行时清理、隔离平台环境的离线共享验证、受控清理、平台运行时生成和专属验证。
5. 若失败，恢复原准备脚本及命令；删除新增缓存目录即可回到无持久缓存行为，不触及持久 outputs 资产。

## 需求依据

- D-01：锁文件是唯一依赖树输入，临时安装使用确定性模式。
- D-02：缓存与运行时分别位于受控 outputs 路径，并具有独立清理边界。
- D-03：离线选项失败关闭，默认模式仅在缓存未命中时允许网络回退。
- D-04：命令参数、环境变量、临时目录、机器诊断与 Windows JavaScript npm 入口保持兼容。
- D-05：本变更不扩大到插件发布、官方校验器或 UI Review 模块化。
- D-06：真实平台 CI 必须以预热后的离线共享验证证明运行时链路，并在每个 runner 回收受控目录。
