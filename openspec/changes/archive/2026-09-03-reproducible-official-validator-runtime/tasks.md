## 1. 实现轻量官方预检

- [x] 1.1 新建 `tests/official-validator-preflight.test.mjs`，先固定全部 Skill 稳定排序、Plugin 单次执行、缓存首次准备与复用、四类失败、POSIX/Windows 路径和精确清理合同。（D-01、D-03、D-04、D-06、D-08；A-01、A-02、A-03；V-01）
- [x] 1.2 实现最小 Node.js 运行器和必要的 Python 启动适配，解析当前 Codex Creator validators，锁定并核验 PyYAML 版本与摘要，只使用 `outputs/official-validator-cache/` 和 `outputs/official-validator-runtime/`。（D-02、D-03、D-04、D-08；A-01、A-02）
- [x] 1.3 执行全部 Skill 和一次 Plugin validator，记录脚本摘要、Python/PyYAML 版本、目标、计数、真实退出码与原始输出，并实现四类稳定失败 code。（D-01、D-02、D-06、D-07；A-01、A-03、A-05）

## 2. 接入显式命令和文档

- [x] 2.1 在根 `package.json` 增加 `validate:official` 和独立缓存清理命令，补充回归断言确认普通 `validate`、`verify`、CI 和插件发布内容保持不变。（D-04、D-05、D-07；A-02、A-04）
- [x] 2.2 更新 README，说明元数据变更与发布前的触发时机、冷/暖缓存行为、显式清理、外部 validator 摘要和“当前本地预检”结论边界。（D-02、D-03、D-05、D-07；A-04、A-05）

## 3. 完成聚焦验证

- [x] 3.1 执行 `[TC-01]`～`[TC-03]` 的聚焦测试，确认 locator 精确命中并生成 V-01、V-03、V-04 证据。（D-01～D-08；A-01～A-05；V-01、V-03、V-04）
- [x] 3.2 在当前 Codex 开发环境执行一次 `npm run validate:official`，核对全部 Skill、Plugin、脚本摘要和结论边界；再运行 `npm test`、`npm run validate` 与 OpenSpec 严格校验，记录 V-02 和最终验证说明。（D-01～D-08；A-01～A-05；V-02、V-03）
