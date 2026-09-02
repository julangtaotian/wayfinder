# fast-change-routing Specification

## Purpose
提供独立、可直接选择的前端快速修改能力，使已决定结果的局部改动以最少流程完成，同时把实质风险单次交接给保持完整兼容的受管变更能力。

## Requirements

### Requirement: 独立快速 Skill 具有互斥且可隐式选择的入口

插件 SHALL 提供独立的 `frontend-fast-change` Skill 及启用隐式选择的元数据。其描述 MUST 只面向用户明确要求实施、预期结果已决定且影响局部的前端修改；`frontend-change` 的描述 MUST 保持完整受管生命周期定位，不包含快速修改或小修复入口。（D-01、D-06、D-07；A-01、A-04、A-05）

#### Scenario: 明确局部实施请求选择快速 Skill

- **WHEN** 用户明确要求实施一个结果已决定、影响可界定的局部前端修改
- **THEN** 系统 SHALL 能根据描述选择 `frontend-fast-change`，而无需先加载完整受管变更流程

#### Scenario: 完整变更请求保持原入口

- **WHEN** 用户请求规划、继续、实现、评审或完成一个受管功能或缺陷变更
- **THEN** 系统 SHALL 继续选择 `frontend-change` 及其原有生命周期

### Requirement: 快速通道仅依赖最小准入事实

快速 Skill 仅在用户明确要求实施、预期结果已经决定且无需新增产品决定、相关源码与必要调用方足以把影响界定为同一局部行为、存在聚焦验证方式且没有匹配活动变更时 SHALL 继续实施。全部条件 MUST 同时成立；目录名、文件数和改动行数 MUST NOT 单独作为准入证明或阻断条件。（D-02、D-03；A-01、A-03）

#### Scenario: 全部最小条件成立

- **WHEN** 用户意图、相关源码、必要调用方、聚焦验证和活动变更状态共同证明全部准入条件
- **THEN** 快速 Skill SHALL 不创建需求或 OpenSpec 产物，并进入局部实现

#### Scenario: 同一局部调用链需要多个文件

- **WHEN** 达成同一已决定结果需要修改同一局部调用链中的多个必要文件，且没有改变共享契约或风险边界
- **THEN** 快速 Skill SHALL 允许完成这些文件，而不是仅因文件数量升级

#### Scenario: 影响无法界定

- **WHEN** 必要读取后仍无法证明影响属于同一局部行为
- **THEN** 快速 Skill MUST 不继续扩张，并按交接合同转给 `frontend-change`

### Requirement: 实质风险触发单次无损交接

匹配活动变更、未解决的产品决定、无法界定或跨模块影响、共享或公开契约变化，以及 API、鉴权、权限、安全、敏感数据、持久化、依赖或锁文件、构建、部署、CI 或平台兼容的实质变化，任一命中时快速 Skill MUST 停止扩张并只交接一次给 `frontend-change`。交接 MUST 保留用户拥有的改动和已完成的安全调查或修改，并传递触发原因、相关文件、事实证据和验证结果，使完整流程从当前状态继续。（D-03、D-04；A-02）

#### Scenario: 匹配活动变更直接交接

- **WHEN** 轻量检查发现当前请求匹配一个活动变更
- **THEN** 快速 Skill MUST 交接并继续该活动变更，不创建重复需求或变更

#### Scenario: 实施中发现共享契约变化

- **WHEN** 实现或验证揭示原请求需要改变实质共享或公开契约
- **THEN** 快速 Skill MUST 停止扩大修改，保留安全工作并把现有证据单次交给 `frontend-change`

#### Scenario: 目录关键词没有实质风险

- **WHEN** 相关文件位于路由、共享组件或其他常见高影响目录，但检查证明修改仍是局部实现且不改变共享契约
- **THEN** 快速 Skill MUST NOT 仅因目录名自动升级

### Requirement: 快速执行保持精简、真实和可验证

快速 Skill SHALL 只读取适用规则、仓库状态、相关源码、必要调用方和邻近测试；需要时可以使用项目导航定位调用链，但 MUST NOT 默认加载需求矩阵、完整依赖画像或规划产物。它 SHALL 只发送一次简短开工说明，完成最小充分修改，并运行最窄且能证明结果的自动测试、邻近测试或明确人工检查；默认 MUST NOT 运行全量验证，除非聚焦验证不可用、共享链路要求或用户明确要求。完成报告 MUST 只包含实际文件、真实验证结果和实质剩余风险，且不得自动提交、推送、发布或改变外部状态。（D-04、D-05；A-01、A-03）

#### Scenario: 存在聚焦自动验证

- **WHEN** 仓库已有覆盖目标行为的聚焦测试或检查
- **THEN** 快速 Skill MUST 运行该验证并按实际输出报告结果

#### Scenario: 没有匹配自动验证

- **WHEN** 仓库没有覆盖目标行为的自动验证
- **THEN** 快速 Skill MUST 执行并记录匹配的人工检查，并如实说明自动化证据缺口

#### Scenario: 聚焦验证足以证明结果

- **WHEN** 聚焦验证已经覆盖局部修改且没有暴露共享风险
- **THEN** 快速 Skill SHALL 完成交付，不为流程完整性额外运行需求、OpenSpec 或仓库全量验证

### Requirement: 公共路由与原完整能力具有确定性回归保护

受管 `AGENTS.md` 模板 SHALL 只提供 `frontend-fast-change` 与 `frontend-change` 的简洁选择和交接提示；需求规则与 README SHALL 说明二者职责而不复制完整快速合同。公开 Skill 清单 MUST 包含新 Skill，专用测试 MUST 同时验证独立入口、最小准入、实质风险、单次交接、快速执行和 `frontend-change` 原有描述与 Plan/Revise/Implement/Complete 生命周期。（D-06、D-07；A-04、A-05）

#### Scenario: 原完整能力没有快速分支

- **WHEN** 仓库检查 `frontend-change` 的公开描述和正文
- **THEN** 它 MUST 保留原受管生命周期，且 MUST NOT 包含 Fast Path、快速通道或小修复分支

#### Scenario: 公共路由发生漂移

- **WHEN** 新 Skill、元数据、模板、规则、README 或公开清单缺失必要职责，或原完整能力被快速规则改写
- **THEN** 专用测试 MUST 给出失败并定位漂移资产
