import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readLifecycleConfig } from './lifecycle-contract.mjs';

export const REPOSITORY_FOOTPRINT_BUDGETS = Object.freeze({
  trackedOutputFiles: 200,
  trackedOutputBytes: 10 * 1024 * 1024,
  activeFullRequirements: 5,
  rootTestFileLines: 1000,
  pluginScriptFileLines: 800,
  specTotalBytes: 512 * 1024,
  testTotalLines: 15000,
});

export const REPOSITORY_RETIREMENT_LIMITS = Object.freeze({
  platformAssetFiles: 0,
  platformIntegrityManifests: 0,
  platformLfsRules: 0,
});

const RETIRED_PATHS = Object.freeze(['outputs/lanhu-design-spec']);
const STUB_MARKER = '<!-- requirement-archive-stub:v1 -->';
const PLAYWRIGHT_PLATFORM_ASSET_PREFIX = 'plugins/frontend-ai-workflow/runtime/playwright/platform-assets/';
const PLAYWRIGHT_PLATFORM_INTEGRITY_PATTERN = /^plugins\/frontend-ai-workflow\/runtime\/playwright\/integrity\/(?:darwin-arm64|darwin-x64|linux-arm64|linux-x64|win32-x64)\.json$/u;
const PLAYWRIGHT_LFS_RULE_PATTERN = /^\s*plugins\/frontend-ai-workflow\/runtime\/playwright\/platform-assets\/\*\*\s+.*\bfilter=lfs\b.*$/gmu;

function normalizePath(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//u, '');
}

function gitTrackedFiles(root) {
  const result = spawnSync('git', ['-C', root, 'ls-files', '-z'], {
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
  return { code, target: normalizePath(target), status: 'failed', actual, budget, limit: budget };
}

function warning(code, target, actual, budget, details = undefined) {
  return { code, target: normalizePath(target), status: 'warning', actual, budget, limit: budget, ...(details ? { details } : {}) };
}

function recursiveFiles(directory, predicate) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && predicate(entry.name)) result.push(target);
    }
  }
  visit(directory);
  return result.sort();
}

