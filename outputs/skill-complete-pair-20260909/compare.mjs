import fs from 'node:fs';
import path from 'node:path';
const root='outputs/skill-complete-pair-20260909';
const before=JSON.parse(fs.readFileSync(path.join(root,'runs.json')))[0];
const after=JSON.parse(fs.readFileSync('outputs/skill-paired-20260909/runs.json')).find(r=>r.id==='assertion-after');
if(!before.completed||!after.completed)throw Error('必须使用两个完整样本');
const rows=[];
for(const [metric,a,b] of [
 ['inputTokens',before.usage.input_tokens,after.usage.input_tokens],
 ['cachedInputTokens',before.usage.cached_input_tokens,after.usage.cached_input_tokens],
 ['uncachedInputTokens',before.usage.input_tokens-before.usage.cached_input_tokens,after.usage.input_tokens-after.usage.cached_input_tokens],
 ['outputTokens',before.usage.output_tokens,after.usage.output_tokens],
 ['totalTokens',before.usage.input_tokens+before.usage.output_tokens,after.usage.input_tokens+after.usage.output_tokens],
 ['toolOutputBytes',before.toolOutputBytes,after.toolOutputBytes],
 ['commandCount',before.commands.length,after.commands.length],
 ['elapsedMs',before.elapsedMs,after.elapsedMs],
])rows.push({metric,before:a,after:b,reductionPercent:Number(((a-b)/a*100).toFixed(2))});
const criteria=JSON.parse(fs.readFileSync(path.join(root,'cases.json'))).find(c=>c.id==='assertion').criteria;
const result={status:'passed_single_case',baselineCommit:'ca472ca3ec6857f10af92364142dda377cd657c0',candidateSource:'outputs/skill-paired-20260909/protocol.json hashes',samples:{before:'outputs/skill-complete-pair-20260909/runs.json assertion-before',after:'outputs/skill-paired-20260909/runs.json assertion-after'},controls:'same day, same model/reasoning, identical 11-file fixture and user task, explicit skills, read-only sandbox',comparisonComplete:true,additionalModelRunsThisTurn:1,pairedCases:1,quality:{criteria,before:[true,true,true,true],after:[true,true,true,true],adjudicator:'主评测者人工依据冻结条目与源码核对，不是盲评'},gates:{qualityPreserved:true,afterIrrelevantGuideReadsZero:true,inputReductionAtLeast20Percent:rows[0].reductionPercent>=20},rows,previousAbortedRun:{source:'outputs/skill-paired-20260909/runs.json assertion-before',includedInBenefitMetrics:false,usage:'unavailable, not zero',retained:true},account:{before:{fiveHourUsed:32,weekUsed:35},after:{fiveHourUsed:44,weekUsed:36},sharedNotExclusive:true},limitations:['只有一组完整配对，未估计置信区间','新版复用今天已完成记录，旧版在用户授权后重跑完成；不是随机交错重复实验','旧版此前超时产生的损耗单独保留，不拿来夸大收益','缓存、排队和采样波动仍可能影响用量/耗时，不能外推全部技能或套餐省32.7%','未评测bootstrap；未提交、推送或重新安装']};
fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(result,null,2));
const report=`# 完整技能配对结果（2026-09-09）\n\n结论：单条断言分析场景通过预先确定的质量、无关读取和输入至少减少20%三项检查。本次只追加一次旧版模型运行，让它自然完成；新版复用同日已完成的真实样本，不重跑或扩展其他场景。\n\n## 对比条件\n\n旧版：ca472ca3；新版：outputs/skill-paired-20260909/protocol.json 中记录的四文档工作区哈希。同日、gpt-6-astra、xhigh、同一用户问题、同一11文件Vue fixture、只读沙箱和显式技能。旧版重建后逐文件SHA-256与原fixture一致，路径与原实验相同。模型未获得评委的预期答案。\n\n## 完整实测\n\n| 指标 | 旧版 | 新版 | 本组下降 |\n| --- | ---: | ---: | ---: |\n| 冻结质量检查 | 4/4 | 4/4 | 质量保持 |\n| 输入 token（含缓存） | 67296 | 45307 | 32.68% |\n| 缓存输入 token | 49536 | 29184 | 单独披露 |\n| 未缓存输入 token | 17760 | 16123 | 9.22% |\n| 输出 token | 1749 | 1357 | 22.41% |\n| 输入＋输出 token | 69045 | 46664 | 32.42% |\n| 工具返回 UTF-8 字节 | 14235 | 3283 | 76.94% |\n| 完成工具命令数 | 6 | 5 | 16.67% |\n| 完成耗时 | 69.997秒 | 55.303秒 | 20.99% |\n\n两组都有实际 turn.completed 和 usage，均完整完成，没有把超时当成完成，也没有把SKILL字节数当token。两版都准确说明默认all、空白与大小写边界、关键词与状态的交集、恒等实现可通过及输入突变盲点，并明确未运行测试。\n\n旧版读取了测试通用指南、数据文件、页面与README，并进行额外查找。新版只读取技能、项目规则、测试和实现，未读取无关指南或检查器源码。其默认信息读取面缩小已在执行轨迹中出现，而不只是文档结构变短。两版工作区均保持原样。\n\n## 可以与不可以推出的结论\n\n这一个场景的输入降幅超过20%目标，回答质量保持，且无关指南读取消失，可以认定局部测试分析优化在该完整样本中有效。缓存比例不同，未缓存输入只减少9.22%，因此不能称套餐额度或金钱节省32.68%。只有一组完整配对，不能推断长期平均提速、返工率、所有技能收益；bootstrap尚未实测。\n\n## 超时历史与成本\n\n此前旧版75秒样本不完整，原始记录仍在 outputs/skill-paired-20260909/runs.json。它的消耗未返回完整usage，不能按零计，也没有计入性能差异来夸大新版收益。用户本次明确要求完成真正对照，因此解除该次补跑的耗时截断，只追加旧版一次，未重跑新版。\n\n账户共享快照：本轮开始5小时已用32%、周35%；补跑后44%、周36%。这包含主任务和账户其他活动，不是该调用独占扣费。没有兑换重置额度。固定运行时沿用，没有新增依赖。\n\n## 证据\n\n新版：outputs/skill-paired-20260909/assertion-after.events.jsonl、assertion-after.answer.md 与 runs.json。旧版：本目录 assertion-before.events.jsonl、assertion-before.answer.md 与 runs.json。机器比较见 results.json，准备与运行条件见 protocol.json。临时重建的旧版包、运行时链接和fixture已清理；未提交、推送或更新安装缓存。\n`;
fs.writeFileSync(path.join(root,'report.md'),report);
console.log(JSON.stringify(rows));
