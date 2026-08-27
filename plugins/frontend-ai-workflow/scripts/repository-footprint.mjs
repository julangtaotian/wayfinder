import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const REPOSITORY_FOOTPRINT_BUDGETS = Object.freeze({
  trackedOutputFiles: 200,
  trackedOutputBytes: 10 * 1024 * 1024,
  activeFullRequirements: 5,
  rootTestFileLines: 1000,
  pluginScriptFileLines: 800,
});

const RETIRED_PATHS = Object.freeze(['outputs/lanhu-design-spec']);
const STUB_MARKER = '<!-- requirement-archive-stub:v1 -->';

function normalizePath(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//u, '');
}

function gitTrackedOutputs(root) {
  const result = spawnSync('git', ['-C', root, 'ls-files', '-z', '--', 'outputs'], {
    encoding: 'utf8',
    shell: false,
  });
  if (result.error || result.status !== 0) {
    const error = new Error(`无法读取 Git 跟踪文件：${result.error?.message || result.stderr || `退出码 ${result.status}`}`);
    error.code = 'tracked_outputs_unavailable';
    throw error;
  }
  return result.stdout.split('\0').filter(Boolean).map(normalizePath).sort();
}

function directFiles(directory, predicate) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

function lineCount(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content) return 0;
  return content.split(/\r?\n/u).length - (content.endsWith('\n') ? 1 : 0);
}

function diagnostic(code, target, actual, budget) {
  return { code, target: normalizePath(target), status: 'failed', actual, budget };
}

export function auditRepositoryFootprint({
  root = process.cwd(),
  trackedFiles = null,
  budgets = REPOSITORY_FOOTPRINT_BUDGETS,
} = {}) {
  const repositoryRoot = fs.realpathSync(path.resolve(root));
  const tracked = (trackedFiles || gitTrackedOutputs(repositoryRoot))
    .map(normalizePath)
    // 待提交删除仍会出现在索引中，预算按本次提交后的实际文件面统计。
    .filter((relativePath) => fs.existsSync(path.join(repositoryRoot, relativePath)))
    .sort();
  const diagnostics = [];
  const trackedOutputBytes = tracked.reduce((total, relativePath) => {
    const filePath = path.join(repositoryRoot, relativePath);
    return total + (fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? fs.statSync(filePath).size : 0);
  }, 0);
  const requirementFiles = directFiles(
    path.join(repositoryRoot, 'requirements'),
    (name) => /^REQ-\d{4}-\d+[-\w]*\.md$/u.test(name),
  );
  const activeFullRequirements = requirementFiles.filter((file) => !fs.readFileSync(file, 'utf8').includes(STUB_MARKER));
  const testFiles = directFiles(path.join(repositoryRoot, 'tests'), (name) => name.endsWith('.test.mjs'));
  const scriptFiles = directFiles(
    path.join(repositoryRoot, 'plugins', 'frontend-ai-workflow', 'scripts'),
    (name) => name.endsWith('.mjs'),
  );

  for (const retiredPath of RETIRED_PATHS) {
    if (fs.existsSync(path.join(repositoryRoot, retiredPath))) diagnostics.push(diagnostic('retired_path_present', retiredPath, 1, 0));
  }
  if (tracked.length > budgets.trackedOutputFiles) {
    diagnostics.push(diagnostic('tracked_outputs_file_budget_exceeded', 'outputs', tracked.length, budgets.trackedOutputFiles));
  }
  if (trackedOutputBytes > budgets.trackedOutputBytes) {
    diagnostics.push(diagnostic('tracked_outputs_byte_budget_exceeded', 'outputs', trackedOutputBytes, budgets.trackedOutputBytes));
  }
  if (activeFullRequirements.length > budgets.activeFullRequirements) {
    diagnostics.push(diagnostic(
      'active_requirement_budget_exceeded',
      'requirements',
      activeFullRequirements.length,
      budgets.activeFullRequirements,
    ));
  }
  for (const file of testFiles) {
    const lines = lineCount(file);
    if (lines > budgets.rootTestFileLines) {
      diagnostics.push(diagnostic(
        'test_file_line_budget_exceeded',
        path.relative(repositoryRoot, file),
        lines,
        budgets.rootTestFileLines,
      ));
    }
  }
  for (const file of scriptFiles) {
    const lines = lineCount(file);
    if (lines > budgets.pluginScriptFileLines) {
      diagnostics.push(diagnostic(
        'script_file_line_budget_exceeded',
        path.relative(repositoryRoot, file),
        lines,
        budgets.pluginScriptFileLines,
      ));
    }
  }
  diagnostics.sort((left, right) => left.code.localeCompare(right.code) || left.target.localeCompare(right.target));
  const counts = {
    trackedOutputFiles: tracked.length,
    trackedOutputBytes,
    activeFullRequirements: activeFullRequirements.length,
    rootTestFiles: testFiles.length,
    pluginScriptFiles: scriptFiles.length,
  };
  return {
    ok: diagnostics.length === 0,
    code: diagnostics.length === 0 ? 'repository_footprint_ok' : 'repository_footprint_exceeded',
    status: diagnostics.length === 0 ? 'passed' : 'failed',
    target: normalizePath(path.relative(process.cwd(), repositoryRoot) || '.'),
    budgets: { ...budgets },
    counts,
    diagnostics,
  };
}

function parseArgs(argv) {
  const args = { root: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--target') throw new Error(`不支持的参数：${argv[index]}`);
    if (!argv[index + 1]) throw new Error('参数 --target 缺少值');
    args.root = argv[index + 1];
    index += 1;
  }
  return args;
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const result = auditRepositoryFootprint(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: error.code || 'repository_footprint_failed', errors: [error.message] }, null, 2));
    process.exitCode = 1;
  }
}
