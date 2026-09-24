import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { statusComplexChange, validateComplexChange } from './complex-change.mjs';
import { resolveSafeProjectPath } from './project-path-safety.mjs';

const VERIFICATION_LEVELS = new Set(['None', 'Focused', 'Targeted UI', 'Full UI']);
const VERIFICATION_SUMMARY_MAX_BYTES = 16 * 1024;

export function verificationSummaryTarget(root, changeName) {
  return path.join(root, '.frontend-ai-workflow', 'runs', changeName, 'verification-summary.json');
}

function summaryFailure(code, target, message) {
  return { ok: false, code, status: 'blocked', target, message };
}

// 完成门禁只读取单个有界临时摘要，不把命令日志、截图或证据路径复制进生命周期事件。
export function readTemporaryVerificationSummary(root, changeName) {
  const target = verificationSummaryTarget(root, changeName);
  const checked = resolveSafeProjectPath(root, target, '临时验证摘要', {
    allowAbsolute: true,
    allowDirectory: false,
  });
  if (!checked.exists) {
    return summaryFailure('verification_summary_missing', checked.projectPath, '缺少临时验证摘要');
  }
  const bytes = fs.statSync(checked.absolutePath).size;
  if (bytes > VERIFICATION_SUMMARY_MAX_BYTES) {
    return summaryFailure(
      'verification_summary_too_large',
      checked.projectPath,
      `临时验证摘要超过 ${VERIFICATION_SUMMARY_MAX_BYTES} 字节`,
    );
  }
  let value;
  try {
    value = JSON.parse(fs.readFileSync(checked.absolutePath, 'utf8'));
  } catch (error) {
    return summaryFailure('verification_summary_invalid', checked.projectPath, `临时验证摘要无法解析：${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return summaryFailure('verification_summary_invalid', checked.projectPath, '临时验证摘要必须是对象');
  }
  if (value.schemaVersion !== 1 || value.changeId !== changeName || !VERIFICATION_LEVELS.has(value.verificationLevel)) {
    return summaryFailure('verification_summary_invalid', checked.projectPath, '临时验证摘要的版本、变更标识或验证级别无效');
  }
  if (!Array.isArray(value.outcomes) || value.outcomes.length === 0 || value.outcomes.length > 64) {
    return summaryFailure('verification_summary_invalid', checked.projectPath, 'Outcome Gate 必须包含 1 到 64 个验收结果');
  }
  for (const [index, outcome] of value.outcomes.entries()) {
    const valid = outcome
      && typeof outcome === 'object'
      && !Array.isArray(outcome)
      && typeof outcome.acceptance === 'string'
      && outcome.acceptance.trim().length > 0
      && outcome.acceptance.length <= 300
      && outcome.status === 'passed'
      && typeof outcome.observation === 'string'
      && outcome.observation.trim().length > 0
      && outcome.observation.length <= 500;
    if (!valid) {
      return summaryFailure(
        'outcome_gate_failed',
        `${checked.projectPath}#outcomes[${index}]`,
        `Outcome Gate 第 ${index + 1} 项未通过或缺少可观察结果`,
      );
    }
  }
  return {
    ok: true,
    code: 'verification_summary_valid',
    status: 'passed',
    path: checked.absolutePath,
    projectPath: checked.projectPath,
    verificationLevel: value.verificationLevel,
    outcomeCount: value.outcomes.length,
  };
}

export function archiveTarget(root, changeName) {
  const date = new Date().toISOString().slice(0, 10);
  const archiveName = /^\d{4}-\d{2}-\d{2}-/u.test(changeName) ? changeName : `${date}-${changeName}`;
  return path.join(root, 'openspec', 'changes', 'archive', archiveName);
}

// 复杂通道只检查一个 OpenSpec 身份；需求正文、测试计划和证据文件不再是前置条件。
export function checkChange({ target = process.cwd(), change, stage = 'implement' } = {}, injected = {}) {
  if (!['implement', 'precomplete'].includes(stage)) throw new Error(`检查阶段无效：${stage}`);
  const status = statusComplexChange({ target, change }, injected);
  const validation = validateComplexChange({ target, change }, injected);
  const archivePath = archiveTarget(validation.root, change);
  const errors = [
    ...status.blockers.map((item) => item.message),
    ...validation.diagnostics.map((item) => item.message),
  ];
  let archive = null;
  let verificationSummary = null;
  if (stage === 'precomplete') {
    const available = !fs.existsSync(archivePath);
    if (!available) errors.push(`临时归档目标已存在：${archivePath}`);
    if (validation.progress.remaining > 0) errors.push(`仍有 ${validation.progress.remaining} 项任务未完成`);
    verificationSummary = (injected.readTemporaryVerificationSummary || readTemporaryVerificationSummary)(validation.root, change);
    if (!verificationSummary.ok) errors.push(verificationSummary.message);
    archive = { available, targetPath: archivePath };
  }
  return {
    ok: errors.length === 0,
    code: errors.length ? 'complex_check_failed' : 'complex_check_passed',
    status: errors.length ? 'blocked' : 'passed',
    root: validation.root,
    changePath: validation.changePath,
    changeName: change,
    stage,
    progress: validation.progress,
    artifacts: status.artifacts,
    blockers: status.blockers,
    diagnostics: validation.diagnostics,
    verificationSummary,
    archive,
    errors,
    warnings: [],
  };
}

function parseArgs(argv) {
  const args = { target: process.cwd(), change: null, stage: 'implement' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (['--target', '--change', '--stage'].includes(value)) {
      if (!argv[index + 1]) throw new Error(`参数 ${value} 缺少值`);
      args[value.slice(2)] = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`不支持的参数：${value}`);
    }
  }
  if (!args.change) throw new Error('必须提供 --change');
  return args;
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const result = checkChange(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
