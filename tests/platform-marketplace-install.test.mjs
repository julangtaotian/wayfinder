import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  CODEX_INSTALL_EVIDENCE_CLI_VERSION,
  compactInstallStageName,
  verifyPlatformMarketplaceInstall,
} from '../plugins/frontend-ai-workflow/scripts/verify-platform-marketplace-install.mjs';
import { browserExecutableForLaunch } from '../plugins/frontend-ai-workflow/scripts/playwright-runtime.mjs';

const NATIVE_PLATFORM_KEY = `${process.platform}-${process.arch}`;

function createMarketplaceFixture(context) {
  fs.mkdirSync(path.resolve('outputs'), { recursive: true });
  const repositoryRoot = fs.mkdtempSync(path.resolve('outputs', 'platform-install-fixture-'));
  context.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));
  const marketplaceName = `frontend-ai-workflow-${NATIVE_PLATFORM_KEY}`;
  const marketplaceRoot = path.join(repositoryRoot, 'dist', marketplaceName);
  const pluginRoot = path.join(marketplaceRoot, 'plugins', 'frontend-ai-workflow');
  fs.mkdirSync(path.join(marketplaceRoot, '.agents', 'plugins'), { recursive: true });
  fs.mkdirSync(path.join(pluginRoot, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(pluginRoot, 'skills', 'frontend-ui-review'), { recursive: true });
  fs.mkdirSync(path.join(pluginRoot, 'runtime', 'playwright'), { recursive: true });
  fs.writeFileSync(path.join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json'), `${JSON.stringify({
    name: marketplaceName,
    plugins: [{
      name: 'frontend-ai-workflow',
      source: { source: 'local', path: './plugins/frontend-ai-workflow' },
    }],
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), `${JSON.stringify({
    name: 'frontend-ai-workflow',
    version: '0.18.0+codex.fixture',
    skills: './skills/',
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(pluginRoot, 'skills', 'frontend-ui-review', 'SKILL.md'), '# UI Review\n');
  fs.writeFileSync(path.join(marketplaceRoot, 'package-report.json'), `${JSON.stringify({
    schemaVersion: 1,
    platformKey: NATIVE_PLATFORM_KEY,
    smoke: { ok: true, skipped: false, platformKey: NATIVE_PLATFORM_KEY, screenshotBytes: 256 },
  }, null, 2)}\n`);
  return {
    repositoryRoot,
    marketplaceRoot,
    marketplaceName,
    outputPath: path.join(repositoryRoot, 'outputs', 'platform-install-evidence', `${NATIVE_PLATFORM_KEY}.json`),
  };
}

function createCodexFixtureExecutor(fixture, calls) {
  const { marketplaceName, marketplaceRoot } = fixture;
  const pluginId = `frontend-ai-workflow@${marketplaceName}`;
  return (_command, args, options) => {
    calls.push({ args, env: options.env });
    const commandArgs = args.slice(1);
    if (commandArgs[0] === '--version') {
      return { status: 0, stdout: `codex-cli ${CODEX_INSTALL_EVIDENCE_CLI_VERSION}\n`, stderr: '' };
    }
    if (commandArgs.join(' ').startsWith('plugin marketplace add')) {
      return {
        status: 0,
        stdout: `${JSON.stringify({
          marketplaceName,
          installedRoot: commandArgs[3],
          alreadyAdded: false,
        })}\n`,
        stderr: '',
      };
    }
    if (commandArgs.join(' ').startsWith('plugin add')) {
      const installedPath = path.join(
        options.env.CODEX_HOME,
        'plugins',
        'cache',
        marketplaceName,
        'frontend-ai-workflow',
        '0.18.0+codex.fixture',
      );
      fs.cpSync(path.join(marketplaceRoot, 'plugins', 'frontend-ai-workflow'), installedPath, { recursive: true });
      return {
        status: 0,
        stdout: `${JSON.stringify({
          pluginId,
          name: 'frontend-ai-workflow',
          marketplaceName,
          version: '0.18.0+codex.fixture',
          installedPath,
        })}\n`,
        stderr: '',
      };
    }
    if (commandArgs.join(' ').startsWith('plugin list')) {
      return {
        status: 0,
        stdout: `${JSON.stringify({
          installed: [{
            pluginId,
            version: '0.18.0+codex.fixture',
            installed: true,
            enabled: true,
            source: { source: 'local', path: path.join(marketplaceRoot, 'plugins', 'frontend-ai-workflow') },
          }],
          available: [],
        })}\n`,
        stderr: '',
      };
    }
    if (commandArgs.join(' ').startsWith('debug prompt-input')) {
      const installedPath = path.join(
        options.env.CODEX_HOME,
        'plugins',
        'cache',
        marketplaceName,
        'frontend-ai-workflow',
        '0.18.0+codex.fixture',
      );
      return {
        status: 0,
        stdout: `${JSON.stringify([{ content: [{ text: `frontend-ai-workflow:frontend-ui-review (file: ${installedPath}/skills/frontend-ui-review/SKILL.md)` }] }])}\n`,
        stderr: '',
      };
    }
    return { status: 9, stdout: '', stderr: `unexpected command: ${commandArgs.join(' ')}` };
  };
}

test('[TC-12] 五平台真实 Codex 安装、加载与断网运行证据入口', async (context) => {
  const fixture = createMarketplaceFixture(context);
  const calls = [];
  const smokeCalls = [];
  const preview = await verifyPlatformMarketplaceInstall({
    ...fixture,
    platformKey: NATIVE_PLATFORM_KEY,
    codexEntry: '/fixture/codex.js',
    allowedOutputRoots: [path.join(fixture.repositoryRoot, 'outputs')],
    execute: createCodexFixtureExecutor(fixture, calls),
  });
  assert.equal(preview.status, 'planned');
  assert.equal(preview.code, 'platform_install_evidence_plan');
  assert.equal(fs.existsSync(fixture.outputPath), false);
  assert.equal(calls.length, 0);

  const report = await verifyPlatformMarketplaceInstall({
    ...fixture,
    platformKey: NATIVE_PLATFORM_KEY,
    codexEntry: '/fixture/codex.js',
    write: true,
    allowedOutputRoots: [path.join(fixture.repositoryRoot, 'outputs')],
    environment: {
      ...process.env,
      CODEX_API_KEY: 'must-not-leak',
      OPENAI_API_KEY: 'must-not-leak',
    },
    execute: createCodexFixtureExecutor(fixture, calls),
    runOfflineSmoke: async (options) => {
      smokeCalls.push(options);
      return { ok: true, skipped: false, platformKey: NATIVE_PLATFORM_KEY, screenshotBytes: 512 };
    },
  });
  assert.equal(report.status, 'passed');
  assert.equal(report.code, 'platform_marketplace_install_verified');
  assert.equal(report.codex.version, CODEX_INSTALL_EVIDENCE_CLI_VERSION);
  assert.equal(report.marketplace.copiedForOfflineInstall, true);
  assert.equal(report.plugin.installed, true);
  assert.equal(report.plugin.enabled, true);
  assert.equal(report.load.skill, 'frontend-ai-workflow:frontend-ui-review');
  assert.equal(report.load.visibleInNewSession, true);
  assert.equal(report.offline.install, true);
  assert.equal(report.offline.chromium.ok, true);
  assert.equal(report.offline.chromium.screenshotBytes, 512);
  assert.deepEqual(JSON.parse(fs.readFileSync(fixture.outputPath, 'utf8')), report);
  assert.equal(smokeCalls.length, 1);
  assert.match(smokeCalls[0].runtimeRoot, /plugins[/\\]cache[/\\].+[/\\]runtime[/\\]playwright$/u);
  for (const call of calls) {
    assert.equal(call.env.CODEX_API_KEY, undefined);
    assert.equal(call.env.OPENAI_API_KEY, undefined);
    assert.equal(call.env.HTTP_PROXY, 'http://127.0.0.1:9');
    assert.equal(call.env.HTTPS_PROXY, 'http://127.0.0.1:9');
    assert.ok(call.env.CODEX_HOME.startsWith(path.join(fixture.repositoryRoot, 'outputs')));
  }
  assert.equal(
    fs.readdirSync(path.join(fixture.repositoryRoot, 'outputs')).some((name) => name.startsWith('.i-')),
    false,
  );
});

test('[TC-12] Codex 安装失败保留稳定诊断并清理隔离目录', async (context) => {
  const fixture = createMarketplaceFixture(context);
  const execute = (_command, args) => {
    if (args[1] === '--version') {
      return { status: 0, stdout: `codex-cli ${CODEX_INSTALL_EVIDENCE_CLI_VERSION}\n`, stderr: '' };
    }
    return { status: 7, stdout: '', stderr: 'fixture install failed' };
  };
  await assert.rejects(
    () => verifyPlatformMarketplaceInstall({
      ...fixture,
      platformKey: NATIVE_PLATFORM_KEY,
      codexEntry: '/fixture/codex.js',
      write: true,
      allowedOutputRoots: [path.join(fixture.repositoryRoot, 'outputs')],
      execute,
    }),
    (error) => error.code === 'platform_install_codex_command_failed'
      && error.status === 'failed'
      && error.target === 'marketplace-add'
      && error.exitCode === 7,
  );
  assert.equal(fs.existsSync(fixture.outputPath), false);
  assert.equal(
    fs.readdirSync(path.join(fixture.repositoryRoot, 'outputs')).some((name) => name.startsWith('.i-')),
    false,
  );
});

test('[TC-12] 安装证据写入拒绝伪造的非原生平台', async (context) => {
  const fixture = createMarketplaceFixture(context);
  await assert.rejects(
    () => verifyPlatformMarketplaceInstall({
      ...fixture,
      platformKey: NATIVE_PLATFORM_KEY,
      currentPlatform: process.platform === 'win32' ? 'linux' : 'win32',
      currentArch: process.arch,
      codexEntry: '/fixture/codex.js',
      write: true,
      allowedOutputRoots: [path.join(fixture.repositoryRoot, 'outputs')],
      execute: createCodexFixtureExecutor(fixture, []),
    }),
    (error) => error.code === 'platform_install_non_native_write'
      && error.status === 'failed'
      && error.target === NATIVE_PLATFORM_KEY,
  );
  assert.equal(fs.existsSync(fixture.outputPath), false);
});

test('[TC-12] Windows 安装缓存的超长 Chromium 路径使用系统命名空间', () => {
  const workRoot = path.win32.join(
    'D:\\a\\wayfinder\\wayfinder\\outputs',
    compactInstallStageName({ processId: 5092, timestamp: 1788137696439 }),
  );
  const browserExecutable = path.win32.join(
    workRoot,
    'c',
    'plugins',
    'cache',
    'frontend-ai-workflow-win32-x64',
    'frontend-ai-workflow',
    '0.18.0+codex.20260826072715',
    'runtime',
    'playwright',
    'platform-assets',
    'win32-x64',
    '.local-browsers',
    'chromium_headless_shell-1234',
    'chrome-headless-shell-win64',
    'chrome-headless-shell.exe',
  );
  const launchPath = browserExecutableForLaunch(browserExecutable, {
    platform: 'win32',
    pathApi: path.win32,
  });
  assert.ok(browserExecutable.length >= 260, `测试样本没有覆盖 Windows 超长路径：${browserExecutable.length}`);
  assert.match(launchPath, /^\\\\\?\\D:\\/u);
  assert.equal(launchPath.slice(4), browserExecutable);
});

test('[TC-12] 人工证据收集复用原五平台矩阵且不增加日常成本', () => {
  const workflow = fs.readFileSync(path.resolve('.github/workflows/validate.yml'), 'utf8');
  const platformJob = workflow.slice(workflow.indexOf('\n  platform:'));
  assert.match(workflow, /^\s+workflow_dispatch:\r?\n\s+inputs:\r?\n\s+collect_platform_install_evidence:/mu);
  assert.match(
    platformJob,
    /if:\s*github\.event_name == 'workflow_dispatch' && inputs\.collect_platform_install_evidence/u,
  );
  assert.match(
    platformJob,
    new RegExp(`@openai/codex@${CODEX_INSTALL_EVIDENCE_CLI_VERSION.replaceAll('.', '\\.')}`, 'u'),
  );
  assert.match(platformJob, /verify-platform-marketplace-install\.mjs --write/u);
  assert.match(platformJob, /--codex-entry outputs\/platform-install-codex\/node_modules\/@openai\/codex\/bin\/codex\.js/u);
  assert.match(platformJob, /outputs\/platform-install-evidence\/\$\{\{ matrix\.platform \}\}\.json/u);
  assert.equal([...platformJob.matchAll(/actions\/upload-artifact@v7/gmu)].length, 1);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY|CODEX_API_KEY|openai\/codex-action|^\s*schedule:/gmu);
});
