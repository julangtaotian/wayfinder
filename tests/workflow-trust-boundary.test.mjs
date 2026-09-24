import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  atomicWriteProjectFile,
  resolveSafeProjectPath,
} from '../plugins/frontend-ai-workflow/scripts/project-path-safety.mjs';
import { buildVerificationEnvironment, buildVerificationSteps } from '../scripts/verify.mjs';

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

test('统一验证不再包含独立生命周期入口并保持子进程隔离', (context) => {
  const root = fixture(context);
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  for (const name of [
    'ordinary.test.mjs',
    'platform-marketplace-install.test.mjs',
    'platform-package-runtime.test.mjs',
    'project-platform-profile.test.mjs',
    'ui-review-automation.test.mjs',
    'ui-review-platform-runtime.test.mjs',
    'workflow-trust-boundary.test.mjs',
  ]) {
    fs.writeFileSync(path.join(root, 'tests', name), 'export {};\n');
  }
  const steps = buildVerificationSteps(root, { scope: 'shared' });
  assert.deepEqual(steps.map((step) => step.id), [
    'static', 'footprint', 'tests', 'structure', 'openspec', 'runtime-version', 'runtime-integrity',
  ]);
  assert.equal(steps.some((step) => step.args.some((value) => value.endsWith('lifecycle-audit.mjs'))), false);

  const environment = buildVerificationEnvironment(path.join(root, 'tmp'), {
    PATH: '/fixture/bin',
    GIT_CEILING_DIRECTORIES: '/parent',
  });
  assert.equal(environment.TMPDIR, path.join(root, 'tmp'));
  assert.equal(environment.GIT_CEILING_DIRECTORIES.split(path.delimiter).includes('/parent'), true);
  assert.equal(environment.OPENSPEC_NO_UPDATE_CHECK, '1');
});
