import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runBootstrap } from '../plugins/frontend-ai-workflow/scripts/bootstrap-project.mjs';
import { checkProject } from '../plugins/frontend-ai-workflow/scripts/check-project.mjs';
import { runUpdate } from '../plugins/frontend-ai-workflow/scripts/update-project.mjs';
import { expectedPublicSkills } from './helpers/workflow-fixtures.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readRepositoryFile(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

function readFrontmatterValue(content, key) {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/u)?.[1] || '';
  return frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'mu'))?.[1].trim() || '';
}

function writeFixtureFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function createVueViteFixture(t) {
  fs.mkdirSync(path.join(repositoryRoot, 'outputs'), { recursive: true });
  const root = fs.mkdtempSync(path.join(repositoryRoot, 'outputs', 'fast-change-route-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFixtureFile(root, 'package-lock.json', '{}\n');
  writeFixtureFile(root, 'package.json', `${JSON.stringify({
    name: 'fast-change-vue-fixture',
    scripts: { dev: 'vite', build: 'vite build', test: 'vitest run' },
    dependencies: { vue: '^3.5.0' },
    devDependencies: { vite: '^6.0.0', vitest: '^3.2.4' },
  }, null, 2)}\n`);
  writeFixtureFile(root, 'src/App.vue', '<template><main>Fast change fixture</main></template>\n');
  writeFixtureFile(root, 'vite.config.js', 'export default {};\n');
  return root;
}

const fastSkill = readRepositoryFile('plugins/frontend-ai-workflow/skills/frontend-fast-change/SKILL.md');
const fastMetadata = readRepositoryFile('plugins/frontend-ai-workflow/skills/frontend-fast-change/agents/openai.yaml');
const changeSkill = readRepositoryFile('plugins/frontend-ai-workflow/skills/frontend-change/SKILL.md');
const agentsTemplate = readRepositoryFile('plugins/frontend-ai-workflow/assets/templates/AGENTS.md');
const requirementGuidelines = readRepositoryFile('plugins/frontend-ai-workflow/references/requirement-guidelines.md');
const structureValidator = readRepositoryFile('plugins/frontend-ai-workflow/scripts/validate-structure.mjs');
const readme = readRepositoryFile('README.md');

test('独立快速 Skill 可被隐式选择且公开可见', () => {
  assert.equal(readFrontmatterValue(fastSkill, 'name'), 'frontend-fast-change');
  const description = readFrontmatterValue(fastSkill, 'description');
  assert.match(description, /clear, localized frontend code change immediately/u);
  assert.match(description, /expected result is already decided/u);
  assert.match(description, /Do not use for a matching active managed change/u);

  assert.match(fastMetadata, /default_prompt:\s*"[^"]*\$frontend-fast-change[^"]*"/u);
  assert.match(fastMetadata, /allow_implicit_invocation:\s*true/u);
  assert.equal(expectedPublicSkills.includes('frontend-fast-change'), true);
  assert.match(structureValidator, /const PUBLIC_SKILLS = \[[\s\S]*?'frontend-fast-change'/u);
});

test('快速 Skill 只读取最低必要事实且不创建规划产物', () => {
  const requiredFacts = [
    'explicitly asked for implementation',
    'expected result is already decided',
    'same local behavior',
    'focused automated test, project-native check, or specific manual check',
    'No matching active managed change exists',
  ];

  assert.match(fastSkill, /applicable `AGENTS\.md` files and the current worktree status/u);
  assert.match(fastSkill, /directly related source, necessary callers, and nearest tests/u);
  assert.match(fastSkill, /do not load requirements, interaction matrices, dependency profiles, or planning artifacts by default/u);
  for (const fact of requiredFacts) {
    assert.equal(fastSkill.includes(fact), true, `缺少快速准入事实：${fact}`);
  }
  assert.match(fastSkill, /without creating requirement or OpenSpec artifacts/u);
});

test('局部调用链可以充分修改而不受规模或目录关键词机械限制', () => {
  assert.match(fastSkill, /Multiple files are allowed when they are necessary parts of the same local call chain/u);
  assert.match(fastSkill, /Directory names, file count, changed-line count, and model confidence are neither proof nor blockers/u);
  assert.match(fastSkill, /Make the smallest sufficient in-scope change/u);
  assert.match(fastSkill, /Add or update a nearby test when the project already has a suitable pattern/u);
});

test('实质风险触发一次无损交接并复用已有工作', () => {
  const materialBoundaries = [
    'matching active managed change',
    'new or conflicting product decision',
    'shared/public contract boundary',
    'API',
    'authentication',
    'permission',
    'security or sensitive-data behavior',
    'persistence',
    'dependency or lockfile',
    'build',
    'deployment',
    'CI',
    'platform compatibility',
  ];

  assert.match(fastSkill, /Stop expanding the fast change and hand off once to `\$frontend-change`/u);
  for (const boundary of materialBoundaries) {
    assert.equal(fastSkill.includes(boundary), true, `缺少实质交接边界：${boundary}`);
  }
  assert.match(fastSkill, /Preserve user-owned work and any safe investigation, edits, or verification already completed/u);
  assert.match(fastSkill, /pass the discovered files, facts, current edits, and results/u);
  assert.match(fastSkill, /After the handoff, do not continue this fast path/u);
});

test('快速验证和交付保持真实且不扩大授权', () => {
  assert.match(fastSkill, /Send one brief start update/u);
  assert.match(fastSkill, /Run the narrowest verification that proves the expected result/u);
  assert.match(fastSkill, /When no matching automated check exists, perform and report the specific manual check/u);
  assert.match(fastSkill, /Run broader verification only when focused verification is unavailable/u);
  assert.match(fastSkill, /actual files changed, actual verification and result, and material residual risk/u);
  assert.match(fastSkill, /never authorizes commits, pushes, releases, messages, deployments/u);
});

test('原 frontend-change 保持发布版完整生命周期且不含独立快速分支', () => {
  const originalDescription = 'Drive a frontend change through exploration, planning, plan revision, implementation, specification synchronization, and completion using the plugin\'s internal planning engine. Use when a user wants to start, continue, implement, review, or finish a feature or bug change without operating the underlying engine commands directly.';
  assert.equal(readFrontmatterValue(changeSkill, 'description'), originalDescription);
  assert.doesNotMatch(changeSkill, /Fast Path|fast path|frontend-fast-change|small existing-behavior fix/iu);

  const lifecycleHeadings = ['### Explore', '### Plan', '### Revise', '### Implement', '### Complete'];
  let previousIndex = -1;
  for (const heading of lifecycleHeadings) {
    const currentIndex = changeSkill.indexOf(heading);
    assert.ok(currentIndex > previousIndex, `原完整生命周期缺失或顺序错误：${heading}`);
    previousIndex = currentIndex;
  }

  assert.match(changeSkill, /A new request with no matching active change defaults to Plan/u);
  assert.match(changeSkill, /Never invent a second change for work already represented by an active change/u);
  assert.match(changeSkill, /Pause and return to Revise when implementation exposes a material planning conflict/u);
  assert.match(changeSkill, /Preview the hard-gated completion/u);
});

test('活动变更内部修正与独立快速入口保持互斥', () => {
  const correctionEntryFacts = [
    'exactly one matching active change',
    'confirmed or project-default `D-*` and `A-*`',
    'the same local behavior',
    'a focused check can prove the correction',
    'no observable behavior or material shared or external contract changes',
  ];

  assert.match(fastSkill, /If a matching active change exists, hand off to `\$frontend-change`/u);
  assert.match(fastSkill, /No matching active managed change exists/u);
  assert.match(changeSkill, /#### Correct within an active change/u);
  for (const fact of correctionEntryFacts) {
    assert.equal(changeSkill.includes(fact), true, `缺少受管修正准入事实：${fact}`);
  }
  assert.match(changeSkill, /do not create another Skill, requirement, change, specification, or design/u);
  assert.match(changeSkill, /A new request with no matching active change defaults to Plan/u);
});

test('受管修正恢复真实状态并且同一聚焦命令只执行一次', () => {
  assert.match(changeSkill, /When it is `待验证`, restore it to `实施中`/u);
  assert.match(changeSkill, /reopen only the directly affected tasks, `A-\*` items, and `V-\*` records before editing source/u);
  assert.match(changeSkill, /run the implement-stage requirement validator/u);
  assert.match(changeSkill, /execute it once through `verification-evidence\.mjs`; otherwise run the focused command once/u);
  assert.match(changeSkill, /Do not run unrelated full verification for this correction alone/u);
  assert.match(changeSkill, /identify every invalidated required record and rerun only those records/u);
  assert.match(changeSkill, /External CI evidence must describe the exact revision now being delivered/u);
});

test('受管修正遇到实质变化返回 Revise 且不削弱完成门禁', () => {
  const reviseBoundaries = [
    'new or changed `D-*` or `A-*`',
    'changes behavior or scope',
    'cannot remain bounded',
    'shared/public contract',
    'API',
    'authentication',
    'permission',
    'security or sensitive data',
    'persistence',
    'dependency',
    'build',
    'deployment',
    'CI',
    'platform compatibility',
  ];

  assert.match(changeSkill, /Stop this subflow and return to Revise/u);
  for (const boundary of reviseBoundaries) {
    assert.equal(changeSkill.includes(boundary), true, `缺少受管修正退出边界：${boundary}`);
  }
  assert.match(changeSkill, /Preserve the safe investigation and verification already completed instead of repeating it/u);
  assert.match(changeSkill, /Keep the original Complete and finalize gates unchanged/u);
  assert.match(changeSkill, /Preview the hard-gated completion/u);
  assert.match(changeSkill, /repeat the same command with `--write`/u);
  assert.match(changeSkill, /archive_partial_failure/u);
  assert.doesNotMatch(fastSkill, /Correct within an active change/u);
});

test('公共文档只负责两个 Skill 的简洁路由', () => {
  for (const content of [agentsTemplate, requirementGuidelines, readme]) {
    assert.match(content, /\$frontend-fast-change/u);
    assert.match(content, /\$frontend-change/u);
    assert.match(content, /局部/u);
    assert.match(content, /交接/u);
  }

  assert.match(agentsTemplate, /不创建需求或 OpenSpec 产物/u);
  assert.match(requirementGuidelines, /完整准入和执行合同以该 Skill 为准/u);
  assert.match(readme, /简单任务只加载短路径并直接交付/u);
  assert.match(readme, /独立快速 Skill 不改变这里原有的状态规则和完成门禁/u);
});

test('Vue 3 + Vite fixture 在初始化、重复执行、升级和检查后保留新路由', (t) => {
  const root = createVueViteFixture(t);
  const preview = runBootstrap({ target: root });
  assert.equal(preview.ok, true);
  assert.equal(preview.write, false);

  const initialized = runBootstrap({ target: root, write: true });
  assert.equal(initialized.ok, true);
  const agentsPath = path.join(root, 'AGENTS.md');
  const customized = fs.readFileSync(agentsPath, 'utf8')
    .replace('## 工作流', '## 旧工作流')
    .concat('\n项目自定义内容：升级后必须保留。\n');
  fs.writeFileSync(agentsPath, customized, 'utf8');

  const repeated = runBootstrap({ target: root, write: true });
  assert.equal(repeated.actions.find((item) => item.file === 'AGENTS.md').action, 'skip');
  const upgraded = runUpdate({ target: root, write: true });
  assert.equal(upgraded.ok, true);

  const agents = fs.readFileSync(agentsPath, 'utf8');
  assert.match(agents, /\$frontend-fast-change/u);
  assert.match(agents, /\$frontend-change/u);
  assert.match(agents, /项目自定义内容：升级后必须保留/u);

  const checked = checkProject(root);
  assert.equal(checked.ok, true);
  assert.equal(checked.preset, 'vue3-vite');
});
