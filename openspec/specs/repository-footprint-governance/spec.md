# repository-footprint-governance Specification

## Purpose
为仓库提供可重复、可机器定位的体积与文件规模预算，使历史资产、验证输出和超大文件在进入共享验证时被及时阻断，而不是依赖后续人工清理。

## Requirements

### Requirement: 仓库必须提供版本化体积预算审计
系统 MUST 以只读方式统计受跟踪文件、受管 outputs、活跃完整需求和日常源码/测试规模，并 MUST 返回版本化机器结果。平台浏览器资产目录、平台二进制 LFS 规则和受跟踪平台生成清单 MUST 作为确定性退役目标，实际数量上限为零。每项违规 MUST 包含稳定 `code`、`status`、`target`、`actual` 与 `limit`，任一阻断诊断存在时命令 MUST 返回非零状态，不得通过扩大普通体积预算放行退役内容。

#### Scenario: 当前仓库满足预算
- **WHEN** 开发者运行仓库体积审计且所有普通目标均在声明预算内，同时平台资产退役目标实际数量为零
- **THEN** 结果 MUST 返回 `status=passed`、零阻断诊断和各分类实际计数

#### Scenario: 受跟踪资产超过预算
- **WHEN** tracked outputs、活跃完整需求、日常源码或测试任一超过对应预算
- **THEN** 结果 MUST 返回 `status=failed`、非零退出状态和可定位超限目标，不得只输出人类描述

#### Scenario: 已退役路径重新出现
- **WHEN** Git 索引再次包含 `runtime/playwright/platform-assets/` 内容、平台生成清单或对应 LFS 规则
- **THEN** 审计 MUST 以稳定退役路径 code、实际数量和零上限阻断，不得通过扩大普通体积预算绕过

### Requirement: 预算变化必须经过显式规划

系统 MUST 把预算值和允许例外作为受版本控制的稳定合同；预算调整 MUST 关联正式需求与变更，不得由审计命令自动学习当前体积、静默抬高阈值或写回新基线。

#### Scenario: 当前实际值超过预算

- **WHEN** 审计发现超限
- **THEN** 命令 MUST 保持只读并失败，不能把当前实际值保存为新预算

#### Scenario: 开发者需要新增持久大资产

- **WHEN** 新需求确实需要突破既有预算或增加例外
- **THEN** 规划资料 MUST 说明原因、生命周期、读取路由和回收策略后才能修改预算合同

### Requirement: 仓库必须提供职责稳定的聚焦验证入口

系统 SHALL 提供仓库治理、工作流核心和平台运行时三个可直接调用的聚焦测试入口，入口 SHALL 使用仓库真实测试文件并在零测试发现时失败；统一发布验证仍 MUST 覆盖全部测试和共享门禁。

#### Scenario: 修改仓库治理能力

- **WHEN** 开发者运行仓库治理聚焦入口
- **THEN** 命令 SHALL 执行体积、需求归档和仓库卫生专用测试，并 SHALL 报告真实发现数量与退出状态

#### Scenario: 修改平台运行时能力

- **WHEN** 开发者运行平台运行时聚焦入口
- **THEN** 命令 SHALL 执行平台准备、打包、完整性和暂存失败回归，不得隐式运行无关视觉历史测试

#### Scenario: 执行发布级验证

- **WHEN** 开发者或 CI 运行统一验证
- **THEN** 系统 MUST 执行完整测试集合和全部共享门禁，聚焦入口不得替代该证据

### Requirement: 仓库必须拒绝持久运行时和退役归档结构

仓库体积门禁 MUST 以零上限拒绝受跟踪的 `.frontend-ai-workflow/runs`、`cache`、`transactions`、`.frontend-ui-review/runs`、普通 `outputs`、`requirements/archive` 和 `openspec/changes/archive` 内容，并 MUST 拒绝生命周期 schema v1/v2 混写。忽略规则不得替代 Git 索引检查。

#### Scenario: 使用强制添加绕过忽略
- **WHEN** Git 索引包含任一运行时或退役归档路径
- **THEN** 体积门禁 MUST 返回稳定 tracked_runtime_artifact 或 retired_lifecycle_path 诊断并失败

#### Scenario: 仓库只有本地临时运行
- **WHEN** 忽略目录存在本地运行结果但 Git 索引不包含它们
- **THEN** 门禁 MUST 保持只读通过且不得遍历大体积运行内容

### Requirement: 正式规格和测试上下文增长必须可见

体积治理 MUST 报告正式规格数量、总字节、重复 requirement 标题、退役能力和测试总文件/总行数。硬安全违规 MUST 阻断；总上下文预算 SHOULD 使用显式版本化软预警，不能为当前体积静默调整，也不能用单纯数量上限阻止合理能力增长。

#### Scenario: 新建重复 capability requirement
- **WHEN** 两个正式规格包含相同规范化 Requirement 标题且未声明替代关系
- **THEN** 门禁 MUST 返回可定位重复诊断并要求更新既有 capability 或明确迁移

#### Scenario: 测试编号存在歧义
- **WHEN** 多个测试文件把同一个裸 TC 编号作为证据定位
- **THEN** 审计 SHALL 报告歧义并提供文件和行为标题，新增严格证据不得只保存裸编号

#### Scenario: 正式规格仍依赖局部需求编号
- **WHEN** 正式规格仍包含只能由已删除需求正文解释的 D-* 或 A-* 引用
- **THEN** legacy-readonly 审计 SHALL 输出文件与引用清单，v2 门禁 MUST 阻断；系统不得猜测批量改写，需保留的长期决定必须先提升为全局 DEC 标识

#### Scenario: 总上下文超过软预算
- **WHEN** 正式规格总字节或测试总行数超过版本化预算但没有安全违规
- **THEN** 审计 SHALL 返回 warning 和实际值，不自动修改预算或阻断无关紧急修复
