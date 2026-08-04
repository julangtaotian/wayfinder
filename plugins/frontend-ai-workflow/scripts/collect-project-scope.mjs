import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export const PROJECT_SCOPE_VERSION = '2.2.0';

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.turbo',
  '.yarn',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'storybook-static',
  'temp',
  'tmp',
]);

const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.env',
  '.gql',
  '.graphql',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.less',
  '.md',
  '.mdx',
  '.mjs',
  '.sass',
  '.scss',
  '.sh',
  '.svelte',
  '.svg',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.wxml',
  '.wxs',
  '.wxss',
  '.yaml',
  '.yml',
]);

const TEXT_FILENAMES = new Set([
  '.gitignore',
  '.npmignore',
  '.prettierignore',
  'dockerfile',
  'makefile',
]);

const DEFAULT_LIMITS = Object.freeze({
  maxFileBytes: 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
});

const ENV_TEMPLATE_PATTERN = /^\.env\.(?:example|sample|template)$/iu;
const SENSITIVE_FILENAMES = new Set([
  '.env',
  '.npmrc',
  '.pypirc',
]);
const SENSITIVE_EXTENSIONS = new Set(['.key', '.pem', '.p12', '.pfx', '.jks']);
const CATEGORY_PRIORITIES = new Map([
  ['configuration', 0],
  ['source', 1],
  ['test', 2],
  ['documentation', 3],
  ['other', 4],
]);
const GIT_MAX_BUFFER = 64 * 1024 * 1024;
const WXML_ADJACENT_ATTRIBUTE_PATTERN = /\b[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*')(?=[A-Za-z_:][\w:.-]*\s*=)/gu;

// 这些规则只界定 AI 需要处理的材料范围，不承担项目语义判断。
function relativePath(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function countLines(content) {
  if (!content.length) return 0;
  return content.split(/\r\n|\r|\n/).length;
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function buildValidationEvidence() {
  return {
    fileEnumeration: { executed: true, status: 'performed', description: '已完成安全路径枚举与范围过滤。' },
    contentRead: { executed: true, status: 'performed', description: '已读取纳入范围的文本内容。' },
    contentHash: { executed: true, status: 'performed', description: '已计算纳入文件的 SHA-256。' },
    syntaxParse: { executed: false, status: 'not-run', description: '范围工具未执行源码语法解析。' },
    platformCompile: { executed: false, status: 'not-run', description: '范围工具未执行平台编译。' },
    lint: { executed: false, status: 'not-run', description: '范围工具未执行 Lint。' },
    test: { executed: false, status: 'not-run', description: '范围工具未执行测试。' },
  };
}

// 这里只记录低成本静态观察，不把启发式匹配冒充 WXML 解析或平台编译结论。
function collectWxmlObservations(filePath, content) {
  if (path.extname(filePath).toLowerCase() !== '.wxml') return [];
  const observations = [];
  const lines = content.split(/\r\n|\r|\n/u);
  let insideComment = false;
  for (let index = 0; index < lines.length; index += 1) {
    const characters = lines[index].split('');
    let cursor = 0;
    while (cursor < characters.length) {
      if (insideComment) {
        const commentEnd = lines[index].indexOf('-->', cursor);
        const maskEnd = commentEnd < 0 ? characters.length : commentEnd + 3;
        characters.fill(' ', cursor, maskEnd);
        cursor = maskEnd;
        if (commentEnd < 0) break;
        insideComment = false;
      } else {
        const commentStart = lines[index].indexOf('<!--', cursor);
        if (commentStart < 0) break;
        characters.fill(' ', commentStart, commentStart + 4);
        cursor = commentStart + 4;
        insideComment = true;
      }
    }
    const matches = characters.join('').match(WXML_ADJACENT_ATTRIBUTE_PATTERN) || [];
    for (let count = 0; count < matches.length; count += 1) {
      observations.push({
        code: 'wxml-attribute-spacing',
        severity: 'warning',
        path: filePath,
        line: index + 1,
        message: '属性结束引号后可能缺少空白；仅为静态观察，未执行 WXML 语法解析或平台编译。',
      });
    }
  }
  return observations;
}

function hasTextExtension(filePath) {
  const base = path.basename(filePath).toLowerCase();
  return TEXT_FILENAMES.has(base) || base.startsWith('.env') || TEXT_EXTENSIONS.has(path.extname(base));
}

function classifyPath(filePath) {
  const parts = filePath.toLowerCase().split('/');
  const base = parts.at(-1);
  if (parts.some((part) => ['test', 'tests', '__tests__', '__mocks__'].includes(part)) || /(?:^|[._-])(?:spec|test)\.[^.]+$/.test(base)) {
    return 'test';
  }
  if (parts.includes('docs') || /^(readme|changelog|contributing)\b/.test(base)) return 'documentation';
  if (/^(package|vite|webpack|vitest|jest|tsconfig|jsconfig|eslint|prettier|tailwind|postcss)\b/.test(base) || base.startsWith('.env')) {
    return 'configuration';
  }
  if (parts.includes('src') || parts.includes('app') || parts.includes('pages') || parts.includes('components')) return 'source';
  return 'other';
}

function isLikelyText(buffer) {
  return !buffer.includes(0);
}

function sortByPath(items) {
  return [...items].sort((left, right) => left.path.localeCompare(right.path));
}

// 敏感判断只依赖路径，不读取文件内容，避免扫描规则本身造成凭据暴露。
function sensitiveReason(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (ENV_TEMPLATE_PATTERN.test(base)) return null;
  if (SENSITIVE_FILENAMES.has(base) || base.startsWith('.env.')) return '敏感配置文件未纳入扫描范围';
  if (SENSITIVE_EXTENSIONS.has(path.extname(base))) return '密钥或证书文件未纳入扫描范围';
  if (/^(?:id_rsa|id_ed25519|service-account|credentials|secrets?)(?:[._-]|$)/u.test(base)) {
    return '凭据或密钥文件未纳入扫描范围';
  }
  return null;
}

function runGit(root, args) {
  return spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER,
  });
}

function inspectGitScope(root) {
  const inside = runGit(root, ['rev-parse', '--is-inside-work-tree']);
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
    return { available: false, allowedPaths: null, commit: null, dirty: null };
  }
  const listed = runGit(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  const commit = runGit(root, ['rev-parse', 'HEAD']);
  const status = runGit(root, ['status', '--porcelain=v1', '--untracked-files=normal']);
  return {
    available: listed.status === 0,
    allowedPaths: listed.status === 0
      ? new Set(listed.stdout.split('\0').filter(Boolean).map((file) => file.split(path.sep).join('/')))
      : null,
    commit: commit.status === 0 ? commit.stdout.trim() : null,
    dirty: status.status === 0 ? Boolean(status.stdout.trim()) : null,
  };
}

function sortByScanPriority(items) {
  return [...items].sort((left, right) => {
    const priority = CATEGORY_PRIORITIES.get(left.category) - CATEGORY_PRIORITIES.get(right.category);
    return priority || left.path.localeCompare(right.path);
  });
}

// 工作流自身会持续更新，不能让任务勾选或 Wayfinder 自引用造成项目地图立即过期。
function isFingerprintInput(file) {
  if (['AGENTS.md', '.ai-workflow.yaml', 'wayfinder/frontend.md'].includes(file.path)) return false;
  if (file.path.startsWith('requirements/') || file.path.startsWith('openspec/')) return false;
  return true;
}

function scopeFingerprint(files, limits) {
  const payload = {
    version: PROJECT_SCOPE_VERSION,
    limits,
    files: sortByPath(files).filter(isFingerprintInput).map((file) => [file.path, file.sha256]),
  };
  return sha256(JSON.stringify(payload));
}

// 遍历阶段只记录文件和排除原因，避免把目录结构误写成架构结论。
function walkProject(root, directory, discoveredFiles, excludedFiles) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    excludedFiles.push({
      path: relativePath(root, directory) || '.',
      kind: 'directory',
      reason: `无法读取目录：${error.code || error.message}`,
    });
    return;
  }

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const projectPath = relativePath(root, absolutePath);
    if (entry.isSymbolicLink()) {
      excludedFiles.push({ path: projectPath, kind: 'file', reason: '符号链接未纳入扫描范围' });
    } else if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) {
        excludedFiles.push({ path: projectPath, kind: 'directory', reason: `排除目录：${entry.name}` });
      } else {
        walkProject(root, absolutePath, discoveredFiles, excludedFiles);
      }
    } else if (entry.isFile()) {
      let stats;
      try {
        stats = fs.statSync(absolutePath);
      } catch (error) {
        excludedFiles.push({ path: projectPath, kind: 'file', reason: `无法读取文件状态：${error.code || error.message}` });
        continue;
      }
      discoveredFiles.push({ absolutePath, path: projectPath, bytes: stats.size });
    } else {
      excludedFiles.push({ path: projectPath, kind: 'file', reason: '不支持的文件类型' });
    }
  }
}

