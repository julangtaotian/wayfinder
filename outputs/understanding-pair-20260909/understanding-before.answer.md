我会先读取你指定的技能，再沿着订单列表的页面、筛选事件和数据请求逐层核对源码，整理关键词与状态变化后的调用关系。全程只读，不联网、不安装依赖，也不启动子代理。


已确认这条筛选链直接使用本地订单数组，没有发送接口请求。关键词和状态会共同参与过滤；我会继续核对匹配规则，并验证几个典型输入的结果。


订单列表采用**本地响应式筛选**：输入关键词或切换状态后，页面重新过滤本地订单数组，再更新列表；这条调用链没有后端接口请求。

调用关系如下：

1. **页面入口**：`src/main.mjs` 挂载 `App.vue`，后者直接渲染订单列表组件。见 [App.vue]([repository]/outputs/understanding-pair-20260909/workspaces/understanding-before/src/App.vue:1)。
2. **保存筛选条件**：输入框通过 `v-model` 绑定 `keyword`，下拉框绑定 `status`，初始值分别为 `""` 和 `"all"`。见 [OrderList.vue]([repository]/outputs/understanding-pair-20260909/workspaces/understanding-before/src/pages/OrderList.vue:5)。
3. **触发过滤**：任一条件变化，计算属性 `visibleOrders` 就会根据最新条件求值，调用 `filterOrders(orders, { keyword, status })`。没有搜索按钮、显式防抖或异步请求；切换状态也不会清空关键词。
4. **更新显示**：模板的 `v-for` 遍历 `visibleOrders`，以订单 `id` 为键，显示订单编号和客户名。

其中，`orders` 来自静态导入的 [src/data/orders.mjs]([repository]/outputs/understanding-pair-20260909/workspaces/understanding-before/src/data/orders.mjs:1)，目前只有两条数据：`AB-001 / Alice / paid` 和 `CD-002 / 张三 / pending`。

**具体筛选规则**在 [filterOrders]([repository]/outputs/understanding-pair-20260909/workspaces/understanding-before/src/order-filter.mjs:2)：

- 关键词先去掉首尾空格，再转小写。
- 搜索对象是拼接后的“订单编号 + 空格 + 客户名”，使用 `includes` 做子串匹配，不区分英文大小写。
- 空关键词或纯空格不限制关键词匹配，但状态条件仍然有效。
- `all` 不限制状态；`paid`、`pending` 与订单状态精确匹配。
- 关键词与状态是 **“并且”关系**，必须同时满足。
- `filter` 返回新数组，不修改原始订单数据。

用当前数据举例：

| 关键词 | 状态 | 显示结果 |
|---|---|---|
| 空 | 全部 | 两条订单 |
| ` ALI ` | 全部 | `AB-001 / Alice` |
| `Alice` | 待支付 | 空列表 |
| `张` | 待支付 | `CD-002 / 张三` |

因此，输入 `Alice` 后再切换到“待支付”，页面会用**保留的关键词 `Alice` 和新状态 `pending`**重新筛选，结果为空。当前模板没有单独的“无结果”提示，只会渲染空列表。

本次按指定技能只检查了入口、订单页面、筛选函数、本地数据及相关测试。已运行现有测试（1 项通过），并在内存中核对了 6 个筛选案例，全部通过；未进行浏览器交互验证。未联网、安装依赖、修改文件或启动子代理。