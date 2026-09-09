export function renderRequirement({ revision = 'R-01', verificationResult = '计划' } = {}) {
  const extraRevision = revision === 'R-02'
    ? '| R-02 | 2026-08-17 | D-01 | A-01 | 行为修订。 |\n'
    : '';
  const verificationDate = verificationResult === '通过' ? '2026-08-17' : '待执行';
  return `# Fixture requirement

## 基本信息

- 状态：实施中

## 决策台账

| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 加法行为 | 已确认 | 返回两数之和 | fixture |

## 关联变更范围

| 变更 | 决策范围 | 验收范围 |
| --- | --- | --- |
| add-fixture-test | D-01 | A-01 |

## 修订记录

| 修订 | 日期 | 影响决策 | 影响验收 | 验证与任务处理 |
| --- | --- | --- | --- | --- |
| R-01 | 2026-08-17 | D-01 | A-01 | 建立需求。 |
${extraRevision}
## 验证记录

| 验证ID | 验证类型 | 执行内容或环境 | 执行日期 | 结果 | 证据位置 |
| --- | --- | --- | --- | --- | --- |
| V-01 | 自动 | Vitest 聚焦测试 | ${verificationDate} | ${verificationResult} | \`artifacts/TC-01.txt\` |

## 验收标准

- [ ] [A-01] add(1, 2) 返回 3。
`;
}

export function renderPlan({
  baseline = 'R-01',
  planStatus = '就绪',
  caseStatus = '计划',
  target = 'tests/math.spec.js',
  result = '未执行',
  evidence = '待执行',
  duplicate = false,
} = {}) {
  const caseBlock = (id = 'TC-01') => `### ${id}：两数相加

- 状态：${caseStatus}
- 优先级：P1
- 验证类型：自动
- 测试层级：单元
- 关联决策：D-01
- 关联验收：A-01
- 关联规格：fixture / 两数相加
- 状态矩阵：用户操作
- 前置条件：加载纯函数模块
- 测试数据：1 与 2
- 测试替身：不适用
- 操作：调用 add(1, 2)
- 可观察断言：返回值严格等于 3
- 目标测试：\`${target}\`
- 测试定位：\`[TC-01] 两数相加\`
- 聚焦命令：\`npm run test -- ${target}\`
- 关联验证：V-01
- 结果分类：${result}
- 证据：${evidence === '待执行' ? evidence : `\`${evidence}\``}
`;
  return `# 测试方案：fixture

## 基本信息

- 状态：${planStatus}
- 需求：\`requirements/REQ-2026-001-fixture.md\`
- 变更：add-fixture-test
- 需求修订基线：${baseline}
- 默认聚焦命令：\`npm run test -- tests/math.spec.js\`

## 测试上下文

- 测试命令状态：detected
- 测试命令：\`npm run test\`
- 测试运行器：Vitest
- 测试目录：\`tests\`
- Git 基线：unavailable
- 兼容说明：Vue 3 + Vite + Vitest fixture。

## 测试用例

${caseBlock()}${duplicate ? caseBlock() : ''}`;
}

