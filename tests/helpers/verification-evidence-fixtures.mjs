import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EVIDENCE_SCHEMA_VERSION,
  computeVerificationSemanticBinding,
  computeWorkspaceFingerprint,
  createEvidenceFileDescriptor,
} from '../../plugins/frontend-ai-workflow/scripts/verification-evidence.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixtureOutputRoot = path.join(repositoryRoot, 'outputs', 'verification-evidence-integrity', 'test-fixtures');

export function write(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

export function createFixture(context, { evidenceRequired = true } = {}) {
  fs.mkdirSync(fixtureOutputRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureOutputRoot, 'case-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'package.json', '{"name":"evidence-fixture","private":true,"scripts":{"test":"node --test tests/*.test.mjs"}}\n');
  write(root, 'src/settlement.mjs', 'export const total = (values) => values.reduce((sum, value) => sum + value, 0);\n');
  write(root, 'tests/settlement.test.mjs', "// [TC-01] 复杂订单结算\nexport const covered = true;\n");
  write(root, 'requirements/REQ-2026-001-evidence.md', `# fixture

## 决策台账

| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 证据合同 | 已确认 | 受控执行与可信聚合 | fixture |

## 修订记录

| 修订 | 日期 | 影响决策 | 影响验收 | 验证与任务处理 |
| --- | --- | --- | --- | --- |
| R-01 | 2026-08-18 | D-01 | A-01 | 建立 fixture。 |

## 验证记录

| 验证ID | 验证类型 | 执行内容或环境 | 执行日期 | 结果 | 证据位置 |
| --- | --- | --- | --- | --- | --- |
| V-01 | 自动 | 本地聚焦测试 | 待执行 | 计划 | 待执行 |
| V-02 | 自动 | 外部 CI 引用 | 待执行 | 计划 | 待执行 |

## 验收标准

- [ ] [A-01](#acceptance-criteria) 机器证据必须对应当前测试语义。

## 验收—证据映射

| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 | 验证记录 |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 证据完整性 | D-01 | 自动 | 待执行 | 证据可复算 | V-01、V-02 |
`);
  write(root, 'openspec/changes/evidence-change/.openspec.yaml', [
    'schema: spec-driven',
    'test_plan: required',
    evidenceRequired ? 'verification_evidence: required' : '',
    '',
  ].filter((line, index, values) => line || index === values.length - 1).join('\n'));
  write(root, 'openspec/changes/evidence-change/test-plan.md', `# fixture plan

- 变更：evidence-change

## 测试用例

### TC-01：复杂订单结算

- 关联决策：D-01
- 关联验收：A-01
- 关联规格：fixture
- 状态矩阵：用户操作、错误态
- 前置条件：fixture 已建立
- 测试数据：订单数据
- 测试替身：无
- 操作：运行聚焦测试
- 可观察断言：定位命中且退出码为零
- 目标测试：\`tests/settlement.test.mjs\`
- 测试定位：\`[TC-01] 复杂订单结算\`
- 聚焦命令：\`node --test tests/settlement.test.mjs\`
- 关联验证：V-01

### TC-02：外部 CI 引用

- 关联决策：D-01
- 关联验收：A-01
- 关联规格：fixture
- 状态矩阵：用户操作、错误态
- 前置条件：fixture 已建立
- 测试数据：外部 URL
- 测试替身：无网络读取
- 操作：记录外部引用
- 可观察断言：外部引用不提升为可信通过
- 目标测试：\`tests/settlement.test.mjs\`
- 测试定位：\`[TC-02] 外部 CI 引用\`
- 聚焦命令：\`node --test tests/settlement.test.mjs\`
- 关联验证：V-02
`);
  write(root, 'outputs/evidence-fixture/stdout.log', '[TC-01] 复杂订单结算\n');
  const changePath = path.join(root, 'openspec', 'changes', 'evidence-change');
  const requirementPath = path.join(root, 'requirements', 'REQ-2026-001-evidence.md');
  return {
    root,
    changePath,
    requirementPath,
    logDescriptor: createEvidenceFileDescriptor(root, 'outputs/evidence-fixture/stdout.log', 'fixture 日志'),
    semanticBindings: Object.fromEntries(['V-01', 'V-02'].map((evidenceId) => [evidenceId, computeVerificationSemanticBinding({
      requirementPath,
      changePath,
      evidenceId,
    })])),
  };
}

export function writeManagedVerifyFixture(fixture, { completed = false } = {}) {
  const locator = '[TC-01] 受管 Verify 结果补写与语义版本兼容';
  write(fixture.root, 'tests/settlement.test.mjs', `// ${locator}\nexport const covered = true;\n`);
  write(fixture.root, 'requirements/REQ-2026-001-evidence.md', `# fixture

## 基本信息

- 状态：${completed ? '待验证' : '实施中'}

## 决策台账

| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 证据合同 | 已确认 | 受控执行与可信聚合 | fixture |

## 关联变更范围

| 变更 | 决策范围 | 验收范围 |
| --- | --- | --- |
| evidence-change | D-01 | A-01 |

## 修订记录

| 修订 | 日期 | 影响决策 | 影响验收 | 验证与任务处理 |
| --- | --- | --- | --- | --- |
| R-01 | 2026-09-10 | D-01 | A-01 | 建立 fixture。 |

## 验证记录

| 验证ID | 验证类型 | 执行内容或环境 | 执行日期 | 结果 | 证据位置 |
| --- | --- | --- | --- | --- | --- |
| V-01 | 自动 | node --test tests/settlement.test.mjs${completed ? '；命中 TC-01，共 1 项' : ''} | ${completed ? '2026-09-10' : '待执行'} | ${completed ? '通过' : '计划'} | \`openspec/changes/evidence-change/evidence/V-01.json\` |

## 验收标准

- [${completed ? 'x' : ' '}] A-01：机器证据必须对应当前测试语义。

## 验收—证据映射

| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 | 验证记录 |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 证据完整性 | D-01 | 自动 | \`openspec/changes/evidence-change/evidence/V-01.json\` | 退出成功且定位命中 | V-01 |

${completed ? '## 复验记录\n\n实际执行 1 项测试，通过 1 项，定位命中 1 次。\n' : ''}`);
  write(fixture.root, 'openspec/changes/evidence-change/test-plan.md', `# fixture plan

## 基本信息

- 状态：${completed ? '已验证' : '已实现'}
- 需求：\`requirements/REQ-2026-001-evidence.md\`
- 变更：evidence-change
- 需求修订基线：R-01
- 默认聚焦命令：\`node --test tests/settlement.test.mjs\`

## 测试上下文

- 测试命令状态：detected
- 测试命令：\`npm run test\`
- 测试运行器：Node Test Runner
- 测试目录：\`tests\`
- Git 基线：unavailable
- 兼容说明：fixture 仅验证受管证据合同。

## 测试用例

### TC-01：受管 Verify 结果补写与语义版本兼容

- 状态：${completed ? '通过' : '已实现'}
- 优先级：P0
- 验证类型：自动
- 测试层级：集成
- 关联决策：D-01
- 关联验收：A-01
- 关联规格：verification-evidence-integrity / 结果补写
- 状态矩阵：用户操作、刷新、错误态
- 前置条件：fixture 已建立
- 测试数据：验证记录与机器证据
- 测试替身：注入无 shell 执行器
- 操作：运行聚焦验证并补写完成事实
- 可观察断言：结果补写后首次 complete 通过
- 目标测试：\`tests/settlement.test.mjs\`
- 测试定位：\`${locator}\`
- 聚焦命令：\`node --test tests/settlement.test.mjs\`
- 关联验证：V-01
- 结果分类：${completed ? '通过' : '未执行'}
- 证据：${completed ? '\`openspec/changes/evidence-change/evidence/V-01.json\`' : '待执行'}

${completed ? '## 复验记录\n\n运行说明只记录完成事实，不改变测试目标。\n' : ''}`);
  return locator;
}

export function localManifest(fixture, overrides = {}) {
  const evidenceId = overrides.evidenceId || 'V-01';
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    evidenceId,
    kind: 'local-command',
    status: 'passed',
    requirement: 'requirements/REQ-2026-001-evidence.md',
    change: 'evidence-change',
    semanticBinding: fixture.semanticBindings[evidenceId] || fixture.semanticBindings['V-01'],
    command: {
      executable: process.execPath,
      args: ['--test', 'tests/settlement.test.mjs'],
      cwd: '.',
      source: 'node',
    },
    locator: '[TC-01] 复杂订单结算',
    locatorMatches: 1,
    workspaceFingerprint: computeWorkspaceFingerprint(fixture.root).digest,
    git: { available: false, commit: null, dirty: null },
    startedAt: '2026-08-18T01:00:00.000Z',
    completedAt: '2026-08-18T01:00:01.000Z',
    exitCode: 0,
    logs: [{ stream: 'stdout', ...fixture.logDescriptor }],
    artifacts: [],
    ...overrides,
  };
}
