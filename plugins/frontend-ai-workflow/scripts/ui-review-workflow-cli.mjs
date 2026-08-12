import { parseCliArgs } from './cli-arguments.mjs';
import { assertSafeProjectRoot, resolveProjectRoot } from './collect-project-scope.mjs';
import {
  DEFAULT_UI_REVIEW_CONFIG,
  fail,
  requireString,
} from './ui-review-contract.mjs';
import {
  resolveSafeProjectPath,
  loadUiReviewConfig,
} from './ui-review-config.mjs';
import {
  createCapturePlan,
  createReviewRun,
} from './ui-review-plan.mjs';
import {
  completeReviewRun,
  evaluateRepairGate,
  completeRepairRun,
  createVerifyRun,
  completeVerifyRun,
} from './ui-review-state.mjs';
import {
  readJsonFile,
  readRunState,
  writeRunState,
} from './ui-review-storage.mjs';

// CLI 层组合领域能力，保持既有参数、输出和失败语义。
export function cliOptions(argv) {
  return parseCliArgs(argv, {
    defaults: { target: process.cwd(), configPath: DEFAULT_UI_REVIEW_CONFIG, write: false, explicitApproval: false },
    valueOptions: {
      '--target': 'target',
      '--config': 'configPath',
      '--scenario': 'scenarioId',
      '--run-id': 'runId',
      '--capture': 'capture',
      '--state': 'statePath',
      '--baseline': 'baselinePath',
      '--result': 'resultPath',
      '--finding-ids': 'findingIds',
    },
    booleanOptions: { '--write': 'write', '--explicit-approval': 'explicitApproval' },
  });
}

export function cliContext(options) {
  const projectRoot = resolveProjectRoot(options.target);
  assertSafeProjectRoot(projectRoot);
  return { projectRoot, config: loadUiReviewConfig(projectRoot, options.configPath) };
}

export function resultFromPath(projectRoot, resultPath) {
  const safe = resolveSafeProjectPath(projectRoot, resultPath, '验收结果路径', { mustExist: true, allowDirectory: false });
  return readJsonFile(safe.absolutePath, '验收结果');
}

export function assertCompletedArtifacts(projectRoot, state) {
  for (const [key, label] of [
    ['actualScreenshot', '实际截图'],
    ['annotatedScreenshot', '标注截图'],
    ['report', 'Markdown 报告'],
  ]) {
    resolveSafeProjectPath(projectRoot, state.artifacts?.[key], label, { mustExist: true, allowDirectory: false });
  }
}

export function persistOrPreview(projectRoot, state, write, allowExistingState = false) {
  if (write) writeRunState(projectRoot, state, { allowExistingState });
  return { write, state };
}

export async function runUiReviewWorkflowCli(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (!command) fail('缺少命令：inspect、capture-plan、start-review、complete-review、repair-gate、complete-repair、start-verify 或 complete-verify');
  const options = cliOptions(rest);
  const { projectRoot, config } = cliContext(options);
  let output;

  if (command === 'inspect') {
    output = { write: false, config };
  } else if (command === 'capture-plan') {
    output = {
      write: false,
      plan: createCapturePlan(config, options.scenarioId, { runId: options.runId }),
    };
  } else if (command === 'start-review') {
    output = persistOrPreview(
      projectRoot,
      createReviewRun(config, options.scenarioId, {
        runId: options.runId,
        capture: options.capture,
      }),
      options.write,
    );
  } else if (command === 'complete-review') {
    const state = readRunState(projectRoot, options.statePath);
    assertCompletedArtifacts(projectRoot, state);
    const next = completeReviewRun(state, resultFromPath(projectRoot, options.resultPath));
    output = persistOrPreview(projectRoot, next, options.write, true);
  } else if (command === 'repair-gate') {
    const state = readRunState(projectRoot, options.statePath);
    output = { write: false, ...evaluateRepairGate(state, config, { explicitApproval: options.explicitApproval }) };
  } else if (command === 'complete-repair') {
    const state = readRunState(projectRoot, options.statePath);
    const ids = requireString(options.findingIds, '--finding-ids').split(',').map((id) => id.trim()).filter(Boolean);
    output = persistOrPreview(projectRoot, completeRepairRun(state, ids), options.write, true);
  } else if (command === 'start-verify') {
    const baseline = readRunState(projectRoot, options.baselinePath);
    output = persistOrPreview(projectRoot, createVerifyRun(config, baseline, { runId: options.runId }), options.write);
  } else if (command === 'complete-verify') {
    const state = readRunState(projectRoot, options.statePath);
    const baseline = readRunState(projectRoot, options.baselinePath);
    assertCompletedArtifacts(projectRoot, state);
    const next = completeVerifyRun(state, baseline, resultFromPath(projectRoot, options.resultPath));
    output = persistOrPreview(projectRoot, next, options.write, true);
  } else {
    fail(`不支持的 UI 验收命令：${command}`);
  }

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return output;
}
