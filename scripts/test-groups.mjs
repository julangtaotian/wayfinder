import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const TEST_GROUPS = Object.freeze({
  all: ['tests/*.test.mjs'],
  repository: [
    'tests/ai-code-marker-policy.test.mjs',
    'tests/ai-context-efficiency.test.mjs',
    'tests/lanhu-ai-spec.test.mjs',
    'tests/repository-footprint.test.mjs',
    'tests/repository-hygiene.test.mjs',
    'tests/requirement-archive.test.mjs',
    'tests/test-entrypoints.test.mjs',
  ],
  workflow: [
    'tests/workflow*.test.mjs',
    'tests/frontend-test-workflow.test.mjs',
    'tests/verification-evidence-integrity.test.mjs',
    'tests/dynamic-dependency-context.test.mjs',
    'tests/project-target-profile.test.mjs',
    'tests/project-platform-profile.test.mjs',
    'tests/real-project-validation.test.mjs',
  ],
  platform: ['tests/ui-review-platform-runtime.test.mjs'],
});

function patternExpression(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/gu, '\\$&').replaceAll('*', '[^/]*');
  return new RegExp(`^${escaped}$`, 'u');
}

export function discoverTestFiles(root, patterns) {
  const testsRoot = path.join(root, 'tests');
  const candidates = fs.existsSync(testsRoot)
    ? fs.readdirSync(testsRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
      .map((entry) => `tests/${entry.name}`)
      .sort()
    : [];
  const expressions = patterns.map(patternExpression);
  const files = candidates.filter((candidate) => expressions.some((expression) => expression.test(candidate)));
  if (files.length === 0) {
    const error = new Error(`测试分组没有发现任何文件：${patterns.join(', ')}`);
    error.code = 'test_group_empty';
    throw error;
  }
  return files;
}

export function buildTestCommand({ root = process.cwd(), group = 'all' } = {}) {
  if (!TEST_GROUPS[group]) {
    const error = new Error(`未知测试分组：${group}`);
    error.code = 'unknown_test_group';
    throw error;
  }
  return { command: process.execPath, args: ['--test', ...discoverTestFiles(root, TEST_GROUPS[group])] };
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const root = process.cwd();
    const command = buildTestCommand({ root, group: process.argv[2] || 'all' });
    const result = spawnSync(command.command, command.args, { cwd: root, stdio: 'inherit', shell: false });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(`${error.code || 'test_group_failed'}：${error.message}`);
    process.exitCode = 1;
  }
}
