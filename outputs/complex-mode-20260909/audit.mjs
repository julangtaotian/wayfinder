import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// 审核使用运行前指纹与当前实物，不采用被测模型的自评结论。
const root = 'outputs/complex-mode-20260909';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const runs = JSON.parse(read('runs.json'));
const initial = runs.find(run => run.id === 'deep-after');
const resumed = runs.find(run => run.id === 'deep-resume-after');
if (!resumed) throw new Error('恢复运行尚未结束，不能生成最终审核');
const before = JSON.parse(read('deep-managed-baseline.json'));
const workflowFiles = Object.keys(before);
const hash = file => crypto.createHash('sha256').update(read(`workspaces/deep-after/${file}`)).digest('hex');
const protectedFiles = Object.keys(initial.beforeFiles).filter(file => !workflowFiles.includes(file));
const removeManaged = text => text
  .replace(/<!-- frontend-ai-workflow:([\w-]+:)?start[^>]*-->[\s\S]*?<!-- frontend-ai-workflow:\1end -->/g, '')
  .replace(/^# frontend-ai-workflow:start[^\n]*\n[\s\S]*?^# frontend-ai-workflow:end[^\n]*/gm, '');
const outer = Object.fromEntries(workflowFiles.map(file => [file, removeManaged(before[file]) === removeManaged(read(`workspaces/deep-after/${file}`))]));
const check = JSON.parse(read('deep-independent-check.json'));
const result = {
  resumedCompleted: resumed.completed,
  protectedFiles,
  protectedFilesPreserved: protectedFiles.every(file => initial.beforeFiles[file] === hash(file)),
  managedOuterPreserved: outer,
  originalSentinelPreserved: read('workspaces/deep-after/AGENTS.md').includes('PROJECT_RULE_SENTINEL：保留本段及所有受管块外文字。订单筛选使用本地数据，不接入远程服务。允许初始化工作流，禁止修改业务源码和依赖。'),
  finalChangedExisting: Object.keys(initial.beforeFiles).filter(file => initial.beforeFiles[file] !== hash(file)),
  independentCheck: check,
};
fs.writeFileSync(path.join(root, 'deep-audit.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
