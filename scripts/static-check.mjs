import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDirectory, '..');
export const STATIC_CHECK_ROOTS = Object.freeze([
  'scripts',
  'tests',
  'plugins/frontend-ai-workflow/scripts',
]);
const STATIC_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

function compareNames(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeMachinePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//u, '');
}

function walkJavaScriptFiles(root, current, files) {
  if (!fs.existsSync(current)) return;
  const entries = fs.readdirSync(current, { withFileTypes: true })
    .sort((left, right) => compareNames(left.name, right.name));
  for (const entry of entries) {
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      walkJavaScriptFiles(root, absolutePath, files);
    } else if (entry.isFile() && STATIC_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(normalizeMachinePath(path.relative(root, absolutePath)));
    }
  }
}

export function discoverStaticCheckFiles(repositoryRoot = defaultRepositoryRoot) {
  const root = fs.realpathSync(path.resolve(repositoryRoot));
  const files = [];
  // 固定白名单比遍历后排除更容易审计，也不会误扫运行时、产物或业务项目。
  for (const relativeRoot of STATIC_CHECK_ROOTS) {
    walkJavaScriptFiles(root, path.join(root, relativeRoot), files);
  }
  return [...new Set(files)].sort(compareNames);
}

function sanitizeDiagnostic(repositoryRoot, value) {
  let diagnostic = String(value || '').replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
  const roots = [repositoryRoot, repositoryRoot.replaceAll('\\', '/'), repositoryRoot.replaceAll('/', '\\')];
  for (const root of roots) {
    if (root) diagnostic = diagnostic.split(root).join('.');
  }
  return diagnostic;
}

export function runStaticCheck({ repositoryRoot = defaultRepositoryRoot, execute = spawnSync } = {}) {
  const root = fs.realpathSync(path.resolve(repositoryRoot));
  const files = discoverStaticCheckFiles(root);
  if (files.length === 0) {
    return {
      ok: false,
      code: 'static_check_empty',
      status: 1,
      checkedFiles: 0,
      target: null,
      diagnostic: '静态检查没有发现任何 JavaScript 文件。',
    };
  }

  for (const [index, target] of files.entries()) {
    const result = execute(process.execPath, ['--check', path.join(root, target)], {
      cwd: root,
      encoding: 'utf8',
      shell: false,
    });
    if (result.error || result.status !== 0) {
      return {
        ok: false,
        code: result.error ? 'static_check_start_failed' : 'static_check_syntax_failed',
        status: result.status ?? 1,
        checkedFiles: index + 1,
        target,
        diagnostic: sanitizeDiagnostic(root, result.stderr || result.error?.message),
      };
    }
  }

  return {
    ok: true,
    code: 'static_check_passed',
    status: 0,
    checkedFiles: files.length,
    target: null,
    diagnostic: '',
  };
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const result = runStaticCheck();
    const output = JSON.stringify(result, null, 2);
    if (result.ok) console.log(output);
    else console.error(output);
    process.exitCode = result.status;
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: 'static_check_unavailable',
      status: 1,
      checkedFiles: 0,
      target: null,
      diagnostic: error.message,
    }, null, 2));
    process.exitCode = 1;
  }
}
