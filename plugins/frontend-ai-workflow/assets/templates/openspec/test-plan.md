# 测试方案：变更名称

## 基本信息

- 状态：草稿
- 需求：`requirements/REQ-YYYY-NNN-example.md`
- 变更：change-name
- 需求修订基线：R-01
- 默认聚焦命令：`npm run test -- path/to/feature.spec.js`

## 测试上下文

- 测试命令状态：detected
- 测试命令：`npm run test`
- 测试运行器：project-native
- 测试目录：`tests`
- Git 基线：available
- 兼容说明：仅声明已有项目文件能够证明的测试能力。

## 测试用例

### TC-01：可观察行为名称

- 状态：计划
- 优先级：P1
- 验证类型：自动
- 测试层级：组件
- 关联决策：D-01
- 关联验收：A-01
- 关联规格：capability / 场景名称
- 状态矩阵：用户操作
- 前置条件：待填写
- 测试数据：待填写
- 测试替身：不适用
- 操作：待填写
- 可观察断言：待填写
- 目标测试：`tests/feature.spec.js`
- 测试定位：`[TC-01] 可观察行为名称`
- 聚焦命令：`npm run test -- tests/feature.spec.js`
- 关联验证：V-01
- 结果分类：未执行
- 证据：待执行
