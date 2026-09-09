import fs from 'node:fs';
import path from 'node:path';
const root='outputs/skill-paired-20260909';
const runs=JSON.parse(fs.readFileSync(path.join(root,'runs.json')));
const candidate=runs.find(r=>r.id==='assertion-after');
const baseline=runs.find(r=>r.id==='assertion-before');
const historical=JSON.parse(fs.readFileSync('outputs/skill-benefit-evaluation/runs.json')).find(r=>r.id==='assertion-after');
const metrics={};
for(const [name,old,current] of [
 ['inputTokens',historical.usage.input_tokens,candidate.usage.input_tokens],
 ['uncachedInputTokens',historical.usage.input_tokens-historical.usage.cached_input_tokens,candidate.usage.input_tokens-candidate.usage.cached_input_tokens],
 ['toolOutputBytes',historical.toolOutputBytes,candidate.toolOutputBytes],
 ['elapsedMs',historical.elapsedMs,candidate.elapsedMs],
]) metrics[name]={historical:old,current,reductionPercent:Number(((old-current)/old*100).toFixed(2))};
const result={date:'2026-09-09',status:'inconclusive',started:2,completed:1,timedOut:1,expanded:false,quality:{candidatePassed:4,total:4,baseline:'not-graded-incomplete',method:'主评测者核对运行前冻结 criteria，无独立盲评'},candidateIrrelevantGuideReads:0,pairedInputReductionPercent:null,twentyPercentTarget:'unverified',historyComparison:{source:'outputs/skill-benefit-evaluation/runs.json assertion-after',sameModelSettings:true,paired:false,metrics,caveat:'跨日期历史参照，非当日完整配对，不足以验收20%目标或声称稳定额度收益'},account:{before:{fiveHourUsed:2,weekUsed:30},afterCandidate:{fiveHourUsed:13,weekUsed:32},afterBaseline:{fiveHourUsed:25,weekUsed:34},stopThreshold:22,limitType:'两次调用之间的停止线，不是服务侧硬额度上限',exclusiveEvaluationUsage:false},limitations:['75秒上限低于历史旧版约78秒耗时，易截断基线；本次设计偏紧','旧版超时未返回usage，不能当作零成本','新版只验证一个显式技能任务，不能代表bootstrap或其他技能','质量和读取行为通过，不等于整体效率验收通过'],sourceChanged:false,installed:false,committed:false,pushed:false,ci:'当前修订未提交，无对应新矩阵'};
fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(result,null,2));
const controls=JSON.parse(fs.readFileSync(path.join(root,'controls.json')));controls.accountSnapshots.push({stage:'after-baseline',fiveHourUsed:25,weekUsed:34});fs.writeFileSync(path.join(root,'controls.json'),JSON.stringify(controls,null,2));
const report=`# 2026-09-09 限定技能对照\n\n结论：新版的局部读取行为与答案质量通过检查；同日配对因旧版超时不完整，输入降低 20% 目标仍未验证，不扩展、不重试、不安装。\n\n## 条件\n\n旧版 ca472ca3 与冻结的工作区候选，四份候选文档 SHA-256 见 protocol.json。两个隔离 Vue fixture 的 11 个文件逐字相同；同题、同模型 gpt-6-astra、xhigh、只读沙箱，各一次，先新版后旧版。评分问题与规则在执行前固定，没有把标准答案提供给模型。每次最多 75 秒，每次结束检查额度。\n\n## 当日结果\n\n| 指标 | 旧版 | 新版 |\n| --- | --- | --- |\n| 完成状态 | 75 秒时中止，只有过程消息 | 55.303 秒完整完成 |\n| 四项质量检查 | 未评分，不能当作答案质量失败 | 4/4 |\n| 无关指南 | 中止前已搜索并分段读取测试通用指南 | 0 次 |\n| 工具命令数 | 中止前 6 次 | 5 次 |\n| 工具返回文本 | 中止前 14322 字节，不是完整总量 | 3283 字节 |\n| 输入 token | 未返回，不按零计 | 45307 |\n| 缓存输入 token | 未返回 | 29184 |\n| 未缓存输入 token | 未返回 | 16123 |\n| 输出 token | 未返回 | 1357 |\n| 工作区修改 | 无 | 无 |\n\n新版读取技能、适用项目规则、断言和实现，没有读受管流程、测试指南、检查器源码或无关页面。正确指出空关键词依赖默认 all、trim/大小写边界、状态与关键词交集、错误实现仍可通过以及输入突变盲点，并声明未运行测试。五次命令中仍有拆开的文件读取，因此不能宣称调用次数已经最少。\n\n## 仅供参考的历史对比\n\n相对 2026-09-08 同题、同模型设置、同一旧版技能的完整记录：输入 68215 → 45307（减少 ${metrics.inputTokens.reductionPercent}%）；未缓存输入 33783 → 16123（减少 ${metrics.uncachedInputTokens.reductionPercent}%）；工具文本 15219 → 3283（减少 ${metrics.toolOutputBytes.reductionPercent}%）；耗时 78.193 → 55.303 秒（减少 ${metrics.elapsedMs.reductionPercent}%）。这组数字是跨日观察，服务状态、采样、缓存可能不同，不能替代当日完整配对，也不作为 20% 目标达标证据。\n\n## 停止与方法问题\n\n实际执行 2 次，1 完成、1 超时，无自动重试。账户共享 5 小时已用 2% → 13% → 25%，周已用 30% → 34%；超出 22% 的调用间停止线后，不启动其他场景，没有使用重置额度。账户差值包含主任务及可能的其他活动，不能归因成两次试验独占用量。\n\n75 秒期限低于已知历史旧版约 78 秒的完成时间，容易截断基线；这是此次评测设计的不足，不应利用超时宣称新版稳定更快。后续若再做配对，应先确保基线的完整完成时间能落在约定预算内，并为两次调用整体预留额度。当前不自动开展。\n\n## 交付状态\n\n源码四文档与上轮本地测试时的哈希一致，没有再次修改产品或重复跑全量测试。原 233 通过、0 失败、8 跳过及官方验证仍对应同一源码；未提交、推送、重装，也没有当前修订新 CI。临时插件副本、运行时链接和隔离项目已清理，保留 protocol.json、cases.json、controls.json、runs.json、results.json 和执行事件、回答供复核。\n`;
fs.writeFileSync(path.join(root,'report.md'),report);
console.log(JSON.stringify({status:result.status,historyOnly:metrics}));
