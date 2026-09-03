import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  OFFICIAL_VALIDATOR_SUCCESS_CONCLUSION,
  cleanupOfficialValidatorCache,
  normalizeRepositoryTarget,
  officialValidatorError,
  runOfficialValidatorPreflight,
} from '../scripts/official-validator-preflight.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureParent = path.join(repositoryRoot, 'outputs', 'official-validator-preflight-tests');
const fakeArchiveFilename = 'PyYAML-1.2.3-cp310-test.whl';
const fakeArchiveSha256 = 'a'.repeat(64);
const fakeDependencyLock = {
  schemaVersion: 1,
  package: 'PyYAML',
  version: '1.2.3',
  archives: { [fakeArchiveFilename]: fakeArchiveSha256 },
};

function write(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

function createFixture(t, { skills = ['zeta-skill', 'alpha-skill'] } = {}) {
  fs.mkdirSync(fixtureParent, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureParent, 'case-'));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    if (fs.existsSync(fixtureParent) && fs.readdirSync(fixtureParent).length === 0) {
      fs.rmdirSync(fixtureParent);
    }
  });
  write(root, 'package.json', '{"name":"official-validator-preflight-fixture","private":true}\n');
  for (const skill of skills) write(root, `plugins/frontend-ai-workflow/skills/${skill}/SKILL.md`, `---\nname: ${skill}\ndescription: fixture\n---\n`);
  write(root, 'plugins/frontend-ai-workflow/.codex-plugin/plugin.json', '{"name":"fixture"}\n');
  const skillValidator = write(root, 'creator/skill/quick_validate.py', '# skill validator fixture\n');
  const pluginValidator = write(root, 'creator/plugin/validate_plugin.py', '# plugin validator fixture\n');
  const preservedOutput = write(root, 'outputs/preserve.txt', 'keep\n');
  return { root, skillValidator, pluginValidator, preservedOutput };
}

function createDependencyPreparer(counter) {
  return ({ stagingRoot }) => {
    counter.count += 1;
    write(stagingRoot, 'yaml/__init__.py', '__version__ = "1.2.3"\n');
    write(stagingRoot, 'PyYAML-1.2.3.dist-info/METADATA', 'Name: PyYAML\nVersion: 1.2.3\n');
    return { archiveFilename: fakeArchiveFilename, archiveSha256: fakeArchiveSha256 };
  };
}

function createExecutor({ failTarget = null, startFailure = false, pythonUnavailable = false } = {}) {
  const calls = [];
  const execute = (command, args, options) => {
    calls.push({ command, args: [...args], options: { ...options } });
    if (args.includes('-c')) {
      if (pythonUnavailable) return { status: null, error: new Error('python unavailable'), stdout: '', stderr: '' };
      return {
        status: 0,
        stdout: '{"version":"3.10.11","implementation":"cpython","platform":"test","machine":"arm64"}\n',
        stderr: '',
      };
    }
    if (args.includes('--inspect')) return { status: 0, stdout: '{"version":"1.2.3"}\n', stderr: '' };
    const runIndex = args.indexOf('--run');
    if (runIndex >= 0) {
      if (startFailure) return { status: null, error: new Error('spawn failed'), stdout: '', stderr: '' };
      const target = args[runIndex + 3];
      if (failTarget && target.includes(failTarget)) {
        return { status: 7, stdout: 'official stdout\n', stderr: 'official stderr\n' };
      }
      return { status: 0, stdout: `validated ${target}\n`, stderr: '' };
    }
    throw new Error(`测试执行器收到未预期参数：${args.join(' ')}`);
  };
  return { calls, execute };
}

function runFixture(fixture, overrides = {}) {
  return runOfficialValidatorPreflight({
    repositoryRoot: fixture.root,
    skillValidatorPath: fixture.skillValidator,
    pluginValidatorPath: fixture.pluginValidator,
    pythonPath: 'python-fixture',
    dependencyLock: fakeDependencyLock,
    ...overrides,
  });
}

test('[TC-01] 官方预检复用缓存并执行全部目标', (t) => {
  const fixture = createFixture(t);
  const prepareCounter = { count: 0 };
  const firstExecutor = createExecutor();
  const first = runFixture(fixture, {
    execute: firstExecutor.execute,
    prepareDependency: createDependencyPreparer(prepareCounter),
    runId: 'first',
  });

  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.cacheStatus, 'created');
  assert.equal(first.skillCount, 2);
  assert.deepEqual(first.results.map((item) => item.target), [
    'plugins/frontend-ai-workflow/skills/alpha-skill',
    'plugins/frontend-ai-workflow/skills/zeta-skill',
    'plugins/frontend-ai-workflow',
  ]);
  assert.deepEqual(first.results.map((item) => item.validator), ['skill', 'skill', 'plugin']);
  assert.equal(first.validators.skill.sha256.length, 64);
  assert.equal(first.validators.plugin.sha256.length, 64);
  assert.deepEqual(first.validatorSha256, {
    skill: first.validators.skill.sha256,
    plugin: first.validators.plugin.sha256,
  });
  assert.equal(first.conclusion, OFFICIAL_VALIDATOR_SUCCESS_CONCLUSION);
  assert.equal(fs.existsSync(path.join(fixture.root, 'outputs', 'official-validator-runtime')), false);
  assert.equal(fs.existsSync(path.join(fixture.root, 'outputs', 'official-validator-cache')), true);
  assert.equal(fs.readFileSync(fixture.preservedOutput, 'utf8'), 'keep\n');
  assert.ok(firstExecutor.calls.every((call) => call.options.shell === false));

  const secondExecutor = createExecutor();
  const second = runFixture(fixture, {
    execute: secondExecutor.execute,
    prepareDependency: createDependencyPreparer(prepareCounter),
    runId: 'second',
  });
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal(second.cacheStatus, 'reused');
  assert.equal(prepareCounter.count, 1, '暖缓存不得重复准备依赖');
  assert.deepEqual(second.results.map((item) => item.target), first.results.map((item) => item.target));

  const cleaned = cleanupOfficialValidatorCache({ repositoryRoot: fixture.root });
  assert.equal(cleaned.status, 'cleaned');
  assert.equal(fs.existsSync(path.join(fixture.root, 'outputs', 'official-validator-cache')), false);
  assert.equal(fs.readFileSync(fixture.preservedOutput, 'utf8'), 'keep\n');
});

