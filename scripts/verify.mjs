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
  const outputsRoot = path.join(repositoryRoot, '.frontend-ai-workflow', 'runs');
  const runtimeRoot = path.join(outputsRoot, 'verify-runtime');
  const relativeRuntime = path.relative(outputsRoot, runtimeRoot);
  if (!relativeRuntime || relativeRuntime.startsWith('..') || path.isAbsolute(relativeRuntime)) {
    throw new Error(`验证临时目录必须位于受管 runs 内：${runtimeRoot}`);
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
  let offline = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--offline') {
      if (offline) {
        throw verificationArgumentError('verification_offline_duplicate', '参数 --offline 只能出现一次');
      }
      offline = true;
      continue;
    }
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
  return offline ? { scope, offline: true } : { scope };
}

function lifecycleMode(repositoryRoot) {
  const configPath = path.join(repositoryRoot, '.frontend-workflow.json');
  if (!fs.existsSync(configPath)) return 'legacy-readonly';
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')).lifecycleMode || 'legacy-readonly';
  } catch {
    return 'invalid';
  }
}

export function buildVerificationSteps(repositoryRoot = defaultRepositoryRoot, { scope = 'all', requireLifecycleBase = false } = {}) {
  const selectedScope = resolveVerificationScope(scope);
  const pluginScripts = path.join(repositoryRoot, 'plugins', 'frontend-ai-workflow', 'scripts');
  const testCommand = buildTestCommand({ root: repositoryRoot, group: selectedScope });
  const steps = [
    {
      id: 'static',
      label: 'JavaScript 静态语法',
      args: [path.join(repositoryRoot, 'scripts', 'static-check.mjs')],
    },
    {
      id: 'footprint',
      label: '仓库体积与生命周期预算',
      args: [path.join(pluginScripts, 'repository-footprint.mjs'), '--target', repositoryRoot],
    },
    {
      id: 'lifecycle',
      label: '生命周期格式与追加历史',
      args: [
        path.join(pluginScripts, 'lifecycle-audit.mjs'),
        '--target', repositoryRoot,
        ...(requireLifecycleBase ? ['--require-base'] : []),
      ],
    },
    {
      id: 'tests',
      label: '自动测试',
      args: testCommand.args,
    },
    {
      id: 'structure',
      label: '插件与技能结构',
      args: [
        path.join(pluginScripts, 'validate-structure.mjs'),
        ...(selectedScope === 'shared' ? ['--scope', 'shared'] : []),
      ],
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
  const lifecycleAwareSteps = lifecycleMode(repositoryRoot) === 'v2'
    ? steps.filter((step) => step.id !== 'openspec-archived')
    : steps;
  if (selectedScope !== 'platform') {
    // 规范源码不再携带平台二进制；真实完整性与 Chromium 冒烟只在平台成品作用域执行。
    return lifecycleAwareSteps.filter((step) => !['playwright-integrity', 'playwright-smoke'].includes(step.id));
  }
  if (selectedScope === 'platform') {
    return lifecycleAwareSteps.filter((step) => ['tests', 'playwright-integrity', 'playwright-smoke'].includes(step.id));
  }
  return lifecycleAwareSteps;
}

export function buildVerificationEnvironment(tempRoot, environment = process.env) {
  const inheritedCeilings = environment.GIT_CEILING_DIRECTORIES;
  return {
    ...environment,
    TMPDIR: tempRoot,
    TMP: tempRoot,
    TEMP: tempRoot,
    // 测试 fixture 位于仓库受管运行目录时，不得向上继承主仓库的 Git 忽略规则。
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
  offline = false,
  execute = executeStep,
  environment = process.env,
  prepareRuntime = (root, options) => prepareFrontendTestRuntime({ repositoryRoot: root, environment, ...options }),
  cleanupRuntime = (root) => cleanupFrontendTestRuntime({ repositoryRoot: root }),
  report = (message) => console.log(message),
  reportError = (message) => console.error(message),
} = {}) {
  const root = fs.realpathSync(path.resolve(repositoryRoot));
  const selectedScope = resolveVerificationScope(scope);
  const requireLifecycleBase = environment.LIFECYCLE_REQUIRE_BASE === '1';
  const steps = buildVerificationSteps(root, { scope: selectedScope, requireLifecycleBase });
  const completed = [];
  const { runtimeRoot, tempRoot } = resolveVerificationRuntime(root);
  const inheritedTempRoots = [environment.TMPDIR, environment.TMP, environment.TEMP]
    .filter(Boolean)
    .map((item) => path.resolve(item));
  const ownsRuntime = !inheritedTempRoots.includes(path.resolve(tempRoot));
  const managesFrontendTestRuntime = ownsRuntime && selectedScope !== 'platform';
  fs.mkdirSync(tempRoot, { recursive: true });

  try {
    if (managesFrontendTestRuntime) prepareRuntime(root, { offline });
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
          ...(offline ? { offline: true } : {}),
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
      ...(offline ? { offline: true } : {}),
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
