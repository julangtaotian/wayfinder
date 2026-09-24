import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginRoot = path.join(repositoryRoot, 'plugins', 'frontend-ai-workflow');
const pluginIgnorePath = path.join(pluginRoot, '.ignore');
const deliverySkillPath = path.join(pluginRoot, 'skills', 'frontend-delivery', 'SKILL.md');
const deliveryMetadataPath = path.join(pluginRoot, 'skills', 'frontend-delivery', 'agents', 'openai.yaml');
const agentsTemplatePath = path.join(pluginRoot, 'assets', 'templates', 'AGENTS.md');
const manifestPath = path.join(pluginRoot, '.codex-plugin', 'plugin.json');
const expectedPublicSkills = [
  'frontend-delivery',
  'frontend-test',
  'frontend-ui-review',
  'frontend-ui-verify',
  'frontend-workflow-bootstrap',
  'frontend-workflow-check',
  'frontend-workflow-upgrade',
];

function readOptional(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function readFrontmatterValue(content, key) {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/u)?.[1] || '';
  return frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'mu'))?.[1].trim() || '';
}

function assertContainsAll(content, values, label) {
  for (const value of values) {
    assert.equal(content.includes(value), true, `${label}缺少：${value}`);
  }
}

const deliverySkill = readOptional(deliverySkillPath);
const deliveryMetadata = readOptional(deliveryMetadataPath);
const description = readFrontmatterValue(deliverySkill, 'description');

test('[P1-02][P1-03] frontend-delivery 只匹配明确实施，不匹配只读意图', () => {
  assert.equal(fs.existsSync(deliverySkillPath), true, '目标架构必须提供 frontend-delivery Skill');
  assert.equal(readFrontmatterValue(deliverySkill, 'name'), 'frontend-delivery');
  assert.match(description, /implement[^.]*explicit|explicit(?:ly)?[^.]*implement|explicit implementation/iu);
  assert.match(description, /Do not use[^.]*explan[^.]*analy(?:sis|[sz]e)[^.]*review[^.]*status/iu);
  assert.match(deliveryMetadata, /default_prompt:\s*"[^"]*\$frontend-delivery[^"]*"/u);
  assert.match(deliveryMetadata, /allow_implicit_invocation:\s*true/u);
});

test('[P1-02] Delivery Core 固定 Direct、Light、Complex 三档实施合同', () => {
  assertContainsAll(deliverySkill, ['Direct', 'Light', 'Complex'], '实施深度合同');
  assert.match(deliverySkill, /Direct[^\n]*目标明确|Direct[^\n]*clear/iu);
  assert.match(deliverySkill, /Light[^\n]*(会话内|in-session)/iu);
  assert.match(deliverySkill, /Complex[^\n]*OpenSpec/iu);
  assert.match(deliverySkill, /文件数|file count/iu);
  assert.match(deliverySkill, /不能|must not|cannot[^\n]*(单独|alone)|(单独|alone)[^\n]*cannot/iu);
});

test('[P1-04][P1-05] Direct 与 Light 零管理文件，只有 Complex 使用 OpenSpec', () => {
  assert.match(deliverySkill, /Direct[^\n]*(不创建|do(?:es)? not create)[^\n]*(requirement|管理文件)/iu);
  assert.match(deliverySkill, /Light[^\n]*(不创建|do(?:es)? not create)[^\n]*(requirement|管理文件)/iu);
  assert.match(deliverySkill, /Direct[\s\S]*Light[\s\S]*(不写入|must not write|do not write)[^\n]*(openspec|\.workflow-history|evidence)/iu);
  assert.match(deliverySkill, /只有|only[^\n]*Complex[^\n]*(创建|create)[^\n]*OpenSpec/iu);
  assert.match(deliverySkill, /exactly one change is required/iu);
  assert.match(deliverySkill, /create before implementation/iu);
});

test('[P1-06] 规划深度与验证深度独立选择', () => {
  assertContainsAll(deliverySkill, ['None', 'Focused', 'Targeted UI', 'Full UI'], '验证路由合同');
  assert.match(deliverySkill, /规划[^\n]*验证[^\n]*(独立|independent)|planning[^\n]*verification[^\n]*independent/iu);
  assert.match(deliverySkill, /Direct[^\n]*Targeted UI/iu);
  assert.match(deliverySkill, /Light[^\n]*Focused/iu);
  assert.match(deliverySkill, /Complex[^\n]*(Focused|Full UI)/iu);
});

test('[P1-02] Project Context 与 Execution Brief 保持有界且不落盘', () => {
  assertContainsAll(
    deliverySkill,
    ['Project Context', 'Execution Brief', 'goal', 'scope', 'outOfScope', 'acceptance', 'verificationLevel'],
    '轻量交付上下文',
  );
  assert.match(deliverySkill, /Execution Brief[^\n]*(会话|conversation|in-memory)/iu);
  assert.match(deliverySkill, /不落盘|must not be written|do not write/iu);
  assert.match(deliverySkill, /完整源码|full source|完整日志|full log/iu);
});

