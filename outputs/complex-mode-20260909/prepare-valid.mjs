import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root=path.resolve('outputs/complex-mode-20260909');
const source=path.join(root,'workspaces/managed-after'),target=path.join(root,'workspaces/managed-valid-after');
const git=(args,cwd)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8',shell:false});if(r.status)throw Error(r.stderr);return r.stdout;};
// 从冻结提交构造正常场景，避免复制正在运行的冲突样本产物。
for(const name of git(['ls-tree','-r','--name-only','HEAD'],source).trim().split('\n')){const p=path.join(target,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,git(['show',`HEAD:${name}`],source));}
fs.writeFileSync(path.join(target,'AGENTS.md'),'# 样例项目规则\n回复中文。保持产品源码、package.json、锁文件和已有测试不变。执行日志放在当前项目 outputs；测试方案要求的 V-* 机器证据允许写在活动变更 evidence 目录。依据实际执行结果更新验证记录。\n');
for(const args of [['init','-q'],['add','.'],['-c','user.name=Evaluation','-c','user.email=evaluation@example.invalid','commit','-qm','Freeze compatible evidence policy']])git(args,target);
const cases=JSON.parse(fs.readFileSync(path.join(root,'cases.json')));cases.push({...cases.find(c=>c.id==='managed'),id:'managed-valid'});fs.writeFileSync(path.join(root,'cases.json'),JSON.stringify(cases,null,2));
const protocol=JSON.parse(fs.readFileSync(path.join(root,'protocol.json')));protocol.order.push('managed-valid-after');protocol.maxRuns=3;protocol.amendment='第一次受管样例规则意外禁止固定证据目录，保留为冲突场景；仅补一个正常场景，不用阻断冒充成功路径验证。';fs.writeFileSync(path.join(root,'protocol.json'),JSON.stringify(protocol,null,2));
console.log('正常复验样例已从冻结基线重建。');
