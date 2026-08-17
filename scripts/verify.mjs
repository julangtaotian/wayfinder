import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareFrontendTestRuntime } from './prepare-frontend-test-runtime.mjs';
import { cleanupFrontendTestRuntime } from './cleanup-frontend-test-runtime.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDir, '..');

function resolveVerificationRuntime(repositoryRoot) {
  const outputsRoot = path.join(repositoryRoot, 'outputs');
  const runtimeRoot = path.join(outputsRoot, 'verify-runtime');
  const relativeRuntime = path.relative(outputsRoot, runtimeRoot);
  if (!relativeRuntime || relativeRuntime.startsWith('..') || path.isAbsolute(relativeRuntime)) {
    throw new Error(`验证临时目录必须位于 outputs 内：${runtimeRoot}`);
  }
  return { runtimeRoot, tempRoot: path.join(runtimeRoot, 'tmp') };
}

function discoverTests(repositoryRoot) {
  const testsRoot = path.join(repositoryRoot, 'tests');
  return fs.readdirSync(testsRoot)
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => path.join('tests', name));
}

export function buildVerificationSteps(repositoryRoot = defaultRepositoryRoot) {
  const pluginScripts = path.join(repositoryRoot, 'plugins', 'frontend-ai-workflow', 'scripts');
  return [
    {
      id: 'tests',
      label: '自动测试',
      args: ['--test', ...discoverTests(repositoryRoot)],
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
  execute = executeStep,
  environment = process.env,
  prepareRuntime = (root) => prepareFrontendTestRuntime({ repositoryRoot: root, environment }),
  cleanupRuntime = (root) => cleanupFrontendTestRuntime({ repositoryRoot: root }),
  report = (message) => console.log(message),
  reportError = (message) => console.error(message),
} = {}) {
  const root = fs.realpathSync(path.resolve(repositoryRoot));
  const steps = buildVerificationSteps(root);
  const completed = [];
  const { runtimeRoot, tempRoot } = resolveVerificationRuntime(root);
  const inheritedTempRoots = [environment.TMPDIR, environment.TMP, environment.TEMP]
    .filter(Boolean)
    .map((item) => path.resolve(item));
  const ownsRuntime = !inheritedTempRoots.includes(path.resolve(tempRoot));
  fs.mkdirSync(tempRoot, { recursive: true });

  try {
    if (ownsRuntime) prepareRuntime(root);
    for (const [index, step] of steps.entries()) {
      report(`[verify ${index + 1}/${steps.length}] ${step.label}`);
      const result = execute(step, root, tempRoot, environment);
      if (result.error || result.status !== 0) {
        const reason = result.error?.message || `退出码 ${result.status ?? '未知'}`;
        reportError(`统一验证失败：${step.label}（${reason}）`);
        return { ok: false, completed, failedStep: step.id, status: result.status ?? 1 };
      }
      completed.push(step.id);
    }

    report(`统一验证通过：${completed.length} 个阶段全部完成。`);
    return { ok: true, completed, failedStep: null, status: 0 };
  } finally {
    // 只有最外层验证负责回收，避免嵌套验证删除仍在使用的共享临时目录。
    if (ownsRuntime) {
      try {
        cleanupRuntime(root);
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
    const result = runVerification();
    process.exitCode = result.status;
  } catch (error) {
    console.error(`统一验证无法启动：${error.message}`);
    process.exitCode = 1;
  }
}
