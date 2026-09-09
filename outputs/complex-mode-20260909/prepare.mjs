import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { renderRequirement,renderPlan } from './render-fixture.mjs';
import { validateTestPlan } from '../../plugins/frontend-ai-workflow/scripts/validate-test-plan.mjs';
const root=path.resolve('outputs/complex-mode-20260909');
const write=(base,file,text)=>{const p=path.join(base,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);};
const hashes={};
for(const name of ['skills/frontend-test/SKILL.md','skills/frontend-workflow-bootstrap/SKILL.md','references/managed-test-workflow.md','references/workflow-initialization.md']){const source=path.join('plugins/frontend-ai-workflow',name);fs.cpSync(source,path.join(root,'packages/after',name));hashes[name]=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');}
const managed=path.join(root,'workspaces/managed-after');
write(managed,'AGENTS.md','# 样例项目规则\n回复中文。保持产品源码、package.json、锁文件和已有测试不变。验证产物保存在当前项目 outputs 中。依据实际执行结果更新验证记录。\n');
write(managed,'package.json',JSON.stringify({name:'managed-evidence-example',private:true,type:'module',scripts:{test:'node --test tests/*.test.mjs'},dependencies:{vue:'3.5.13'},devDependencies:{vite:'6.1.0'}},null,2));
write(managed,'src/math.mjs','export const add = (left, right) => left + right;\n');
write(managed,'tests/math.test.mjs',`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from '../src/math.mjs';\ntest('[TC-01] 两数相加', () => assert.equal(add(1, 2), 3));\n`);
let requirement=renderRequirement().replace('`artifacts/TC-01.txt`','`openspec/changes/add-fixture-test/evidence/V-01.json`').replace('Vitest 聚焦测试','node --test tests/math.test.mjs');
requirement+='\n## 验收—证据映射\n\n| 验收ID | 验收点 | 关联决策 | 验证方式 | 证据位置 | 断言结果 | 验证记录 |\n| --- | --- | --- | --- | --- | --- | --- |\n| A-01 | 两数相加 | D-01 | 自动 | `openspec/changes/add-fixture-test/evidence/V-01.json` | add(1, 2)严格等于3 | V-01 |\n';
write(managed,'requirements/REQ-2026-001-fixture.md',requirement);
let plan=renderPlan({planStatus:'已实现',caseStatus:'已实现',target:'tests/math.test.mjs'}).replaceAll('npm run test -- tests/math.spec.js','node --test tests/math.test.mjs').replaceAll('npm run test -- tests/math.test.mjs','node --test tests/math.test.mjs').replaceAll('Vitest','Node Test Runner').replace('Git 基线：unavailable','Git 基线：独立 Git 已跟踪').replace('Vue 3 + Vite + Node Test Runner fixture。','Node 内置运行器按真实项目证据有限支持，不宣称 Vitest 认证。');
write(managed,'openspec/changes/add-fixture-test/test-plan.md',plan);
write(managed,'openspec/changes/add-fixture-test/.openspec.yaml','schema: spec-driven\ntest_plan: required\nverification_evidence: required\n');
write(managed,'openspec/config.yaml','schema: spec-driven\n');
for(const args of [['init','-q'],['add','.'],['-c','user.name=Evaluation','-c','user.email=evaluation@example.invalid','commit','-qm','Frozen managed fixture']]){const r=spawnSync('git',args,{cwd:managed,encoding:'utf8',shell:false});if(r.status)throw Error(r.stderr);}
const check=validateTestPlan(path.join(managed,'openspec/changes/add-fixture-test/test-plan.md'),{requirement:path.join(managed,'requirements/REQ-2026-001-fixture.md'),change:path.join(managed,'openspec/changes/add-fixture-test'),stage:'implement'});
fs.writeFileSync(path.join(root,'managed-preflight.json'),JSON.stringify(check,null,2).replaceAll(process.cwd(),'[repository]'));
if(!check.ok)throw Error(JSON.stringify(check.errors));
const deep=path.join(root,'workspaces/deep-after');fs.renameSync(path.join(root,'workspaces/understanding-after'),deep);
write(deep,'AGENTS.md','# 项目专属规则\n\nPROJECT_RULE_SENTINEL：保留本段及所有受管块外文字。订单筛选使用本地数据，不接入远程服务。允许初始化工作流，禁止修改业务源码和依赖。\n');
write(deep,'docs/operations.md','# 维护说明\n\n本项目目前是本地订单筛选演示；发布流程尚未建设。请保留运营说明。\n');
write(deep,'.gitignore','node_modules/\noutputs/\n.env.local\n');
for(const args of [['add','.'],['-c','user.name=Evaluation','-c','user.email=evaluation@example.invalid','commit','-qm','Freeze deep setup sentinel']]){const r=spawnSync('git',args,{cwd:deep,encoding:'utf8',shell:false});if(r.status)throw Error(r.stderr);}
const cases=[{id:'managed',skill:'frontend-test',prompt:'复验活动变更 add-fixture-test 的已实现测试用例，关联需求 requirements/REQ-2026-001-fixture.md。按实际结果更新测试方案和需求中的验证记录，提供可追溯证据；不要修改业务源码或既有测试。',criteria:['加载managed-test-workflow与test-case-guidelines','先预览后执行记录的聚焦命令，真实命中TC-01','生成可校验V-01机器证据并更新真实结果','调用complete验证且保留产品/测试/依赖原文']},{id:'deep',skill:'frontend-workflow-bootstrap',prompt:'请为这个项目完成深度初始化，建立完整、可用的项目地图，并写入工作流文件。保留现有项目专属规则和所有业务代码，不安装依赖；未实际运行的构建或浏览器验证要明确说明。',criteria:['加载初始化与深度流程，执行范围收集和预览','地图覆盖纳入范围全部文件，不能以局部分析冒充完整','保留专属规则和业务文件，仅写受管工作流','产出地图经深度校验成立，披露未执行能力']}];
fs.writeFileSync(path.join(root,'cases.json'),JSON.stringify(cases,null,2));
fs.writeFileSync(path.join(root,'protocol.json'),JSON.stringify({date:'2026-09-09',model:'gpt-6-astra',reasoning:'xhigh',order:['managed-after','deep-after'],maxRuns:2,aggregateInputStop:null,timeoutMs:null,hashes,initialAccount:{fiveHourUsed:0,weekUsed:31},scope:'两个候选复杂行为场景，无新旧性能比较；每场景一次自然完成',authorization:'用户要求复杂模式行为验证，仅隔离fixture可写，不自动重试'},null,2));
fs.mkdirSync(path.join(root,'tmp'),{recursive:true});console.log(JSON.stringify({managedPreflight:check.ok,cases:2}));
