import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runUiReviewWorkflowCli } from './ui-review-workflow-cli.mjs';

// 兼容门面只保留稳定公共导出和直接运行入口，内部职责由领域模块承担。
export {
  BUNDLED_UI_REVIEW_ADAPTER,
  DEFAULT_UI_REVIEW_CONFIG,
  UI_REVIEW_CONFIG_VERSION,
  UI_REVIEW_STATE_VERSION,
} from './ui-review-contract.mjs';
export {
  loadUiReviewConfig,
  normalizeUiReviewConfig,
  resolveSafeProjectPath,
} from './ui-review-config.mjs';
export {
  createCapturePlan,
  createReviewRun,
} from './ui-review-plan.mjs';
export {
  completeRepairRun,
  completeReviewRun,
  completeVerifyRun,
  createVerifyRun,
  evaluateRepairGate,
  normalizeUiFinding,
} from './ui-review-state.mjs';
export {
  readRunState,
  writeRunState,
} from './ui-review-storage.mjs';
export { runUiReviewWorkflowCli };

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  runUiReviewWorkflowCli().catch((error) => {
    process.stderr.write(`UI 验收流程失败：${error.message}\n`);
    process.exitCode = 1;
  });
}
