import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  CODEX_INSTALL_EVIDENCE_CLI_VERSION,
  compactInstallStageName,
  verifyPlatformMarketplaceInstall,
} from '../plugins/frontend-ai-workflow/scripts/verify-platform-marketplace-install.mjs';

function createMarketplaceFixture(context) {
  fs.mkdirSync(path.resolve('outputs'), { recursive: true });
  const repositoryRoot = fs.mkdtempSync(path.resolve('outputs', 'platform-install-fixture-'));
  context.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));
  const marketplaceRoot = path.join(repositoryRoot, 'dist', 'frontend-ai-workflow-darwin-arm64');
  const pluginRoot = path.join(marketplaceRoot, 'plugins', 'frontend-ai-workflow');
  fs.mkdirSync(path.join(marketplaceRoot, '.agents', 'plugins'), { recursive: true });
  fs.mkdirSync(path.join(pluginRoot, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(pluginRoot, 'skills', 'frontend-ui-review'), { recursive: true });
  fs.mkdirSync(path.join(pluginRoot, 'runtime', 'playwright'), { recursive: true });
  fs.writeFileSync(path.join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json'), `${JSON.stringify({
    name: 'frontend-ai-workflow-darwin-arm64',
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
    platformKey: 'darwin-arm64',
    smoke: { ok: true, skipped: false, platformKey: 'darwin-arm64', screenshotBytes: 256 },
  }, null, 2)}\n`);
  return {
    repositoryRoot,
    marketplaceRoot,
    outputPath: path.join(repositoryRoot, 'outputs', 'platform-install-evidence', 'darwin-arm64.json'),
  };
}

function createCodexFixtureExecutor(marketplaceRoot, calls) {
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
          marketplaceName: 'frontend-ai-workflow-darwin-arm64',
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
        'frontend-ai-workflow-darwin-arm64',
        'frontend-ai-workflow',
        '0.18.0+codex.fixture',
      );
      fs.cpSync(path.join(marketplaceRoot, 'plugins', 'frontend-ai-workflow'), installedPath, { recursive: true });
      return {
        status: 0,
        stdout: `${JSON.stringify({
          pluginId: 'frontend-ai-workflow@frontend-ai-workflow-darwin-arm64',
          name: 'frontend-ai-workflow',
          marketplaceName: 'frontend-ai-workflow-darwin-arm64',
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
            pluginId: 'frontend-ai-workflow@frontend-ai-workflow-darwin-arm64',
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
        'frontend-ai-workflow-darwin-arm64',
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
    platformKey: 'darwin-arm64',
    codexEntry: '/fixture/codex.js',
    allowedOutputRoots: [path.join(fixture.repositoryRoot, 'outputs')],
    execute: createCodexFixtureExecutor(fixture.marketplaceRoot, calls),
  });
  assert.equal(preview.status, 'planned');
  assert.equal(preview.code, 'platform_install_evidence_plan');
  assert.equal(fs.existsSync(fixture.outputPath), false);
  assert.equal(calls.length, 0);

  const report = await verifyPlatformMarketplaceInstall({
    ...fixture,
    platformKey: 'darwin-arm64',
    codexEntry: '/fixture/codex.js',
    write: true,
    allowedOutputRoots: [path.join(fixture.repositoryRoot, 'outputs')],
    environment: {
      ...process.env,
      CODEX_API_KEY: 'must-not-leak',
      OPENAI_API_KEY: 'must-not-leak',
    },
    execute: createCodexFixtureExecutor(fixture.marketplaceRoot, calls),
    runOfflineSmoke: async (options) => {
      smokeCalls.push(options);
      return { ok: true, skipped: false, platformKey: 'darwin-arm64', screenshotBytes: 512 };
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
      platformKey: 'darwin-arm64',
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

test('[TC-12] Windows 安装证据缓存路径保持在传统路径预算内', () => {
  const workRoot = path.win32.join(
    'D:\\a\\wayfinder\\wayfinder\\outputs',
    compactInstallStageName({ processId: 5092, timestamp: 1788137696439 }),
  );
  const installedSkill = path.win32.join(
    workRoot,
    'c',
    'plugins',
    'cache',
    'frontend-ai-workflow-win32-x64',
    'frontend-ai-workflow',
    '0.18.0+codex.20260826072715',
    'skills',
    'frontend-ui-review',
    'SKILL.md',
  );
  assert.ok(installedSkill.length < 260, `Windows Codex 安装证据路径过长：${installedSkill.length}`);
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
