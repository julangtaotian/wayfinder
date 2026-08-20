## MODIFIED Requirements

### Requirement: 历史与外部证据必须保持显式信任边界
系统 SHALL 允许未声明机器证据合同的历史需求继续只读审计，并 MUST 将旧 Markdown 通过、失效活动路径和未联网复查的 `external-ci` 记录分别标记为历史或外部来源。普通 JSON 持久资料 MUST NOT 被当作机器证据清单解析；只有显式 `V-*.json` 或位于 `evidence/` 目录的 JSON 才能成为机器证据候选。兼容模式不得自动补造 JSON、改写历史事实或降低新合同门禁。（D-01、D-02、D-03、D-05，A-01、A-02、A-03）

#### Scenario: 历史已验收需求只有 Markdown 证据
- **WHEN** 旧需求在引入机器证据合同之前已经验收且只包含 Markdown 通过记录
- **THEN** 项目检查返回可定位迁移警告并保持内容不变，不以缺少 JSON 破坏历史可读性

#### Scenario: 历史自动记录引用普通 JSON 资料
- **WHEN** 未声明机器证据合同的历史自动记录引用 `plugin.json`、配置 JSON 或报告 JSON
- **THEN** 系统只按持久路径和安全边界检查这些资料，不进入机器证据解析，也不产生机器清单失败诊断

#### Scenario: 历史记录引用无效机器证据候选
- **WHEN** 未声明机器证据合同的历史自动记录引用无效的 `V-*.json` 或 `evidence/` JSON
- **THEN** 系统返回带稳定 code、target 和 warning status 的兼容警告，不把历史记录升级为失败

#### Scenario: 新合同引用普通 JSON 但缺少机器证据
- **WHEN** 显式启用机器证据合同的新变更只引用普通 JSON 资料，没有同 ID 的有效机器证据
- **THEN** 系统继续以 `machine_evidence_missing` 失败关闭，不因历史兼容分类而降低严格度

#### Scenario: 外部 CI 引用尚未联网复查
- **WHEN** 证据记录包含运行 URL、精确提交和任务状态，但当前流程没有调用远程 API 复查
- **THEN** 系统保留 `external-ci` 来源和未远程验证标志，不把它描述为插件本地真实执行
