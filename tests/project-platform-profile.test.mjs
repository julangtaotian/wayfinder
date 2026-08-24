import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runBootstrap } from '../plugins/frontend-ai-workflow/scripts/bootstrap-project.mjs';
import { checkProject } from '../plugins/frontend-ai-workflow/scripts/check-project.mjs';
import {
  detectPlatformCommands,
  inspectProject,
} from '../plugins/frontend-ai-workflow/scripts/inspect-project.mjs';
import {
  collectPlatformProjectEvidence,
  detectTargetProfile,
} from '../plugins/frontend-ai-workflow/scripts/project-target-profile.mjs';
import { runUpdate } from '../plugins/frontend-ai-workflow/scripts/update-project.mjs';

function writeFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createFixture(t, dependencies = {}, prefix = 'platform-profile-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFile(root, 'package.json', `${JSON.stringify({
    name: 'platform-profile-fixture',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      test: 'vitest run',
      lint: 'eslint .',
      typecheck: 'vue-tsc --noEmit',
    },
    dependencies: {
      vue: '^3.5.0',
      ...dependencies,
    },
    devDependencies: {
      vite: '^6.0.0',
    },
  }, null, 2)}\n`);
  writeFile(root, 'src/pages/Home.vue', '<template><main>fixture</main></template>\n');
  return root;
}

function replaceDependencies(root, dependencies) {
  const packagePath = path.join(root, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageJson.dependencies = { vue: '^3.5.0', ...dependencies };
  fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
}

function replaceScripts(root, scripts) {
  const packagePath = path.join(root, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageJson.scripts = scripts;
  fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
}

test('显式平台脚本生成三类目标的全部候选且不泄露脚本内容', () => {
  const result = detectPlatformCommands('npm', {
    'dev:weapp': 'sensitive-platform-secret --mode dev',
    'serve-weapp': 'tool serve',
    'start:wechat': 'tool start',
    'build:mp-weixin': 'tool build',
    'start:mp-alipay': 'tool start',
    'build-alipay': 'tool build',
    'dev:h5': 'tool dev',
    'build-h5': 'tool build',
    'dev:mp-weixin': '',
    'prebuild:weapp': 'tool prebuild',
    'build:ios': 'tool ios',
  });

  assert.equal(result.status, 'detected');
  assert.equal(result.source, 'package-scripts');
  assert.deepEqual(result.targets, [
    {
      target: 'wechat-mini-program',
      devCandidates: [
        { scriptName: 'dev:weapp', command: 'npm run dev:weapp', source: 'explicit-platform-script', executed: false },
        { scriptName: 'serve-weapp', command: 'npm run serve-weapp', source: 'explicit-platform-script', executed: false },
        { scriptName: 'start:wechat', command: 'npm run start:wechat', source: 'explicit-platform-script', executed: false },
      ],
      buildCandidates: [
        { scriptName: 'build:mp-weixin', command: 'npm run build:mp-weixin', source: 'explicit-platform-script', executed: false },
      ],
    },
    {
      target: 'alipay-mini-program',
      devCandidates: [
        { scriptName: 'start:mp-alipay', command: 'npm run start:mp-alipay', source: 'explicit-platform-script', executed: false },
      ],
      buildCandidates: [
        { scriptName: 'build-alipay', command: 'npm run build-alipay', source: 'explicit-platform-script', executed: false },
      ],
    },
    {
      target: 'h5',
      devCandidates: [
        { scriptName: 'dev:h5', command: 'npm run dev:h5', source: 'explicit-platform-script', executed: false },
      ],
      buildCandidates: [
        { scriptName: 'build-h5', command: 'npm run build-h5', source: 'explicit-platform-script', executed: false },
      ],
    },
  ]);
  assert.deepEqual(result.evidence, [
    'script:build-alipay',
    'script:build-h5',
    'script:build:mp-weixin',
    'script:dev:h5',
    'script:dev:weapp',
    'script:serve-weapp',
    'script:start:mp-alipay',
    'script:start:wechat',
  ]);
  assert.doesNotMatch(JSON.stringify(result), /sensitive-platform-secret/u);
});

test('平台候选使用当前包管理器且空脚本和误导名称保持 missing', () => {
  for (const [packageManager, command] of [
    ['npm', 'npm run build:weapp'],
    ['pnpm', 'pnpm run build:weapp'],
    ['yarn', 'yarn build:weapp'],
    ['bun', 'bun run build:weapp'],
  ]) {
    const detected = detectPlatformCommands(packageManager, { 'build:weapp': 'tool build' });
    assert.equal(detected.targets[0].buildCandidates[0].command, command, packageManager);
  }

  assert.deepEqual(detectPlatformCommands('npm', {
    'dev:h5': '',
    'prebuild:weapp': 'tool prebuild',
    'build:ios': 'tool ios',
    build: 'echo weapp',
  }), {
    status: 'missing',
    source: 'unknown',
    targets: [],
    evidence: [],
  });
});

test('平台项目缺少平台脚本时警告，普通项目保持安静空态', (t) => {
  const platformRoot = createFixture(t, { '@tarojs/taro': '^4.0.0' });
  const platformCheck = checkProject(platformRoot);
  assert.equal(platformCheck.platformCommands.status, 'missing');
  assert.match(platformCheck.warnings.join('\n'), /已识别平台框架，但 package\.json 未配置受支持的显式平台脚本/u);

  const webRoot = createFixture(t);
  const webCheck = checkProject(webRoot);
  assert.equal(webCheck.platformCommands.status, 'missing');
  assert.doesNotMatch(webCheck.warnings.join('\n'), /显式平台脚本/u);
});

test('明确依赖生成 uni-app、Taro 和 Remax 平台画像且保留第一轮字段', () => {
  assert.deepEqual(detectTargetProfile({ 'element-plus': '^2.0.0', '@dcloudio/uni-app': '^3.0.0' }).platform, {
    kind: 'cross-platform',
    frameworks: ['uni-app'],
    source: 'package-dependencies',
    evidence: ['package:@dcloudio/uni-app'],
  });
  assert.deepEqual(detectTargetProfile({ '@tarojs/cli': '^4.0.0' }).platform, {
    kind: 'cross-platform',
    frameworks: ['taro'],
    source: 'package-dependencies',
    evidence: ['package:@tarojs/cli'],
  });
  assert.deepEqual(detectTargetProfile({ remax: '^2.0.0' }).platform, {
    kind: 'cross-platform',
    frameworks: ['remax'],
    source: 'package-dependencies',
    evidence: ['package:remax'],
  });
  const profile = detectTargetProfile({ 'element-plus': '^2.0.0', '@tarojs/taro': '^4.0.0' });
  assert.deepEqual({
    formFactor: profile.formFactor,
    source: profile.source,
    evidence: profile.evidence,
  }, {
    formFactor: 'desktop',
    source: 'package-dependencies',
    evidence: ['element-plus'],
  });
});

test('固定文件组合识别微信原生和 uni-app，误导目录不形成证据', (t) => {
  const nativeRoot = createFixture(t);
  writeFile(nativeRoot, 'app.json', '{"pages":["pages/index/index"]}\n');
  writeFile(nativeRoot, 'project.config.json', '{"appid":"sensitive-app-id","compileType":"miniprogram"}\n');
  const nativeInspection = inspectProject(nativeRoot);
  assert.deepEqual(nativeInspection.targetProfile.platform, {
    kind: 'native-mini-program',
    frameworks: ['wechat-native'],
    source: 'project-files',
    evidence: ['file:app.json', 'file:project.config.json'],
  });
  assert.doesNotMatch(JSON.stringify(nativeInspection.targetProfile), /sensitive-app-id/u);

  const uniRoot = createFixture(t);
  writeFile(uniRoot, 'src/manifest.json', '{"name":"fixture"}\n');
  writeFile(uniRoot, 'src/pages.json', '{"pages":[]}\n');
  assert.deepEqual(inspectProject(uniRoot).targetProfile.platform, {
    kind: 'cross-platform',
    frameworks: ['uni-app'],
    source: 'project-files',
    evidence: ['file:src/manifest.json', 'file:src/pages.json'],
  });

  const misleadingRoot = createFixture(t, {}, 'wechat-uni-app-taro-');
  writeFile(misleadingRoot, 'src/wechat/app.json', '{}\n');
  writeFile(misleadingRoot, 'src/taro/pages/index.js', 'export default {}\n');
  assert.deepEqual(inspectProject(misleadingRoot).targetProfile.platform, {
    kind: 'unknown',
    frameworks: [],
    source: 'unknown',
    evidence: [],
  });
});

test('原生微信小程序生成准确的预设、路径、测试与人工验证边界', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-native-bootstrap-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFile(root, 'package.json', `${JSON.stringify({
    name: 'wechat-native-fixture',
    scripts: {
      test: 'echo "Error: no test specified" && exit 1',
    },
    dependencies: {
      '@vant/weapp': '^1.11.7',
    },
  }, null, 2)}\n`);
  writeFile(root, 'yarn.lock', '# fixture\n');
  writeFile(root, 'app.json', '{"pages":["pages/index/index"]}\n');
  writeFile(root, 'project.config.json', '{"compileType":"miniprogram"}\n');
  writeFile(root, 'app.js', 'App({ globalData: { userInfo: null } });\n');
  writeFile(root, 'api/user.js', 'export const getUser = () => null;\n');
  writeFile(root, 'pages/index/index.js', 'Page({});\n');
  writeFile(root, 'components/card/card.js', 'Component({});\n');

  const inspection = inspectProject(root);
  assert.equal(inspection.preset, 'wechat-native');
  assert.equal(inspection.packageManager, 'yarn');
  assert.deepEqual(inspection.techStack, ['微信原生小程序', '@vant/weapp [dependencies="^1.11.7"]']);
  assert.deepEqual({
    formFactor: inspection.targetProfile.formFactor,
    source: inspection.targetProfile.source,
    evidence: inspection.targetProfile.evidence,
  }, {
    formFactor: 'mobile',
    source: 'package-dependencies',
    evidence: ['@vant/weapp'],
  });
  assert.equal(inspection.scriptNames.test, null);
  assert.equal(inspection.commands.test, '未配置');
  assert.deepEqual(inspection.commandSemantics.test, {
    scriptName: 'test',
    command: 'yarn test',
    source: 'placeholder',
    status: 'placeholder',
  });
  assert.deepEqual(inspection.paths, {
    views: 'pages',
    components: 'components',
    request: 'api',
    router: 'app.json',
    store: 'app.js',
    tests: '未识别',
  });

  const initialized = runBootstrap({ target: root, write: true });
  assert.equal(initialized.ok, true);
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  const wayfinder = fs.readFileSync(path.join(root, 'wayfinder/frontend.md'), 'utf8');
  const openspec = fs.readFileSync(path.join(root, 'openspec/config.yaml'), 'utf8');
  assert.match(agents, /项目预设：`wechat-native`/u);
  assert.match(agents, /测试：`不可用（yarn test 为失败占位脚本）`（状态：`placeholder`）/u);
  assert.match(agents, /微信开发者工具或外部 CI/u);
  assert.match(wayfinder, /testCommandStatus: "placeholder"/u);
  assert.match(wayfinder, /frontend-ai-workflow:facts:start/u);
  assert.match(wayfinder, /技术栈：根 package 共 1 项直接依赖，展示 1 项，遗漏 0 项：@vant\/weapp \[dependencies="\^1\.11\.7"\]/u);
  assert.match(wayfinder, /路由与页面注册：`app\.json`/u);
  assert.match(wayfinder, /深度分析状态：未启用（普通初始化仅生成可追溯的识别基线）/u);
  assert.match(openspec, /测试命令：不可用（yarn test 为失败占位脚本）（状态：placeholder）/u);

  const checked = checkProject(root);
  assert.equal(checked.commandEvidence.test.status, 'placeholder');
  assert.equal(checked.commandEvidence.test.executed, false);
  assert.deepEqual(checked.managedContentFreshness, { checked: true, stale: false, files: [] });
  assert.match(checked.warnings.join('\n'), /失败占位脚本/u);
  assert.match(checked.warnings.join('\n'), /记录微信开发者工具或外部 CI 的验证环境/u);
});

test('失败测试占位脚本不会遮蔽后续真实测试入口', (t) => {
  const root = createFixture(t);
  replaceScripts(root, {
    test: 'echo "Error: no test specified" && exit 1',
    'test:unit': 'node --test',
  });

  const inspection = inspectProject(root);
  assert.equal(inspection.scriptNames.test, 'test:unit');
  assert.equal(inspection.commands.test, 'npm run test:unit');
  assert.deepEqual(inspection.commandSemantics.test, {
    scriptName: 'test:unit',
    command: 'npm run test:unit',
    source: 'detected',
    status: 'detected',
  });
});

test('多框架证据返回 conflict 并区分包与项目文件来源', (t) => {
  assert.deepEqual(detectTargetProfile({ '@tarojs/taro': '^4.0.0', remax: '^2.0.0' }).platform, {
    kind: 'conflict',
    frameworks: ['taro', 'remax'],
    source: 'package-dependencies',
    evidence: ['package:@tarojs/taro', 'package:remax'],
  });

  const root = createFixture(t, { '@dcloudio/uni-app': '^3.0.0' });
  writeFile(root, 'app.json', '{}\n');
  writeFile(root, 'project.config.json', '{}\n');
  const projectEvidence = collectPlatformProjectEvidence(root);
  assert.deepEqual(detectTargetProfile({ '@dcloudio/uni-app': '^3.0.0' }, projectEvidence).platform, {
    kind: 'conflict',
    frameworks: ['wechat-native', 'uni-app'],
    source: 'package-and-project-files',
    evidence: ['file:app.json', 'file:project.config.json', 'package:@dcloudio/uni-app'],
  });
});

test('初始化、升级和检查共享平台画像并保留项目自定义内容', (t) => {
  const root = createFixture(t, { '@tarojs/taro': '^4.0.0' });
  replaceScripts(root, {
    dev: 'vite',
    build: 'vite build',
    test: 'vitest run',
    lint: 'eslint .',
    typecheck: 'vue-tsc --noEmit',
    'dev:weapp': 'sensitive-platform-secret --mode dev',
    'build:weapp': 'tool build',
  });
  const preview = runBootstrap({ target: root });
  assert.equal(preview.write, false);
  assert.equal(preview.inspection.targetProfile.platform.kind, 'cross-platform');
  assert.equal(preview.inspection.platformCommands.status, 'detected');
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false);

  const initialized = runBootstrap({ target: root, write: true });
  assert.equal(initialized.ok, true);
  const agentsPath = path.join(root, 'AGENTS.md');
  const wayfinderPath = path.join(root, 'wayfinder/frontend.md');
  const openspecPath = path.join(root, 'openspec/config.yaml');
  assert.match(fs.readFileSync(agentsPath, 'utf8'), /平台框架画像：`cross-platform`（框架：taro；来源：`package-dependencies`；证据：package:@tarojs\/taro）/u);
  assert.match(fs.readFileSync(agentsPath, 'utf8'), /平台命令证据：wechat-mini-program（开发候选：npm run dev:weapp；构建候选：npm run build:weapp）（状态：`detected`；证据：script:build:weapp、script:dev:weapp；发现不代表已执行）/u);
  assert.match(fs.readFileSync(wayfinderPath, 'utf8'), /targetPlatformKind: "cross-platform"/u);
  assert.match(fs.readFileSync(wayfinderPath, 'utf8'), /targetPlatformFrameworks: "taro"/u);
  assert.match(fs.readFileSync(wayfinderPath, 'utf8'), /platformCommandStatus: "detected"/u);
  assert.match(fs.readFileSync(wayfinderPath, 'utf8'), /platformCommandTargets: "wechat-mini-program"/u);
  assert.match(fs.readFileSync(wayfinderPath, 'utf8'), /platformCommandEvidence: "script:build:weapp、script:dev:weapp"/u);
  assert.match(fs.readFileSync(openspecPath, 'utf8'), /平台框架画像：cross-platform（框架：taro；来源：package-dependencies；证据：package:@tarojs\/taro；有限安全信号，不证明目标已构建或发布）/u);
  assert.match(fs.readFileSync(openspecPath, 'utf8'), /平台命令证据：wechat-mini-program（开发候选：npm run dev:weapp；构建候选：npm run build:weapp）（状态：detected；证据：script:build:weapp、script:dev:weapp；发现不代表已执行）/u);
  assert.doesNotMatch([
    fs.readFileSync(agentsPath, 'utf8'),
    fs.readFileSync(wayfinderPath, 'utf8'),
    fs.readFileSync(openspecPath, 'utf8'),
  ].join('\n'), /sensitive-platform-secret/u);
  assert.deepEqual(checkProject(root).targetProfile, initialized.inspection.targetProfile);
  assert.deepEqual(checkProject(root).platformCommands, initialized.inspection.platformCommands);

  fs.appendFileSync(agentsPath, '\n项目自定义 AGENTS 内容。\n', 'utf8');
  fs.appendFileSync(wayfinderPath, '\n项目自定义 Wayfinder 内容。\n', 'utf8');
  fs.appendFileSync(openspecPath, '\n# 项目自定义 OpenSpec 内容。\n', 'utf8');
  replaceDependencies(root, { remax: '^2.0.0' });
  replaceScripts(root, {
    dev: 'vite',
    build: 'vite build',
    test: 'vitest run',
    lint: 'eslint .',
    typecheck: 'vue-tsc --noEmit',
    'build:h5': 'tool build',
  });

  const upgraded = runUpdate({ target: root, write: true });
  assert.equal(upgraded.ok, true);
  assert.deepEqual(upgraded.inspection.targetProfile.platform.frameworks, ['remax']);
  const nextAgents = fs.readFileSync(agentsPath, 'utf8');
  const nextWayfinder = fs.readFileSync(wayfinderPath, 'utf8');
  const nextOpenSpec = fs.readFileSync(openspecPath, 'utf8');
  assert.match(nextAgents, /平台框架画像：`cross-platform`（框架：remax；来源：`package-dependencies`；证据：package:remax）/u);
  assert.match(nextAgents, /平台命令证据：h5（开发候选：未识别；构建候选：npm run build:h5）（状态：`detected`；证据：script:build:h5；发现不代表已执行）/u);
  assert.match(nextWayfinder, /targetPlatformFrameworks: "remax"/u);
  assert.match(nextWayfinder, /platformCommandTargets: "h5"/u);
  assert.match(nextWayfinder, /platformCommandEvidence: "script:build:h5"/u);
  assert.match(nextOpenSpec, /平台框架画像：cross-platform（框架：remax；来源：package-dependencies；证据：package:remax；有限安全信号，不证明目标已构建或发布）/u);
  assert.match(nextOpenSpec, /平台命令证据：h5（开发候选：未识别；构建候选：npm run build:h5）（状态：detected；证据：script:build:h5；发现不代表已执行）/u);
  assert.match(nextAgents, /项目自定义 AGENTS 内容/u);
  assert.match(nextWayfinder, /项目自定义 Wayfinder 内容/u);
  assert.match(nextOpenSpec, /项目自定义 OpenSpec 内容/u);
  assert.deepEqual(checkProject(root).targetProfile, upgraded.inspection.targetProfile);
  assert.deepEqual(checkProject(root).platformCommands, upgraded.inspection.platformCommands);
});
