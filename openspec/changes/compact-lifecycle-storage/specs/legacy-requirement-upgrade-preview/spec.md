## ADDED Requirements

### Requirement: v2 日常检查不得展开已退役需求入口

当仓库声明 lifecycle schema v2 时，旧需求升级预览和其他日常检查 MUST 只处理当前活动 `requirements/REQ-*.md`，不得依赖 `requirements/index.json`、已验收根存根或 `requirements/archive/`。legacy-readonly 仓库 MAY 继续只读识别旧结构以支持迁移预览。（D-01、D-02、D-11、D-16；A-01、A-02、A-05、A-09）

#### Scenario: v2 仓库执行旧需求预览

- **WHEN** 根需求目录只包含活动需求且历史已转为生命周期事件
- **THEN** 预览只报告活动需求缺口，不尝试读取已删除的索引、存根或归档正文

#### Scenario: legacy-readonly 仓库准备迁移

- **WHEN** 仓库仍存在旧索引、存根和归档正文
- **THEN** 预览保持只读兼容，生命周期迁移器把旧索引和已验收存根纳入精确候选而非活动引用
