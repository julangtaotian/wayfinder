import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  buildTestCommand,
  discoverTestFiles,
  TEST_GROUPS,
} from '../scripts/test-groups.mjs';

test('[V-05] 聚焦入口与核心脚本兼容合同：三个入口真实发现', () => {
  for (const group of ['repository', 'workflow', 'platform']) {
    const files = discoverTestFiles(path.resolve('.'), TEST_GROUPS[group]);
    assert.equal(files.length > 0, true, `${group} 未发现测试`);
    assert.equal(files.every((file) => fs.existsSync(path.resolve(file))), true);
    const command = buildTestCommand({ root: path.resolve('.'), group });
    assert.deepEqual(command.args.slice(0, 1), ['--test']);
    assert.deepEqual(command.args.slice(1), files);
  }

  const all = discoverTestFiles(path.resolve('.'), TEST_GROUPS.all);
  assert.equal(all.includes('tests/test-entrypoints.test.mjs'), true);
  assert.equal(all.includes('tests/repository-footprint.test.mjs'), true);
});

test('聚焦测试零发现时返回稳定错误', (context) => {
  const root = fs.mkdtempSync(path.join(path.resolve('outputs'), 'test-groups-empty-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  assert.throws(
    () => discoverTestFiles(root, ['tests/missing*.test.mjs']),
    (error) => error.code === 'test_group_empty',
  );
});
