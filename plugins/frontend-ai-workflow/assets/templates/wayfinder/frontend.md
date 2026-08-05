# {{PROJECT_NAME}} Wayfinder

Wayfinder 是项目的稳定导航资料：它只记录可追溯的项目事实、边界与验证基线。业务需求保存为 `requirements/REQ-*.md`，OpenSpec 变更保存为 `openspec/changes/`，不要将一次性任务记录持续堆入本文。

<!-- frontend-ai-workflow:meta:start version={{WORKFLOW_VERSION}} -->
version: "{{WORKFLOW_VERSION}}"
openspecVersion: "{{OPENSPEC_VERSION}}"
layout: "wayfinder"
project: "{{PROJECT_NAME}}"
preset: "{{PRESET}}"
packageManager: "{{PACKAGE_MANAGER}}"
targetFormFactor: "{{TARGET_FORM_FACTOR}}"
targetProfileSource: "{{TARGET_PROFILE_SOURCE}}"
targetProfileEvidence: "{{TARGET_PROFILE_EVIDENCE}}"
targetPlatformKind: "{{TARGET_PLATFORM_KIND}}"
targetPlatformFrameworks: "{{TARGET_PLATFORM_FRAMEWORKS}}"
targetPlatformSource: "{{TARGET_PLATFORM_SOURCE}}"
targetPlatformEvidence: "{{TARGET_PLATFORM_EVIDENCE}}"
platformCommandStatus: "{{PLATFORM_COMMAND_STATUS}}"
platformCommandTargets: "{{PLATFORM_COMMAND_TARGETS}}"
platformCommandEvidence: "{{PLATFORM_COMMAND_EVIDENCE}}"
testCommandStatus: "{{TEST_STATUS}}"
deepAnalysis: {{DEEP_ANALYSIS}}
analysisStatus: "{{ANALYSIS_STATUS}}"
analysisCoveredFiles: {{ANALYSIS_COVERED_FILES}}
analysisUpdatedAt: "{{ANALYSIS_UPDATED_AT}}"
scopeVersion: "{{SCOPE_VERSION}}"
scopeIncludedFiles: {{SCOPE_INCLUDED_FILES}}
scopeExcludedFiles: {{SCOPE_EXCLUDED_FILES}}
scopeIncludedBytes: {{SCOPE_INCLUDED_BYTES}}
scopeFingerprint: "{{SCOPE_FINGERPRINT}}"
scopeScannedAt: "{{SCOPE_SCANNED_AT}}"
scopeGitCommit: "{{SCOPE_GIT_COMMIT}}"
scopeGitDirty: "{{SCOPE_GIT_DIRTY}}"
<!-- frontend-ai-workflow:meta:end -->

<!-- frontend-ai-workflow:facts:start version={{WORKFLOW_VERSION}} -->
## 项目概览

- 技术栈：{{TECH_STACK}}。
- 开发：`{{DEV_COMMAND}}`。
- 构建：`{{BUILD_COMMAND}}`。
- 测试：`{{TEST_COMMAND}}`（状态：`{{TEST_STATUS}}`）。
- Lint：`{{LINT_COMMAND}}`。
- 类型检查：`{{TYPECHECK_COMMAND}}`。

`未配置` 表示 `package.json` 当前没有对应脚本；`不可用` 表示只发现失败占位脚本。两者都不得被描述为已具备自动验证能力。

- 平台验证边界：{{PLATFORM_VERIFICATION_GUIDANCE}}

## 目录职责

- 页面：`{{VIEWS_PATH}}`。
- 公共组件：`{{COMPONENTS_PATH}}`。
- 请求与接口：`{{REQUEST_PATH}}`。
- 路由与页面注册：`{{ROUTER_PATH}}`。
- 状态管理或全局数据：`{{STORE_PATH}}`。
- 测试：`{{TESTS_PATH}}`。
<!-- frontend-ai-workflow:facts:end -->

<!-- frontend-ai-workflow:scope:start version={{WORKFLOW_VERSION}} -->
## 深度扫描范围