test('[P1-02] Outcome Gate 必须逐项核对用户原始目标', () => {
  assert.match(deliverySkill, /Outcome Gate/u);
  assert.match(deliverySkill, /用户原始目标|original user goal/iu);
  assert.match(deliverySkill, /逐项|each acceptance|every acceptance/iu);
  assert.match(deliverySkill, /可观察|observable/iu);
  assert.match(deliverySkill, /测试退出码|test exit code/iu);
});

test('[P1-07] 同类失败最多修复两轮，第三次稳定停止', () => {
  assertContainsAll(deliverySkill, ['acceptance item', 'failed gate', 'observable symptom'], '失败问题指纹');
  assert.match(deliverySkill, /hypothesis.*layer.*candidate.*stage name.*does not reset/iu);
  assert.match(deliverySkill, /same fingerprint/iu);
  assert.match(deliverySkill, /最多两轮|at most two repair rounds|maximum of two repair rounds/iu);
  assert.match(deliverySkill, /第三次|third[^\n]*(停止|stop)/iu);
  assert.match(deliverySkill, /根因|root cause/iu);
});

test('[P2] 公开触发面严格限定为一个日常入口和六个显式专项入口', () => {
  const skillsRoot = path.join(pluginRoot, 'skills');
  const actualSkills = fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(actualSkills, expectedPublicSkills);

  for (const skill of expectedPublicSkills) {
    const metadata = readOptional(path.join(skillsRoot, skill, 'agents', 'openai.yaml'));
    const expectedPolicy = skill === 'frontend-delivery' ? 'true' : 'false';
    assert.match(metadata, new RegExp(`allow_implicit_invocation:\\s*${expectedPolicy}`, 'u'), skill);
  }
});

test('[P2] 主 Skill、AGENTS 路由和插件入口满足轻量预算', () => {
  const agentsTemplate = readOptional(agentsTemplatePath);
  const manifest = readOptional(manifestPath);
  const publicSurface = `${deliverySkill}\n${agentsTemplate}\n${manifest}`;

  assert.ok(Buffer.byteLength(deliverySkill) <= 3000, 'frontend-delivery 必须不超过 3KB');
  assert.ok(deliverySkill.split(/\r?\n/u).filter((line) => line.trim()).length <= 35, 'frontend-delivery 非空行必须不超过 35');
  assert.ok(Buffer.byteLength(agentsTemplate) <= 2500, 'AGENTS 受管模板必须不超过 2.5KB');
  assert.match(agentsTemplate, /解释、分析、评审、状态查询[^\n]*不调用 `\$frontend-delivery`/u);
  assert.match(manifest, /Direct or Light delivery without management files/u);
  assert.doesNotMatch(publicSurface, /frontend-(?:change|fast-change|requirement-write|ui-fix)/u);
});

test('[P3] Project Context 复用现有事实并限制模型可见结果', () => {
  assertContainsAll(
    deliverySkill,
    ['stack', 'scope', 'entrypoints', 'similarImplementations', 'testCandidates', 'commands'],
    'Project Context 字段',
  );
  assert.match(deliverySkill, /Project Context[^\n]*4096 bytes/u);
  assertContainsAll(
    deliverySkill,
    ['Wayfinder', 'project detection', 'dependency profile', 'direct targets', 'nearest tests'],
    '项目事实复用合同',
  );
  assert.match(deliverySkill, /Never include full source, full logs, plans, or evidence bodies/u);
});

test('[P3] Light 在会话内闭环并可无损升级同一任务', () => {
  assert.match(deliverySkill, /Light[^\n]*in-session plan of 3–7 steps/u);
  assert.match(deliverySkill, /Preserve safe investigation and edits[^\n]*escalates the same task/u);
  assert.doesNotMatch(deliverySkill, /context fingerprint|\broute\b|\bbegin\b|\bnext\b|managed profile/iu);
});

test('[P10-02] 主 Skill 不重复无变化的成功检查', () => {
  assert.match(deliverySkill, /Do not rerun a passing focused check without relevant edits/iu);
  assert.match(deliverySkill, /For Direct local edits[^\n]*focused check[^\n]*diff\/allowed-path review[^\n]*one safe closing tool call/iu);
  assert.match(deliverySkill, /report every failure/iu);
});

test('[P10-06] Skill 不声明无法兑现的预加载路径保证', () => {
  assert.doesNotMatch(`${description}\n${deliveryMetadata}`, /Skill roots alias|exact listed path|guessed cache path|search plugin cache paths/iu);
  assert.doesNotMatch(description, /(?:\/Users\/|[A-Z]:\\|~\/|\.codex\/plugins\/cache)/u);
});

test('[P10-06] 插件回退枚举排除固定运行时', () => {
  assert.equal(fs.readFileSync(pluginIgnorePath, 'utf8'), 'runtime/**\n');
});
