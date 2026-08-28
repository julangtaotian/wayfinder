import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareFrontendTestRuntime } from './prepare-frontend-test-runtime.mjs';
import { cleanupFrontendTestRuntime } from './cleanup-frontend-test-runtime.mjs';
import { buildTestCommand } from './test-groups.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDir, '..');
const VERIFICATION_SCOPES = new Set(['all', 'shared', 'platform']);

function resolveVerificationRuntime(repositoryRoot) {
  const outputsRoot = path.join(repositoryRoot, 'outputs');
  const runtimeRoot = path.join(outputsRoot, 'verify-runtime');
  const relativeRuntime = path.relative(outputsRoot, runtimeRoot);
  if (!relativeRuntime || relativeRuntime.startsWith('..') || path.isAbsolute(relativeRuntime)) {
    throw new Error(`验证临时目录必须位于 outputs 内：${runtimeRoot}`);
  }
  return { runtimeRoot, tempRoot: path.join(runtimeRoot, 'tmp') };
}

function verificationArgumentError(code, message, { scope = null } = {}) {
  const error = new Error(message);
  error.code = code;
  error.scope = scope;
  error.status = 1;
  return error;
}

function resolveVerificationScope(scope = 'all') {
  if (!VERIFICATION_SCOPES.has(scope)) {
    throw verificationArgumentError('unknown_verification_scope', `未知验证作用域：${scope}`, { scope });
  }
  return scope;
}

export function parseVerificationArgs(argv = []) {
  let scope = 'all';
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value !== '--scope') {
      throw verificationArgumentError('unknown_verification_argument', `不支持的验证参数：${value}`);
    }
    const requested = argv[index + 1];
    if (!requested || requested.startsWith('--')) {
      throw verificationArgumentError('verification_scope_missing', '参数 --scope 缺少值');
    }
    scope = resolveVerificationScope(requested);
    index += 1;
  }
  return { scope };
}

export function buildVerificationSteps(repositoryRoot = defaultRepositoryRoot, { scope = 'all' } = {}) {
  const selectedScope = resolveVerificationScope(scope);
  const pluginScripts = path.join(repositoryRoot, 'plugins', 'frontend-ai-workflow', 'scripts');
  const testCommand = buildTestCommand({ root: repositoryRoot, group: selectedScope });
  const steps = [
    {
      id: 'footprint',
      label: '仓库体积与生命周期预算',
      args: [path.join(pluginScripts, 'repository-footprint.mjs'), '--target', repositoryRoot],
    },
    {
      id: 'tests',
      label: '自动测试',
      args: testCommand.args,
    },
    {
      id: 'structure',
      label: '插件与技能结构',
      args: [path.join(pluginScripts, 'validate-structure.mjs')],
    },
    {
      id: 'openspec',
      label: 'OpenSpec 全量严格校验',
      args: [
        path.join(pluginScripts, 'openspec-cli.mjs'),
        'validate',
        '--all',
        '--strict',
        '--no-interactive',
      ],
    },
    {
      id: 'openspec-archived',
      label: 'OpenSpec 归档任务校验',
      args: [
        path.join(pluginScripts, 'openspec-cli.mjs'),
        'validate',
        '--archived',
        '--no-interactive',
      ],
    },
    {
      id: 'runtime-version',
      label: 'OpenSpec 运行时版本',
      args: [path.join(pluginScripts, 'openspec-cli.mjs'), '--version'],
    },
    {
      id: 'runtime-integrity',
      label: 'OpenSpec 运行时完整性',
      args: [path.join(pluginScripts, 'runtime-integrity.mjs'), '--check'],
    },
    {
      id: 'playwright-integrity',
      label: 'Playwright 运行时完整性',
      args: [path.join(pluginScripts, 'playwright-runtime.mjs'), '--check'],
    },
    {
      id: 'playwright-smoke',
      label: 'Playwright 浏览器启动',
      args: [path.join(pluginScripts, 'playwright-runtime.mjs'), '--smoke'],
    },
  ];
  if (selectedScope === 'shared') {
    return steps.filter((step) => !['playwright-integrity', 'playwright-smoke'].includes(step.id));
  }
  if (selectedScope === 'platform') {
    return steps.filter((step) => ['tests', 'playwright-integrity', 'playwright-smoke'].includes(step.id));
  }
  return steps;
}

