import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { runBoundedProcess } from '../../plugins/frontend-ai-workflow/scripts/developer-effectiveness-benchmark-process.mjs';
const repo = process.cwd();
const root = path.join(repo, 'outputs/skill-benefit-evaluation');
const protocol = JSON.parse(fs.readFileSync(path.join(root, 'protocol.json'), 'utf8'));
const cases = JSON.parse(fs.readFileSync(path.join(root, 'cases.json'), 'utf8'));
const sanitize = value => value.replaceAll(repo, '[repository]').replaceAll(process.env.HOME || '[no-home]', '[home]');
function fingerprint(target) {
 const out = {};
 function walk(dir) { for(const entry of fs.readdirSync(dir, { withFileTypes: true })) { if(entry.name === '.git') continue; const p = path.join(dir, entry.name); if(entry.isDirectory()) walk(p); else out[path.relative(target, p)] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } }
 walk(target); return out;
}
let aggregateInput = 0;
const results = [];
for (const id of protocol.order) {
 if(aggregateInput >= protocol.aggregateInputStop) { console.log(JSON.stringify({ stopped: 'aggregate_input_limit', aggregateInput })); break; }
 const variant = id.endsWith('-before') ? 'before' : 'after';
 const candidate = cases.find(c => id === `${c.id}-${variant}`);
 const workspace = path.join(root, 'workspaces', id);
 const skill = path.join(root, 'packages', variant, 'skills', candidate.skill, 'SKILL.md');
 const prompt = `请使用 ${skill} 中的技能完成下面的用户任务，并以该技能所在目录解析引用和插件脚本。\n用户任务：${candidate.prompt}\n工作目录就是待分析的项目。请直接完成这项只读任务，不联网、不安装依赖、不修改任何文件，不启动其他模型或子代理。`;
 fs.writeFileSync(path.join(root, `${id}.prompt.txt`), sanitize(prompt));
 const args = ['exec', '--ignore-user-config', '--ephemeral', '--json', '--color', 'never', '--sandbox', 'read-only', '--model', protocol.model, '-c', `model_reasoning_effort="${protocol.reasoning}"`, '--cd', workspace, '-'];
 const before = fingerprint(workspace);
 const start = performance.now();
 console.log(JSON.stringify({ started: id }));
 const r = await runBoundedProcess({ command: process.env.FRONTEND_EVAL_CODEX, args, cwd: workspace, env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(workspace), TMPDIR: path.join(root, 'tmp'), TMP: path.join(root, 'tmp'), TEMP: path.join(root, 'tmp') }, input: prompt, timeoutMs: protocol.timeoutMs });
 const elapsedMs = Math.round(performance.now() - start);
 fs.writeFileSync(path.join(root, `${id}.events.jsonl`), sanitize(r.stdout));
 fs.writeFileSync(path.join(root, `${id}.stderr.log`), sanitize(r.stderr));
 const events = r.stdout.split('\n').filter(Boolean).flatMap(line => {try{return [JSON.parse(line)];}catch{return [];}});
 const usage = events.filter(e => e.type === 'turn.completed').reduce((sum, e) => {for(const [key, value] of Object.entries(e.usage || {})) if(typeof value === 'number') sum[key] = (sum[key] || 0) + value; return sum;}, {});
 const items = events.filter(e => e.type === 'item.completed').map(e => e.item);
 const commands = items.filter(e => e.type === 'command_execution');
 const answer = items.filter(e => e.type === 'agent_message').map(e=>e.text).join('\n\n');
 fs.writeFileSync(path.join(root, `${id}.answer.md`), sanitize(answer));
 const record = { id, variant, caseId: candidate.id, elapsedMs, exitCode: r.exitCode, timedOut: r.timedOut, usage, completed: events.some(e=>e.type === 'turn.completed'), errorEvents: events.filter(e=>e.type === 'error' || e.type === 'turn.failed'), commands: commands.map(c=>({ command: sanitize(c.command), exitCode: c.exit_code, outputBytes: Buffer.byteLength(c.aggregated_output || '') })), toolOutputBytes: commands.reduce((n,c)=>n+Buffer.byteLength(c.aggregated_output || ''),0), answerBytes: Buffer.byteLength(answer), workspaceUnchanged: JSON.stringify(before) === JSON.stringify(fingerprint(workspace)) };
 aggregateInput += usage.input_tokens || 0;
 results.push(record);
 fs.writeFileSync(path.join(root, 'runs.json'), JSON.stringify(results, null, 2));
 console.log(JSON.stringify({ finished: id, elapsedMs, usage, commands: commands.length, completed: record.completed, timedOut: record.timedOut, aggregateInput }));
 // 接入失败时停止，避免连续消耗无效请求；任务超时保留失败记录供评分。
 if(!record.completed && !record.timedOut) break;
}
