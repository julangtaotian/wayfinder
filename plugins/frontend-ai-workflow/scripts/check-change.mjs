import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertSafeProjectRoot, resolveProjectRoot } from './collect-project-scope.mjs';
import { runOpenSpecSync } from './openspec-cli.mjs';
import { validateRequirementDecisions } from './validate-requirement-decisions.mjs';

const CHECK_STAGES = new Set(['implement', 'precomplete']);

function parseEngineJson(output) {
  const start = String(output || '').indexOf('{');
  if (start < 0) return null;
  try {
    return JSON.parse(output.slice(start));
  } catch {
    return null;
  }
}

function resolveInsideRoot(root, target, label) {
  const resolved = path.resolve(root, target);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label}越出项目范围：${target}`);
  }
  return resolved;
}

function resolveChangePath(root, change) {
  if (!change) throw new Error('必须提供变更名称或路径');
  const candidate = change.includes(path.sep)
    ? resolveInsideRoot(root, change, '变更路径')
    : path.join(root, 'openspec', 'changes', change);
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) {
    throw new Error(`变更目录不存在：${candidate}`);
  }
  return candidate;
}

function taskProgress(changePath) {
  const tasksPath = path.join(changePath, 'tasks.md');
  if (!fs.existsSync(tasksPath)) return { total: 0, complete: 0, remaining: 0 };
  const tasks = [...fs.readFileSync(tasksPath, 'utf8').matchAll(/^\s*-\s*\[([ xX])\]\s+(.+)$/gmu)];
  const complete = tasks.filter((match) => match[1].toLowerCase() === 'x').length;
  return { total: tasks.length, complete, remaining: tasks.length - complete };
}

function runEngineCheck(root, args, label, errors) {
  const result = runOpenSpecSync(args, { cwd: root, encoding: 'utf8' });
  if (!result.available || result.status !== 0) {
    errors.push(`${label}失败：${(result.stderr || result.stdout || result.error?.message || '未知错误').trim()}`);
    return { ok: false, executed: true, data: parseEngineJson(result.stdout || result.stderr) };
  }
  return { ok: true, executed: true, data: parseEngineJson(result.stdout) };
}

// OpenSpec 1.7 的 JSON 根信息属于安全边界，不能只把它当作展示字段。
export function validatePlanningRoot(root, data, label, errors) {
  if (!data?.root || typeof data.root.path !== 'string' || typeof data.root.source !== 'string') {
    errors.push(`${label}缺少可核验的规划根信息`);
    return;
  }
  if (data.root.source === 'global_default') {
    errors.push(`${label}解析到未经明确选择的机器默认 Store：${data.root.path}`);
    return;
  }
  if (path.resolve(data.root.path) !== path.resolve(root)) {
    errors.push(`${label}规划根与当前项目不一致：${data.root.path}`);
  }
}

function hasSkipSpecsMetadata(changePath) {
  const metadataPath = path.join(changePath, '.openspec.yaml');
  if (!fs.existsSync(metadataPath)) return false;
  return /^skip_specs:\s*true\s*(?:#.*)?$/mu.test(fs.readFileSync(metadataPath, 'utf8'));
}

function hasSkipSpecsDecision(requirementPath) {
  const content = fs.readFileSync(requirementPath, 'utf8');
  const heading = /^##\s+决策台账\s*$/mu.exec(content);
  if (!heading) return false;
  const afterHeading = content.slice(heading.index + heading[0].length);
  const nextHeading = afterHeading.search(/^##\s+/mu);
  const section = nextHeading < 0 ? afterHeading : afterHeading.slice(0, nextHeading);
  return section.split(/\r?\n/u).some((line) => (
    line.trim().startsWith('|')
    && /skip_specs:\s*true/iu.test(line)
    && /(不改变可观察行为|不影响可观察行为|no observable behavior)/iu.test(line)
    && /(已确认|项目默认)/u.test(line)
  ));
}

export function validatePlanningArtifacts(statusData, changePath, requirementPath, errors) {
  const skipSpecsMetadata = hasSkipSpecsMetadata(changePath);
  const skipSpecsAuthorized = skipSpecsMetadata && hasSkipSpecsDecision(requirementPath);
  const artifacts = Array.isArray(statusData?.artifacts) ? statusData.artifacts : [];
  if (!statusData) {
    errors.push('规划状态没有返回可解析的 JSON');
  } else if (statusData.isComplete !== true) {
    errors.push('规划尚未完成：OpenSpec isComplete 必须为 true');
  }
  if (!artifacts.length) errors.push('规划状态没有返回 artifact 列表');
  if (skipSpecsMetadata && !skipSpecsAuthorized) {
    errors.push('skip_specs: true 缺少需求决策台账中“已确认且不改变可观察行为”的授权');
  }
  const specPaths = statusData?.artifactPaths?.specs?.existingOutputPaths;
  if (skipSpecsMetadata && Array.isArray(specPaths) && specPaths.length > 0) {
    errors.push('skip_specs: true 与已存在的 delta specs 冲突');
  }
  for (const artifact of artifacts) {
    if (artifact?.status === 'done') continue;
    if (
      artifact?.id === 'specs'
      && artifact.status === 'skipped'
      && skipSpecsMetadata
      && skipSpecsAuthorized
    ) {
      continue;
    }
    errors.push(`规划 artifact 未完成或状态非法：${artifact?.id || 'unknown'}=${artifact?.status || 'missing'}`);
  }
  return {
    isComplete: statusData?.isComplete === true,
    artifacts: artifacts.map((artifact) => ({ id: artifact?.id, status: artifact?.status })),
    skipSpecsMetadata,
    skipSpecsAuthorized,
  };
}

export function archiveTarget(root, changeName) {
  const date = new Date().toISOString().slice(0, 10);
  const archiveName = /^\d{4}-\d{2}-\d{2}-/u.test(changeName) ? changeName : `${date}-${changeName}`;
  return path.join(root, 'openspec', 'changes', 'archive', archiveName);
}

// 变更检查只组合已有事实和内置严格校验，不执行目标项目测试或构建。
export function checkChange({
  target = process.cwd(),
  requirement,
  change,
  stage = 'implement',
} = {}) {
  if (!CHECK_STAGES.has(stage)) throw new Error(`检查阶段无效：${stage}`);
  const root = resolveProjectRoot(target);
  assertSafeProjectRoot(root);
  const requirementPath = resolveInsideRoot(root, requirement, '需求路径');
  if (!fs.existsSync(requirementPath)) throw new Error(`需求文件不存在：${requirementPath}`);
  const changePath = resolveChangePath(root, change);
  const changeName = path.basename(changePath);
  const errors = [];
  const warnings = [];
  const requirementValidation = validateRequirementDecisions(requirementPath, { changePath, stage });
  errors.push(...requirementValidation.errors);
  warnings.push(...requirementValidation.warnings);

  const status = runEngineCheck(root, ['status', '--change', changeName, '--json'], '规划状态检查', errors);
  if (status.ok) validatePlanningRoot(root, status.data, '规划状态检查', errors);
  const planningArtifacts = validatePlanningArtifacts(status.data, changePath, requirementPath, errors);
  const strictValidation = runEngineCheck(
    root,
    ['validate', changeName, '--type', 'change', '--strict', '--json', '--no-interactive'],
    '严格 OpenSpec 校验',
    errors,
  );
  if (strictValidation.ok) validatePlanningRoot(root, strictValidation.data, '严格 OpenSpec 校验', errors);
  const progress = taskProgress(changePath);
  let archive = null;
  let archiveInstructions = null;
  if (stage === 'precomplete') {
    const instructionResult = runEngineCheck(
      root,
      ['instructions', 'archive', '--change', changeName, '--json'],
      '归档指令检查',
      errors,
    );
    if (instructionResult.ok) validatePlanningRoot(root, instructionResult.data, '归档指令检查', errors);
    archiveInstructions = instructionResult.data;
    const targetPath = archiveTarget(root, changeName);
    const available = !fs.existsSync(targetPath);
    if (!available) errors.push(`归档目标已存在：${targetPath}`);
    archive = { available, targetPath };
  }

  return {
    ok: errors.length === 0,
    level: stage === 'precomplete' ? 'delivery' : 'change',
    root,
    requirementPath,
    changePath,
    changeName,
    stage,
    commandEvidence: {
      projectCommands: { status: 'detected', executed: false },
      verificationRecords: {
        status: 'recorded',
        executed: false,
        persistentFilesVerified: requirementValidation.evidenceFiles?.verifiedFiles || 0,
      },
      openSpecStatus: { status: status.ok ? 'passed' : 'failed', executed: true },
      openSpecStrictValidation: { status: strictValidation.ok ? 'passed' : 'failed', executed: true },
      archiveInstructions: {
        status: stage !== 'precomplete' ? 'not-run' : archiveInstructions ? 'passed' : 'failed',
        executed: stage === 'precomplete',
      },
    },
    requirementValidation,
    planningStatus: status.data,
    planningArtifacts,
    archiveInstructions,
    strictValidation: strictValidation.data,
    progress,
    archive,
    errors,
    warnings,
  };
}

function parseArgs(argv) {
  const args = { target: process.cwd(), requirement: null, change: null, stage: 'implement' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (['--target', '--requirement', '--change', '--stage'].includes(value)) {
      const key = value.slice(2);
      if (!argv[index + 1]) throw new Error(`参数 ${value} 缺少值`);
      args[key] = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`不支持的参数：${value}`);
    }
  }
  if (!args.requirement) throw new Error('必须提供 --requirement');
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
