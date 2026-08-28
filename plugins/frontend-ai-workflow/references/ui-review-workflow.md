# UI 验收自动化合同

## 统一入口

所有命令从插件根目录执行，`--target` 指向业务项目。版本 2 配置优先使用统一入口；默认只预览，显式 `--write` 才创建运行产物：

```text
node scripts/ui-review-runner.mjs review --target <项目> --scenario <场景> --run-id <运行ID> [--write]
node scripts/ui-review-runner.mjs verify --target <项目> --scenario <场景> --run-id <运行ID> --baseline <基线状态路径> [--write]
```

稳定退出码为 `0=passed/有效预览`、`1=needs-fix/failed`、`2=inconclusive`、`3=blocked`。有效预览必须同时返回 `write: false` 与 `readyToWrite: true`；不可执行计划返回 `readyToWrite: false`、`blocked` 和退出码 3，且两者都不创建运行产物。该 JSON 合同可供跨 AI 工具和 CI 消费；统一入口不会启动项目自定义命令、安装业务依赖、自动修改源码、提交或推送。细粒度的 `inspect`、`capture-plan`、`start-*`、`complete-*` 和 `repair-gate` 仍由 `ui-review-workflow.mjs` 提供，用于版本 1 只读兼容、显式修复门禁和 Browser 视觉兜底，不得用于绕过版本 2 受信适配器门禁。

## 版本 2 项目配置

默认文件为 `.frontend-ui-review/config.json`。`autoFix` 可取 `off`、`suggest`、`apply`，省略按 `suggest`。新场景必须声明：

- 不含认证信息的 HTTP(S) 页面、视口、DPR、本地设计依据和至少一个唯一目标节点。
- `capture: project-playwright`、项目内适配器与结果路径；版本 2 适配器必须与插件当前模板内容摘要一致，`captureFallback: browser` 可选，只在不确定结果时开放。
- `interactions` 结构化步骤，仅支持 `click`、`hover`、`fill`、`press`、`select-option`、`check`、`uncheck`、`wait-for`、`assert` 和 `capture`。
- `comparison.scope` 为 `structure` 或 `visual`，省略时按向后兼容的 `structure` 处理。结构范围只能证明节点和交互；视觉范围至少要包含 `style.*`、`rect.*` 或图片区域证据，否则结果固定为 `inconclusive`。
- `comparison.mode` 为 `dom`、`image` 或 `hybrid`。DOM 规则支持显隐、文本、值、URL、`style.<CSS属性>` 和 `rect.x/y/width/height/top/right/bottom/center-x/center-y`；计算样式使用非空目标值精确匹配，不使用子串语义。几何规则使用数值 `expected` 与 `tolerance`，或通过 `relativeTo` 比较另一个唯一节点的几何属性；图片规则必须声明成对区域、成对掩码以及颜色、差异像素数和差异比例阈值。

每个交互动作都校验允许字段、唯一选择器和 100～30000 毫秒超时。分段截图名称只允许小写字母、数字和短横线。禁止任意 JavaScript、Shell、动态模块、项目外路径和密码、令牌等敏感填写目标；执行记录只保存值长度，不保存填写值、Cookie 或页面存储。

场景指纹覆盖页面、视口、采集器、兜底、适配器内容摘要、设计内容摘要、目标节点、结构化交互、比较区域、掩码和阈值。任一事实变化都要求新基线。统一入口实际加载插件发布物内的受信模板，不导入业务项目中的模块；摘要不一致的自定义适配器标记为 `project-adapter`，在预览阶段即阻塞且不创建产物。版本 2 自定义适配器不能自动降级或通过细粒度命令绕过。

## 页面环境与既有项目迁移

统一入口只访问已经可用的 HTTP(S) 页面，不启动业务项目或验收代理。页面需要假登录、接口模拟或固定数据时，由用户明确启动的项目既有本地流程或项目自有验收环境在适配器之外准备；只允许本地非敏感假数据，不得把真实 Cookie、Token、密码、页面存储或动态项目模块写入配置、适配器或产物。

