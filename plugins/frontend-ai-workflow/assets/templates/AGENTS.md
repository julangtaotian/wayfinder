<!-- frontend-ai-workflow:start version={{WORKFLOW_VERSION}} -->
# {{PROJECT_NAME}} AI 协作规则

用户要求与更深规则优先；先读规则、工作树、直接源码、邻近测试，保留改动。

## 项目事实

- 预设：`{{PRESET}}`；依赖：{{DEPENDENCY_SUMMARY}}；终端：`{{TARGET_FORM_FACTOR}}`；平台：`{{TARGET_PLATFORM_KIND}}`（{{TARGET_PLATFORM_FRAMEWORKS}}）。声明须由源码验证。
- 包管理器：`{{PACKAGE_MANAGER}}`；页面：`{{VIEWS_PATH}}`；组件：`{{COMPONENTS_PATH}}`；请求：`{{REQUEST_PATH}}`；路由：`{{ROUTER_PATH}}`；状态：`{{STORE_PATH}}`。见 `wayfinder/frontend.md`。

<!-- frontend-ai-workflow:deep-guardrails:start version={{WORKFLOW_VERSION}} -->
## 深度扫描关键约束（待生成）

完成后写入 4–8 条带源码路径的已确认约束。
<!-- frontend-ai-workflow:deep-guardrails:end -->

## 工作流

- 解释、分析、评审、状态查询、只要计划时不调用 `$frontend-delivery`。
- 实施用 `$frontend-delivery`：Direct/Light 不写管理文件；架构/安全/持久化/公共契约/依赖/构建/部署/CI/跨平台、影响不明或正式规格进入 Complex。
- 规划与验证独立选择 None、Focused、Targeted UI、Full UI；专项 Skill 仅按明确任务触发。

## 实现与验证

- 只做最小改动；不做无关重构、整仓格式化、依赖升级。
- 先确认本地入口；缺失只记一次，不安装、不重试，做最低充分检查。
- 路径、子进程、环境变量、机器诊断或 CI：跨平台高风险，双侧统一规范化，本地结果不冒充真实矩阵。
- 原目标逐项验收；测试退出码不能单独证明完成。同类失败最多修复两轮，第三次停止并报告根因。

## 项目命令

- 开发：`{{DEV_COMMAND}}`；构建：`{{BUILD_COMMAND}}`；交付构建：`{{RELEASE_BUILD_COMMAND}}`；测试：`{{TEST_COMMAND}}`（`{{TEST_STATUS}}`）；Lint：`{{LINT_COMMAND}}`（`{{LINT_STATUS}}`）；类型检查：`{{TYPECHECK_COMMAND}}`。只报告实际执行结果。
<!-- frontend-ai-workflow:end -->

## 项目自定义规则

补充业务、接口、权限、设计、发布要求；升级不覆盖。
