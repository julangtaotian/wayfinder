import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { SUPPORTED_PLAYWRIGHT_PLATFORMS } from './playwright-runtime.mjs';

export const CODEX_INSTALL_EVIDENCE_CLI_VERSION = '0.150.0-alpha.8';
const OFFLINE_PROXY = 'http://127.0.0.1:9';
const PROXY_KEYS = [
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY',
  'http_proxy', 'https_proxy', 'all_proxy',
];
const API_KEY_NAMES = ['CODEX_API_KEY', 'OPENAI_API_KEY'];
const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const defaultPluginRoot = path.resolve(scriptDir, '..');
const defaultRepositoryRoot = path.resolve(defaultPluginRoot, '..', '..');

function fail(message, {
  code = 'platform_install_evidence_failed',
  target = null,
  exitCode = null,
  signal = null,
} = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = 'failed';
  error.target = target;
  error.exitCode = exitCode;
  error.signal = signal;
  throw error;
}

function readJson(filePath, target) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`无法读取 JSON：${filePath}（${error.message}）`, {
      code: 'platform_install_json_invalid',
      target,
    });
  }
}

function canonicalPotentialPath(target) {
  const missing = [];
  let existing = path.resolve(target);
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  const realExisting = fs.existsSync(existing) ? fs.realpathSync(existing) : existing;
  return path.resolve(realExisting, ...missing);
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function validateOutputPath(outputPath, allowedOutputRoots) {
  const resolved = canonicalPotentialPath(outputPath);
  const allowed = allowedOutputRoots.map((item) => canonicalPotentialPath(item));
  if (!allowed.some((root) => isInside(root, resolved))) {
    fail(`安装证据必须写入允许的 outputs 范围：${outputPath}`, {
      code: 'platform_install_output_unsafe',
      target: outputPath,
    });
  }
  if (fs.existsSync(resolved)) {
    fail(`安装证据已存在，拒绝覆盖：${resolved}`, {
      code: 'platform_install_output_exists',
      target: resolved,
    });
  }
  return resolved;
}

function validateMarketplaceRoot(marketplaceRoot, repositoryRoot) {
  const resolved = path.resolve(marketplaceRoot);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory() || fs.lstatSync(resolved).isSymbolicLink()) {
    fail(`marketplace 目录不存在或不安全：${resolved}`, {
      code: 'platform_install_marketplace_unsafe',
      target: resolved,
    });
  }
  const real = fs.realpathSync(resolved);
  const forbidden = [path.parse(real).root, os.homedir(), repositoryRoot, defaultPluginRoot].map((item) => path.resolve(item));
  if (forbidden.includes(real)) {
    fail(`marketplace 不能指向根目录、用户目录、仓库或插件源码：${real}`, {
      code: 'platform_install_marketplace_unsafe',
      target: real,
    });
  }
  return real;
}

function redact(value, environment) {
  let result = String(value || '');
  for (const key of PROXY_KEYS) {
    if (environment[key]) result = result.split(String(environment[key])).join('[REDACTED_PROXY]');
  }
  return result;
}

function offlineEnvironment(environment, codexHome) {
  const result = { ...environment, CODEX_HOME: codexHome, NO_COLOR: '1', CI: '1' };
  for (const key of API_KEY_NAMES) delete result[key];
  for (const key of PROXY_KEYS) result[key] = OFFLINE_PROXY;
  result.NO_PROXY = '127.0.0.1,localhost';
  result.no_proxy = result.NO_PROXY;
  result.PLAYWRIGHT_DOWNLOAD_HOST = OFFLINE_PROXY;
  result.PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST = OFFLINE_PROXY;
  return result;
}

function parseJsonCommand(stdout, target, environment) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    fail(`Codex ${target} 没有返回有效 JSON：${redact(error.message, environment)}`, {
      code: 'platform_install_codex_json_invalid',
      target,
    });
  }
}

function collectPromptText(value, texts = []) {
  if (typeof value === 'string') {
    texts.push(value);
    return texts;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPromptText(item, texts);
    return texts;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectPromptText(item, texts);
  }
  return texts;
}

