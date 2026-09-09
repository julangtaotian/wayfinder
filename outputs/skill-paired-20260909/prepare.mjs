import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const repo = process.cwd();
const root = path.join(repo, 'outputs/skill-paired-20260909');
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const git = (...args) => { const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' }); if (r.status) throw Error(r.stderr); return r.stdout; };
const baseline = git('rev-parse', 'ca472ca3').trim();
const current = git('rev-parse', 'HEAD').trim();
for (const [variant, revision] of [['before', baseline], ['after', current]]) {
  const plugin = path.join(root, 'packages', variant);
  const files = git('ls-tree', '-r', '--name-only', revision, ...['scripts', 'skills', 'references', 'assets/templates', '.codex-plugin'].map(p => `plugins/frontend-ai-workflow/${p}`)).trim().split('\n');
  for (const file of files) write(path.join(plugin, file.replace('plugins/frontend-ai-workflow/', '')), git('show', `${revision}:${file}`));
  // 两组共享未改动的固定运行时，仅隔离日常脚本和技能版本。
  const runtime = path.join(plugin, 'runtime');
  if (!fs.existsSync(runtime)) fs.symlinkSync(path.relative(plugin, path.join(repo, 'dist/frontend-ai-workflow-darwin-arm64/plugins/frontend-ai-workflow/runtime')), runtime, 'dir');
}
const cases = [
  { id: 'assertion', skill: 'frontend-test', prompt: '帮我看看 tests/order-filter.test.mjs 中“空关键词保留全部订单”这个断言：它实际覆盖了什么，还遗漏了哪些重要边界？', criteria: ['识别只测空字符串、不能覆盖纯空格或非空搜索', '正确说明源码 trim 与大小写归一化', '指出状态筛选/组合筛选等重要遗漏', '不把未运行测试说成通过，不因无受管变更拒绝分析'] },
  { id: 'understanding', skill: 'frontend-workflow-bootstrap', prompt: '帮我理解这个项目里订单列表的筛选是怎么工作的，输入关键词和切换状态后，页面到数据的调用关系是什么？', criteria: ['正确串联 OrderList.vue 与 order-filter.mjs', '关键词 trim、小写转换并匹配订单编号或客户名', 'all 保留状态，否则状态与关键词条件取交集', '识别静态数据来源，不把后端和运行状态当成已验证事实'] },
  { id: 'health', skill: 'frontend-workflow-check', prompt: '检查一下这个项目目前工作流是否接入齐全，告诉我主要问题和最小处理办法。', criteria: ['真实运行精简健康检查', '识别未接入工作流文件', '正确区别脚本声明与实际执行', '清楚交代检查范围和未验证内容，不擅自修复'] },
];
const files = {
 'AGENTS.md': '# 项目规则\n回复中文。依据真实源码说明行为，保留用户改动；未运行的验证不得写为通过。\n',
 'package.json': JSON.stringify({ name: 'order-console-eval', private: true, type: 'module', scripts: { dev: 'vite', build: 'vite build', test: 'node --test tests/*.test.mjs' }, dependencies: { vue: '3.5.13' }, devDependencies: { vite: '6.1.0' } }, null, 2),
 'index.html': '<!doctype html><html><head><title>订单管理</title></head><body><div id="app"></div><script type="module" src="/src/main.mjs"></script></body></html>\n',
 'src/main.mjs': "import { createApp } from 'vue';\nimport App from './App.vue';\ncreateApp(App).mount('#app');\n",
 'src/App.vue': '<script setup>\nimport OrderList from "./pages/OrderList.vue";\n</script>\n<template><OrderList /></template>\n',
 'src/pages/OrderList.vue': '<script setup>\nimport { computed, ref } from "vue";\nimport { filterOrders } from "../order-filter.mjs";\nimport { orders } from "../data/orders.mjs";\nconst keyword = ref("");\nconst status = ref("all");\nconst visibleOrders = computed(() => filterOrders(orders, { keyword: keyword.value, status: status.value }));\n</script>\n<template><input v-model="keyword" aria-label="搜索订单" /><select v-model="status"><option value="all">全部</option><option value="paid">已支付</option><option value="pending">待支付</option></select><ul><li v-for="order in visibleOrders" :key="order.id">{{ order.id }} {{ order.customer }}</li></ul></template>\n',
 'src/order-filter.mjs': '// 空关键词不限制搜索，状态条件与关键词条件同时生效。\nexport function filterOrders(orders, { keyword = "", status = "all" } = {}) {\n  const query = keyword.trim().toLowerCase();\n  return orders.filter(order => (status === "all" || order.status === status) && (!query || `${order.id} ${order.customer}`.toLowerCase().includes(query)));\n}\n',
 'src/data/orders.mjs': 'export const orders = [{ id: "AB-001", customer: "Alice", status: "paid" }, { id: "CD-002", customer: "张三", status: "pending" }];\n',
 'tests/order-filter.test.mjs': 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { filterOrders } from "../src/order-filter.mjs";\nconst orders = [{ id: "A-1", customer: "Alice", status: "paid" }, { id: "B-2", customer: "Bob", status: "pending" }];\ntest("空关键词保留全部订单", () => {\n  assert.deepEqual(filterOrders(orders, { keyword: "" }), orders);\n});\n',
 'README.md': '# 订单管理示例\nVue 3 + Vite 项目。订单展示使用本地静态数据。工作流尚未初始化。依赖只声明，评测不安装。\n',
 'src/settings.mjs': '// 后续设置页使用，当前订单页未导入。\nexport const settings = { locale: "zh-CN", pageSize: 20 };\n',
};
for (const candidate of cases) for (const variant of ['before', 'after']) {
 const target = path.join(root, 'workspaces', `${candidate.id}-${variant}`);
 for (const [file, content] of Object.entries(files)) write(path.join(target, file), content);
 for (const args of [['init','-q'], ['add','.'], ['-c','user.name=Evaluation','-c','user.email=evaluation@example.invalid','commit','-qm','Frozen evaluation fixture']]) {
  const r = spawnSync('git', args, { cwd: target, encoding: 'utf8' }); if(r.status) throw Error(r.stderr);
 }
}
write(path.join(root, 'cases.json'), JSON.stringify(cases, null, 2));
write(path.join(root, 'protocol.json'), JSON.stringify({ baseline, current, model: 'gpt-6-astra', reasoning: 'xhigh', source: 'existing user configuration', maxRuns: 6, timeoutMs: 180000, aggregateInputStop: 250000, order: ['assertion-before','assertion-after','understanding-after','understanding-before','health-before','health-after'], metrics: ['CLI usage.input_tokens / cached_input_tokens / output_tokens', 'wall clock', 'completed command count', 'tool result UTF-8 bytes', 'frozen criteria manual adjudication'], limits: ['每场景每版本一次，探索性配对，不是统计显著性结论', '显式选择技能，不能衡量自然触发准确率', '统一只读沙箱，不能证明写操作保护能力', '小型合成 Vue fixture，不代表真实大仓库', '使用实际模型工具事件，工具输出字节不是磁盘读取字节'], platformRisk: { high: true, items: ['路径','子进程','临时fixture','机器诊断'], platform: process.platform + '-' + process.arch, scope: '仅评测脚本与隔离项目，不修改产品或 CI，未声称新五平台证据' } }, null, 2));
console.log(JSON.stringify({ baseline, current, cases: cases.length, runs: 6 }));
