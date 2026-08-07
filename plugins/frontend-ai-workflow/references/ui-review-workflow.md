# UI 验收自动化合同

## 固定入口

所有命令都从插件根目录执行，`--target` 指向业务项目根目录。命令默认只预览；只有显式 `--write` 才写入 `state.json`。

```text
node scripts/ui-review-workflow.mjs inspect --target <项目> [--config .frontend-ui-review/config.json]
node scripts/ui-review-workflow.mjs capture-plan --target <项目> --scenario <场景> --run-id <运行ID>
node scripts/ui-review-workflow.mjs start-review --target <项目> --scenario <场景> --run-id <运行ID> [--capture browser|project-playwright] [--write]
node scripts/ui-review-workflow.mjs complete-review --target <项目> --state <状态路径> --result <验收输入JSON> [--write]
node scripts/ui-review-workflow.mjs repair-gate --target <项目> --state <状态路径> [--explicit-approval]
node scripts/ui-review-workflow.mjs complete-repair --target <项目> --state <状态路径> --finding-ids UI-001,UI-002 [--write]
node scripts/ui-review-workflow.mjs start-verify --target <项目> --baseline <基线状态路径> --run-id <运行ID> [--write]
node scripts/ui-review-workflow.mjs complete-verify --target <项目> --state <复验状态路径> --baseline <基线状态路径> --result <复验输入JSON> [--write]
node scripts/ui-review-report.mjs --screenshot <实际PNG> --data <验收输入JSON> --output <运行目录/report>
node scripts/playwright-runtime.mjs --inspect
```

## 项目配置

默认文件为 `.frontend-ui-review/config.json`，`schemaVersion` 固定为 `1`。`autoFix` 可取 `off`、`suggest`、`apply`，省略时仍按 `suggest`。每个场景必须声明：

- 唯一的小写 `id` 和不含认证信息的 HTTP(S) `url`。
- `capture`：主采集器，取 `browser` 或 `project-playwright`。新配置优先使用 `project-playwright`。
- 可选 `captureFallback`：只能是与主采集器不同且真实可用的采集器；省略表示禁止切换，老配置语义不变。
- 新配置使用 `projectPlaywright.adapter`：项目内已存在的 `.mjs` 或 `.js` 模块路径。插件运行器向其注入固定 Playwright API、只读场景和受控产物路径，业务项目不安装 Playwright。
- 兼容配置可继续使用 `projectPlaywright.command`：项目已声明命令的参数数组，可以使用 `{scenarioId}`、`{runId}`、`{runDirectory}`、`{actualScreenshot}`、`{reviewInput}`、`{designPath}` 和 `{url}`；不得拼成 Shell 字符串。`adapter` 与 `command` 不能同时声明。
- `projectPlaywright.resultPath`：适配器或命令产生的项目相对结构化结果路径，可使用相同占位符。
- `viewport.width`、`viewport.height` 和 `deviceScaleFactor`。
- 仓库内 `design.path` 及 `image` 或 `spec` 类型。
- 至少一个带真实 CSS 选择器的 `targets`，以及可选 `interactions`。

场景指纹覆盖页面、视口、主采集器、兜底、项目命令、结果路径、设计文件内容摘要、目标节点和交互。任何一项变化都意味着新场景事实；没有新增字段的老配置继续使用原指纹来源。

## 采集计划

`capture-plan` 只读取和规范化配置，不执行项目命令。输出包含：

- `primary`、`fallback` 和允许使用的 `order`。
- `projectPlaywright.source`、`portable`、参数数组、工作目录、展开后的结果路径和适配器路径。
- 内置运行时的固定版本、目标平台、当前平台、浏览器 revision、完整性结论与不可用原因。
- Browser 是否已声明及其主路径或兜底角色。
- 本次运行的实际截图、结构化输入和报告产物路径。

