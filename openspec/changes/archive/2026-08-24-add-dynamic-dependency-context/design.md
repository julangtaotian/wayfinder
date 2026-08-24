## Context

见 `proposal.md` 的 Why。当前 `inspect-project.mjs` 同时承担 package 读取、预设判断、技术栈固定映射、命令与路径识别；`bootstrap-project.mjs` 再把 `techStack` 直接写入 AGENTS、Wayfinder 和 OpenSpec。终端与平台画像也使用有限包集合，但它们承担已验证兼容和安全提示，不能与完整依赖事实混为一谈。

本变更跨越共享检查结果、三份模板、升级漂移判断和 AI 分析规则，且命中路径、包管理器入口与机器诊断的跨平台风险。生产实现继续只使用 Node.js 标准库，目标根由现有安全路径链解析，测试 fixture 不安装第三方依赖。

本设计实现需求 D-01～D-12，并以 A-01～A-06 的可观察结果作为取舍边界；任何实现发现与这些事实冲突时先修订需求和规划。

## Goals / Non-Goals

**Goals:**

- 为根 package 的全部合法直接依赖提供无白名单、可追溯、稳定的事实合同。
- 让机器完整事实、人类有限摘要和 AI 语义总结各自承担单一职责。
- 在不删除既有字段和兼容画像的前提下，消除“未命中即不存在”的结论漏洞。
- 让初始化、升级、检查和深度分析使用同一依赖事实，并保持默认预览与受管内容保护。
- 用确定性回归覆盖无效输入、摘要截断、跨平台顺序和无副作用边界。

**Non-Goals:**

- 不解析 workspace 子项目、锁文件传递树、已安装包元数据、漏洞、许可证或最新版本。
- 不让确定性脚本判断包的业务职责、使用状态或兼容性。
- 不移除或动态扩张 preset、终端画像、平台画像的已验证规则。
- 不为框架生成命令、代码或适配器，不联网和不执行目标项目依赖。

## Decisions

### 1. 新建单一依赖事实模块，识别器只负责组装

新增 `scripts/dependency-profile.mjs`，集中导出画像 schema 版本、固定分组顺序、收集器和摘要格式化器。`inspect-project.mjs` 读取一次 package 后把原始对象交给该模块，再将同一个画像同时用于机器返回和模板变量。

选择独立模块而不是继续扩张 `TECH_PACKAGES`，是为了让事实收集可单独测试，也让 preset/平台兼容信号与完整依赖事实保持物理隔离。备选方案是在 `inspect-project.mjs` 内直接遍历四个分组；代码较少，但会继续把兼容识别、事实收集和展示混在一个文件中，不利于后续 Monorepo 阶段复用。

### 2. 画像保存完整声明，按确定性规则去重和排序

`dependencyProfile` 采用以下稳定形状：

```json
{
  "schemaVersion": "1.0.0",
  "source": "root-package-json",
  "totalPackages": 2,
  "groupCounts": {
    "dependencies": 1,
    "devDependencies": 1,
    "peerDependencies": 1,
    "optionalDependencies": 0
  },
  "packages": [
    {
      "name": "example",
      "declarations": [
        { "group": "dependencies", "specifier": "^1.0.0" },
        { "group": "peerDependencies", "specifier": ">=1" }
      ]
    }
  ],
  "diagnostics": [],
  "summary": {
    "status": "complete",
    "totalPackages": 2,
    "displayedPackages": 2,
    "omittedPackages": 0,
    "text": "..."
  }
}
```

分组顺序固定为 package 的四个标准字段；包和诊断使用不依赖系统 locale 的 UTF-16 词法比较，避免 `localeCompare` 在不同 ICU/区域设置下漂移。分组计数统计合法声明数，`totalPackages` 统计去重包数；跨分组不同版本全部保留，不采用对象展开的最后写入覆盖。

备选方案是继续返回扁平依赖 Map；它无法表达同包跨分组不同声明，也无法区分唯一包总数和分组计数，因此不采用。

### 3. 非法声明降级为结构化诊断，package 整体语法错误仍失败

缺失分组按空对象处理；显式非普通对象分组产生 `invalid-dependency-group`，非安全包名产生 `invalid-dependency-name`，空白或非字符串版本产生 `invalid-dependency-specifier`。诊断固定使用 `status=ignored` 和 `target=<group>` 或 `<group>.<package>`，无效项不进入画像和 Markdown。

包名验证只承担结构与输出安全：拒绝空白、控制字符、反斜杠、绝对/相对路径片段和 Markdown 反引号，不建立框架名单。原始 `package.json` JSON 无法解析继续由现有读取入口失败，避免把不完整数据包装成成功。

备选方案是遇到任一无效项时整体失败；虽然更严格，但会让一个无关坏声明阻断其他可审计事实，并扩大既有行为变化。结构化降级能同时保持事实完整和错误可见。

