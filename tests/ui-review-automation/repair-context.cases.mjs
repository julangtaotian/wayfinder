import test from 'node:test';
import {
  assert, fs, path, spawnSync, createProject, configV2Input, loadUiReviewConfig,
  createReviewRun, completeReviewRun, createVerifyRun, completeVerifyRun, writeRunState, workflowScript,
} from './fixtures.mjs';
import { sha256 } from '../../plugins/frontend-ai-workflow/scripts/ui-review-contract.mjs';
import { prepareRepairContext, assertRepairContextFresh } from '../../plugins/frontend-ai-workflow/scripts/ui-review-repair-context.mjs';

function setup(context) {
  const root = createProject(context, configV2Input());
  const config = loadUiReviewConfig(root);
  const result = { findings: [{ id: 'UI-001', confidence: 'high', selector: 'main', type: '颜色', targetValue: 'red', repairable: false }] };
  const state = completeReviewRun(createReviewRun(config, 'home-desktop', { runId: 'repair-context' }), result);
  const proposal = {
    runId: state.runId,
    scenarioFingerprint: state.scenarioFingerprint,
    candidates: [{
      findingId: state.findings[0].id,
      findingFingerprint: state.findings[0].fingerprint,
      sourceSha256: sha256(fs.readFileSync(path.join(root, 'src/main.css'))),
      sourceTarget: { file: 'src/main.css', anchor: 'main {' },
      changeScope: '只修改 main 的颜色',
      forbiddenChanges: '不修改其他属性或业务行为',
      verification: { workingDirectory: 'src', commands: ['node --test'], page: '/', assertions: ['main 颜色为 red'] },
    }],
  };
  return { root, config, state, result, proposal };
}

function runCli(root, ...args) {
  return spawnSync(process.execPath, [workflowScript, ...args, '--target', root], { encoding: 'utf8' });
}

test('候选补齐保留原始发现、保持幂等且复验不误报 resolved', (context) => {
  const { root, config, state, result, proposal } = setup(context);
  const original = JSON.stringify(state);
  const next = prepareRepairContext(root, state, config, proposal);
  assert.equal(JSON.stringify(state), original);
  assert.deepEqual(next.findings, state.findings);
  assert.equal(next.findings[0].repairable, false);
  assert.equal(next.repairCandidates.length, 1);
  assert.equal(prepareRepairContext(root, next, config, proposal), next);
  assert.doesNotThrow(() => assertRepairContextFresh(root, next, config));
  const stillBroken = completeVerifyRun(createVerifyRun(config, next, { runId: 'still-broken' }), next, result);
  assert.equal(stillBroken.verification.remaining.length, 1);
  assert.equal(stillBroken.verification.resolved.length, 0);
  assert.equal(stillBroken.verification.new.length, 0);
  const fixed = completeVerifyRun(createVerifyRun(config, next, { runId: 'fixed' }), next, { findings: [] });
  assert.equal(fixed.status, 'passed');
  assert.equal(fixed.verification.resolved.length, 1);
});

test('候选拒绝失效、空集合、重复、越界与跨平台路径且不写源码', (context) => {
  const { root, config, state, proposal } = setup(context);
  const source = fs.readFileSync(path.join(root, 'src/main.css'), 'utf8');
  const cases = [
    ['UI_REPAIR_BASELINE_STALE', (p) => { p.runId = 'other'; }],
    ['UI_REPAIR_BASELINE_STALE', (p) => { p.scenarioFingerprint = 'other'; }],
    ['UI_REPAIR_FINDING_STALE', (p) => { p.candidates[0].findingFingerprint = 'old'; }],
    ['UI_REPAIR_CANDIDATES_EMPTY', (p) => { p.candidates = []; }],
    ['UI_REPAIR_DUPLICATE', (p) => { p.candidates.push(p.candidates[0]); }],
    ['UI_REPAIR_SOURCE_STALE', (p) => { p.candidates[0].sourceSha256 = 'old'; }],
    ['UI_REPAIR_ANCHOR_INVALID', (p) => { p.candidates[0].sourceTarget.anchor = 'missing'; }],
    ['UI_REPAIR_CONTEXT_INVALID', (p) => { p.candidates[0].verification.assertions = []; }],
    ['UI_REPAIR_CONTEXT_INVALID', (p) => { p.candidates[0].verification.commands = []; }],
    ['UI_REPAIR_DIRECTORY_INVALID', (p) => { p.candidates[0].verification.workingDirectory = 'src/main.css'; }],
  ];
  for (const value of ['../outside.css', '/tmp/outside.css', 'D:/workspace/main.css', 'D:\\workspace\\main.css', 'src\\main.css']) {
    cases.push(['unsafe_project_path', (p) => { p.candidates[0].sourceTarget.file = value; }]);
  }
  for (const [code, mutate] of cases) {
    const input = structuredClone(proposal);
    mutate(input);
    assert.throws(() => prepareRepairContext(root, state, config, input), { code });
  }
  assert.equal(fs.readFileSync(path.join(root, 'src/main.css'), 'utf8'), source);
  const changedConfig = structuredClone(config);
  changedConfig.scenarios[0].fingerprint = 'changed';
  assert.throws(() => prepareRepairContext(root, state, changedConfig, proposal), { code: 'UI_REPAIR_BASELINE_STALE' });
  assert.throws(() => prepareRepairContext(root, { ...state, schemaVersion: 1 }, config, proposal), { code: 'UI_REPAIR_CONTEXT_INVALID' });
  const stale = prepareRepairContext(root, state, config, proposal);
  fs.appendFileSync(path.join(root, 'src/main.css'), '\n');
  assert.throws(() => assertRepairContextFresh(root, stale, config), { code: 'UI_REPAIR_SOURCE_STALE' });
});