新配置优先执行插件内置 Playwright 适配器主路径。先用同一运行 ID 写入 `start-review` 或 `start-verify` 状态，再直接执行计划返回的参数数组；运行器只从插件运行时加载 Playwright，并校验状态、截图像素、目标节点和结构化结果。兼容项目命令继续原样执行。主路径不可用或证据不完整时，只有配置已声明 Browser 且当前工具提供能力，才使用新的运行 ID 显式执行兜底；不得在同一运行里静默切换。

模板适配器负责稳定打开页面、采集视口截图、目标节点坐标和计算样式，初始结果带 `analysisPending: true`。调用方必须真实比较设计依据与实际截图，补齐完整 `findings` 后移除待分析状态；`complete-review` 会拒绝把待分析结果写成通过。项目也可以扩展适配器，在一次执行中产生已经完成视觉比较的完整结果。

## 内置 Playwright 适配器

创建新配置时，同时复制 `assets/templates/ui-review/config.json` 和 `assets/templates/ui-review/playwright-adapter.mjs` 到业务项目的 `.frontend-ui-review/`。适配器默认导出异步函数并接收：

- `playwright`：插件固定版本 API，不从业务项目解析。
- `project`：项目根目录与名称。
- `runId` 和只读 `scenario`：规范化页面、视口、设计依据、目标节点与交互。
- `artifacts.actualScreenshot`、`artifacts.result`、`artifacts.design`：已经通过安全路径校验的绝对路径。

模板只自动处理没有交互的场景。存在登录、点击、输入或状态切换时，必须把自然语言说明改写成明确的 Playwright locator 操作，不能让运行器猜测动作。

## 运行状态

每次只处理一个场景，产物目录固定为 `<artifactsRoot>/<runId>/<scenarioId>`。`state.json` 记录：

- `stage`：`review`、`repair` 或 `verify`。
- `status`：`collecting`、`needs-fix`、`ready-to-verify`、`passed` 或 `failed`。
- `scenarioFingerprint`、`capture`、`parentRunId` 和问题指纹。
- 实际截图、结构化输入、标注截图和 Markdown 报告的项目相对路径。

不要手改状态来跳过迁移。运行目录存在未知文件、不同运行状态或危险路径时必须停止。

## 结构化问题合同

报告生成器需要真实 `checkedNodes`、截图坐标和 `findings`。只有 `confidence: high` 的交付问题会进入状态。每个可修复问题必须包含：

- `selector`、`type`、`targetValue`。
- `sourceTarget.file`、`sourceTarget.anchor` 和样式来源。
- `changeScope` 与 `forbiddenChanges`。
- `verification.workingDirectory`、至少一个命令、页面和至少一条断言。

稳定问题指纹由选择器、类型、目标值、源码文件和锚点计算；编号变化不会把同一问题误判为新增。

## 采集与权限边界

- 适配器路径只允许指向项目内真实模块；插件只注入自己的 Playwright，业务项目的 `package.json` 和锁文件不得因此改变。
- 兼容项目命令只能复用计划返回的参数数组；插件工作流脚本本身不执行任意项目命令。
- Browser 或同类视觉能力只作为老配置的固定采集器或新配置已声明的兜底，不是跨 AI 工具主路径。
- Playwright 1.62.1 与 Chromium headless shell 在插件构建阶段固定下载并随发布物提供；用户运行阶段不执行 npm 安装、浏览器下载或用户缓存回退。FFmpeg 与字体仍由当前环境提供，缺少就报告阻塞。
- 当前运行时绑定 `darwin-arm64`。平台、CPU、版本或完整性不匹配时计划标记不可移植；只能使用场景已经声明的视觉兜底，不能现场下载修复。
- 不读取页面或仓库中的认证数据，不把结果发送到外部服务。
- `autoFix` 只控制是否进入本地受控修改，绝不隐含提交、推送、PR、主分支修改或外部状态回写权限。
- 复验必须使用与基线相同的实际采集器和场景指纹，不能在 Playwright 与视觉兜底之间切换。