export function resolveProjectRoot(target = process.cwd()) {
  const resolvedTarget = path.resolve(target);
  if (!fs.existsSync(resolvedTarget)) throw new Error(`目标目录不存在：${resolvedTarget}`);
  const root = fs.realpathSync(resolvedTarget);
  if (!fs.statSync(root).isDirectory()) throw new Error(`目标不是目录：${root}`);
  return root;
}

export function assertSafeProjectRoot(root) {
  const filesystemRoot = path.parse(root).root;
  const home = fs.realpathSync(os.homedir());
  if (root === filesystemRoot || root === home) throw new Error(`拒绝在高风险目录扫描：${root}`);
}

export function collectProjectScope(target = process.cwd(), limits = DEFAULT_LIMITS) {
  const root = resolveProjectRoot(target);
  assertSafeProjectRoot(root);
  const effectiveLimits = { ...DEFAULT_LIMITS, ...limits };
  const discoveredFiles = [];
  const excludedFiles = [];
  walkProject(root, root, discoveredFiles, excludedFiles);
  const git = inspectGitScope(root);
  const eligibleFiles = [];
  const observations = [];

  // 先完成纯路径与元数据过滤，只有安全候选才会进入内容读取阶段。
  for (const file of sortByPath(discoveredFiles)) {
    const sensitive = sensitiveReason(file.path);
    if (sensitive) {
      excludedFiles.push({ path: file.path, kind: 'file', bytes: file.bytes, reason: sensitive });
      continue;
    }
    if (git.allowedPaths && !git.allowedPaths.has(file.path)) {
      excludedFiles.push({ path: file.path, kind: 'file', bytes: file.bytes, reason: 'Git 忽略规则未纳入扫描范围' });
      continue;
    }
    if (!hasTextExtension(file.path)) {
      excludedFiles.push({ path: file.path, kind: 'file', bytes: file.bytes, reason: '不在可读文本扩展名范围内' });
      continue;
    }
    if (file.bytes > effectiveLimits.maxFileBytes) {
      excludedFiles.push({ path: file.path, kind: 'file', bytes: file.bytes, reason: `超过单文件限制：${effectiveLimits.maxFileBytes} bytes` });
      continue;
    }
    eligibleFiles.push({ ...file, category: classifyPath(file.path) });
  }

  // 总量不足时优先保留配置、源码与测试，最终报告仍按路径排序保持稳定。
  const includedFiles = [];
  let includedBytes = 0;
  for (const file of sortByScanPriority(eligibleFiles)) {
    if (includedBytes + file.bytes > effectiveLimits.maxTotalBytes) {
      excludedFiles.push({ path: file.path, kind: 'file', bytes: file.bytes, reason: `超过总文件限制：${effectiveLimits.maxTotalBytes} bytes` });
      continue;
    }
    try {
      const content = fs.readFileSync(file.absolutePath);
      if (!isLikelyText(content)) {
        excludedFiles.push({ path: file.path, kind: 'file', bytes: file.bytes, reason: '内容包含空字节，未按文本读取' });
        continue;
      }
      const text = content.toString('utf8');
      includedBytes += file.bytes;
      includedFiles.push({
        path: file.path,
        category: file.category,
        bytes: file.bytes,
        lines: countLines(text),
        sha256: sha256(content),
      });
      observations.push(...collectWxmlObservations(file.path, text));
    } catch (error) {
      excludedFiles.push({ path: file.path, kind: 'file', bytes: file.bytes, reason: `无法读取文件：${error.code || error.message}` });
    }
  }

  const exclusions = sortByPath(excludedFiles);
  const stableFiles = sortByPath(includedFiles);
  const stableObservations = [...observations].sort((left, right) => (
    left.path.localeCompare(right.path) || left.line - right.line || left.code.localeCompare(right.code)
  ));
  return {
    version: PROJECT_SCOPE_VERSION,
    root,
    rules: {
      textExtensions: [...TEXT_EXTENSIONS].sort(),
      textFilenames: [...TEXT_FILENAMES].sort(),
      excludedDirectories: [...EXCLUDED_DIRECTORIES].sort(),
      limits: effectiveLimits,
    },
    fingerprint: scopeFingerprint(stableFiles, effectiveLimits),
    git: {
      available: git.available,
      commit: git.commit,
      dirty: git.dirty,
    },
    validationEvidence: buildValidationEvidence(),
    observations: stableObservations,
    includedFiles: stableFiles,
    excludedFiles: exclusions,
    summary: {
      discoveredFiles: discoveredFiles.length,
      includedFiles: includedFiles.length,
      includedBytes,
      excludedFiles: exclusions.length,
      observations: stableObservations.length,
    },
  };
}

function parseArgs(argv) {
  const args = { target: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--target') {
      if (!argv[index + 1]) throw new Error('参数 --target 缺少目录');
      args.target = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`不支持的参数：${argv[index]}`);
    }
  }
  return args;
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    console.log(JSON.stringify(collectProjectScope(parseArgs(process.argv.slice(2)).target), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
