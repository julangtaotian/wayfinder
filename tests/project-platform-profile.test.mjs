import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runBootstrap } from '../plugins/frontend-ai-workflow/scripts/bootstrap-project.mjs';
import { checkProject } from '../plugins/frontend-ai-workflow/scripts/check-project.mjs';
import { inspectProject } from '../plugins/frontend-ai-workflow/scripts/inspect-project.mjs';
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
  const preview = runBootstrap({ target: root });
  assert.equal(preview.write, false);
  assert.equal(preview.inspection.targetProfile.platform.kind, 'cross-platform');
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false);

  const initialized = runBootstrap({ target: root, write: true });
  assert.equal(initialized.ok, true);
  const agentsPath = path.join(root, 'AGENTS.md');
  const wayfinderPath = path.join(root, 'wayfinder/frontend.md');
  const openspecPath = path.join(root, 'openspec/config.yaml');
  assert.match(fs.readFileSync(agentsPath, 'utf8'), /平台框架画像：`cross-platform`（框架：taro；来源：`package-dependencies`；证据：package:@tarojs\/taro）/u);
  assert.match(fs.readFileSync(wayfinderPath, 'utf8'), /targetPlatformKind: "cross-platform"/u);
  assert.match(fs.readFileSync(wayfinderPath, 'utf8'), /targetPlatformFrameworks: "taro"/u);
  assert.match(fs.readFileSync(openspecPath, 'utf8'), /平台框架画像：cross-platform（框架：taro；来源：package-dependencies；证据：package:@tarojs\/taro）/u);
  assert.deepEqual(checkProject(root).targetProfile, initialized.inspection.targetProfile);

  fs.appendFileSync(agentsPath, '\n项目自定义 AGENTS 内容。\n', 'utf8');
  fs.appendFileSync(wayfinderPath, '\n项目自定义 Wayfinder 内容。\n', 'utf8');
  fs.appendFileSync(openspecPath, '\n# 项目自定义 OpenSpec 内容。\n', 'utf8');
  replaceDependencies(root, { remax: '^2.0.0' });

  const upgraded = runUpdate({ target: root, write: true });
  assert.equal(upgraded.ok, true);
  assert.deepEqual(upgraded.inspection.targetProfile.platform.frameworks, ['remax']);
  const nextAgents = fs.readFileSync(agentsPath, 'utf8');
  const nextWayfinder = fs.readFileSync(wayfinderPath, 'utf8');
  const nextOpenSpec = fs.readFileSync(openspecPath, 'utf8');
  assert.match(nextAgents, /平台框架画像：`cross-platform`（框架：remax；来源：`package-dependencies`；证据：package:remax）/u);
  assert.match(nextWayfinder, /targetPlatformFrameworks: "remax"/u);
  assert.match(nextOpenSpec, /平台框架画像：cross-platform（框架：remax；来源：package-dependencies；证据：package:remax）/u);
  assert.match(nextAgents, /项目自定义 AGENTS 内容/u);
  assert.match(nextWayfinder, /项目自定义 Wayfinder 内容/u);
  assert.match(nextOpenSpec, /项目自定义 OpenSpec 内容/u);
  assert.deepEqual(checkProject(root).targetProfile, upgraded.inspection.targetProfile);
});
