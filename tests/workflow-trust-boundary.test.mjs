import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  atomicWriteProjectFile,
  resolveSafeProjectPath,
} from '../plugins/frontend-ai-workflow/scripts/project-path-safety.mjs';

const fixtureParent = path.resolve('.frontend-ai-workflow/runs/workflow-trust-boundary-tests');

function fixture(context) {
  fs.mkdirSync(fixtureParent, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureParent, 'case-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('受管写入拒绝项目外路径和符号链接祖先', (context) => {
  const root = fixture(context);
  assert.throws(
    () => resolveSafeProjectPath(root, '../outside.txt'),
    (error) => error.code === 'unsafe_project_path',
  );
  const outside = fixture(context);
  fs.symlinkSync(outside, path.join(root, 'linked'));
  assert.throws(
    () => atomicWriteProjectFile(root, 'linked/value.txt', 'blocked\n'),
    (error) => error.code === 'project_path_symlink',
  );
  assert.equal(fs.existsSync(path.join(outside, 'value.txt')), false);
});