- 深度分析状态：{{DEEP_ANALYSIS_LABEL}}。
- 项目地图状态：`{{ANALYSIS_STATUS}}`；已覆盖文件：{{ANALYSIS_COVERED_FILES}} / {{SCOPE_INCLUDED_FILES}}；最后更新：`{{ANALYSIS_UPDATED_AT}}`。
- 范围清单版本：`{{SCOPE_VERSION}}`。
- 纳入文本文件：{{SCOPE_INCLUDED_FILES}} 个，共 {{SCOPE_INCLUDED_BYTES}} bytes。
- 排除或受限项：{{SCOPE_EXCLUDED_FILES}} 个。
- 快照指纹：`{{SCOPE_FINGERPRINT}}`。
- 扫描时间：`{{SCOPE_SCANNED_AT}}`；Git 提交：`{{SCOPE_GIT_COMMIT}}`；工作区脏状态：`{{SCOPE_GIT_DIRTY}}`。
- 覆盖边界：完整逐文件清单只在本次扫描报告和只读范围命令中提供；本文只保留稳定结论与未覆盖原因。
<!-- frontend-ai-workflow:scope:end -->

<!-- frontend-ai-workflow:analysis:start version={{WORKFLOW_VERSION}} -->
<!-- frontend-ai-workflow:analysis:pending -->
## 深度项目地图（待生成）

`deepAnalysis: true` 只表示已建立安全范围与快照，不表示下列项目地图已经完成。只有 `analysisStatus: "complete"` 且本区块已替换为实际分析后，才可将本文作为完整项目上下文使用。

完成全量阅读和关键链路交叉核对后，AI 用实际内容替换本区块，并同步更新 meta 中的状态：

1. `pending`：范围已扫描，项目地图尚未开始；`analysisCoveredFiles` 必须为 0。
2. `partial`：已阅读部分纳入文件；记录实际覆盖数、未覆盖文件及原因，不得称为完整分析。
3. `complete`：已覆盖全部 `scopeIncludedFiles`，删除本占位标记，填写下列全部维度，并使用 ISO 时间更新 `analysisUpdatedAt`。标题可以按项目调整，但必须在对应内容前保留稳定维度标记；标记格式见插件的深度扫描规则。

## 建议写入结构

必填维度 ID：`run-delivery`、`functional-dependencies`、`data-state-security`、`verification-risks`、`facts-inferences-questions`。

### 项目运行与交付边界

- 入口、构建、环境、部署路径与平台发布边界；每项附配置或源码证据。

### 功能与依赖链路

- 路由 → 页面 → 关键组件，以及跨模块影响链路的首尾关键文件。

### 数据、状态与安全边界

- 页面 → 状态 → 请求层 → 接口契约；同时记录鉴权、会话、存储、权限守卫与空值/错误语义。

### 验证基线与高风险区域

- 已执行与未执行的验证、测试资产与缺口、性能/可访问性/观测风险，以及变更时应检索的调用方。

## 按证据启用的扩展维度

仅在完整阅读后发现对应源码、配置或依赖证据时写入相关小节；未发现证据不猜测也不强制填充，避免小项目的导航文档膨胀。

- 国际化与本地化：语言资源、路由语言策略、日期/货币格式及回退行为。
- PWA 与离线能力：Service Worker、缓存策略、离线降级与更新提示。
- 设计系统与组件演示：主题、Token、Storybook、可访问性规则及公共组件影响面。
- 监控、埋点与实验：错误追踪、性能指标、事件契约、Feature Flag 与隐私边界。
- 跨端与平台能力：平台入口、条件编译、生命周期差异、发布目标和人工验证环境。

## 事实、推断与待确认项

- 已确认事实逐项附来源文件；推断说明依据和边界；动态行为、仓库外契约、实际环境值与未覆盖文件必须保留为待确认项。

完整逐文件账本仅保留在本次扫描报告；本文只保留稳定结论与未覆盖原因。
<!-- frontend-ai-workflow:analysis:end -->

## 文档维护

技术栈、脚本、目录职责、请求协议、权限链路或部署方式发生稳定变化时更新本文。
