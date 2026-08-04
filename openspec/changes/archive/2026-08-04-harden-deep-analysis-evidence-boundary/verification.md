# 验证记录

## 聚焦验证

- 命令：`node --test tests/workflow.test.mjs`
- 结果：41/41 通过，0 失败。
- 覆盖：2.2.0 范围合同、`validationEvidence`、合法与属性粘连 WXML、路径和行号、Git 忽略与二进制排除、检查器空态/警告态、技能与参考规则。

## 完整验证

- 单变更严格校验：`harden-deep-analysis-evidence-boundary` 通过，0 个问题。
- `npm run verify`：114/114 自动测试通过。
- 插件与技能结构：通过。
- OpenSpec 全量严格校验：22/22 项通过。
- 内置运行时：OpenSpec 1.7.0；76 个包完整性通过。
- 统一门禁：5/5 阶段通过。

## 官方验证器

- 源码插件：官方 plugin validator 通过。
- 源码技能：5/5 官方 skill validator 通过。
- 安装副本插件：官方 plugin validator 通过。
- 安装副本技能：5/5 官方 skill validator 通过。
- 安装副本与源码的范围收集、项目检查、深度初始化技能和项目检查技能逐文件一致。

## 安装副本与目标项目只读冒烟

- 安装版本：`0.11.0+codex.20260804024810`。
- 安装目录：`/Users/lvshuai/.codex/plugins/cache/frontend-ai-workflow/frontend-ai-workflow/0.11.0+codex.20260804024810`。
- 目标项目：`/Users/lvshuai/Desktop/ikang/dytsh/ikang-mini-wechat-inspect`。
- 工作流结构：`ok: true`。
- 既有范围版本：2.1.0；当前 2.2.0 指纹不同，`freshness.stale: true`，目标文件未写入。
- 验证证据：文件枚举、文本读取和 SHA-256 为 `performed`；语法解析、平台编译、Lint、测试均为 `not-run`。
- 静态观察：发现 20 处 `wxml-attribute-spacing`，完整结果保留项目相对路径和 1 基行号，不包含源码片段或属性值。
- 警告边界：结果明确说明这是静态观察，未执行 WXML 语法解析或平台编译，需要微信开发者工具或外部 CI 确认；检查仍保持成功。

## 剩余边界

- WXML 检测是单行启发式，只覆盖属性结束引号后紧邻下一属性名的模式，不是完整语法解析器。
- 未运行微信开发者工具、真机、平台编译、目标项目 Lint 或测试。
- 没有修改或自动修复目标项目的 20 处观察位置。
