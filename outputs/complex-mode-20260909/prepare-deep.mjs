import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root=path.resolve('outputs/complex-mode-20260909');
const project=path.join(root,'workspaces/deep-after');
const entry=path.join(root,'packages/after/scripts/bootstrap-project.mjs');
const rules=fs.readFileSync(path.join(project,'AGENTS.md'),'utf8');
// 独立保留无受管标记冲突证据；成功场景从正常接入的基线开始。
fs.renameSync(path.join(root,'deep-preflight.json'),path.join(root,'unmanaged-conflict.json'));
fs.unlinkSync(path.join(project,'AGENTS.md'));
const init=spawnSync(process.execPath,[entry,'--target',project,'--write'],{encoding:'utf8',shell:false});
if(init.status)throw Error(init.stderr+' '+init.stdout);
fs.appendFileSync(path.join(project,'AGENTS.md'),'\n'+rules);
for(const args of [['add','.'],['-c','user.name=Evaluation','-c','user.email=evaluation@example.invalid','commit','-qm','Freeze ordinary onboarding with custom rules']]){const r=spawnSync('git',args,{cwd:project,encoding:'utf8',shell:false});if(r.status)throw Error(r.stderr);}
const preview=spawnSync(process.execPath,[entry,'--target',project,'--deep'],{encoding:'utf8',shell:false});
const data=JSON.parse(preview.stdout);fs.writeFileSync(path.join(root,'deep-preflight.json'),preview.stdout.replaceAll(process.cwd(),'[repository]'));
if(!data.ok)throw Error(JSON.stringify(data.actions));
const base={};for(const file of ['AGENTS.md','wayfinder/frontend.md','openspec/config.yaml'])base[file]=fs.readFileSync(path.join(project,file),'utf8');
fs.writeFileSync(path.join(root,'deep-managed-baseline.json'),JSON.stringify(base,null,2));
console.log(JSON.stringify({deepReady:data.ok,unmanagedConflictRetained:true}));
