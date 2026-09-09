import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve('outputs/skill-benefit-evaluation');
const target = path.join(root,'workspaces/health-before');
const rows = [];
for(let round = -1; round < 20; round++) for(const variant of round % 2 === 0 ? ['before','after'] : ['after','before']) {
 const start = performance.now();
 const result = spawnSync(process.execPath,[path.join(root,'packages',variant,'scripts/check-project.mjs'),'--target',target,'--summary'],{encoding:'utf8',shell:false});
 const elapsedMs = performance.now() - start;
 let data;
 try { data = JSON.parse(result.stdout); } catch { throw Error(`invalid summary: ${result.stderr}`); }
 if(round >= 0) rows.push({round,variant,elapsedMs,exitCode:result.status,ok:data.ok,outputBytes:Buffer.byteLength(result.stdout)});
}
const median = a => {a=[...a].sort((x,y)=>x-y);return (a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2;};
const summary = Object.fromEntries(['before','after'].map(variant=>{const set=rows.filter(r=>r.variant===variant);return [variant,{count:set.length,medianMs:median(set.map(r=>r.elapsedMs)),minMs:Math.min(...set.map(r=>r.elapsedMs)),maxMs:Math.max(...set.map(r=>r.elapsedMs)),resultStable:set.every(r=>r.exitCode === set[0].exitCode && r.ok === set[0].ok)}];}));
fs.writeFileSync(path.join(root,'timing.json'),JSON.stringify({warmupPerVariant:1,rows,summary,platform:process.platform+'-'+process.arch,scope:'同一小型 fixture 的进程启动和健康摘要，不是模型响应延迟'},null,2));
console.log(JSON.stringify(summary));
