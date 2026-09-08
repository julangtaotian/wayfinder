## Context

依据 REQ-2026-043 D-01 至 D-04。默认比较结果不可修复，现有状态支持候选但没有安全补齐入口。

## Goals / Non-Goals

保留原始证据和授权门禁，复用既有状态、路径、原子写入实现。不引入依赖、额外代理调用或新的路由引擎。

## Decisions

- 新增 prepare-repair 细粒度命令，使用 --result 提交包含 runId、scenarioFingerprint 和 candidates 的 JSON。每项绑定 findingId、findingFingerprint、源码 SHA-256、sourceTarget、changeScope、forbiddenChanges、verification。
- 新领域模块负责补齐与源码失效检查，CLI 只负责组合。沿用 v2 可选字段 repairContext，原始 findings 不变，避免修改问题身份造成误判。
- 候选绑定源码原始字节摘要，唯一锚点按 LF 规范化识别，兼容 CRLF；输入相对路径保持已有正斜杠合同，原生绝对路径仅由共享安全函数内部生成。失败输出稳定 code、target、status。
- 预览与写入执行相同校验；repair-gate 复核源码摘要；complete-repair 仍只记录实际已修复 ID，不再要求修复前源码摘要。
- 技能先分流再读细则。UI 内部维护说明分离，保留兼容入口与公开技能集合。

## Risks / Trade-offs

- 跨平台高风险：路径、临时目录、机器可读诊断；覆盖 darwin-arm64、darwin-x64、linux-x64、linux-arm64、win32-x64。
- 人工声明范围不能证明 diff 自动合规 → 保留技能的逐项 diff 与用户修改重叠门禁，不宣称机器验证语义范围。
- 摘要校验可能拒绝与修复无关的同文件变动 → 重新核对上下文再生成候选，不能静默更新摘要。
- 真实代理场景耗额 → 本轮使用说明审查与确定性运行回归；真实模型行为和效率不标通过。

## Migration Plan

新增可选字段；旧 v2 候选保留原合同，v1 只读。聚焦测试、本地全量验证与真实五平台 CI 独立记录，外部证据未完成前不归档。源码验收后同步本机安装并报告其本地验证边界。
