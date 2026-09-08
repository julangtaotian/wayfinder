# 验证记录

实现提交为 a6f7dcce839827d15189e05f699bbedc0864f3f0。已通过 GitHub REST API 独立核对该提交的共享检查和五平台 CI；本轮只补证据与收口资料，不改变已验证的插件源码。

## 实际验证

- V-01：聚焦回归通过；最终本机 darwin-arm64 浏览器领域回归 34 项通过、0 失败、0 跳过。证据：outputs/skill-workflow-repair/browser-final.log。包含 Review → prepare-repair → repair-gate → 修改 fixture 源码 → complete-repair → 原基线 Verify。
- V-02：npm test 最终 234 项，226 通过、0 失败、8 跳过；5 项为共享源码不携带浏览器，已由上述本机平台回归补测，另 3 项真实外部业务项目矩阵未配置。证据：outputs/skill-workflow-repair/tests-final.log。
- npm run validate 通过，包含体积门禁与禁止来源计数标记；npm run validate:official 校验 10 个技能及插件清单通过。证据：outputs/skill-workflow-repair/validate.log、official-final.log。
- Vue 3 + Vite fixture 初始化、重复执行、升级及检查通过，用户自定义内容保持；这是 fixture 证据，不代表外部业务项目认证。
- 全量通过后，针对无效候选 JSON 补齐稳定诊断并聚焦复跑 4 项全部通过（repair-context-final.log）；该两行错误分支修正没有触发无关全量重跑，结构校验再次通过。
- 当前 OpenSpec 变更 strict 校验通过。临时 Vitest 运行目录已通过标准 cleanup 移除，复用缓存保留。
- V-04：通过。[GitHub Actions #34179305660](https://github.com/julangtaotian/wayfinder/actions/runs/34179305660) 的 head_sha 与实现提交一致，run attempt 1、event push；共享检查及 darwin-arm64、darwin-x64、linux-x64、linux-arm64、win32-x64 均 success，各平台 npm run verify:platform 步骤实际成功。原始响应：outputs/skill-workflow-repair/ci-run-verified.json、ci-jobs-verified.json；精简记录：ci-receipt.json。

## V-03：技能意图人工审查

| 输入场景 | 核对结果 |
| --- | --- |
| 只评审需求 | Review 分流先执行，只读且不分配编号 |
| 修订现有需求 | 保留 REQ 身份并使相关证据失效 |
| 只要修复计划 | 计划就绪后停止 |
| 规划并修复或已有实施授权 | 就绪后继续 Implement，无重复启动请求 |
| 完成且证据有效 | Complete 仅读取；缺失或过期才返回 Verify |
| 无活动变更的局部明确修改 | fast-change 的互斥准入保留 |
| 默认 UI 发现无候选 | 显式修复时定位源码，预览后补齐候选，保留原始发现 |

以上为规则审查与确定性脚本回归，不是独立模型行为评测；没有新增代理或付费模型调用，也不宣称实际 token、耗时或成功率已经改善。

## 按需读取量

| 入口文件 | 原字节 | 当前字节 | 减少 |
| --- | ---: | ---: | ---: |
| plugins/frontend-ai-workflow/skills/frontend-change/SKILL.md | 16979 | 14439 | 15% |
| plugins/frontend-ai-workflow/skills/frontend-workflow-bootstrap/SKILL.md | 8509 | 4540 | 46.6% |
| plugins/frontend-ai-workflow/skills/frontend-requirement-write/SKILL.md | 8108 | 6740 | 16.9% |
| plugins/frontend-ai-workflow/references/ui-review-workflow.md | 12937 | 11348 | 12.3% |

数值只比较入口文本字节；对应复杂阶段仍需读取参考文件，不能直接换算为模型额度节省。细则移动后，测试跟随真实参考文件检查安全约束，不锁死整段 description。

## 回归与兼容边界

- 初轮全量有 1 项测试仍从旧文件查找已迁移的报告维护规则；修正引用后全量复跑通过，没有放宽原语义断言。
- 首次平台回归未声明目标平台而默认检查 linux-x64；使用与原生运行包一致的 UI_REVIEW_EXPECT_PLATFORM 后 34 项全部通过。
- 源码摘要绑定原始字节，锚点兼容 CRLF；Windows 盘符、反斜杠、越界、目录 junction/符号链接、空候选、重复、陈旧源码、失效身份及无写入预览均有确定性回归。
- 新候选补齐为内部模块与 CLI，原公开函数集合、v1 只读和旧 v2 候选门禁保持。允许/禁止范围的业务语义与用户改动重叠仍由修复技能审查，未声称机器能自动证明任意 diff 安全。
- 未验证真实外部业务仓库、其他框架和独立模型任务效果。五个原生平台的常规 CI 已通过；本次 push 未触发可选的 Codex 安装、加载与离线专项，不将其描述为通过。

## 安装同步

最终成品版本：0.18.0+codex.20260908020112。打包时复用既有 darwin-arm64 浏览器资产，Chromium 冒烟通过；安装与新任务加载核对记录于 outputs/skill-workflow-repair/installed-check.json。

安装核对通过：106 个脚本、技能、参考与模板文件与源码一致；新任务加载 9 个隐式技能，显式 UI 修复文件存在；安装运行时完整性与 Chromium 冒烟通过。核对使用本地上下文预览，没有调用模型。仅清理本次创建的成品备份与临时目录，保留日志、既有 outputs 和复用缓存。

A-04 / 任务 3.3 的外部五平台 CI 证据已补齐。本次 V-01、V-02、V-04 仍按非严格机器证据合同记录，legacy_markdown_evidence 提示对应原生测试日志和 GitHub 响应快照，本变更未启用严格机器证据合同，日志与模型行为验证不混为一谈。
