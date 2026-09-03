## Why

仓库已经能够运行项目自定义结构校验，也曾通过在 `outputs/` 临时准备 PyYAML 真实执行当前 Codex 环境的 Skill/Plugin Creator validators。实际问题不是缺少更多校验规则，而是每次都要人工定位脚本、准备依赖、逐项执行和清理，容易遗漏目标，也容易把“官方脚本未启动”误写成“官方校验通过”。（D-01～D-06；A-01～A-03）

固定官方脚本快照、建设许可证与更新供应链、修改普通门禁并在多平台 CI 重复执行，会引入明显高于问题本身的维护成本，而且仍不能代表 OpenAI 公共目录最终审核。因此本变更只收敛一个显式、失败关闭、可复用依赖缓存的本地预检入口。（D-05、D-07、D-08；A-04、A-05）

## What Changes

- 新增显式 `npm run validate:official`，按稳定顺序对全部自定义 Skill 和插件根真实执行当前 Codex 开发环境的 Creator validators。（D-01、D-02；A-01）
- 固定 PyYAML 版本和包摘要，只在 `outputs/official-validator-cache/` 准备或复用依赖；单次临时运行时独立创建并精确清理。（D-03、D-04；A-02）
- 对 validator、Python、依赖、启动和内容失败返回非零状态，保留稳定机器字段、真实退出码及原始输出。（D-06、D-08；A-03）
- 记录实际 validator 摘要和执行环境，结论只说明“当前本地 Creator validators 预检通过”。（D-02、D-07；A-05）
- 保持普通 `npm run validate`、`npm run verify`、CI 和插件发布内容不变，只补充聚焦测试与使用说明。（D-05、D-07；A-04）

## Capabilities

### New Capabilities

- `official-validator-runtime`: 提供显式本地 Creator validator 预检、可复用的有界依赖缓存、失败关闭诊断和诚实结论边界。

### Modified Capabilities

无。本变更不修改现有仓库统一验证门禁或 CI 合同。

## Impact

- 仓库脚本与命令：新增一个轻量 Node.js 编排入口、必要的 Python 启动适配和独立缓存清理命令。
- 测试：新增 `tests/official-validator-preflight.test.mjs`，用受控替身覆盖目标编排、缓存、失败传播、跨平台路径和清理。
- 文档：更新 README，说明显式触发时机、首次准备、缓存复用、清理和结论边界。
- 不受影响：普通 `validate`、`verify`、GitHub Actions、插件用户运行时、cachebuster 和发布内容。（D-05、D-07、D-08；A-04、A-05）