test('[TC-02] 官方预检失败关闭并保留真实诊断', (t) => {
  const fixture = createFixture(t, { skills: ['bad-skill'] });
  const prepareCounter = { count: 0 };
  const prepareDependency = createDependencyPreparer(prepareCounter);

  const missingValidator = runFixture(fixture, {
    skillValidatorPath: path.join(fixture.root, 'missing-validator.py'),
    execute: createExecutor().execute,
    prepareDependency,
    runId: 'missing-validator',
  });
  assert.equal(missingValidator.code, 'official_validator_unavailable');
  assert.equal(missingValidator.validator, 'skill');

  const missingPython = runFixture(fixture, {
    execute: createExecutor({ pythonUnavailable: true }).execute,
    prepareDependency,
    runId: 'missing-python',
  });
  assert.equal(missingPython.code, 'official_validator_unavailable');
  assert.equal(missingPython.validator, 'python');

  const dependencyFailure = runFixture(fixture, {
    execute: createExecutor().execute,
    prepareDependency: () => {
      throw officialValidatorError(
        'official_validator_dependency_unavailable',
        'dependency unavailable',
        { validator: 'dependency', stderr: 'network unavailable' },
      );
    },
    runId: 'dependency-failure',
  });
  assert.equal(dependencyFailure.code, 'official_validator_dependency_unavailable');
  assert.equal(dependencyFailure.stderr, 'network unavailable');

  const startFailure = runFixture(fixture, {
    execute: createExecutor({ startFailure: true }).execute,
    prepareDependency,
    runId: 'start-failure',
  });
  assert.equal(startFailure.code, 'official_validator_start_failed');
  assert.equal(startFailure.target, 'plugins/frontend-ai-workflow/skills/bad-skill');

  const contentExecutor = createExecutor({ failTarget: 'bad-skill' });
  const contentFailure = runFixture(fixture, {
    execute: contentExecutor.execute,
    prepareDependency,
    runId: 'content-failure',
  });
  assert.equal(contentFailure.code, 'official_validator_validation_failed');
  assert.equal(contentFailure.validator, 'skill');
  assert.equal(contentFailure.target, 'plugins/frontend-ai-workflow/skills/bad-skill');
  assert.equal(contentFailure.exitCode, 7);
  assert.equal(contentFailure.stdout, 'official stdout\n');
  assert.equal(contentFailure.stderr, 'official stderr\n');
  assert.ok(contentExecutor.calls.every((call) => call.options.shell === false));

  assert.equal(
    normalizeRepositoryTarget('D:\\workspace', 'D:/workspace/plugins/frontend-ai-workflow', path.win32),
    'plugins/frontend-ai-workflow',
  );
  assert.equal(
    normalizeRepositoryTarget('/workspace/', '/workspace/plugins/frontend-ai-workflow', path.posix),
    'plugins/frontend-ai-workflow',
  );
  assert.throws(
    () => normalizeRepositoryTarget('D:\\workspace', 'E:\\outside', path.win32),
    (error) => error.code === 'official_validator_unavailable',
  );
  assert.equal(fs.existsSync(path.join(fixture.root, 'outputs', 'official-validator-runtime')), false);
  assert.equal(fs.readFileSync(fixture.preservedOutput, 'utf8'), 'keep\n');
});

test('[TC-03] 普通门禁和 CI 保持不变', (t) => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts.validate, 'node plugins/frontend-ai-workflow/scripts/validate-structure.mjs');
  assert.equal(packageJson.scripts.verify, 'node scripts/verify.mjs');
  assert.equal(packageJson.scripts['validate:official'], 'node scripts/official-validator-preflight.mjs');
  assert.equal(packageJson.scripts['cleanup:official-validator-cache'], 'node scripts/official-validator-preflight.mjs --cleanup-cache');

  const ci = fs.readFileSync(path.join(repositoryRoot, '.github', 'workflows', 'validate.yml'), 'utf8');
  assert.doesNotMatch(ci, /validate:official|official-validator-preflight/u);
  assert.equal(
    fs.existsSync(path.join(repositoryRoot, 'plugins', 'frontend-ai-workflow', 'scripts', 'official-validator-preflight.mjs')),
    false,
    '仓库预检脚本不得进入插件目录',
  );

  const fixture = createFixture(t);
  const output = runFixture(fixture, {
    execute: createExecutor().execute,
    prepareDependency: createDependencyPreparer({ count: 0 }),
    runId: 'boundary',
  });
  assert.equal(output.ok, true, JSON.stringify(output));
  assert.equal(output.conclusion, '当前本地 Creator validators 预检通过');
  assert.match(output.boundary, /不代表最新上游规则、行为质量或公共目录最终审核/u);
});
