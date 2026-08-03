import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCliArgs } from './cli-arguments.mjs';
import {
  collectPlatformProjectEvidence,
  detectTargetProfile,
} from './project-target-profile.mjs';

const SCRIPT_ALIASES = {
  dev: ['dev', 'serve', 'start'],
  build: ['build', 'build:prod'],
  test: ['test', 'test:unit', 'coverage'],
  lint: ['lint'],
  typecheck: ['typecheck', 'type-check', 'check:types'],
};
const DEFAULT_BUILD_ALIASES = ['build'];
const RELEASE_BUILD_ALIASES = ['build:prod', 'build:production', 'build:release'];
const VERIFIED_LINT_PATTERN = /\b(?:eslint|stylelint|biome|oxlint)\b|\bvue-cli-service\s+lint\b/u;
const PLACEHOLDER_TEST_PATTERNS = [
  /^\s*echo\s+(["'])?error:\s*no test specified\1\s*&&\s*exit\s+1\s*$/iu,
  /^\s*(?:exit\s+1|false)\s*$/iu,
];
const PLATFORM_COMMAND_TARGETS = [
  { target: 'wechat-mini-program', aliases: ['weapp', 'mp-weixin', 'wechat'] },
  { target: 'alipay-mini-program', aliases: ['alipay', 'mp-alipay'] },
  { target: 'h5', aliases: ['h5'] },
];
const PLATFORM_COMMAND_ACTIONS = {
  dev: ['dev', 'serve', 'start'],
  build: ['build'],
};
const PLATFORM_COMMAND_SEPARATORS = [':', '-'];

const PATH_CANDIDATES = {
  views: ['src/views', 'src/pages', 'app', 'pages'],
  components: ['src/components', 'components'],
  request: ['src/request', 'src/api', 'src/services', 'src/service', 'api', 'services'],
  router: ['src/router', 'src/routes', 'app/routes'],
  store: ['src/store', 'src/stores', 'src/state'],
  tests: ['src/__tests__', 'tests', 'test', '__tests__'],
};

const NATIVE_MINI_PROGRAM_PATH_CANDIDATES = {
  router: ['app.json'],
  store: ['app.js'],
};

const TECH_PACKAGES = [
  ['vue', 'Vue'],
  ['react', 'React'],
  ['vite', 'Vite'],
  ['webpack', 'Webpack'],
  ['vue-router', 'Vue Router'],
  ['react-router-dom', 'React Router'],
  ['vuex', 'Vuex'],
  ['pinia', 'Pinia'],
  ['redux', 'Redux'],
  ['element-plus', 'Element Plus'],
  ['element-ui', 'Element UI'],
  ['antd', 'Ant Design'],
  ['@mui/material', 'MUI'],
  ['vant', 'Vant'],
  ['@vant/weapp', 'Vant Weapp'],
  ['antd-mobile', 'Ant Design Mobile'],
  ['@nutui/nutui', 'NutUI'],
  ['@dcloudio/uni-app', 'uni-app'],
  ['@dcloudio/vite-plugin-uni', 'uni-app Vite Plugin'],
  ['@tarojs/taro', 'Taro'],
  ['@tarojs/cli', 'Taro CLI'],
  ['@tarojs/vite-runner', 'Taro Vite Runner'],
  ['@tarojs/webpack5-runner', 'Taro Webpack Runner'],
  ['remax', 'Remax'],
  ['vitest', 'Vitest'],
  ['jest', 'Jest'],
  ['typescript', 'TypeScript'],
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function dependencyMap(packageJson) {
  return {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
    ...(packageJson.peerDependencies || {}),
  };
}

function majorVersion(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

export function detectPreset(packageJson, platformProfile = null) {
  const deps = dependencyMap(packageJson);
  const hasVite = Boolean(deps.vite);
  const hasWebpack = Boolean(deps.webpack || deps['@vue/cli-service'] || deps['react-scripts']);

  if (
    platformProfile?.kind === 'native-mini-program'
    && platformProfile.frameworks.length === 1
    && platformProfile.frameworks[0] === 'wechat-native'
    && !deps.vue
    && !deps.react
  ) {
    return 'wechat-native';
  }

  if (deps.vue) {
    const vueMajor = majorVersion(deps.vue);
    if (hasVite) return vueMajor === 2 ? 'vue2-vite' : 'vue3-vite';
    return hasWebpack ? 'vue-webpack' : 'vue-webpack';
  }

  if (deps.react) {
    return hasVite ? 'react-vite' : 'react-webpack';
  }

  return 'generic-frontend';
}

export function detectPackageManager(root) {
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(root, 'bun.lockb')) || fs.existsSync(path.join(root, 'bun.lock'))) return 'bun';
  return 'npm';
}

function findScript(scripts, aliases) {
  return aliases.find((name) => (
    Object.prototype.hasOwnProperty.call(scripts, name)
    && typeof scripts[name] === 'string'
    && scripts[name].trim().length > 0
  )) || null;
}

function isPlaceholderTestScript(content) {
  return PLACEHOLDER_TEST_PATTERNS.some((pattern) => pattern.test(String(content || '')));
}

function findTestScript(scripts, aliases, { placeholder = false } = {}) {
  return aliases.find((name) => (
    Object.prototype.hasOwnProperty.call(scripts, name)
    && typeof scripts[name] === 'string'
    && scripts[name].trim().length > 0
    && isPlaceholderTestScript(scripts[name]) === placeholder
  )) || null;
}

// 仅基于脚本文本给出可信度，不把未知包装脚本误判为静态检查能力。
function describeCommand(packageManager, scriptName, source) {
  return {
    scriptName,
    command: packageCommand(packageManager, scriptName),
    source: scriptName ? source : 'missing',
  };
}

function inspectCommandSemantics(packageManager, scripts, legacyBuildScript, lintScript, testScriptCandidate) {
  const defaultBuildScript = findScript(scripts, DEFAULT_BUILD_ALIASES) || legacyBuildScript;
  const explicitReleaseScript = findScript(scripts, RELEASE_BUILD_ALIASES);
  const releaseBuildScript = explicitReleaseScript || defaultBuildScript;
  const lintContent = lintScript ? String(scripts[lintScript] || '') : '';
  const lintStatus = !lintScript
    ? 'missing'
    : (VERIFIED_LINT_PATTERN.test(lintContent) ? 'verified' : 'unverified');
  const testStatus = !testScriptCandidate
    ? 'missing'
    : (isPlaceholderTestScript(scripts[testScriptCandidate]) ? 'placeholder' : 'detected');

  return {
    defaultBuild: describeCommand(
      packageManager,
      defaultBuildScript,
      defaultBuildScript === 'build' ? 'explicit-default' : 'legacy-fallback',
    ),
    releaseBuild: describeCommand(
      packageManager,
      releaseBuildScript,
      explicitReleaseScript ? 'explicit-release' : 'default-fallback',
    ),
    lint: {
      ...describeCommand(packageManager, lintScript, lintStatus),
      status: lintStatus,
    },
    test: {
      ...describeCommand(packageManager, testScriptCandidate, testStatus),
      status: testStatus,
    },
  };
}

export function packageCommand(packageManager, scriptName) {
  if (!scriptName) return '未配置';
  if (packageManager === 'yarn') return `yarn ${scriptName}`;
  if (packageManager === 'pnpm') return `pnpm run ${scriptName}`;
  if (packageManager === 'bun') return `bun run ${scriptName}`;
  return `npm run ${scriptName}`;
}

function platformScriptNames(actions, aliases) {
  return actions.flatMap((action) => aliases.flatMap((alias) =>
    PLATFORM_COMMAND_SEPARATORS.map((separator) => `${action}${separator}${alias}`)));
}

function platformCandidates(packageManager, scripts, actions, aliases) {
  return platformScriptNames(actions, aliases)
    .filter((scriptName, index, names) => names.indexOf(scriptName) === index)
    .filter((scriptName) => (
      typeof scripts[scriptName] === 'string'
      && scripts[scriptName].trim().length > 0
    ))
    .map((scriptName) => ({
      scriptName,
      command: packageCommand(packageManager, scriptName),
      source: 'explicit-platform-script',
      executed: false,
    }));
}

// 平台脚本只作为静态候选证据，不解析内容、不选择默认值，也不执行命令。
export function detectPlatformCommands(packageManager, scripts = {}) {
  const targets = PLATFORM_COMMAND_TARGETS.map(({ target, aliases }) => ({
    target,
    devCandidates: platformCandidates(
      packageManager,
      scripts,
      PLATFORM_COMMAND_ACTIONS.dev,
      aliases,
    ),
    buildCandidates: platformCandidates(
      packageManager,
      scripts,
      PLATFORM_COMMAND_ACTIONS.build,
      aliases,
    ),
  })).filter(({ devCandidates, buildCandidates }) => (
    devCandidates.length > 0 || buildCandidates.length > 0
  ));
  const evidence = [...new Set(targets.flatMap(({ devCandidates, buildCandidates }) => (
    [...devCandidates, ...buildCandidates].map(({ scriptName }) => `script:${scriptName}`)
  )))].sort();

  return {
    status: targets.length ? 'detected' : 'missing',
    source: targets.length ? 'package-scripts' : 'unknown',
    targets,
    evidence,
  };
}

function findExistingPath(root, candidates) {
  const found = candidates.find((candidate) => fs.existsSync(path.join(root, candidate)));
  return found || '未识别';
}

function hasNativeMiniProgramGlobalState(root) {
  const appPath = path.join(root, 'app.js');
  if (!fs.existsSync(appPath)) return false;
  const stats = fs.statSync(appPath);
  // 普通初始化只读取合理大小的应用入口，并且只匹配结构，不输出任何源码值。
  if (!stats.isFile() || stats.size > 1024 * 1024) return false;
  const content = fs.readFileSync(appPath, 'utf8');
  return /\bApp\s*\(/u.test(content) && /\bglobalData\s*:/u.test(content);
}

function detectProjectPaths(root, platformProfile) {
  return Object.fromEntries(Object.entries(PATH_CANDIDATES).map(([kind, candidates]) => {
    const platformCandidates = platformProfile.kind === 'native-mini-program'
      ? (NATIVE_MINI_PROGRAM_PATH_CANDIDATES[kind] || [])
      : [];
    const filteredPlatformCandidates = kind === 'store' && !hasNativeMiniProgramGlobalState(root)
      ? []
      : platformCandidates;
    return [kind, findExistingPath(root, [...candidates, ...filteredPlatformCandidates])];
  }));
}

function techStack(packageJson, platformProfile) {
  const deps = dependencyMap(packageJson);
  const stack = [];
  if (platformProfile.frameworks.includes('wechat-native')) stack.push('微信原生小程序');
  stack.push(...TECH_PACKAGES
    .filter(([packageName]) => deps[packageName])
    .map(([packageName, label]) => `${label} ${deps[packageName]}`));
  return stack.length ? stack : ['未识别'];
}

export function inspectProject(target = process.cwd()) {
  const root = fs.realpathSync(path.resolve(target));
  const packagePath = path.join(root, 'package.json');
  if (!fs.existsSync(packagePath)) {
    throw new Error(`目标目录缺少 package.json：${root}`);
  }

  const packageJson = readJson(packagePath);
  const packageManager = detectPackageManager(root);
  const scripts = packageJson.scripts || {};
  const targetProfile = detectTargetProfile(
    dependencyMap(packageJson),
    collectPlatformProjectEvidence(root),
  );
  const usableTestScript = findTestScript(scripts, SCRIPT_ALIASES.test);
  const testScriptCandidate = usableTestScript
    || findTestScript(scripts, SCRIPT_ALIASES.test, { placeholder: true });
  const scriptNames = Object.fromEntries(
    Object.entries(SCRIPT_ALIASES).map(([kind, aliases]) => [kind, findScript(scripts, aliases)]),
  );
  scriptNames.test = usableTestScript;
  const commands = Object.fromEntries(
    Object.entries(scriptNames).map(([kind, scriptName]) => [kind, packageCommand(packageManager, scriptName)]),
  );
  const commandSemantics = inspectCommandSemantics(
    packageManager,
    scripts,
    scriptNames.build,
    scriptNames.lint,
    testScriptCandidate,
  );
  const platformCommands = detectPlatformCommands(packageManager, scripts);
  const paths = detectProjectPaths(root, targetProfile.platform);
  // Wayfinder 是插件项目导航的唯一长期文档，需求模板改为按需使用的插件资产。
  const managedFiles = [
    'AGENTS.md',
    'openspec/config.yaml',
    'wayfinder/frontend.md',
  ];

  return {
    root,
    name: packageJson.name || path.basename(root),
    preset: detectPreset(packageJson, targetProfile.platform),
    packageManager,
    techStack: techStack(packageJson, targetProfile.platform),
    targetProfile,
    scriptNames,
    commands,
    commandSemantics,
    platformCommands,
    paths,
    existingWorkflowFiles: managedFiles.filter((file) => fs.existsSync(path.join(root, file))),
  };
}

function parseArgs(argv) {
  return parseCliArgs(argv, {
    defaults: { target: process.cwd() },
    valueOptions: {
      '--target': 'target',
    },
  });
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    console.log(JSON.stringify(inspectProject(args.target), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
