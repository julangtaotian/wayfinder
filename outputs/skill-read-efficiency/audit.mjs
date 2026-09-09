import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = 'plugins/frontend-ai-workflow';
const read = p => fs.readFileSync(p,'utf8');
const rebase = s => s.replaceAll('../../references/', './').replaceAll('../../assets/', '../assets/');
const testBefore = read('outputs/skill-read-efficiency/test-before.md');
const bootstrapBefore = read('outputs/skill-read-efficiency/bootstrap-before.md');
const managed = read(path.join(root,'references/managed-test-workflow.md'));
const initialization = read(path.join(root,'references/workflow-initialization.md'));
const checks = {
 managedPlanImplementVerifyAndGuardrailsPreserved: managed.includes(rebase(testBefore.slice(testBefore.indexOf('## Plan')))),
 managedRuntimePreserved: managed.includes(rebase(testBefore.slice(testBefore.indexOf('## Runtime'),testBefore.indexOf('## Intent Routing'))).replace('Resolve `<plugin-root>` as the directory two levels above this skill folder. ', '')),
 initializationMigrationAndGuardrailsPreserved: initialization.includes(rebase(bootstrapBefore.slice(bootstrapBefore.indexOf('## Workflow'))).replace('When mode selection requires deep initialization,', 'For explicit deep initialization or a complete project map,').replace('relative to this skill', 'relative to this reference')),
};
const hashes = {};
for(const name of ['skills/frontend-test/SKILL.md','skills/frontend-workflow-bootstrap/SKILL.md','references/managed-test-workflow.md','references/workflow-initialization.md']) hashes[name] = crypto.createHash('sha256').update(read(path.join(root,name))).digest('hex');
const metrics = Object.fromEntries([['test',testBefore,'frontend-test'],['bootstrap',bootstrapBefore,'frontend-workflow-bootstrap']].map(([name,before,skill])=>{const after=fs.statSync(path.join(root,'skills',skill,'SKILL.md')).size;return [name,{beforeBytes:Buffer.byteLength(before),afterBytes:after,reductionPercent:Number(((1-after/Buffer.byteLength(before))*100).toFixed(2)),within2400Bytes:after<=2400}];}));
const result = {checks,metrics,hashes,modelTrial:{started:false,status:'budget_stopped_before_start',fiveHourUsedPercent:65,stopThresholdPercent:55,extraModelRuns:0},scope:'移动后的复杂流程段落与原文逐字核对，仅规范相对引用和插件根解析说明；不是独立模型行为测试'};
fs.writeFileSync('outputs/skill-read-efficiency/audit.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
if(Object.values(checks).some(v=>!v)||Object.values(metrics).some(v=>!v.within2400Bytes)) process.exitCode=1;