发现版本 2 `project-adapter` 时，保留原配置和文件，先输出迁移清单：识别其中的页面环境职责，把这些职责移出适配器，使用当前受信模板，并因页面 URL、适配器摘要或设计内容变化建立独立基线。只有用户明确授权配置迁移时才可修改项目验收配置；普通 UI review 不隐含覆盖权限。历史版本 1 字符串交互和项目命令只保持原只读或调用方消费语义，不自动改写为版本 2。

预览只有同时满足版本 2、主采集器为 `project-playwright`、`capture.configured` 为 `bundled-adapter`、`capture.portable` 为 `true`、平台运行时非空、比较规则完整以及复验上下文一致时才返回 `readyToWrite: true`。页面可访问性仍由正式执行验证，预览就绪不等于验收通过。

## 版本 1 兼容

版本 1 继续保持原指纹来源和采集语义。字符串 `interactions` 只作为自定义适配器说明，不会被默认适配器猜测执行；`projectPlaywright.command` 仍可通过细粒度计划由调用方按原参数数组消费，但统一入口绝不执行它。版本 1 状态只能读取，不能原地写成版本 2 或升级为更强结论。

## 结构化交互与采集

默认适配器使用当前平台内置 Chromium，打开页面后等待字体、有限 Web Animation/Transition 和连续两帧渲染稳定。结构化动作封闭分派、顺序执行；目标必须唯一。`wait-for visible/attached` 先等待异步节点出现或超时，再校验最终唯一性；每个状态变更动作之后及每次截图之前重新等待稳定，超出步骤超时即失败关闭。交互截图先写临时目录，只有所有步骤成功才一次性提交，失败时不留下半成品。完成交互后再采集目标节点坐标、文本、语义和计算样式，适配器不读取认证数据和页面存储。

运行状态、实际截图、交互截图、比较图、标注图和报告都必须经过共享项目路径边界：项目根会先解析为真实目录，根以下任一既有符号链接都会阻断预览或写入；普通文件使用同目录独占暂存和原子替换，临时目录发布前后再次复核。项目根入口本身可以是指向同一项目的路径别名，但不能借此允许项目内部链接。

插件只从自己的固定运行时加载 Playwright，业务项目不安装 Playwright，`package.json` 和锁文件不得改变。默认适配器显式使用平台元数据登记的浏览器可执行文件，不回退到用户缓存，也不在运行阶段下载。

## 确定性判断

DOM、几何与图片比较都产生可追溯 `observations`。几何比较读取 Playwright `boundingBox()`，支持固定目标与同页面参考节点的相对中心线等关系；图片比较只处理显式区域，按成对掩码忽略动态内容，记录比较像素、差异像素和比例并生成 `report/diff.png`。结论规则：

- `passed`：全部已声明判断均有确定证据且满足阈值。
- `needs-fix`：存在高置信度、超过阈值的确定差异。
- `inconclusive`：待分析、中置信度、证据缺失、PNG 损坏、区域越界、尺寸无法对齐或区域被遮罩完全覆盖而没有可比较像素；永远不能自动升级为通过。

报告必须展示 `scope`。`structure` 通过只能写成结构与交互通过，不得声称视觉还原通过；`visual` 通过必须实际存在样式、几何或图片证据。文本存在、按钮可点击和弹窗 `visible` 都不是单独成立的视觉证据。

首次验收与复验的 Markdown 报告必须从完成状态投影同一份上下文，并展示 `schemaVersion`、`runId`、`scenarioFingerprint`、实际 `capture`、可空 `baselineRunId`、`statePath`、证据路径及观察/问题摘要。缺少必需身份字段时拒绝生成报告；Markdown 不得自行猜测或覆盖状态 JSON。

确定性图片或 DOM 问题可以进入报告，但默认 `repairable: false`。只有同时具备源码文件、稳定锚点、允许和禁止范围、验证命令与断言的问题才进入 `repairCandidates` 和 `repair-gate`。无候选时自动修复必须阻塞。

