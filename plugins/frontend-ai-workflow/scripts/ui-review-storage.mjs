import fs from 'node:fs';
import path from 'node:path';
import {
  atomicWriteProjectFile,
  ensureSafeProjectDirectory,
} from './project-path-safety.mjs';
import {
  fail,
  requireObject,
} from './ui-review-contract.mjs';
import {
  resolveSafeProjectPath,
} from './ui-review-config.mjs';
import {
  assertState,
  assertMutableState,
} from './ui-review-state.mjs';

// 存储层只负责受限路径中的状态读取和原子写入。
export function readJsonFile(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`无法读取${label}：${error.message}`);
  }
}

export function readRunState(projectRoot, statePath) {
  const safe = resolveSafeProjectPath(projectRoot, statePath, '状态路径', { mustExist: true, allowDirectory: false });
  return assertState(readJsonFile(safe.absolutePath, '运行状态'));
}

export function writeRunState(projectRoot, state, { allowExistingState = false } = {}) {
  const current = assertMutableState(state);
  const artifacts = requireObject(current.artifacts, '运行状态 artifacts');
  const statePath = resolveSafeProjectPath(projectRoot, artifacts.state, '状态产物路径');
  const runDirectory = resolveSafeProjectPath(projectRoot, artifacts.runDirectory, '运行目录');
  if (path.dirname(statePath.absolutePath) !== runDirectory.absolutePath) fail('state.json 必须直接位于运行目录中');

  if (fs.existsSync(runDirectory.absolutePath)) {
    const entries = fs.readdirSync(runDirectory.absolutePath);
    const allowed = new Set(['state.json', 'actual.png', 'interactions', 'review-input.json', 'report']);
    const unknown = entries.filter((entry) => !allowed.has(entry));
    if (unknown.length > 0) fail(`运行目录包含未知内容，拒绝写入：${unknown.join('、')}`);
    if (fs.existsSync(statePath.absolutePath) && !allowExistingState) fail(`运行状态已存在，拒绝覆盖：${artifacts.state}`);
    if (fs.existsSync(statePath.absolutePath)) {
      const previous = readJsonFile(statePath.absolutePath, '既有运行状态');
      if (previous.runId !== current.runId || previous.scenarioId !== current.scenarioId) fail('既有运行状态不属于同一次运行');
    }
  } else {
    ensureSafeProjectDirectory(projectRoot, runDirectory.absolutePath, '运行目录');
  }

  atomicWriteProjectFile(projectRoot, statePath.absolutePath, `${JSON.stringify(current, null, 2)}\n`, {
    label: '运行状态',
  });
  return statePath.absolutePath;
}
