import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCliArgs } from './cli-arguments.mjs';
import { assertSafeProjectRoot, resolveProjectRoot } from './collect-project-scope.mjs';
import { runPlaywrightAdapter } from './playwright-adapter-runner.mjs';
import { renderDeterministicAssessmentMarkdown } from './ui-review-report.mjs';
import {
  DEFAULT_UI_REVIEW_CONFIG,
  completeReviewRun,
  completeVerifyRun,
  createCapturePlan,
  createReviewRun,
  createVerifyRun,
  loadUiReviewConfig,
  readRunState,
  resolveSafeProjectPath,
  writeRunState,
} from './ui-review-workflow.mjs';

const EXIT_CODES = Object.freeze({ passed: 0, 'needs-fix': 1, failed: 1, inconclusive: 2, blocked: 3 });

function fail(message) {
  throw new Error(message);
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label}不能为空`);
  return value.trim();
}

function writeTextAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, content, 'utf8');
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

function createPreview({ mode, projectRoot, config, plan, baseline }) {
  return {
    ok: true,
    write: false,
    readyToWrite: true,
    mode,
    exitCode: 0,
    projectRoot,
    config: { path: config.configPath, schemaVersion: config.schemaVersion, autoFix: config.autoFix },
    platform: plan.projectPlaywright.runtime,
    scenario: {
      id: plan.scenarioId,
      fingerprint: plan.scenarioFingerprint,
      url: plan.scenario.url,
      viewport: plan.scenario.viewport,
      interactionMode: plan.scenario.interactionMode,
      interactions: plan.scenario.interactions.map((interaction) => ({
        action: typeof interaction === 'string' ? 'instruction' : interaction.action,
        selector: typeof interaction === 'string' ? null : interaction.selector || null,
      })),
      comparison: plan.scenario.comparison,
    },
    capture: {
      required: 'bundled-adapter',
      configured: plan.projectPlaywright.source,
      portable: plan.projectPlaywright.portable,
      browserFallbackDeclared: plan.browser.role === 'fallback',
    },
    baseline: baseline
      ? {
          runId: baseline.runId,
          status: baseline.status,
          capture: baseline.capture,
          scenarioFingerprint: baseline.scenarioFingerprint,
        }
      : null,
    artifacts: plan.artifacts,
    safety: {
      startsProjectCommand: false,
      installsTargetDependencies: false,
      modifiesBusinessSource: false,
      commitsOrPushes: false,
    },
  };
}

function assertPortableWritePlan(config, plan, mode, baseline) {
  if (config.schemaVersion !== 2) fail('统一入口只执行版本 2 的确定性配置；版本 1 请继续使用细粒度兼容命令');
  if (plan.primary !== 'project-playwright') {
    fail('统一入口只执行以项目 Playwright 为主采集器的版本 2 场景；Browser 只能按已声明的不确定兜底单独运行');
  }
  if (plan.projectPlaywright.source === 'project-adapter') {
    fail('版本 2 项目适配器内容与受信内置适配器模板不一致；请保留原文件，把假登录、接口模拟和固定数据移到项目自有本地页面环境，再使用当前受信模板建立独立基线');
  }
  if (plan.projectPlaywright.source !== 'bundled-adapter') {
    fail('统一入口只执行与插件模板摘要一致的受信内置适配器，不会启动项目自定义命令');
  }
  if (!plan.projectPlaywright.portable) fail(plan.projectPlaywright.unavailableReason || '当前平台运行包不可用');
  if (!plan.scenario.comparison) fail('版本 2 场景必须声明确定性比较规则');
  if (mode === 'verify' && baseline.capture !== 'project-playwright') {
    fail('复验必须复用基线采集器；Browser 视觉基线不能静默切换到 Playwright');
  }
}

function materializeReport(projectRoot, plan, result, completedState) {
  const actual = resolveSafeProjectPath(projectRoot, plan.artifacts.actualScreenshot, '实际截图', { mustExist: true, allowDirectory: false });
  const annotated = resolveSafeProjectPath(projectRoot, plan.artifacts.annotatedScreenshot, '验收标注截图');
  const report = resolveSafeProjectPath(projectRoot, plan.artifacts.report, '验收报告');
  fs.mkdirSync(path.dirname(annotated.absolutePath), { recursive: true });
  fs.copyFileSync(actual.absolutePath, annotated.absolutePath, fs.constants.COPYFILE_EXCL);
  const scenario = { id: plan.scenarioId, ...plan.scenario };
  writeTextAtomic(report.absolutePath, renderDeterministicAssessmentMarkdown({
    scenario,
    assessment: { ...result, outcome: completedState.status === 'failed' ? 'needs-fix' : completedState.status, fallbackRequired: completedState.fallbackRequired },
    runtime: `${plan.projectPlaywright.runtime.platform}-${plan.projectPlaywright.runtime.arch} / Playwright ${plan.projectPlaywright.runtime.version}`,
  }));
}

function blockedResult({ mode, write, error, phase = 'orchestration', state = null }) {
  return {
    ok: false,
    write,
    readyToWrite: false,
    mode,
    status: 'blocked',
    exitCode: EXIT_CODES.blocked,
    error: { code: 'UI_REVIEW_BLOCKED', phase, message: error.message },
    fallbackRequired: false,
    state,
  };
}

export async function runUiReview({
  mode = 'review',
  target = process.cwd(),
  configPath = DEFAULT_UI_REVIEW_CONFIG,
  scenarioId,
  runId,
  baselinePath,
  write = false,
} = {}) {
  if (!['review', 'verify'].includes(mode)) return blockedResult({ mode, write, error: new Error(`模式只能是 review 或 verify：${mode}`) });
  let projectRoot;
  let state = null;
  try {
    projectRoot = resolveProjectRoot(target);
    assertSafeProjectRoot(projectRoot);
    const normalizedScenarioId = requireString(scenarioId, '--scenario');
    const normalizedRunId = requireString(runId, '--run-id');
    const config = loadUiReviewConfig(projectRoot, configPath);
    const baseline = mode === 'verify'
      ? readRunState(projectRoot, requireString(baselinePath, '--baseline'))
      : null;
    const plan = createCapturePlan(config, normalizedScenarioId, { runId: normalizedRunId });
    // 预览也必须完成纯校验，避免正式写入时才发现基线已经失效。
    const preparedState = mode === 'verify'
      ? createVerifyRun(config, baseline, { runId: normalizedRunId })
      : null;
    // 预览与正式写入共用同一纯就绪门禁，避免返回无法执行的成功计划。
    assertPortableWritePlan(config, plan, mode, baseline);
    const preview = createPreview({ mode, projectRoot, config, plan, baseline });
    if (!write) return preview;

    state = mode === 'review'
      ? createReviewRun(config, normalizedScenarioId, { runId: normalizedRunId, capture: 'project-playwright' })
      : preparedState;
    writeRunState(projectRoot, state);
    await runPlaywrightAdapter({ target: projectRoot, configPath, scenarioId: normalizedScenarioId, runId: normalizedRunId });
    const resultPath = resolveSafeProjectPath(projectRoot, plan.artifacts.reviewInput, '确定性比较结果', { mustExist: true, allowDirectory: false });
    const result = JSON.parse(fs.readFileSync(resultPath.absolutePath, 'utf8'));
    const completed = mode === 'review'
      ? completeReviewRun(state, result)
      : completeVerifyRun(state, baseline, result);
    materializeReport(projectRoot, plan, result, completed);
    writeRunState(projectRoot, completed, { allowExistingState: true });
    return {
      ok: completed.status === 'passed',
      write: true,
      mode,
      status: completed.status,
      exitCode: EXIT_CODES[completed.status],
      fallbackRequired: completed.fallbackRequired,
      runId: completed.runId,
      scenarioId: completed.scenarioId,
      observations: completed.observations,
      findings: completed.findings,
      repairCandidates: completed.repairCandidates,
      verification: completed.verification || null,
      artifacts: completed.artifacts,
    };
  } catch (error) {
    if (write && projectRoot && state?.schemaVersion === 2) {
      try {
        const blockedState = {
          ...state,
          status: 'blocked',
          updatedAt: new Date().toISOString(),
          blocked: { code: 'UI_REVIEW_BLOCKED', message: error.message },
        };
        writeRunState(projectRoot, blockedState, { allowExistingState: true });
        return blockedResult({ mode, write, error, phase: 'execution', state: blockedState });
      } catch {
        // 原始阻塞原因优先返回；无法安全更新状态时不再覆盖既有产物。
      }
    }
    return blockedResult({ mode, write, error });
  }
}

function cliOptions(argv) {
  const mode = argv[0];
  const options = parseCliArgs(argv.slice(1), {
    defaults: { target: process.cwd(), configPath: DEFAULT_UI_REVIEW_CONFIG, write: false },
    valueOptions: {
      '--target': 'target',
      '--config': 'configPath',
      '--scenario': 'scenarioId',
      '--run-id': 'runId',
      '--baseline': 'baselinePath',
    },
    booleanOptions: { '--write': 'write' },
  });
  return { mode, ...options };
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  let output;
  try {
    output = await runUiReview(cliOptions(process.argv.slice(2)));
  } catch (error) {
    output = blockedResult({ mode: process.argv[2] || null, write: process.argv.includes('--write'), error });
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = output.exitCode;
}
