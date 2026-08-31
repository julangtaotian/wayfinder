## MODIFIED Requirements

### Requirement: 仓库必须提供版本化体积预算审计
系统 MUST 以只读方式统计受跟踪文件、受管 outputs、活跃完整需求和日常源码/测试规模，并 MUST 返回版本化机器结果。平台浏览器资产目录、平台二进制 LFS 规则和受跟踪平台生成清单 MUST 作为确定性退役目标，实际数量上限为零。每项违规 MUST 包含稳定 `code`、`status`、`target`、`actual` 与 `limit`，任一阻断诊断存在时命令 MUST 返回非零状态，不得通过扩大普通体积预算放行退役内容。（D-02、D-06、D-10；A-06）

#### Scenario: 当前仓库满足预算
- **WHEN** 开发者运行仓库体积审计且所有普通目标均在声明预算内，同时平台资产退役目标实际数量为零
- **THEN** 结果 MUST 返回 `status=passed`、零阻断诊断和各分类实际计数

#### Scenario: 受跟踪资产超过预算
- **WHEN** tracked outputs、活跃完整需求、日常源码或测试任一超过对应预算
- **THEN** 结果 MUST 返回 `status=failed`、非零退出状态和可定位超限目标，不得只输出人类描述

#### Scenario: 已退役路径重新出现
- **WHEN** Git 索引再次包含 `runtime/playwright/platform-assets/` 内容、平台生成清单或对应 LFS 规则
- **THEN** 审计 MUST 以稳定退役路径 code、实际数量和零上限阻断，不得通过扩大普通体积预算绕过
