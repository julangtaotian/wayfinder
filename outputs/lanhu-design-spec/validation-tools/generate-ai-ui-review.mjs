import path from 'node:path';
import { pathToFileURL } from 'node:url';

export * from '../../../plugins/frontend-ai-workflow/scripts/ui-review-report.mjs';
import { runUiReviewReportCli } from '../../../plugins/frontend-ai-workflow/scripts/ui-review-report.mjs';

// 兼容既有样例入口，正式实现由插件脚本统一维护。
if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  runUiReviewReportCli().catch((error) => {
    process.stderr.write(`AI UI 验收生成失败：${error.message}\n`);
    process.exitCode = 1;
  });
}
