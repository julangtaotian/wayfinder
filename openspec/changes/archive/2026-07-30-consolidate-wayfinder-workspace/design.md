## Context

当前默认布局由根目录 `AGENTS.md`、`.ai-workflow.yaml`、`requirements/_template.md`、`docs/ai-context/frontend.md` 与 `openspec/config.yaml` 组成。前两类外部工具分别要求根目录 AGENTS 和固定的 `openspec/config.yaml`；其余文件属于插件自身的项目导航协议，却分散在三个位置。

此前深度扫描已验证长期上下文需要保留范围、项目地图、事实、推断、待确认项、风险与验证边界。它们与 `.ai-workflow.yaml` 的版本和范围元数据共同构成一个整体，应收敛为名为 Wayfinder 的项目导航资料，而不是继续增加根目录配置文件。

## Goals / Non-Goals

**Goals:**

- 新项目默认只创建三个必要工作流产物：`AGENTS.md`、`openspec/config.yaml` 与 `wayfinder/frontend.md`。
- 将工作流元数据、范围摘要和 AI 深度项目地图保存到同一份 Wayfinder 文档的独立受管区块。
- 让 AGENTS 成为自动发现入口，明确索引 Wayfinder；让 OpenSpec 保持原生根目录约定。
- 提供 dry-run 优先、显式写入、可重复、不会静默删除用户内容的旧布局迁移。
- 需求模板仍由插件维护，只有实际创建 `requirements/REQ-*.md` 时才使用，不再作为默认项目文件。

**Non-Goals:**

- 不移动或包装 `AGENTS.md` 与 `openspec/config.yaml`，也不修改 OpenSpec 的根目录解析行为。
- 不自动迁移已初始化项目，不根据文件名猜测文件是否可删除。
- 不把长期业务需求、OpenSpec 变更或扫描逐文件账本塞入 Wayfinder。
- 不为了迁移兼容旧版而永久同时维护两套项目上下文。

## Decisions

### 1. `wayfinder/` 是唯一的插件项目导航目录

新布局固定为 `wayfinder/frontend.md`。Wayfinder 表示后续 AI 和开发者处理变更时使用的项目导航资料：它既保存源码证据支持的项目地图，也保存工作流版本、扫描状态与覆盖统计。这个名称强调“指引后续决策”，不会与 `openspec` 的规格和 `requirements` 的业务需求混淆。

未选择 `aiWorkflow/`，因为它描述工具而非项目资产；未选择 `.ai-workflow/`，因为长期项目知识需要对维护者可见；未选择 `project-context/`，因为辨识度不足。

### 2. 用三个独立受管区块合并元数据与上下文

`wayfinder/frontend.md` 包含 `meta`、`scope` 和 `analysis` 三个命名 Markdown 区块：

- `meta` 保存版本、预设、包管理器、深度状态、范围统计与当前上下文路径；脚本读取和更新该区块。
- `scope` 保存机器生成的范围摘要；脚本在深度模式刷新。
- `analysis` 保存 AI 项目地图；只有完成覆盖和得到用户确认后由 AI 替换。

脚本使用已有的受管标记解析能力读取 `meta` 内稳定的 YAML 样式字段，不引入 YAML 依赖。`AGENTS.md` 的 `deep-guardrails` 仍保持独立、可保留的内层区块。

### 3. 普通初始化不再创建模板或独立元数据

模板仍随插件发布。需求编写技能先读取项目中已有的 `requirements/_template.md`（兼容已有项目），否则直接使用插件内置模板；首次写入真实需求时才创建 `requirements/`。健康检查不再把模板或旧 `.ai-workflow.yaml` 列为新布局的必需文件。

### 4. 旧布局只通过显式迁移收敛

提供独立 `migrate-wayfinder-project.mjs`：默认预览，`--write` 才执行。它只接受具备有效旧受管标记的工作流，并按以下顺序操作：

1. 完整读取旧 `frontend.md` 和 `.ai-workflow.yaml`，生成包含等价元数据、范围区块、分析区块与标记外维护者内容的新 Wayfinder 文档。
2. 刷新 AGENTS 受管区块的 Wayfinder 链接，并保留已有 `deep-guardrails` 内容。
3. 新文档与 AGENTS 写入成功后，才删除已被完整迁移的旧 `frontend.md` 与完全受管、无额外自定义字段的 `.ai-workflow.yaml`。
4. `requirements/_template.md` 仅在与插件模板完全一致时删除；任何差异均保留并列入迁移报告。

写入前任何冲突都会终止。删除失败只会留下重复副本，不会造成内容丢失。普通升级发现旧布局时报告“需要迁移”，而不创建新布局或删除旧文件。

### 5. 健康检查区分新布局和旧布局

新布局必须具备三项固定产物、Wayfinder 的 `meta/scope/analysis` 受管区块，以及深度模式下的 AGENTS 约束区块。旧布局仍可得到兼容检查结果，但标记为 `legacy` 与 `needsMigration` 警告；避免用户在更新插件后被误报为工作流失效。

## Risks / Trade-offs

- [迁移误删维护者内容] → 默认预览；只删除可证明完整迁移或与内置模板逐字一致的旧文件；其他文件保留并报告。
- [单文档过大] → Wayfinder 只保存稳定项目地图与摘要，逐文件账本继续留在本次扫描报告。
- [旧路径残留造成 AI 读取错误] → AGENTS 和所有技能只指向 Wayfinder；健康检查在迁移完成前明确提示旧布局。
- [元数据嵌入 Markdown 后解析脆弱] → 使用单独 `meta` 成对标记和限定字段格式，自动化测试覆盖缺失、重复和错误值。
- [按需模板降低可发现性] → 需求技能在没有项目模板时自动使用插件内置模板，并在报告中说明来源。

## Migration Plan

1. 发布包含 Wayfinder 默认布局、兼容检查和迁移命令的插件版本。
2. 新项目直接使用三项产物；不创建旧路径。
3. 已有项目先运行迁移预览，核对创建、保留和删除计划，再显式加 `--write`。
4. 迁移后运行健康检查与重复迁移预览；应显示新布局健康且无额外变更。
5. 如需回滚，可从版本控制恢复旧文件；迁移不会删除无法证明安全的模板或用户自定义元数据。

## 需求追踪

- 关联需求：`REQ-2026-007-wayfinder-workspace.md`
- 决策依据：D-01、D-02、D-03、D-04。
- 验收目标：A-01、A-02、A-03。

## Open Questions

- 无。Wayfinder 的内容边界、文件名和旧布局安全处理均已由本次决策确定。
