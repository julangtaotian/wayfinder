# 受管文件策略

## 所有权

公共插件拥有模板和受管区块；业务仓库拥有业务需求、规划变更、受管区块之外的说明和全部业务代码。

## 写入规则

- 初始化时只创建不存在的文件。
- 文件已存在且没有受管标记时跳过，并在报告中列出。
- 文件已存在且含受管标记时，普通初始化不修改；升级命令只替换受管区块。
- 需求文档和业务规划变更永不由升级命令覆盖；新版 `wayfinder/frontend.md` 只允许刷新有效 `meta` 与 `scope` 受管区块，AI 项目地图和标记外维护者内容必须保留。
- 普通升级更新公共字段时保留既有扫描时间、Git 状态和范围指纹；只有用户显式确认深度刷新才重新扫描并更新分析快照。
- 写入前先输出 dry-run 计划。

## 标记

Markdown 使用：

```text
<!-- frontend-ai-workflow:start version=0.1.0 -->
<!-- frontend-ai-workflow:end -->
```

YAML 使用：

```text
# frontend-ai-workflow:start version=0.1.0
# frontend-ai-workflow:end
```

找不到成对标记、标记顺序错误或存在多组同名标记时停止升级，不尝试猜测。

Wayfinder 的项目导航使用三组独立 Markdown 标记：

```text
<!-- frontend-ai-workflow:meta:start version=0.17.0 -->
<!-- frontend-ai-workflow:meta:end -->
<!-- frontend-ai-workflow:scope:start version=0.4.0 -->
<!-- frontend-ai-workflow:scope:end -->
<!-- frontend-ai-workflow:analysis:start version=0.4.0 -->
<!-- frontend-ai-workflow:analysis:end -->
```

脚本刷新元数据与范围时只替换 `meta`、`scope` 区块；AI 在用户确认后写入 `analysis` 区块。三组标记必须各自恰好成对存在。没有这些标记的 Wayfinder 一律保留，不自动插入标记或覆盖。

`meta` 区块中的 `dependencyProfileSchema`、`dependencyProfileSource`、`dependencyPackageCount` 和 `dependencySummaryStatus` 描述根 `package.json` 的动态直接依赖画像；摘要可能截断，AI 需要完整事实时必须回到检查结果的 `dependencyProfile.packages` 或根 `package.json`。`scopeFingerprint`、`scopeScannedAt`、`scopeGitCommit` 和 `scopeGitDirty` 属于分析基线。`analysisStatus`、`analysisCoveredFiles` 和 `analysisUpdatedAt` 属于项目地图完成合同：`deepAnalysis: true` 只表示已经取得范围快照，不等于项目地图已完成。旧项目缺少这些字段时只报告刷新提醒，不因升级自动伪造。

普通初始化和升级可以刷新受管区块中的动态依赖摘要与元数据，但不得修改项目 `package.json`、安装依赖或把摘要推断成用途、兼容性和安全性结论。Monorepo 子应用、workspaces 和传递依赖仍在当前受管画像之外。

深度扫描写入范围快照时将项目地图重置为 `pending`、覆盖数重置为 0；历史地图正文可以保留供参考，但在后续分析完成前不得作为完整事实源。普通升级必须保留已有的项目地图状态和覆盖统计。

新版 `AGENTS.md` 在外层受管区块内还包含一组 `deep-guardrails` Markdown 标记。AI 在深度扫描确认后只替换这一内层区块，写入项目专属的高影响约束；升级通用 AGENTS 规则时必须保留其内容。旧版 AGENTS 缺少该内层标记时，可在外层受管区块有效的前提下由新版模板补入占位区块；已有但不成对或重复的内层标记一律报告冲突。

旧 `.ai-workflow.yaml` 与 `docs/ai-context/frontend.md` 只由显式 Wayfinder 迁移处理。普通升级不会创建 Wayfinder、移动或删除这些旧文件；迁移只在 `--write` 后删除已完整迁入或可证明与内置模板一致的文件，所有自定义内容一律保留并报告。