### 4. 完整机器清单与有限人类摘要分层

摘要固定最多展示 20 个按包名排序的包；每项显示包名及全部 `group=specifier` 声明，空画像显示“根 package 未声明直接依赖”。超过上限时文本明确“共 N 项，展示 20 项，另 M 项见 dependencyProfile/packages 或根 package.json”。计数作为独立字段提供，调用方和测试不解析中文文案得出机器结论。

`techStack` 字段保持数组类型以避免旧调用方崩溃，但其内容改为由动态摘要条目生成；原生微信固定配置事实可以继续作为兼容前缀。三份模板新增独立依赖画像元数据和边界文案，并优先使用 `dependencyProfile.summary`，不再把 `TECH_PACKAGES` 命中列表写成完整技术栈。

备选方案是把全部依赖写进每份文档；大型前端项目会让 AGENTS 和 OpenSpec context 失控。只写数量而不展示任何条目又会降低普通初始化价值，因此选择完整机器事实加有界摘要。

### 5. 兼容画像不删除，只改变结论层级

`detectPreset`、`targetProfile` 和平台画像保持现有字段、证据及冲突语义；它们继续服务受支持矩阵、终端提示和平台验证边界。模板和规则统一称其为“有限兼容/安全信号”，并明确 unknown 只表示没有命中该有限规则。

这样既不会把已有 Vue/React/小程序验证链改坏，也不会让画像掩盖 Angular、Svelte、Astro 或私有框架等动态事实。备选方案是删除全部固定画像并让 AI 决定 preset；这会破坏确定性初始化和已验证平台安全提示，因此不采用。

### 6. AI 总结必须交叉验证，不把依赖声明当作使用证明

更新受管模板、需求指南和深度分析规则：开始需求或变更时先读取完整动态画像；对影响当前任务的框架、构建、路由、状态、请求、测试等依赖，再阅读真实配置、入口、导入或调用证据。依赖声明本身只能证明“被根 package 声明”，不能证明已安装、已使用、安全、兼容或可发布。

普通初始化只保存动态事实和分析指导，不伪造 AI 已完成总结；深度分析完成后才允许在 Wayfinder analysis 区块形成带证据的语义结论。

### 7. 测试隔离和跨平台验证分层

新建 `tests/dynamic-dependency-context.test.mjs`，集中覆盖动态画像和共享入口；既有测试只调整因输出合同变化而失效的兼容断言。fixture 仍在测试现有有界机制中创建，不安装依赖；专用断言校验稳定字段、计数和排序，不依赖绝对路径或完整中文摘要。

验证分三层记录：聚焦专用测试；本地 `npm test`、`npm run validate`、`npm run verify` 与官方 validators；最终提交的真实五平台 CI。外部 CI 继续按人工复核记录，不把本地 JSON 描述为可信远程读取。

## Risks / Trade-offs

- [风险] `techStack` 内容由标签白名单变成动态声明摘要，部分内部快照或外部文本消费者可能变化。→ 保留数组类型和所有其他公共字段，新增明确画像字段，更新已知测试并把模板切到新变量；版本提升到 0.17.0。
- [风险] 大型依赖清单摘要截断后 AI 只读取可见部分。→ 文案和规则强制读取完整 `dependencyProfile.packages` 或根 package，并用计数字段暴露遗漏数。
- [风险] 包被声明但实际未安装或未使用。→ 画像字段只称“声明”，AI 语义必须引用配置/源码，缺证据时保留待确认。
- [风险] 非法包名过滤过严影响历史私有包。→ 校验只拒绝输出与路径安全相关字符，不实现 npm registry 的版本规则；合法作用域和常见私有名称进入回归。
- [风险] 新诊断在各平台排序不同。→ 使用固定分组顺序和显式词法比较，机器测试不依赖系统路径、换行或 locale。
- [权衡] 本阶段仍有固定平台/终端画像。→ 它们只保留已验证兼容和安全提示，完整项目事实不再依赖其名单；动态扩展兼容能力属于后续独立验证。
- [权衡] 只处理根 package。→ 能先闭合当前单应用核心链且风险可控；workspace 子包发现与多应用编排留给下一阶段。

## Migration Plan

1. 先增加独立画像模块和专用聚焦测试，保持现有消费者不变。
2. 将 `inspectProject` 增量接入 `dependencyProfile`，再切换 `techStack` 和模板变量；逐项更新既有兼容断言。
3. 更新三份模板、需求/分析规则和版本号，通过初始化、重复执行、升级与检查 fixture。
4. 运行聚焦、本地统一、官方 validators，重新安装最终 cachebuster 版本；通过 WebStorm 提交和推送后等待精确提交的五平台 CI。
5. 回滚时优先撤销模板消费和 `techStack` 切换，再移除新增字段；不修改目标项目 package，已升级受管区块可由版本控制恢复。
