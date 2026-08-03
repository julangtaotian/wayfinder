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
scopeVersion: "{{SCOPE_VERSION}}"
scopeIncludedFiles: {{SCOPE_INCLUDED_FILES}}
scopeExcludedFiles: {{SCOPE_EXCLUDED_FILES}}
scopeIncludedBytes: {{SCOPE_INCLUDED_BYTES}}
scopeFingerprint: "{{SCOPE_FINGERPRINT}}"
scopeScannedAt: "{{SCOPE_SCANNED_AT}}"
scopeGitCommit: "{{SCOPE_GIT_COMMIT}}"
scopeGitDirty: "{{SCOPE_GIT_DIRTY}}"
<!-- frontend-ai-workflow:meta:end -->

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

<!-- frontend-ai-workflow:scope:start version={{WORKFLOW_VERSION}} -->
## 深度扫描范围

- 深度分析状态：{{DEEP_ANALYSIS_LABEL}}。
- 范围清单版本：`{{SCOPE_VERSION}}`。
- 纳入文本文件：{{SCOPE_INCLUDED_FILES}} 个，共 {{SCOPE_INCLUDED_BYTES}} bytes。
- 排除或受限项：{{SCOPE_EXCLUDED_FILES}} 个。
- 快照指纹：`{{SCOPE_FINGERPRINT}}`。
- 扫描时间：`{{SCOPE_SCANNED_AT}}`；Git 提交：`{{SCOPE_GIT_COMMIT}}`；工作区脏状态：`{{SCOPE_GIT_DIRTY}}`。
- 覆盖边界：完整逐文件清单只在本次扫描报告和只读范围命令中提供；本文只保留稳定结论与未覆盖原因。
<!-- frontend-ai-workflow:scope:end -->

<!-- frontend-ai-workflow:analysis:start version={{WORKFLOW_VERSION}} -->
## 深度项目地图（待生成）

完成全量阅读和关键链路交叉核对后，AI 在本区块写入：

1. 项目入口、构建/部署、路由、页面、组件、状态、请求与服务、鉴权、测试与样式的职责地图。
2. 已确认事实：每项附来源文件；跨文件链路附首尾关键文件。
3. 推断：说明依据与适用边界。
4. 待确认项：动态行为、仓库外契约、环境实际值或未覆盖文件。
5. 高风险区域与验证基线：区分源码证实的影响面和需要运行确认的行为。

未完成范围清单的逐项记账前，不得删除“待生成”状态，也不得将结果描述为完整项目分析。
<!-- frontend-ai-workflow:analysis:end -->

## 文档维护

技术栈、脚本、目录职责、请求协议、权限链路或部署方式发生稳定变化时更新本文。
