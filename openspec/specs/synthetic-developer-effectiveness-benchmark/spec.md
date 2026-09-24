# synthetic-developer-effectiveness-benchmark Specification

## Purpose
以隔离、可重复的配对基准比较 frontend-delivery 与无插件基线，并明确合成结论边界。

## Requirements

### Requirement: 冻结用例必须覆盖当前三档路线

完整用例矩阵 MUST 同时包含 Direct 与至少一种 Light 或 Complex，并根据真实风险选择 expectedRoute。文件数、补丁行数和复杂度标签不得单独决定路线；旧 fast、managed、governed 或 full 值 MUST 被拒绝。

#### Scenario: 完整矩阵只有 Direct
- **WHEN** 六个候选全部声明 direct
- **THEN** 冻结阶段返回稳定矩阵错误且不启动代理

### Requirement: 路线证据必须来自单一交付入口

插件组 MUST 记录 frontend-delivery 调用和 finalRoute。Direct 与 Light MUST NOT 产生管理路径；Complex MUST 产生一个 `openspec/changes/` 身份。对照组 MUST 关闭插件和宿主技能发现，且不得产生管理产物。

#### Scenario: Light 创建 OpenSpec
- **WHEN** 插件组返回 light 但改动包含 OpenSpec change
- **THEN** 样本以 `plugin_route_evidence_missing` 标记无效

### Requirement: 用例质量必须在执行前证明

初始状态与已知错误变体 MUST 验收失败，参考实现与结构不同的等价实现 MUST 验收通过。答案匹配型、越界、依赖网络或不可重放候选 MUST 被拒绝，作者纠正最多使用有界重试。

#### Scenario: 等价实现被误拒绝
- **WHEN** evaluator 依赖局部变量名、表达式顺序或完整参考文本
- **THEN** 候选不能冻结，也不得放宽验收继续运行

### Requirement: 配对执行必须隔离并保留未知语义

同一用例的插件组与基线组 MUST 从相同提交和初始补丁建立独立工作区，使用相同模型、推理强度、预算和验收器。缺失指标与 Token 用量 MUST 为带原因的 null，不得补零或推断。

#### Scenario: baseline 暴露插件调用
- **WHEN** baseline 事件包含 frontend-delivery 调用证据
- **THEN** 运行标记为污染并排除比较

### Requirement: 输出必须有界且诚实

运行物 MUST 只进入 `.frontend-ai-workflow/runs/developer-effectiveness-benchmark/<run-id>/`，缓存只进入 `.frontend-ai-workflow/cache/`。汇总 MUST 标记 synthetic；有效配对不足时不得形成优劣结论，也不得外推真实团队生产率。

#### Scenario: 配对不完整
- **WHEN** 任一用例缺少一侧有效样本
- **THEN** 结论为 `insufficient-pairs` 并列出无效原因