export function auditRepositoryFootprint({
  root = process.cwd(),
  trackedFiles = null,
  budgets = REPOSITORY_FOOTPRINT_BUDGETS,
} = {}) {
  const repositoryRoot = fs.realpathSync(path.resolve(root));
  const tracked = (trackedFiles || gitTrackedFiles(repositoryRoot))
    .map(normalizePath)
    // 待提交删除仍会出现在索引中，预算按本次提交后的实际文件面统计。
    .filter((relativePath) => fs.existsSync(path.join(repositoryRoot, relativePath)))
    .sort();
  const trackedOutputs = tracked.filter((relativePath) => relativePath === 'outputs' || relativePath.startsWith('outputs/'));
  const diagnostics = [];
  const lifecycle = readLifecycleConfig(repositoryRoot);
  const trackedOutputBytes = trackedOutputs.reduce((total, relativePath) => {
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
  const specFiles = recursiveFiles(path.join(repositoryRoot, 'openspec', 'specs'), (name) => name === 'spec.md');
  const specTotalBytes = specFiles.reduce((total, file) => total + fs.statSync(file).size, 0);
  const testTotalLines = testFiles.reduce((total, file) => total + lineCount(file), 0);
  const trackedRuntimePrefixes = [
    `${lifecycle.runtimeDirectory}/runs/`,
    `${lifecycle.runtimeDirectory}/cache/`,
    `${lifecycle.runtimeDirectory}/transactions/`,
  ];
  const platformAssetFiles = tracked.filter((relativePath) => relativePath.startsWith(PLAYWRIGHT_PLATFORM_ASSET_PREFIX));
  const platformIntegrityManifests = tracked.filter((relativePath) => PLAYWRIGHT_PLATFORM_INTEGRITY_PATTERN.test(relativePath));
  const attributesPath = path.join(repositoryRoot, '.gitattributes');
  const platformLfsRules = fs.existsSync(attributesPath)
    ? [...fs.readFileSync(attributesPath, 'utf8').matchAll(PLAYWRIGHT_LFS_RULE_PATTERN)].length
    : 0;

  for (const retiredPath of RETIRED_PATHS) {
    if (fs.existsSync(path.join(repositoryRoot, retiredPath))) diagnostics.push(diagnostic('retired_path_present', retiredPath, 1, 0));
  }
  for (const prefix of trackedRuntimePrefixes) {
    const matches = tracked.filter((relativePath) => relativePath.startsWith(prefix));
    if (matches.length) diagnostics.push(diagnostic('tracked_runtime_artifact', prefix, matches.length, 0));
  }
  if (lifecycle.lifecycleMode === 'v2') {
    for (const prefix of ['outputs/', 'requirements/archive/', 'openspec/changes/archive/', '.frontend-ui-review/runs/']) {
      const matches = tracked.filter((relativePath) => relativePath.startsWith(prefix));
      if (matches.length) diagnostics.push(diagnostic('retired_lifecycle_path', prefix, matches.length, 0));
    }
  }
  if (platformAssetFiles.length > REPOSITORY_RETIREMENT_LIMITS.platformAssetFiles) {
    diagnostics.push(diagnostic(
      'retired_platform_asset_files_present',
      PLAYWRIGHT_PLATFORM_ASSET_PREFIX,
      platformAssetFiles.length,
      REPOSITORY_RETIREMENT_LIMITS.platformAssetFiles,
    ));
  }
  if (platformIntegrityManifests.length > REPOSITORY_RETIREMENT_LIMITS.platformIntegrityManifests) {
    diagnostics.push(diagnostic(
      'retired_platform_integrity_manifests_present',
      'plugins/frontend-ai-workflow/runtime/playwright/integrity',
      platformIntegrityManifests.length,
      REPOSITORY_RETIREMENT_LIMITS.platformIntegrityManifests,
    ));
  }
  if (platformLfsRules > REPOSITORY_RETIREMENT_LIMITS.platformLfsRules) {
    diagnostics.push(diagnostic(
      'retired_platform_lfs_rules_present',
      '.gitattributes',
      platformLfsRules,
      REPOSITORY_RETIREMENT_LIMITS.platformLfsRules,
    ));
  }
  if (trackedOutputs.length > budgets.trackedOutputFiles) {
    diagnostics.push(diagnostic('tracked_outputs_file_budget_exceeded', 'outputs', trackedOutputs.length, budgets.trackedOutputFiles));
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
  if (specTotalBytes > budgets.specTotalBytes) {
    diagnostics.push(warning('spec_context_budget_warning', 'openspec/specs', specTotalBytes, budgets.specTotalBytes));
  }
  if (testTotalLines > budgets.testTotalLines) {
    diagnostics.push(warning('test_context_budget_warning', 'tests', testTotalLines, budgets.testTotalLines));
  }
  const requirementTitles = new Map();
  const localSpecReferences = [];
  for (const file of specFiles) {
    const relative = normalizePath(path.relative(repositoryRoot, file));
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/^### Requirement:\s*(.+)$/gmu)) {
      const title = match[1].trim().normalize('NFC').toLocaleLowerCase('en-US');
      const locations = requirementTitles.get(title) || [];
      locations.push(relative);
      requirementTitles.set(title, locations);
    }
    const references = [...new Set([...content.matchAll(/\b[DA]-\d+\b/gu)].map((match) => match[0]))].sort();
    if (references.length) localSpecReferences.push({ file: relative, references });
  }
  for (const [title, locations] of requirementTitles) {
    if (locations.length > 1) diagnostics.push(diagnostic('duplicate_spec_requirement', title, locations.length, 1));
  }
  if (localSpecReferences.length) {
    diagnostics.push({
      code: lifecycle.lifecycleMode === 'v2' ? 'local_spec_reference' : 'legacy_local_spec_reference',
      target: 'openspec/specs',
      status: lifecycle.lifecycleMode === 'v2' ? 'failed' : 'warning',
      actual: localSpecReferences.length,
      budget: 0,
      limit: 0,
      details: localSpecReferences,
    });
  }
  const testLocators = new Map();
  for (const file of testFiles) {
    const relative = normalizePath(path.relative(repositoryRoot, file));
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/(?:test|it)\(\s*['"]\[(TC-\d+)\]\s*([^'"]+)/gmu)) {
      const locations = testLocators.get(match[1]) || [];
      locations.push({ file: relative, behavior: match[2].trim().slice(0, 160) });
      testLocators.set(match[1], locations);
    }
  }
  for (const [locator, locations] of testLocators) {
    if (locations.length > 1) diagnostics.push(warning('ambiguous_test_locator', locator, locations.length, 1, locations));
  }
  diagnostics.sort((left, right) => left.code.localeCompare(right.code) || left.target.localeCompare(right.target));
  const blockingDiagnostics = diagnostics.filter((item) => item.status === 'failed');
  const counts = {
    trackedOutputFiles: trackedOutputs.length,
    trackedOutputBytes,
    activeFullRequirements: activeFullRequirements.length,
    rootTestFiles: testFiles.length,
    pluginScriptFiles: scriptFiles.length,
    platformAssetFiles: platformAssetFiles.length,
    platformIntegrityManifests: platformIntegrityManifests.length,
    platformLfsRules,
    specFiles: specFiles.length,
    specTotalBytes,
    testTotalLines,
    ambiguousTestLocators: [...testLocators.values()].filter((locations) => locations.length > 1).length,
    localSpecReferences: localSpecReferences.length,
  };
  return {
    ok: blockingDiagnostics.length === 0,
    code: blockingDiagnostics.length === 0 ? 'repository_footprint_ok' : 'repository_footprint_exceeded',
    status: blockingDiagnostics.length === 0 ? 'passed' : 'failed',
    target: normalizePath(path.relative(process.cwd(), repositoryRoot) || '.'),
    budgets: { ...budgets },
    retirementLimits: { ...REPOSITORY_RETIREMENT_LIMITS },
    counts,
    diagnostics,
  };
}

function parseArgs(argv) {
  const args = { root: process.cwd(), diagnosticCode: null, offset: 0, limit: 20 };
  for (let index = 0; index < argv.length; index += 1) {
    if (!['--target', '--diagnostic-code', '--offset', '--limit'].includes(argv[index])) throw new Error(`不支持的参数：${argv[index]}`);
    if (!argv[index + 1]) throw new Error(`参数 ${argv[index]} 缺少值`);
    if (argv[index] === '--target') args.root = argv[index + 1];
    else if (argv[index] === '--diagnostic-code') args.diagnosticCode = argv[index + 1];
    else args[argv[index].slice(2)] = Number(argv[index + 1]);
    index += 1;
  }
  return args;
}

export function formatRepositoryFootprint(result, { diagnosticCode = null, offset = 0, limit = 20 } = {}) {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('offset 必须是非负整数');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('limit 必须是 1 到 100 的整数');
  const selected = diagnosticCode
    ? result.diagnostics.filter((item) => item.code === diagnosticCode)
    : result.diagnostics;
  const diagnostics = selected.slice(offset, offset + limit).map((item) => {
    if (!Array.isArray(item.details)) return item;
    const { details, ...summary } = item;
    if (!diagnosticCode) return { ...summary, detailCount: details.length };
    return {
      ...summary,
      details: details.slice(0, limit),
      detailCount: details.length,
      remainingDetails: Math.max(0, details.length - limit),
    };
  });
  return {
    ...result,
    diagnostics,
    diagnosticPage: {
      code: diagnosticCode,
      offset,
      limit,
      total: selected.length,
      remaining: Math.max(0, selected.length - offset - limit),
    },
  };
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = auditRepositoryFootprint(args);
    console.log(JSON.stringify(formatRepositoryFootprint(result, args), null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: error.code || 'repository_footprint_failed', errors: [error.message] }, null, 2));
    process.exitCode = 1;
  }
}
