import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('outputs/skill-benefit-evaluation');
const read = name => JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const runs = read('runs.json');
const before = runs.find(r=>r.id === 'assertion-before');
const after = runs.find(r=>r.id === 'assertion-after');
const pct = (a,b) => Number(((a-b)/a*100).toFixed(2));
const metrics = {};
for(const [name,a,b] of [
 ['inputTokens',before.usage.input_tokens,after.usage.input_tokens],
 ['outputTokens',before.usage.output_tokens,after.usage.output_tokens],
 ['totalTokens',before.usage.input_tokens+before.usage.output_tokens,after.usage.input_tokens+after.usage.output_tokens],
 ['uncachedInputTokens',before.usage.input_tokens-before.usage.cached_input_tokens,after.usage.input_tokens-after.usage.cached_input_tokens],
 ['toolOutputBytes',before.toolOutputBytes,after.toolOutputBytes],
 ['commandCount',before.commands.length,after.commands.length],
 ['elapsedMs',before.elapsedMs,after.elapsedMs],
]) metrics[name] = { before:a, after:b, reductionPercent:pct(a,b) };
const grades = [
 { id:'assertion-before', criteria:[true,true,true,true], conclusion:'准确区分空字符串与空白/非空搜索，解释状态与关键词交集，未虚报执行；额外读取检查器及工作流资料。' },
 { id:'assertion-after', criteria:[true,true,true,true], conclusion:'保留全部关键结论与无副作用断言盲点；未运行检查器，但仍读了通用测试指南和额外页面。' },
 { id:'understanding-after', criteria:[true,true,true,true], conclusion:'正确描述本地数据、computed/v-model 与组合筛选；未运行深度扫描，但仍读 project-detection 和 managed-files。' },
];
const usage = runs.filter(r=>r.completed).reduce((sum,r)=>{for(const key of ['input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens']) sum[key]=(sum[key]||0)+(r.usage[key]||0);return sum;},{});
const result = {
 scope:'限额探索性评测', actual:{started:4,completed:3,interrupted:1,completePairs:1,unstarted:['health-before','health-after']},
 stoppedBecause:'账户共享 5 小时已用量从 7% 升至 37% 时主动中止；最后快照 39%，未兑换重置额度。账户差值含本任务分析与其他账户活动，不能归因给这些模型试验。',
 accountSnapshots:{before:{fiveHourUsedPercent:7,weekUsedPercent:17},stopDecision:{fiveHourUsedPercent:37,weekUsedPercent:22},after:{fiveHourUsedPercent:39,weekUsedPercent:22}},
 measuredCompletedRunUsage:usage, interruptedRunUsage:'unavailable，不按零消耗计算',
 metrics, grades, adjudication:'主评测者依据运行前冻结的 cases.json 对源码与完整回答逐项人工核对，无独立评委或盲评。',
 reliability:read('reliability.json').summary, timing:read('timing.json').summary,
 limitations:['每场景每版本仅一次；无置信区间，不能推断统计显著性','只有一组完整配对，不能代表十个技能','显式指定技能文件，不衡量隐式路由或安装体验','隔离小项目，共享同一固定运行时；未修改用户插件安装状态','缓存命中、服务排队、模型采样与本机并发活动影响结果','统一只读沙箱，未测试真实写入、归档完整交付或 UI 截图流程','源码观察不能替代运行 Vue 页面；fixture 的 Node 测试由评测者另行执行并通过','未缓存 token 增加不能直接换算套餐额度或金钱','定向回归集合覆盖优化目标，不代表真实生产故障率'],
};
fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(result,null,2));
const report = `# 插件优化收益实测报告\n\n日期：2026-09-08。结论：可靠性收益明确；单条测试分析出现较小 token 收益；没有证明实际额度更省或整体速度提高。\n\n## 方法与范围\n\n基线为 226d7a4，新版为 ca472ca3（日常文件与本次安装优化版本对应）。使用同一合成 Vue 3 + Vite 项目、相同用户问题、gpt-6-astra 与 xhigh 设置；评分条件先保存在 cases.json，再执行。显式读取各版本完整 SKILL.md，允许真实只读工具操作，两组共享未变更固定运行时。沿用模型服务身份，忽略用户配置并显式指定原模型设置；没有改写用户安装或认证配置。环境中系统技能与服务行为不应视为完全剥离。\n\n原计划 3 场景 × 2 版本、单次最多 180 秒，累计输入达到 250000 后不再启动下一次。因账户额度增长快于预期，实际启动 4 次、完成 3 次、中止 1 次：只有测试分析形成完整配对；局部理解只有新版结果；健康检查模型任务未启动。中止是评测预算决定，不是旧技能失败，未完成样本不计零耗时或零成本。\n\n## 一、真实模型完整配对：分析一条断言\n\n用户问题：分析“空关键词保留全部订单”断言的覆盖和遗漏。\n\n| 指标 | 旧版 | 新版 | 样本变化 |\n| --- | ---: | ---: | --- |\n| 预先冻结的质量检查 | 4/4 | 4/4 | 关键结论保持 |\n| 工具完成命令数 | 6 | 5 | 减少 16.7% |\n| 工具输出 UTF-8 字节 | 23608 | 15219 | 减少 35.5% |\n| 输入 token（含缓存） | 72948 | 68215 | 减少 6.5% |\n| 输出 token | 1936 | 1695 | 减少 12.4% |\n| 总 token（输入＋输出） | 74884 | 69910 | 减少 6.6% |\n| 缓存输入 token | 50816 | 34432 | 新版命中更少 |\n| 未缓存输入 token | 22132 | 33783 | 增加 52.6% |\n| 端到端耗时 | 94.829 秒 | 78.193 秒 | 本次减少 17.5% |\n\n两版都准确指出：空字符串且默认 all 保留订单；现有断言不覆盖空白、非空搜索或组合筛选；直接返回原数组也可能通过；未实际运行测试。新版没有执行测试上下文检查器，也不再追加与当前分析无关的受管变更前置说明。它保留了“输入突变可能绕过断言”的深入分析，未观察到通过压缩内容损害这组答案质量。\n\n以上是一组探索性样本，不能声称平均提速 17.5% 或整个插件省 token 6.6%。工具输出字节只统计返回给模型的命令文本，既不是磁盘读取量，也不是全部上下文。输入 token 包括每轮上下文重放及系统内容。未缓存输入增加，说明总输入下降与实际计费/套餐额度收益不能画等号。耗时还受排队、采样、缓存和本地其他检查影响。\n\n## 二、局部理解：新版行为确认，未形成前后收益结论\n\n新版完成订单筛选调用链分析，4/4 条件通过，正确解释页面入口 → v-model → computed → filterOrders → 本地数据，指出两条件取交集，并声明未启动页面或执行测试。实际没有运行 inspector、深度扫描或初始化命令，也没有写文件。\n\n用量：输入 90100（缓存 68864），输出 1503，耗时 73.391 秒，6 个完成命令，工具输出 18508 字节。这说明局部模式能够生效，但本身仍不便宜。旧版调用因预算中止，不能据此算节省比例或认定旧版失败。其中一个搜索命令退出 1 是没有找到嵌套 AGENTS 文件，不是业务测试失败。\n\n## 三、确定性可靠性对照\n\n| 定向回归类别 | 旧版 | 新版 | 实际意义 |\n| --- | ---: | ---: | --- |\n| 归档引用迁移（8 项） | 2/8 | 8/8 | 支持普通文本、Markdown 链接/引用、带锚点标题、中文空格与 CRLF 混合引用 |\n| 不应改写的文本（7 项） | 7/7 | 7/7 | 远程 URL、相似名称和非目标路径保护保留 |\n| 证据路径读取（4 项） | 2/4 | 4/4 | 改善编码空格及 Markdown 锚点，保留 Windows 盘符和 UNC |\n| 缺失证据拦截（3 项） | 0/3 | 3/3 | 行内代码、普通文本、Markdown 缺证据均被阻止完成 |\n| 证据恢复后通过（1 项） | 1/1 | 1/1 | 补回文件后正常通过，未误锁死 |\n\n合计 12/23 → 23/23，新增通过 11 个定向样例；新版 8 个迁移样例重复运行均无第二次重写。这些案例针对本轮优化目标，并非生产分布，不能把 100% 转换成整体可靠率或故障率降低比例。此次使用真实两版脚本执行，缺失/恢复检查使用独立 Git fixture。\n\n## 四、脚本速度与剩余浪费\n\n同一健康检查目标，预热各 1 次后交错各执行 20 次：旧版中位数 320.170 ms，新版 319.459 ms，仅约 0.22% 差异，视为基本持平。两组结果稳定；目标尚未接入，因此正常报告缺项，未把非零退出误算成性能成功。此项只测进程启动与精简健康检查，不能代替真实模型健康审计。\n\n模型轨迹仍显示两处多读：测试分析新版读取了 test-case-guidelines.md 和额外页面；局部理解新版读取 project-detection.md 与 managed-files.md 共约 10 KB，而该问题只需要业务链路。这是后续按需阅读规则可以继续改进的具体位置。\n\n## 五、额度、边界与证据\n\n已完成 3 次模型运行合计输入 ${usage.input_tokens}、缓存输入 ${usage.cached_input_tokens}、输出 ${usage.output_tokens} token。中止调用未返回 usage，不能按零消耗计算。账户共享快照为 5 小时已用 7% → 39%、周已用 17% → 22%；包含主任务分析、试验和可能的其他账户活动，不能当成试验的独占扣费。评测预算预估偏乐观，发现增长后已主动停止，没有兑换任何重置额度。\n\n本轮只产生 outputs 内评测资产，没有修改产品源码或业务项目，也未提交、推送或重新运行全套 CI。隔离 fixture 的 Node 测试由评测者另行执行，1 项通过；所有模型工作区指纹保持不变。受只读沙箱保护，不能据此宣称写入门禁已通过模型验证。未覆盖其他框架、真实浏览器、十个技能的完整交付、自然触发路由或长期返工率。\n\n机器数据：results.json、runs.json、reliability.json、timing.json；运行前规则：protocol.json、cases.json；原始事件与回答按场景文件名保留。临时插件副本、运行时符号链接及隔离项目已清理；prepare.mjs 可重建 fixture。CLI JSONL 用量来自实际 turn.completed 事件，方法参考 [Codex 非交互运行官方文档](https://learn.chatgpt.com/docs/non-interactive-mode)。\n`;
fs.writeFileSync(path.join(root,'report.md'),report);
console.log(JSON.stringify({metrics,usage,reliability:result.reliability}));
