import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { compileStageContext } from '../plugins/frontend-ai-workflow/scripts/stage-context.mjs';

const fixtureParent = path.resolve('.frontend-ai-workflow/runs/stage-context-tests');

function write(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

test('阶段上下文有界且不落盘', (context) => {
  fs.mkdirSync(fixtureParent, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureParent, 'case-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'requirements/REQ-2026-001-demo.md', `# demo

## 基本信息
- 状态：实施中

## 决策台账
| ID | 决策项 | 状态 | 取值 | 来源 |
| --- | --- | --- | --- | --- |
| D-01 | 决策 | 已确认 | 开启 | 用户 |

## 验证记录
| 验证ID | 验证类型 | 执行内容或环境 | 执行日期 | 结果 | 证据位置 |
| --- | --- | --- | --- | --- | --- |
| V-01 | 自动 | focused | 2026-09-11 | 计划 | evidence.json |

## 验收标准
- [ ] [A-01] 验收

## 验收—证据映射
| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 |
| --- | --- | --- | --- | --- | --- |
| A-01 | 验收 | D-01 | 自动 | evidence.json | 计划 |
`);
  write(root, 'openspec/changes/demo/tasks.md', '- [x] 完成一项\n- [ ] 待完成行为\n');
  write(root, 'openspec/changes/demo/specs/demo/spec.md', '## ADDED Requirements\n\n### Requirement: 示例行为\n');
  const before = [...fs.readdirSync(path.join(root, 'openspec/changes/demo'))].sort();
  const result = compileStageContext({
    root,
    requirement: 'requirements/REQ-2026-001-demo.md',
    change: 'openspec/changes/demo',
    stage: 'complete',
    diagnostics: [{ code: 'one' }, { code: 'two' }],
    limit: 1,
  });
  assert.equal(result.facts.taskCounts.remaining, 1);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.nextOffset, 1);
  assert.deepEqual([...fs.readdirSync(path.join(root, 'openspec/changes/demo'))].sort(), before);
  assert.throws(() => compileStageContext({ root, stage: 'unknown' }), /stage/u);
});
