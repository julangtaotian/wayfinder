import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseCliArgs } from './cli-arguments.mjs';
import { assertSafeProjectRoot, resolveProjectRoot } from './collect-project-scope.mjs';
import { inspectProject } from './inspect-project.mjs';

const EXCLUDED_DIRECTORIES = new Set([
  '.git', '.next', '.nuxt', '.turbo', '.yarn', 'build', 'coverage', 'dist',
  'node_modules', 'out', 'platform-assets', 'storybook-static', 'temp', 'tmp',
]);
const SUFFIX_TEST_FILE_PATTERN = /(?:^|\/)[^/]+\.(?:spec|test)\.[cm]?[jt]sx?$/iu;
const GENERIC_TEST_FILE_PATTERN = /^(?:spec|test)\.[cm]?[jt]sx?$/iu;
const GENERATED_TEST_PATTERN = /\.generated\.(?:spec|test)\.[cm]?[jt]sx?$/iu;
const TEST_CONFIG_PATTERN = /^(?:vitest|jest|playwright|cypress)\.config\.[cm]?[jt]s$/iu;
const TEST_DIRECTORIES = new Set(['test', 'tests', '__tests__', 'e2e', 'cypress']);
const MAX_DISCOVERED_FILES = 10_000;

function projectPath(root, absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join('/');
}

function isTestFile(projectRelativePath) {
  if (SUFFIX_TEST_FILE_PATTERN.test(projectRelativePath)) return true;
  const segments = projectRelativePath.split('/');
  const fileName = segments.pop() || '';
  if (!GENERIC_TEST_FILE_PATTERN.test(fileName)) return false;
  // 通用 test.* 只有位于真实测试目录时才算用例，避免把 scripts/test.js 启动器误报为测试文件。
  return segments.some((segment) => TEST_DIRECTORIES.has(segment.toLowerCase()));
}

function walkProject(root, directory, files, testDirectories) {
  if (files.length >= MAX_DISCOVERED_FILES) return;
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (files.length >= MAX_DISCOVERED_FILES) return;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      if (TEST_DIRECTORIES.has(entry.name.toLowerCase())) testDirectories.add(projectPath(root, absolutePath));
      walkProject(root, absolutePath, files, testDirectories);
    } else if (entry.isFile()) {
      files.push(projectPath(root, absolutePath));
    }
  }
}

function dependencyMap(packageJson) {
  return {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
    ...(packageJson.peerDependencies || {}),
  };
}

function detectRunner(packageJson, configFiles, testScript) {
  const dependencies = dependencyMap(packageJson);
  const signals = `${testScript || ''} ${configFiles.join(' ')}`;
  if (/\bnode\s+--test\b/u.test(testScript || '')) return { name: 'Node Test Runner', source: 'script' };
  const candidates = [
    ['vitest', 'Vitest'],
    ['jest', 'Jest'],
    ['@playwright/test', 'Playwright Test'],
    ['cypress', 'Cypress'],
  ];
  const scriptMatch = candidates.find(([packageName]) => (
    new RegExp(`\\b${packageName.replaceAll('/', '\\/').replace('@', '@?')}\\b`, 'iu').test(testScript || '')
  ));
  if (scriptMatch) return { name: scriptMatch[1], source: 'script' };
  const match = candidates.find(([packageName]) => (
    dependencies[packageName]
    || new RegExp(`\\b${packageName.replaceAll('/', '\\/').replace('@', '@?')}\\b`, 'iu').test(signals)
  ));
  if (match) return { name: match[1], source: dependencies[match[0]] ? 'dependency' : 'configuration' };
  return { name: '未识别', source: 'unknown' };
}

function inspectGit(root, files) {
  const inside = spawnSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
    return { available: false, trackedTests: [], commit: null, dirty: null };
  }
  const tracked = files.length
    ? spawnSync('git', ['-C', root, 'ls-files', '-z', '--', ...files], { encoding: 'utf8' })
    : null;
  const commit = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  const status = spawnSync('git', ['-C', root, 'status', '--porcelain=v1'], { encoding: 'utf8' });
  return {
    available: true,
    trackedTests: tracked?.status === 0 ? tracked.stdout.split('\0').filter(Boolean).sort() : [],
    commit: commit.status === 0 ? commit.stdout.trim() : null,
    dirty: status.status === 0 ? Boolean(status.stdout.trim()) : null,
  };
}

// 该检查只汇总文件与配置证据，不执行测试，也不读取测试或业务源码内容。
export function inspectTestContext(target = process.cwd()) {
  const root = resolveProjectRoot(target);
  assertSafeProjectRoot(root);
  const project = inspectProject(root);
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const discoveredFiles = [];
  const discoveredDirectories = new Set();
  walkProject(root, root, discoveredFiles, discoveredDirectories);

  const testFiles = discoveredFiles.filter(isTestFile).sort();
  const generatedBaselines = testFiles.filter((file) => GENERATED_TEST_PATTERN.test(file));
  const handwrittenTests = testFiles.filter((file) => !GENERATED_TEST_PATTERN.test(file));
  const configFiles = discoveredFiles
    .filter((file) => TEST_CONFIG_PATTERN.test(path.basename(file)))
    .sort();
  const configuredDirectory = project.paths.tests === '未识别' ? null : project.paths.tests;
  if (configuredDirectory) discoveredDirectories.add(configuredDirectory);
  const testCommand = project.commandSemantics.test;
  const runner = detectRunner(packageJson, configFiles, testCommand.scriptName
    ? packageJson.scripts?.[testCommand.scriptName]
    : null);
  const certified = project.preset === 'vue3-vite' && runner.name === 'Vitest';
  const warnings = [];
  if (discoveredFiles.length >= MAX_DISCOVERED_FILES) {
    warnings.push(`文件枚举达到上限 ${MAX_DISCOVERED_FILES}，测试上下文可能不完整`);
  }
  if (testCommand.status !== 'detected') warnings.push('没有识别到可用测试命令，自动测试实现应保持阻断');
  if (runner.name === '未识别') warnings.push('没有识别到项目测试运行器，仅可按已有文件证据提供有限支持');

  return {
    root,
    preset: project.preset,
    packageManager: project.packageManager,
    testCommand: {
      status: testCommand.status,
      scriptName: testCommand.scriptName,
      command: testCommand.command,
      executed: false,
    },
    runner: {
      ...runner,
      certification: certified ? 'verified-vue3-vite-vitest' : 'project-evidence-only',
    },
    configFiles,
    testDirectories: [...discoveredDirectories].sort(),
    testFiles,
    handwrittenTests,
    generatedBaselines,
    git: inspectGit(root, testFiles),
    scan: {
      bounded: true,
      discoveredFiles: discoveredFiles.length,
      limit: MAX_DISCOVERED_FILES,
      sourceContentRead: false,
    },
    warnings,
  };
}

function parseArgs(argv) {
  return parseCliArgs(argv, {
    defaults: { target: process.cwd() },
    valueOptions: { '--target': 'target' },
  });
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    console.log(JSON.stringify(inspectTestContext(parseArgs(process.argv.slice(2)).target), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
