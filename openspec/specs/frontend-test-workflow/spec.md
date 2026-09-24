# frontend-test-workflow Specification

## Purpose
定义显式测试请求的只读分析、测试实现和最低充分验证边界，使测试能力只在用户明确请求时进入，并避免重新建立长期测试计划或验证证据链。

## Requirements

### Requirement: 测试能力必须只在显式请求时进入

系统 MUST 只在用户明确要求分析测试覆盖、编写测试、运行测试或修复测试时使用测试入口。只读分析 MUST 零写入；未明确授权修改生产代码时，测试入口 MUST NOT 修改生产源码。

#### Scenario: 用户只要求覆盖分析
- **WHEN** 用户要求查看现有覆盖而未授权写入
- **THEN** 系统只读取相关源码、最近测试和真实项目命令并报告缺口

### Requirement: 测试实现必须复用项目原生设施

系统 MUST 优先扩展最近的同类手写测试，并只使用已存在的 runner、命令、fixture、mock 和断言模式。系统 MUST NOT 安装或升级依赖、覆盖生成测试或弱化现有断言。

#### Scenario: 没有可用测试入口
- **WHEN** 项目没有真实测试命令或本地 runner 入口
- **THEN** 系统记录阻断一次，不安装依赖、不重复执行已知失败

### Requirement: 验证结果必须保持真实语义

系统 MUST 报告命令、退出码、通过与失败计数以及首个相关失败摘要。零测试、非零退出、未执行和环境缺失 MUST NOT 被描述为通过。视觉行为 MUST 交给 UI Review/Verify，不建立第二套浏览器流程。

#### Scenario: 命令成功但没有发现测试
- **WHEN** runner 退出为零但发现零测试
- **THEN** 系统将结果标记为失败或阻断，不生成长期测试证据

### Requirement: 测试运行物必须保持临时

日志、缓存和临时运行时 MUST 位于 `.frontend-ai-workflow/runs/` 或 `.frontend-ai-workflow/cache/`，不得写入 OpenSpec change、requirements、outputs 或长期 evidence 目录。

#### Scenario: 测试完成
- **WHEN** 显式测试请求得到结果
- **THEN** 系统只返回有界摘要，长期保留仅限确有维护价值的项目原生测试