test('源码锚点兼容 CRLF，拒绝歧义和目录链接', (context) => {
  const { root, config, state, proposal } = setup(context);
  const file = path.join(root, 'src/main.css');
  fs.writeFileSync(file, 'main {\r\n  color: blue;\r\n}\r\n');
  proposal.candidates[0].sourceSha256 = sha256(fs.readFileSync(file));
  proposal.candidates[0].sourceTarget.anchor = 'main {\n  color: blue;';
  assert.doesNotThrow(() => prepareRepairContext(root, state, config, proposal));
  fs.appendFileSync(file, fs.readFileSync(file));
  proposal.candidates[0].sourceSha256 = sha256(fs.readFileSync(file));
  assert.throws(() => prepareRepairContext(root, state, config, proposal), { code: 'UI_REPAIR_ANCHOR_INVALID' });
  // Windows 使用目录 junction，不需要文件符号链接特权。
  fs.symlinkSync(path.join(root, 'src'), path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  proposal.candidates[0].sourceTarget.file = 'linked/main.css';
  assert.throws(() => prepareRepairContext(root, state, config, proposal), { code: 'project_path_symlink' });
});

test('prepare-repair CLI 预览只读、显式写入幂等，repair-gate 检查陈旧源码', (context) => {
  const { root, config, state, proposal } = setup(context);
  writeRunState(root, state);
  for (const key of ['actualScreenshot', 'annotatedScreenshot', 'report']) {
    const file = path.join(root, state.artifacts[key]);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'fixture evidence');
  }
  fs.writeFileSync(path.join(root, 'proposal.json'), JSON.stringify(proposal));
  const args = ['prepare-repair', '--state', state.artifacts.state, '--result', 'proposal.json'];
  const statePath = path.join(root, state.artifacts.state);
  const original = fs.readFileSync(statePath, 'utf8');
  const preview = runCli(root, ...args);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).write, false);
  assert.equal(fs.readFileSync(statePath, 'utf8'), original);
  const written = runCli(root, ...args, '--write');
  assert.equal(written.status, 0, written.stderr);
  const persisted = fs.readFileSync(statePath, 'utf8');
  assert.equal(runCli(root, ...args, '--write').status, 0);
  assert.equal(fs.readFileSync(statePath, 'utf8'), persisted);
  const gate = runCli(root, 'repair-gate', '--state', state.artifacts.state);
  assert.equal(JSON.parse(gate.stdout).decision, 'suggest');
  const apply = runCli(root, 'repair-gate', '--state', state.artifacts.state, '--explicit-approval');
  assert.equal(JSON.parse(apply.stdout).decision, 'apply');
  const tampered = JSON.parse(persisted);
  tampered.findings[0].targetValue = 'green';
  assert.throws(() => assertRepairContextFresh(root, tampered, config), { code: 'UI_REPAIR_FINDING_STALE' });
  fs.appendFileSync(path.join(root, 'src/main.css'), '\n');
  const stale = runCli(root, 'repair-gate', '--state', state.artifacts.state, '--explicit-approval');
  assert.equal(stale.status, 1);
  assert.equal(JSON.parse(stale.stdout).code, 'UI_REPAIR_SOURCE_STALE');
  assert.equal(fs.readFileSync(statePath, 'utf8'), persisted);
  fs.writeFileSync(path.join(root, 'proposal.json'), '{');
  const malformed = runCli(root, ...args, '--write');
  assert.equal(malformed.status, 1);
  assert.equal(JSON.parse(malformed.stdout).code, 'UI_REPAIR_CONTEXT_INVALID');
  assert.equal(fs.readFileSync(statePath, 'utf8'), persisted);
});
