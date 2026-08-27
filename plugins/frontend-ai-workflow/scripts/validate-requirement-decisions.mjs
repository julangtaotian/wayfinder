import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseRequirementDecisionDocument } from './requirement-decision-parser.mjs';
import { validateRequirementDelivery } from './requirement-delivery-validation.mjs';

const VALIDATION_STAGES = new Set(['plan', 'implement', 'precomplete', 'complete']);

export function validateRequirementDecisions(requirementPath, options = {}) {
  const errors = [];
  const warnings = [];
  const stage = options.stage || 'plan';
  if (!VALIDATION_STAGES.has(stage)) errors.push(`校验阶段无效：${stage}；必须使用${[...VALIDATION_STAGES].join('、')}`);
  const resolvedRequirement = path.resolve(requirementPath || '');
  if (!requirementPath || !fs.existsSync(resolvedRequirement)) {
    return {
      ok: false,
      stage,
      requirementPath: resolvedRequirement,
      changePath: options.changePath ? path.resolve(options.changePath) : null,
      decisions: 0,
      acceptances: 0,
      taskReferences: { decisionCount: 0, acceptanceCount: 0 },
      errors: [`需求文件不存在：${resolvedRequirement}`],
      warnings,
    };
  }
  const content = fs.readFileSync(resolvedRequirement, 'utf8');
  const parsed = parseRequirementDecisionDocument(content, {
    changePath: options.changePath,
    stage,
    errors,
    warnings,
  });
  const delivery = validateRequirementDelivery({
    requirementPath: resolvedRequirement,
    content,
    changePath: options.changePath,
    stage,
    decisions: parsed.decisions,
    acceptanceIds: parsed.acceptanceIds,
    verificationRecords: parsed.verificationRecords,
    selectedChangeScope: parsed.selectedChangeScope,
    errors,
    warnings,
  });
  return {
    ok: errors.length === 0,
    stage,
    requirementPath: resolvedRequirement,
    changePath: options.changePath ? path.resolve(options.changePath) : null,
    decisions: parsed.decisions.size,
    acceptances: parsed.acceptanceIds.size,
    requirementStatus: parsed.requirementStatus,
    interactionStateMatrix: {
      present: parsed.interactionStateMatrix.present,
      rows: parsed.interactionStateMatrix.rows.length,
    },
    verificationRecords: parsed.verificationRecords?.size || 0,
    evidenceFormat: parsed.evidenceMapping.enhanced ? 'enhanced' : 'legacy',
    selectedChangeScope: parsed.selectedChangeScope ? {
      name: parsed.selectedChangeScope.name,
      decisions: parsed.selectedChangeScope.decisionIds.size,
      acceptances: parsed.selectedChangeScope.acceptanceIds.size,
    } : null,
    evidenceFiles: delivery.evidenceFiles,
    testFileStrategy: delivery.testFileStrategy,
    taskReferences: delivery.taskReferences,
    errors,
    warnings,
  };
}

function parseArgs(argv) {
  const args = { requirementPath: null, changePath: null, stage: 'plan', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--change') {
      args.changePath = argv[index + 1];
      index += 1;
    } else if (value === '--stage') {
      args.stage = argv[index + 1];
      index += 1;
    } else if (value === '--json') {
      args.json = true;
    } else if (!args.requirementPath) {
      args.requirementPath = value;
    } else {
      throw new Error(`不支持的参数：${value}`);
    }
  }
  if (!args.requirementPath) throw new Error('必须提供需求文件路径');
  return args;
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = validateRequirementDecisions(args.requirementPath, { changePath: args.changePath, stage: args.stage });
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.ok) {
      console.log(`需求决策校验通过：${result.decisions} 项决策，${result.acceptances} 项验收。`);
    } else {
      console.error(result.errors.map((error) => `- ${error}`).join('\n'));
    }
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
