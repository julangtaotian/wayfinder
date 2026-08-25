# DEF-01：P3 测试启动脚本被误识别为测试文件

## 固定输入

- 项目：P3 `fe-jci`
- 提交：`54914eafd85a22d3f63054b81dd56271c11f9bbf`
- 平台：macOS ARM64，Node.js v22.12.0
- 复现入口：`[TC-04] 六项目基线与只读识别`

## 稳定复现

P3 的根测试命令为 `node scripts/test.js`。`scripts/test.js` 负责设置环境、处理 watch 参数并调用 Jest，不包含项目测试用例；当前测试上下文识别却仅因文件名命中 `test.js`，把它计为 1 个测试文件。

- 预期：测试文件数为 0，`scripts/test.js` 仅作为测试命令启动器证据。
- 实际：测试文件数为 1，结果包含 `scripts/test.js`。
- 稳定诊断：`inspection_expectation_mismatch`
- 影响：插件可能把“存在测试启动器但没有测试用例”的项目描述成已有测试文件，形成测试覆盖事实误报；不影响本轮 Git 基线与隔离生命周期验证。

## 证据与处理边界

- 机器结果：`outputs/real-project-validation/2026-08-25-p1-p6-run-01/inspection/results.json`
- 执行日志：`outputs/verification-evidence/validate-real-project-matrix/V-02/`
- 修复候选：`fix-test-launcher-false-positive`
- 当前处理：只记录缺陷，不在 `validate-real-project-matrix` 中修改产品识别逻辑，也不修改 P3 业务源码。
