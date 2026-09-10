import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildVerificationSteps, runVerification } from '../scripts/verify.mjs';
import {
  discoverStaticCheckFiles,
  runStaticCheck,
  STATIC_CHECK_ROOTS,
} from '../scripts/static-check.mjs';

const repositoryRoot = path.resolve('.');
const fixtureRoot = path.join(repositoryRoot, 'outputs', 'static-check-tests');

function makeFixture(context, name) {
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureRoot, `${name}-`));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

test('[TC-02] 最小静态检查保持固定范围与稳定诊断', (context) => {
  const root = makeFixture(context, 'scope');
  write(root, 'tests/含 空格/second.mjs', 'export const second = 2;\n');
  write(root, 'scripts/first.js', 'export const first = 1;\n');
  write(root, 'plugins/frontend-ai-workflow/scripts/third.cjs', 'module.exports = 3;\n');
  write(root, 'outputs/ignored.mjs', 'const = invalid;\n');
  write(root, 'dist/ignored.js', 'const = invalid;\n');
  write(root, 'plugins/frontend-ai-workflow/runtime/ignored.mjs', 'const = invalid;\n');
  write(root, 'tests/ignored.txt', 'const = invalid;\n');

  const files = discoverStaticCheckFiles(root);
  assert.deepEqual(STATIC_CHECK_ROOTS, ['scripts', 'tests', 'plugins/frontend-ai-workflow/scripts']);
  assert.deepEqual(files, [
    'plugins/frontend-ai-workflow/scripts/third.cjs',
    'scripts/first.js',
    'tests/含 空格/second.mjs',
  ]);

  const calls = [];
  const injected = runStaticCheck({
    repositoryRoot: root,
    execute(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0, stdout: '', stderr: '' };
    },
  });
  assert.equal(injected.code, 'static_check_passed');
  assert.equal(injected.checkedFiles, 3);
  assert.equal(calls.every((call) => call.command === process.execPath), true);
  assert.equal(calls.every((call) => call.args[0] === '--check' && call.options.shell === false), true);
  assert.deepEqual(calls.map((call) => path.relative(root, call.args[1]).replaceAll('\\', '/')), files);
  assert.equal(runStaticCheck({ repositoryRoot: root }).ok, true);

  write(root, 'tests/含 空格/second.mjs', 'export const = 2;\n');
  const failed = runStaticCheck({ repositoryRoot: root });
  assert.equal(failed.code, 'static_check_syntax_failed');
  assert.equal(failed.status > 0, true);
  assert.equal(failed.target, 'tests/含 空格/second.mjs');
  assert.equal(failed.diagnostic.includes(root), false);
  assert.match(failed.diagnostic, /SyntaxError/u);

  const empty = makeFixture(context, 'empty');
  assert.deepEqual(runStaticCheck({ repositoryRoot: empty }), {
    ok: false,
    code: 'static_check_empty',
    status: 1,
    checkedFiles: 0,
    target: null,
    diagnostic: '静态检查没有发现任何 JavaScript 文件。',
  });
});

test('[TC-03] 静态检查进入统一验证并在失败时停止', () => {
  const steps = buildVerificationSteps(repositoryRoot, { scope: 'shared' });
  assert.equal(steps[0].id, 'static');
  assert.equal(steps[1].id, 'footprint');
  assert.deepEqual(steps[0].args, [path.join(repositoryRoot, 'scripts', 'static-check.mjs')]);

  const executed = [];
  const result = runVerification({
    repositoryRoot,
    scope: 'shared',
    prepareRuntime: () => {},
    cleanupRuntime: () => {},
    report: () => {},
    reportError: () => {},
    execute(step) {
      executed.push(step.id);
      return { status: step.id === 'static' ? 2 : 0 };
    },
  });
  assert.equal(result.code, 'verification_step_failed');
  assert.equal(result.failedStep, 'static');
  assert.deepEqual(executed, ['static']);

  const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['check:static'], 'node scripts/static-check.mjs');
});
