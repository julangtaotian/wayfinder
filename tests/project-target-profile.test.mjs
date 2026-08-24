import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runBootstrap } from '../plugins/frontend-ai-workflow/scripts/bootstrap-project.mjs';
import { checkProject } from '../plugins/frontend-ai-workflow/scripts/check-project.mjs';
import { inspectProject } from '../plugins/frontend-ai-workflow/scripts/inspect-project.mjs';
import { detectTargetProfile } from '../plugins/frontend-ai-workflow/scripts/project-target-profile.mjs';
import { runUpdate } from '../plugins/frontend-ai-workflow/scripts/update-project.mjs';

const UNKNOWN_PLATFORM_PROFILE = {
  kind: 'unknown',
  frameworks: [],
  source: 'unknown',
  evidence: [],
};

function writeFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createFixture(t, dependencies, prefix = 'target-profile-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFile(root, 'package.json', `${JSON.stringify({
    name: 'target-profile-fixture',
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

test('终端画像只根据依赖生成桌面、移动、混合和未知结果', () => {
  assert.deepEqual(detectTargetProfile({ antd: '^5.0.0', 'element-plus': '^2.0.0' }), {
    formFactor: 'desktop',
    source: 'package-dependencies',
    evidence: ['antd', 'element-plus'],
    platform: UNKNOWN_PLATFORM_PROFILE,
  });
  assert.deepEqual(detectTargetProfile({ vant: '^4.0.0', '@nutui/nutui': '^4.0.0' }), {
    formFactor: 'mobile',
    source: 'package-dependencies',
    evidence: ['@nutui/nutui', 'vant'],
    platform: UNKNOWN_PLATFORM_PROFILE,
  });
  assert.deepEqual(detectTargetProfile({ '@vant/weapp': '^1.11.7' }), {
    formFactor: 'mobile',
    source: 'package-dependencies',
    evidence: ['@vant/weapp'],
    platform: UNKNOWN_PLATFORM_PROFILE,
  });
  assert.deepEqual(detectTargetProfile({ vant: '^4.0.0', 'element-ui': '^2.0.0' }), {
    formFactor: 'mixed',
    source: 'package-dependencies',
    evidence: ['element-ui', 'vant'],
    platform: UNKNOWN_PLATFORM_PROFILE,
  });
  assert.deepEqual(detectTargetProfile({ vue: '^3.5.0' }), {
    formFactor: 'unknown',
    source: 'unknown',
    evidence: [],
    platform: UNKNOWN_PLATFORM_PROFILE,
  });
});

test('误导性的项目名和目录名不会改变未知终端画像', (t) => {
  const root = createFixture(t, {}, 'mobile-desktop-responsive-');
  writeFile(root, 'src/mobile/DesktopPage.vue', '<template><div>unknown</div></template>\n');

  const inspection = inspectProject(root);
  assert.equal(inspection.preset, 'vue3-vite');
  assert.equal(inspection.commands.build, 'npm run build');
  assert.deepEqual(inspection.targetProfile, {
    formFactor: 'unknown',
    source: 'unknown',
    evidence: [],
    platform: UNKNOWN_PLATFORM_PROFILE,
  });
});

test('初始化、升级和检查共享终端画像并保留自定义内容', (t) => {
  const root = createFixture(t, { 'element-plus': '^2.0.0' });
  const preview = runBootstrap({ target: root });
  assert.equal(preview.write, false);
  assert.deepEqual(preview.inspection.targetProfile, {
    formFactor: 'desktop',
    source: 'package-dependencies',
    evidence: ['element-plus'],
    platform: UNKNOWN_PLATFORM_PROFILE,
  });
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false);

  const initialized = runBootstrap({ target: root, write: true });
  assert.equal(initialized.ok, true);
  const agentsPath = path.join(root, 'AGENTS.md');
  const wayfinderPath = path.join(root, 'wayfinder/frontend.md');
  const openspecPath = path.join(root, 'openspec/config.yaml');
  assert.match(fs.readFileSync(agentsPath, 'utf8'), /终端画像：`desktop`（来源：`package-dependencies`；证据：element-plus）/u);
  assert.match(fs.readFileSync(wayfinderPath, 'utf8'), /targetFormFactor: "desktop"/u);
  assert.match(fs.readFileSync(wayfinderPath, 'utf8'), /targetProfileEvidence: "element-plus"/u);
  assert.match(fs.readFileSync(openspecPath, 'utf8'), /终端画像：desktop（来源：package-dependencies；证据：element-plus；有限兼容信号，unknown 不表示框架不存在）/u);
  assert.deepEqual(checkProject(root).targetProfile, initialized.inspection.targetProfile);

  fs.appendFileSync(agentsPath, '\n项目自定义 AGENTS 内容。\n', 'utf8');
  fs.appendFileSync(wayfinderPath, '\n项目自定义 Wayfinder 内容。\n', 'utf8');
  fs.appendFileSync(openspecPath, '\n# 项目自定义 OpenSpec 内容。\n', 'utf8');
  replaceDependencies(root, { vant: '^4.0.0' });

  const upgraded = runUpdate({ target: root, write: true });
  assert.equal(upgraded.ok, true);
  assert.equal(upgraded.inspection.targetProfile.formFactor, 'mobile');
  const nextAgents = fs.readFileSync(agentsPath, 'utf8');
  const nextWayfinder = fs.readFileSync(wayfinderPath, 'utf8');
  const nextOpenSpec = fs.readFileSync(openspecPath, 'utf8');
  assert.match(nextAgents, /终端画像：`mobile`（来源：`package-dependencies`；证据：vant）/u);
  assert.match(nextWayfinder, /targetFormFactor: "mobile"/u);
  assert.match(nextOpenSpec, /终端画像：mobile（来源：package-dependencies；证据：vant；有限兼容信号，unknown 不表示框架不存在）/u);
  assert.match(nextAgents, /项目自定义 AGENTS 内容/u);
  assert.match(nextWayfinder, /项目自定义 Wayfinder 内容/u);
  assert.match(nextOpenSpec, /项目自定义 OpenSpec 内容/u);
  assert.deepEqual(checkProject(root).targetProfile, upgraded.inspection.targetProfile);
});
