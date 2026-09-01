import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fail, requireString } from './ui-review-report-contract.mjs';
import { generateUiReview } from './ui-review-report-artifacts.mjs';

export { parsePngDimensions, normalizeReviewInput } from './ui-review-report-input.mjs';
export {
  createDeterministicReportContext,
  renderDeterministicAssessmentMarkdown,
  renderReviewMarkdown,
} from './ui-review-report-markdown.mjs';
export { generateUiReview };

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) fail('参数必须使用 --name value 形式。');
    options[key.slice(2)] = value;
  }
  return {
    screenshotPath: requireString(options.screenshot, '--screenshot'),
    dataPath: requireString(options.data, '--data'),
    outputDir: requireString(options.output, '--output'),
  };
}

async function readJsonInput(dataPath) {
  const text = dataPath === '-'
    ? await new Promise((resolve, reject) => {
        let content = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => { content += chunk; });
        process.stdin.on('end', () => resolve(content));
        process.stdin.on('error', reject);
      })
    : fs.readFileSync(dataPath, 'utf8');
  try {
    return JSON.parse(text);
  } catch {
    fail('验收输入不是有效 JSON。');
  }
}

export async function runUiReviewReportCli(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  const input = await readJsonInput(args.dataPath);
  const result = generateUiReview({
    screenshotPath: args.screenshotPath,
    input,
    outputDir: args.outputDir,
    // CLI 的输出目录本身是本次运行的独立 report 子目录，父目录作为唯一允许根。
    allowedOutputRoot: path.dirname(path.resolve(args.outputDir)),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runUiReviewReportCli().catch((error) => {
    process.stderr.write(`AI UI 验收生成失败：${error.message}\n`);
    process.exitCode = 1;
  });
}