export function buildVerificationEnvironment(tempRoot, environment = process.env) {
  const inheritedCeilings = environment.GIT_CEILING_DIRECTORIES;
  return {
    ...environment,
    TMPDIR: tempRoot,
    TMP: tempRoot,
    TEMP: tempRoot,
    // 测试 fixture 位于仓库 outputs 内时，不得向上继承主仓库的 Git 忽略规则。
    GIT_CEILING_DIRECTORIES: [tempRoot, inheritedCeilings].filter(Boolean).join(path.delimiter),
    OPENSPEC_NO_UPDATE_CHECK: '1',
    OPENSPEC_TELEMETRY: '0',
  };
}

function executeStep(step, repositoryRoot, tempRoot, environment) {
  return spawnSync(process.execPath, step.args, {
    cwd: repositoryRoot,
    env: buildVerificationEnvironment(tempRoot, environment),
    stdio: 'inherit',
  });
}

export function runVerification({
  repositoryRoot = defaultRepositoryRoot,
  scope = 'all',
  execute = executeStep,
  environment = process.env,
  prepareRuntime = (root) => prepareFrontendTestRuntime({ repositoryRoot: root, environment }),
  cleanupRuntime = (root) => cleanupFrontendTestRuntime({ repositoryRoot: root }),
  report = (message) => console.log(message),
  reportError = (message) => console.error(message),
} = {}) {
  const root = fs.realpathSync(path.resolve(repositoryRoot));
  const selectedScope = resolveVerificationScope(scope);
  const steps = buildVerificationSteps(root, { scope: selectedScope });
  const completed = [];
  const { runtimeRoot, tempRoot } = resolveVerificationRuntime(root);
  const inheritedTempRoots = [environment.TMPDIR, environment.TMP, environment.TEMP]
    .filter(Boolean)
    .map((item) => path.resolve(item));
  const ownsRuntime = !inheritedTempRoots.includes(path.resolve(tempRoot));
  const managesFrontendTestRuntime = ownsRuntime && selectedScope !== 'platform';
  fs.mkdirSync(tempRoot, { recursive: true });

  try {
    if (managesFrontendTestRuntime) prepareRuntime(root);
    for (const [index, step] of steps.entries()) {
      report(`[verify ${index + 1}/${steps.length}] ${step.label}`);
      const result = execute(step, root, tempRoot, environment);
      if (result.error || result.status !== 0) {
        const reason = result.error?.message || `退出码 ${result.status ?? '未知'}`;
        reportError(`统一验证失败：${step.label}（${reason}）`);
        return {
          ok: false,
          code: 'verification_step_failed',
          scope: selectedScope,
          completed,
          failedStep: step.id,
          status: result.status ?? 1,
        };
      }
      completed.push(step.id);
    }

    report(`统一验证通过：${completed.length} 个阶段全部完成。`);
    return {
      ok: true,
      code: 'verification_passed',
      scope: selectedScope,
      completed,
      failedStep: null,
      status: 0,
    };
  } finally {
    // 只有最外层验证负责回收，避免嵌套验证删除仍在使用的共享临时目录。
    if (ownsRuntime) {
      try {
        if (managesFrontendTestRuntime) cleanupRuntime(root);
      } finally {
        fs.rmSync(runtimeRoot, { recursive: true, force: true });
      }
    }
  }
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const result = runVerification(parseVerificationArgs(process.argv.slice(2)));
    process.exitCode = result.status;
  } catch (error) {
    console.error(`${error.code || 'verification_start_failed'}：统一验证无法启动：${error.message}`);
    process.exitCode = error.status || 1;
  }
}