Browser 或同类视觉能力只在结论为 `inconclusive`、配置已经声明 Browser 兜底且当前 AI 工具具备能力时使用。统一入口只返回 `fallbackRequired: true`，不会自行控制某个 AI 工具。兜底必须使用新运行 ID，不能在原运行或复验中静默切换采集器。

## 运行状态与复验

版本 2 `state.json` 分离保存 `observations`、`findings` 与 `repairCandidates`，并记录实际采集器、场景指纹、父运行、兜底声明和不确定原因。状态包括 `collecting`、`needs-fix`、`passed`、`inconclusive`、`blocked`、`ready-to-verify` 和 `failed`。

复验必须复用基线页面、视口、设计内容、适配器摘要、目标节点、结构化交互、比较规则和实际采集器；统一入口在预览阶段即执行这项只读校验。问题身份只由稳定目标、问题类型和目标值构成，不包含本次实际尺寸、像素数或比例，因此同一问题的差异值变化仍归为 `remaining`。证据不确定时，基线问题保持 `remaining`，不能记为 `resolved`。任一场景事实变化都要求独立验收；只有原问题全部消失且没有新增问题时通过。

## 证据来源与修复边界

交付证据必须记录业务项目根、实际执行目标、页面环境类型、受信适配器摘要、场景指纹和运行 ID。证据可从隔离环境复制到项目允许的持久目录，但必须公开隔离关系，不能把临时目标描述成直接项目运行。

UI Review 作为严格 V-* 机器证据时，schema v2 清单必须绑定状态文件本身和 `actualScreenshot`、`annotatedScreenshot`、`report` 三项关键产物的路径、大小与 SHA-256，并与状态中的 runId、scenarioId、scenarioFingerprint、实际 capture 和 `status: passed` 双向一致。仅存在 JSON、报告文字或 `inconclusive/needs-fix` 状态都不能形成可信通过。

通过外部代理、样式注入或固定响应构造的失败基线统一标记为“受控故障”，只证明发现与复验机制；同时保留真实源码当前态独立验收。适配器、配置、页面环境和受控注入问题不得进入业务源码 `repairCandidates`，不得通过修改业务代码迁就验收环境。

运行目录固定为 `<artifactsRoot>/<runId>/<scenarioId>`，只允许状态、实际截图、交互截图、结构化输入和报告目录。发现未知文件、既有状态或路径冲突时拒绝覆盖。

## 跨平台发布合同

Playwright 1.62.1、PNGJS 7.0.0 和 pixelmatch 7.1.0 固定在插件共享运行时。浏览器资产按 `platform-arch` 独立发布，支持 `darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64` 与 `win32-x64`；每个平台分别包含 Chromium headless shell、FFmpeg、许可、元数据和 SHA-256 清单。

`build-playwright-platform.mjs` 只供插件维护和发布阶段使用，默认预览，显式 `--write` 才下载指定平台资产并更新摘要。Validate CI 在 `lfs: false` 检出后额外使用 `--replace-lfs-pointers`，只允许安全替换纯 LFS 指针/零字节占位目录，失败恢复并清理。普通检查、冒烟、已安装插件和业务验收没有下载代码路径。GitHub Actions 必须在五个原生平台实际启动内置 Chromium 并得到 `skipped: false`；受支持平台缺包或跳过都失败，视觉兜底不能作为平台支持证据。

## 权限边界

- 自动修复只受 `repairCandidates`、配置与当前任务显式授权共同控制，不隐含修改主分支、第三方依赖或未声明源码。
- 统一入口不启动开发服务器；页面必须由用户或项目既有流程准备好。页面不可访问以结构化阻塞返回。
- 不读取或发送认证数据，不调用外部服务，不创建常驻进程、数据库或独立 UI 平台。
- 自动修复不隐含提交、推送、PR 或远程状态回写；不提交、不推送、不创建 PR，这些动作需要用户另行授权。
