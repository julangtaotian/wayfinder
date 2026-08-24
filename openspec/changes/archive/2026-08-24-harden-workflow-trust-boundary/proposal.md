## Why

当前插件的默认预览、受管内容保护和验证证据已经能覆盖正常使用，但安全审计确认还有两个会直接影响结论可信度的缺口：目标项目内的符号链接可能让受管写入落到项目外；严格完成门禁没有完整复核需求语义、日志、附件和 UI 状态，外部 CI 的本地自声明也可能被汇总成通过。若不先封闭这两处边界，插件即使流程跑完，也不能可靠地证明“没有越界修改”和“结论对应当前真实证据”。

## What Changes

- 新增统一的目标项目安全写入合同：所有会创建、覆盖、移动、归档或删除目标项目内容的入口，都以真实项目根为边界，并拒绝根以下既有符号链接目标或祖先。
- 保持默认 dry-run、显式 `--write`、受管内容保护、原子替换和重复执行语义；安全检查在预览与正式写入阶段一致执行。
- 将新生成的严格机器证据升级为 schema v2，绑定当前相关需求修订、D/A/V 可观察断言和 TC 定义的稳定语义摘要。
- 对本地日志、声明附件和 UI Review 状态/关键产物重新计算范围、大小与 SHA-256；内容缺失、越界、身份不一致或篡改时失败关闭。
- 将没有可信远程读取回执的 external-ci 明确降为 `external-recorded`，并阻止 warning、recorded、inconclusive 或 blocked 被顶层汇总为 passed。
- 保留历史 schema v1 的只读解释能力，但活动严格合同不能再依赖 v1 形成新的完成结论。
- **BREAKING**：依赖 schema v1 或本地自声明 external-ci 通过严格自动门禁的活动变更，需要重新生成 v2 本地证据或改为明确的人工复核记录。

## Capabilities

### New Capabilities

- `safe-project-mutation`：为初始化、升级、Wayfinder 迁移、证据写入、UI Review 产物和完成归档提供统一的真实路径与符号链接失败关闭合同。

### Modified Capabilities

- `verification-evidence-integrity`：增加 schema v2 语义绑定、持久产物复算和 external-recorded 信任边界。
- `plugin-ui-review-automation`：要求 UI Review 机器证据复核真实状态身份、通过结果和关键产物完整性。
- `verifiable-change-delivery`：完成门禁和聚合摘要只有在全部必需证据可信通过时才能报告 passed。

## Impact

- 影响插件的目标项目写入辅助模块，以及 bootstrap、update、Wayfinder migration、verification evidence、UI Review、check/precomplete/complete/finalize 等既有入口。
- 影响机器证据 JSON schema、结构化诊断和活动变更的严格完成行为；不改公共 Skill 名称，不修改业务项目源码，不批量改写历史归档。
- 新增跨入口安全与证据信任回归，覆盖 POSIX/Windows 路径语义，并分别记录聚焦验证、本地统一验证和最终提交五平台 CI。
- 仅使用 Node.js 标准库；不引入远程 CI/Figma 读取器，不扩展动态框架识别、Monorepo 编排或非 Vitest 认证，也不在本次升级 Node/Actions。
- 追踪范围：D-01、D-02、D-03、D-04、D-05、D-06、D-07、D-08、D-09、D-10、D-11、D-12；A-01、A-02、A-03、A-04、A-05、A-06、A-07。