function runCommand({ command, prefixArgs, args, target, environment, execute }) {
  const result = execute(command, [...prefixArgs, ...args], {
    encoding: 'utf8',
    env: environment,
    timeout: 120000,
    windowsHide: true,
  });
  if (result?.error || result?.status !== 0) {
    fail(`Codex ${target} 失败：${redact(result?.error?.message || result?.stderr || `退出码 ${result?.status}`, environment)}`, {
      code: 'platform_install_codex_command_failed',
      target,
      exitCode: result?.status ?? null,
      signal: result?.signal || null,
    });
  }
  return result.stdout.trim();
}

function codexCommandSpec({ codexEntry, codexExecutable, execute }) {
  if (codexEntry) {
    const resolvedEntry = path.resolve(codexEntry);
    if (execute === spawnSync && (!fs.existsSync(resolvedEntry) || !fs.statSync(resolvedEntry).isFile())) {
      fail(`Codex Node 入口不存在：${resolvedEntry}`, {
        code: 'platform_install_codex_entry_missing',
        target: resolvedEntry,
      });
    }
    return { command: process.execPath, prefixArgs: [resolvedEntry] };
  }
  if (!codexExecutable) {
    fail('缺少 Codex 可执行文件或 Node 入口', {
      code: 'platform_install_codex_entry_missing',
      target: 'codex',
    });
  }
  return { command: path.resolve(codexExecutable), prefixArgs: [] };
}

function parseCodexVersion(stdout) {
  const match = stdout.match(/^codex-cli\s+([^\s]+)$/u);
  if (!match || match[1] !== CODEX_INSTALL_EVIDENCE_CLI_VERSION) {
    fail(`Codex CLI 版本不匹配：期望 ${CODEX_INSTALL_EVIDENCE_CLI_VERSION}，实际 ${stdout || '未知'}`, {
      code: 'platform_install_codex_version_mismatch',
      target: stdout || null,
    });
  }
  return match[1];
}

function validatePackageReport(marketplaceRoot, platformKey) {
  const report = readJson(path.join(marketplaceRoot, 'package-report.json'), 'package-report');
  if (report.platformKey !== platformKey
    || !report.smoke?.ok
    || report.smoke?.skipped
    || report.smoke?.platformKey !== platformKey
    || report.smoke?.screenshotBytes <= 100) {
    fail(`平台成品报告不能作为安装证据前置：${platformKey}`, {
      code: 'platform_install_package_report_invalid',
      target: platformKey,
    });
  }
  return report;
}

function validateMarketplaceManifest(marketplaceRoot) {
  const manifest = readJson(
    path.join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json'),
    'marketplace-manifest',
  );
  const plugin = manifest.plugins?.find((item) => item.name === 'frontend-ai-workflow');
  if (!manifest.name || plugin?.source?.source !== 'local' || plugin?.source?.path !== './plugins/frontend-ai-workflow') {
    fail('平台 marketplace 清单缺少本地 frontend-ai-workflow 插件', {
      code: 'platform_install_marketplace_manifest_invalid',
      target: 'marketplace-manifest',
    });
  }
  return { marketplaceName: manifest.name, pluginName: plugin.name };
}

export function compactInstallStageName({
  processId = process.pid,
  timestamp = Date.now(),
} = {}) {
  if (!Number.isSafeInteger(processId) || processId < 0 || !Number.isSafeInteger(timestamp) || timestamp < 0) {
    fail('安装证据暂存标识必须是非负安全整数', {
      code: 'platform_install_stage_identity_invalid',
      target: null,
    });
  }
  return `.i-${processId.toString(36)}-${timestamp.toString(36)}`;
}

async function defaultOfflineSmoke({ runtimeRoot, platformKey, environment, preserveRuntimeRoot = false }) {
  const args = [scriptPath, '--offline-smoke-runtime', runtimeRoot, '--platform', platformKey];
  if (preserveRuntimeRoot) args.push('--preserve-runtime-root');
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    env: environment,
    timeout: 120000,
    windowsHide: true,
  });
  if (result?.error || result?.status !== 0) {
    fail(`断网 Chromium 冒烟失败：${redact(result?.error?.message || result?.stderr || `退出码 ${result?.status}`, environment)}`, {
      code: 'platform_install_offline_smoke_failed',
      target: platformKey,
      exitCode: result?.status ?? null,
      signal: result?.signal || null,
    });
  }
  return parseJsonCommand(result.stdout, 'offline-smoke', environment);
}

