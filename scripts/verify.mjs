import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDir, '..');

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

function executeStep(step, repositoryRoot) {
  return spawnSync(process.execPath, step.args, {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      OPENSPEC_NO_UPDATE_CHECK: '1',
      OPENSPEC_TELEMETRY: '0',
    },
    stdio: 'inherit',
  });
}

export function runVerification({
  repositoryRoot = defaultRepositoryRoot,
  execute = executeStep,
  report = (message) => console.log(message),
  reportError = (message) => console.error(message),
} = {}) {
  const root = fs.realpathSync(path.resolve(repositoryRoot));
  const steps = buildVerificationSteps(root);
  const completed = [];

  for (const [index, step] of steps.entries()) {
    report(`[verify ${index + 1}/${steps.length}] ${step.label}`);
    const result = execute(step, root);
    if (result.error || result.status !== 0) {
      const reason = result.error?.message || `退出码 ${result.status ?? '未知'}`;
      reportError(`统一验证失败：${step.label}（${reason}）`);
      return { ok: false, completed, failedStep: step.id, status: result.status ?? 1 };
    }
    completed.push(step.id);
  }

  report(`统一验证通过：${completed.length} 个阶段全部完成。`);
  return { ok: true, completed, failedStep: null, status: 0 };
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
