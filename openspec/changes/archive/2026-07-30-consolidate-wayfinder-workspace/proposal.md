## Why

当前初始化默认生成五个分散的工作流文件，其中项目导航、范围元数据和需求模板的职责重叠，增加了项目根目录和目录层级的认知成本。深度扫描已经证明需要一份可追溯的长期导航资料；现在应将它命名为 `wayfinder` 并收敛默认产物，同时保持 Codex 与 OpenSpec 的固定入口可用。

## What Changes

- 新增 `wayfinder/` 作为项目导航库，默认只生成 `wayfinder/frontend.md`；该文档合并原 `.ai-workflow.yaml` 的工作流元数据与 `docs/ai-context/frontend.md` 的稳定项目上下文。
- 根目录继续保留 `AGENTS.md`，OpenSpec 继续使用 `openspec/config.yaml`；AGENTS 改为索引 `wayfinder/frontend.md`，不改变两项外部工具的发现约定。
- 不再在普通初始化时创建 `.ai-workflow.yaml` 或 `requirements/_template.md`；需求模板保留在插件内，只有创建实际 `requirements/REQ-*.md` 时才按需使用。
- **BREAKING**：新项目的工作流文件位置与健康检查结果发生变更；旧路径不再是新项目的默认输出。
- 提供显式、可预览的 Wayfinder 迁移：迁移已有受管上下文时复制完整项目事实并保留 AGENTS 与 OpenSpec；只在用户确认写入且旧文件无项目自定义内容时删除可安全淘汰的旧元数据，其他旧文件报告为待人工处理，绝不静默删除。

## Capabilities

### New Capabilities

- `wayfinder-workspace`: 以稳定的项目导航文档承载元数据、深度地图与风险边界，并以安全迁移支持旧版工作流。
- `wayfinder-migration`: 在显式确认下将旧版受管工作流转换为 Wayfinder 布局，并对无法安全收敛的用户文件给出明确报告。

### Modified Capabilities

- 无。现有能力尚未同步为主规格；本次以新增规格定义 Wayfinder 的默认布局与迁移契约。

## Impact

- 受影响脚本：项目初始化、升级、健康检查、项目识别与路径安全校验。
- 受影响模板与技能：AGENTS、前端上下文、需求编写、初始化、检查、升级和变更流程。
- 受影响测试与文档：端到端 fixture、README、受管文件规则、深度扫描规则与 OpenSpec 规格。
- 不新增第三方依赖；现有业务项目不会因安装新插件而被自动迁移或删除文件。

## 需求追踪

- 关联需求：`REQ-2026-007-wayfinder-workspace.md`
- 决策依据：D-01、D-02、D-03、D-04。
- 验收目标：A-01、A-02、A-03。