export function createInstalledRuntimeView({
  installedPath,
  workRoot,
  currentPlatform = process.platform,
  pathApi = path,
  createDirectoryLink = fs.symlinkSync,
} = {}) {
  if (currentPlatform !== 'win32') {
    return {
      runtimeRoot: pathApi.join(installedPath, 'runtime', 'playwright'),
      preserveRuntimeRoot: false,
      strategy: 'installed-path',
    };
  }
  const aliasRoot = pathApi.join(workRoot, 'r');
  try {
    createDirectoryLink(installedPath, aliasRoot, 'junction');
  } catch (error) {
    fail(`无法创建 Windows 安装运行时短路径：${error.message}`, {
      code: 'platform_install_runtime_alias_failed',
      target: aliasRoot,
    });
  }
  return {
    runtimeRoot: pathApi.join(aliasRoot, 'runtime', 'playwright'),
    preserveRuntimeRoot: true,
    strategy: 'installed-junction',
  };
}

export async function verifyPlatformMarketplaceInstall({
  marketplaceRoot,
  platformKey = `${process.platform}-${process.arch}`,
  outputPath,
  write = false,
  repositoryRoot = defaultRepositoryRoot,
  allowedOutputRoots,
  currentPlatform = process.platform,
  currentArch = process.arch,
  codexEntry,
  codexExecutable,
  environment = process.env,
  execute = spawnSync,
  runOfflineSmoke = defaultOfflineSmoke,
  copyPath = fs.cpSync,
  removePath = fs.rmSync,
  createDirectoryLink = fs.symlinkSync,
} = {}) {
  if (!SUPPORTED_PLAYWRIGHT_PLATFORMS.includes(platformKey)) {
    fail(`不支持的平台：${platformKey}`, {
      code: 'platform_install_platform_unsupported',
      target: platformKey,
    });
  }
  const nativePlatformKey = `${currentPlatform}-${currentArch}`;
  const sourceRepositoryRoot = fs.realpathSync(path.resolve(repositoryRoot));
  const sourceMarketplaceRoot = validateMarketplaceRoot(marketplaceRoot, sourceRepositoryRoot);
  const effectiveAllowedRoots = allowedOutputRoots || [path.join(sourceRepositoryRoot, 'outputs')];
  const effectiveOutput = outputPath || path.join(
    sourceRepositoryRoot,
    'outputs',
    'platform-install-evidence',
    `${platformKey}.json`,
  );
  const finalOutput = validateOutputPath(effectiveOutput, effectiveAllowedRoots);
  const packageReport = validatePackageReport(sourceMarketplaceRoot, platformKey);
  const marketplace = validateMarketplaceManifest(sourceMarketplaceRoot);
  const plan = {
    ok: true,
    status: 'planned',
    code: 'platform_install_evidence_plan',
    write,
    platformKey,
    nativePlatformKey,
    output: finalOutput,
    codexVersion: CODEX_INSTALL_EVIDENCE_CLI_VERSION,
    usesModel: false,
    requiresAuthentication: false,
    downloadsAtRuntime: false,
    steps: ['copy-marketplace', 'install-plugin', 'inspect-new-session', 'offline-chromium-smoke', 'cleanup'],
  };
  if (!write) return plan;
  if (nativePlatformKey !== platformKey) {
    fail(`安装证据必须在原生平台执行：期望 ${nativePlatformKey}，实际 ${platformKey}`, {
      code: 'platform_install_non_native_write',
      target: platformKey,
    });
  }

  const workRoot = path.join(path.resolve(effectiveAllowedRoots[0]), compactInstallStageName());
  const offlineMarketplaceRoot = path.join(workRoot, 'm');
  const codexHome = path.join(workRoot, 'c');
  if (fs.existsSync(workRoot)) {
    fail(`安装证据暂存目录已存在：${workRoot}`, {
      code: 'platform_install_stage_exists',
      target: workRoot,
    });
  }
  fs.mkdirSync(codexHome, { recursive: true });
  const isolatedEnvironment = offlineEnvironment(environment, codexHome);
  const commandSpec = codexCommandSpec({ codexEntry, codexExecutable, execute });
  try {
    copyPath(sourceMarketplaceRoot, offlineMarketplaceRoot, { recursive: true, dereference: false });
    const version = parseCodexVersion(runCommand({
      ...commandSpec,
      args: ['--version'],
      target: 'version',
      environment: isolatedEnvironment,
      execute,
    }));
    const added = parseJsonCommand(runCommand({
      ...commandSpec,
      args: ['plugin', 'marketplace', 'add', offlineMarketplaceRoot, '--json'],
      target: 'marketplace-add',
      environment: isolatedEnvironment,
      execute,
    }), 'marketplace-add', isolatedEnvironment);
    if (added.marketplaceName !== marketplace.marketplaceName) {
      fail('Codex 返回的 marketplace 名称与成品不一致', {
        code: 'platform_install_marketplace_identity_mismatch',
        target: added.marketplaceName || null,
      });
    }
    const pluginId = `${marketplace.pluginName}@${marketplace.marketplaceName}`;
    const installed = parseJsonCommand(runCommand({
      ...commandSpec,
      args: ['plugin', 'add', pluginId, '--json'],
      target: 'plugin-add',
      environment: isolatedEnvironment,
      execute,
    }), 'plugin-add', isolatedEnvironment);
    const installedPath = fs.realpathSync(path.resolve(installed.installedPath));
    if (installed.pluginId !== pluginId || !isInside(fs.realpathSync(codexHome), installedPath)) {
      fail('Codex 安装结果没有落入隔离插件缓存', {
        code: 'platform_install_plugin_path_invalid',
        target: installed.installedPath || null,
      });
    }
    const listed = parseJsonCommand(runCommand({
      ...commandSpec,
      args: ['plugin', 'list', '--json'],
      target: 'plugin-list',
      environment: isolatedEnvironment,
      execute,
    }), 'plugin-list', isolatedEnvironment);
    const listedPlugin = listed.installed?.find((item) => item.pluginId === pluginId);
    if (!listedPlugin?.installed || !listedPlugin?.enabled || listedPlugin.version !== installed.version) {
      fail('Codex 插件列表未确认已安装且已启用', {
        code: 'platform_install_plugin_not_enabled',
        target: pluginId,
      });
    }
    const promptInput = parseJsonCommand(runCommand({
      ...commandSpec,
      args: ['debug', 'prompt-input', '只检查 frontend-ai-workflow 插件能力是否进入新会话。'],
      target: 'prompt-input',
      environment: isolatedEnvironment,
      execute,
    }), 'prompt-input', isolatedEnvironment);
    const promptText = collectPromptText(promptInput).join('\n').replaceAll('\\', '/');
    const normalizedInstalledPath = installedPath.replaceAll('\\', '/');
    const expectedSkill = 'frontend-ai-workflow:frontend-ui-review';
    if (!promptText.includes(expectedSkill) || !promptText.includes(normalizedInstalledPath)) {
      fail('新 Codex 会话没有加载已安装插件技能', {
        code: 'platform_install_skill_not_loaded',
        target: expectedSkill,
      });
    }
    const runtimeView = createInstalledRuntimeView({
      installedPath,
      workRoot,
      currentPlatform,
      createDirectoryLink,
    });
    const offlineSmoke = await runOfflineSmoke({
      runtimeRoot: runtimeView.runtimeRoot,
      platformKey,
      environment: isolatedEnvironment,
      preserveRuntimeRoot: runtimeView.preserveRuntimeRoot,
    });
    if (!offlineSmoke?.ok
      || offlineSmoke.skipped
      || offlineSmoke.platformKey !== platformKey
      || offlineSmoke.screenshotBytes <= 100) {
      fail(`已安装插件断网 Chromium 冒烟无效：${JSON.stringify(offlineSmoke)}`, {
        code: 'platform_install_offline_smoke_invalid',
        target: platformKey,
      });
    }
    removePath(workRoot, { recursive: true, force: true });
    const report = {
      schemaVersion: 1,
      ok: true,
      status: 'passed',
      code: 'platform_marketplace_install_verified',
      platformKey,
      codex: {
        version,
        usesModel: false,
        authenticated: false,
      },
      marketplace: {
        name: marketplace.marketplaceName,
        copiedForOfflineInstall: true,
      },
      plugin: {
        id: pluginId,
        version: installed.version,
        installed: true,
        enabled: true,
        installedFromLocalCopy: true,
      },
      load: {
        method: 'debug-prompt-input',
        skill: expectedSkill,
        visibleInNewSession: true,
      },
      offline: {
        networkPolicy: 'unreachable-loopback-proxy',
        install: true,
        downloadsAtRuntime: false,
        runtimePathStrategy: runtimeView.strategy,
        chromium: {
          ok: true,
          skipped: false,
          platformKey: offlineSmoke.platformKey,
          screenshotBytes: offlineSmoke.screenshotBytes,
        },
      },
      package: {
        platformKey: packageReport.platformKey,
        initialChromiumSmoke: true,
      },
      cleanup: { status: 'passed' },
    };
    fs.mkdirSync(path.dirname(finalOutput), { recursive: true });
    fs.writeFileSync(finalOutput, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    return report;
  } catch (error) {
    try {
      removePath(workRoot, { recursive: true, force: true });
    } catch (cleanupError) {
      error.cleanupError = redact(cleanupError.message, environment);
      if (!error.code) error.code = 'platform_install_cleanup_failed';
    }
    if (!error.code) error.code = 'platform_install_evidence_failed';
    if (!error.status) error.status = 'failed';
    if (!error.target) error.target = platformKey;
    error.message = redact(error.message, environment);
    throw error;
  }
}

function parseArgs(argv) {
  const options = { write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--write') options.write = true;
    else if (['--marketplace', '--platform', '--output', '--codex-entry', '--codex'].includes(value)) {
      if (!argv[index + 1]) fail(`参数 ${value} 缺少值`, {
        code: 'platform_install_argument_missing',
        target: value,
      });
      const key = {
        '--marketplace': 'marketplaceRoot',
        '--platform': 'platformKey',
        '--output': 'outputPath',
        '--codex-entry': 'codexEntry',
        '--codex': 'codexExecutable',
      }[value];
      options[key] = argv[++index];
    } else {
      fail(`不支持的参数：${value}`, {
        code: 'platform_install_argument_unknown',
        target: value,
      });
    }
  }
  return options;
}

async function runOfflineSmokeEntry(argv) {
  const runtimeRoot = argv[1];
  const platformIndex = argv.indexOf('--platform');
  const platformKey = platformIndex >= 0 ? argv[platformIndex + 1] : null;
  if (!runtimeRoot || !SUPPORTED_PLAYWRIGHT_PLATFORMS.includes(platformKey)) {
    fail('断网冒烟参数无效', {
      code: 'platform_install_offline_smoke_argument_invalid',
      target: platformKey,
    });
  }
  const [platform, ...archParts] = platformKey.split('-');
  const runtimeModule = await import(pathToFileURL(path.join(runtimeRoot, '..', '..', 'scripts', 'playwright-runtime.mjs')).href);
  return runtimeModule.smokeTestBundledPlaywright({
    runtimeRoot,
    integrityPath: path.join(runtimeRoot, 'integrity'),
    platform,
    arch: archParts.join('-'),
    expectedPlatformKey: platformKey,
    useCache: false,
    preserveRuntimeRoot: argv.includes('--preserve-runtime-root'),
  });
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const args = process.argv.slice(2);
    const result = args[0] === '--offline-smoke-runtime'
      ? await runOfflineSmokeEntry(args)
      : await verifyPlatformMarketplaceInstall(parseArgs(args));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      status: error.status || 'failed',
      code: error.code || 'platform_install_evidence_failed',
      target: error.target || null,
      exitCode: error.exitCode ?? null,
      signal: error.signal || null,
      cleanupError: error.cleanupError || null,
      message: `平台安装证据验证失败：${error.message}`,
    }));
    process.exitCode = 1;
  }
}
