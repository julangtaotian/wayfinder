我会使用你指定的 `frontend-workflow-bootstrap` 技能，先检查工作区和初始化规则，再逐项核对源码并写入项目地图。全程只操作当前隔离项目，不联网、不安装依赖、不启动子代理，保留业务代码和项目专属规则。


预览已通过，尚未写入文件：扫描范围为 15 个文本文件，实际排除 `.git`，单文件上限 1 MiB、总量上限 20 MiB；读取范围不含敏感文件或 Git 忽略项。

源码已确认订单页使用本地数据，`settings.mjs` 当前未被使用。接下来只更新三个工作流文件的受管内容，并记录构建配置和测试覆盖的缺口；本次不会运行构建、业务测试或浏览器验证。


15 个纳入文件已全部阅读并完成链路核对。入口为 `index.html → main.mjs → App.vue → OrderList.vue`，筛选由页面状态驱动，没有请求层或权限守卫。

地图会明确保留两个验证缺口：现有测试只覆盖空关键词；源码使用 Vue 单文件组件，但仓库未声明或配置对应转换插件，构建可用性尚未验证。现在开始写入完整地图和项目硬约束。


项目地图已写入五个必填维度和 7 条源码支持的硬约束，覆盖状态已设为 `complete`（15/15）。现有 README 中“工作流尚未初始化”的旧描述已在地图中注明，原文保持不变。

接下来同步 OpenSpec 上下文和范围展示状态，执行一次工作流健康检查，再用哈希核对业务文件及受管块外文字是否完整保留。


已按指定技能完成深度初始化，地图状态为 `complete`，覆盖 **15/15 个文件**；排除 `.git`，无未处理项。

仅更新三个工作流文件：

- [wayfinder/frontend.md]([repository]/outputs/current-version-behavior-recheck/workspaces/deep-init/wayfinder/frontend.md)：完整项目地图、证据、风险和验证边界。
- [AGENTS.md]([repository]/outputs/current-version-behavior-recheck/workspaces/deep-init/AGENTS.md)：7 条源码支持的项目硬约束。
- [openspec/config.yaml]([repository]/outputs/current-version-behavior-recheck/workspaces/deep-init/openspec/config.yaml)：同步完成状态。

工作流检查通过，内置 OpenSpec 运行时健康；提示缺少 Lint、类型检查脚本。哈希复核确认业务代码、依赖声明、运营说明及受管块外文字全部保留。

未联网、安装依赖或启动子代理；**未运行构建、业务测试或浏览器验证**。地图已记录 Vue 单文件组件转换配置待验证、现有测试仅覆盖空关键词等缺口。

逐文件处理账本（Per-file processing ledger）：

| path | status | classification | evidence/reason |
| --- | --- | --- | --- |
| `.gitignore` | read | 忽略规则 | 依赖、输出及本地环境文件 |
| `AGENTS.md` | read | 协作规则 | 7 条硬约束，专属规则保留 |
| `docs/operations.md` | read | 运营说明 | 本地演示，尚无发布流程 |
| `index.html` | read | HTML 入口 | 挂载容器与模块脚本 |
| `openspec/config.yaml` | read | 规划配置 | 规则与 complete 状态同步 |
| `package.json` | read | 依赖与命令 | Vue、Vite 及三个脚本 |
| `README.md` | read | 项目介绍 | 旧初始化描述已注明 |
| `src/App.vue` | read | 根组件 | 直接渲染订单页 |
| `src/data/orders.mjs` | read | 本地数据 | 两条订单及字段契约 |
| `src/main.mjs` | read | 应用启动 | 创建应用并挂载 |
| `src/order-filter.mjs` | read | 筛选逻辑 | 关键词与状态条件交集 |
| `src/pages/OrderList.vue` | read | 订单页面 | 状态、双向绑定和列表 |
| `src/settings.mjs` | read | 未接入配置 | locale/pageSize 无导入方 |
| `tests/order-filter.test.mjs` | read | 手写测试 | 仅覆盖空关键词 |
| `wayfinder/frontend.md` | read | 项目导航 | 五维地图、快照与覆盖状态 |