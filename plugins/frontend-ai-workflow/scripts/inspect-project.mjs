import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCliArgs } from './cli-arguments.mjs';

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

const PATH_CANDIDATES = {
  views: ['src/views', 'src/pages', 'app', 'pages'],
  components: ['src/components', 'components'],
  request: ['src/request', 'src/api', 'src/services', 'src/service', 'services'],
  router: ['src/router', 'src/routes', 'app/routes'],
  store: ['src/store', 'src/stores', 'src/state'],
  tests: ['src/__tests__', 'tests', 'test', '__tests__'],
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

export function detectPreset(packageJson) {
  const deps = dependencyMap(packageJson);
  const hasVite = Boolean(deps.vite);
  const hasWebpack = Boolean(deps.webpack || deps['@vue/cli-service'] || deps['react-scripts']);

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
  return aliases.find((name) => Object.prototype.hasOwnProperty.call(scripts, name)) || null;
}

// 仅基于脚本文本给出可信度，不把未知包装脚本误判为静态检查能力。
function describeCommand(packageManager, scriptName, source) {
  return {
    scriptName,
    command: packageCommand(packageManager, scriptName),
    source: scriptName ? source : 'missing',
  };
}

function inspectCommandSemantics(packageManager, scripts, legacyBuildScript, lintScript) {
  const defaultBuildScript = findScript(scripts, DEFAULT_BUILD_ALIASES) || legacyBuildScript;
  const explicitReleaseScript = findScript(scripts, RELEASE_BUILD_ALIASES);
  const releaseBuildScript = explicitReleaseScript || defaultBuildScript;
  const lintContent = lintScript ? String(scripts[lintScript] || '') : '';
  const lintStatus = !lintScript
    ? 'missing'
    : (VERIFIED_LINT_PATTERN.test(lintContent) ? 'verified' : 'unverified');

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
  };
}

export function packageCommand(packageManager, scriptName) {
  if (!scriptName) return '未配置';
  if (packageManager === 'yarn') return `yarn ${scriptName}`;
  if (packageManager === 'pnpm') return `pnpm run ${scriptName}`;
  if (packageManager === 'bun') return `bun run ${scriptName}`;
  return `npm run ${scriptName}`;
}

function findExistingPath(root, candidates) {
  const found = candidates.find((candidate) => fs.existsSync(path.join(root, candidate)));
  return found || '未识别';
}

function techStack(packageJson) {
  const deps = dependencyMap(packageJson);
  const stack = TECH_PACKAGES
    .filter(([packageName]) => deps[packageName])
    .map(([packageName, label]) => `${label} ${deps[packageName]}`);
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
  const scriptNames = Object.fromEntries(
    Object.entries(SCRIPT_ALIASES).map(([kind, aliases]) => [kind, findScript(scripts, aliases)]),
  );
  const commands = Object.fromEntries(
    Object.entries(scriptNames).map(([kind, scriptName]) => [kind, packageCommand(packageManager, scriptName)]),
  );
  const commandSemantics = inspectCommandSemantics(packageManager, scripts, scriptNames.build, scriptNames.lint);
  const paths = Object.fromEntries(
    Object.entries(PATH_CANDIDATES).map(([kind, candidates]) => [kind, findExistingPath(root, candidates)]),
  );
  // Wayfinder 是插件项目导航的唯一长期文档，需求模板改为按需使用的插件资产。
  const managedFiles = [
    'AGENTS.md',
    'openspec/config.yaml',
    'wayfinder/frontend.md',
  ];

  return {
    root,
    name: packageJson.name || path.basename(root),
    preset: detectPreset(packageJson),
    packageManager,
    techStack: techStack(packageJson),
    scriptNames,
    commands,
    commandSemantics,
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
