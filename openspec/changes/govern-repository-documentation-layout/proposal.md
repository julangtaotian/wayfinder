## Why

OpenSpec 与 outputs 已切换为 schema v2 轻量生命周期，但仓库根文档、忽略规则和项目级配置仍保留部分旧结构语义，导致维护者难以判断目录职责，并让不可复现的 UI Review 配置继续出现在正式源码中。现在需要把“哪些内容长期保留、哪些只在本地生成、哪些目录已经退役”收敛为一份可验证的仓库合同。

## What Changes

- 在根 `README.md` 增加完整的仓库职责地图，覆盖关键根文件、所有受跟踪顶层目录、本地运行目录及其生命周期、必要性和维护入口。
- 调整根 `AGENTS.md`，让它只承载维护规则、读取路由和写入边界，并与 README 的目录地图形成明确分工。
- 把 `.gitignore` 中按主题枚举的旧 outputs 规则收敛为单一 `/outputs/` 退役边界，继续保护正式规格、生命周期事件和持久设计输入。
- 删除引用已不存在 outputs 页面、源码和截图的根 `.frontend-ui-review/config.json` 与适配器；插件模板和测试 fixture 保持不变。
- 修正正式 AI 上下文规格中仍要求 schema v2 长期保存需求归档正文的旧语义，明确 v2 只读取活动需求、正式规格和紧凑事件，旧正文仅在 `legacy-readonly` 迁移审计中按需读取。
- 扩展仓库卫生测试，验证职责地图、统一忽略边界、失效配置退役和持久内容可提交性。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `repository-hygiene`: 增加仓库职责地图、统一 outputs 退役边界和持久项目配置有效性合同。
- `ai-context-efficiency`: 将历史正文读取合同与 schema v2 紧凑事件生命周期对齐，保留 `legacy-readonly` 的按需兼容读取。

## Impact

- 受影响文件：根 `README.md`、`AGENTS.md`、`.gitignore`、`.frontend-ui-review/` 项目配置、`tests/repository-hygiene.test.mjs`，以及两个能力的增量规格。
- 不改变插件公开命令、业务项目模板、OpenSpec/Playwright 运行时或外部 API。
- 路径和 Git 忽略语义属于跨平台高风险，需由聚焦仓库测试、本地共享验证和最终候选五平台 CI 分层验证。
- 本地被忽略的 outputs、dist 和运行缓存不在删除范围内。

需求依据：D-01、D-02、D-03、D-04、D-05、D-06、D-07、D-08。
