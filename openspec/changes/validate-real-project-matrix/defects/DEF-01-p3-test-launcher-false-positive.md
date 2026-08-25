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
- 当前处理：R-02 已完成缺陷固定；用户于 2026-08-25 明确授权 R-03 在当前活动变更中修复插件识别逻辑，且未修改 P3 业务源码。

## R-03 修复与复验

- 修复边界：普通脚本目录中的通用 `test.*` 文件不再自动计为测试用例；`*.test.*`、`*.spec.*` 和已识别测试目录中的合法 `test.*` 继续保留。
- 确定性回归：`[TC-09] 测试启动脚本不计入测试文件` 通过，且确认检查过程没有读取源码正文。
- 同输入复验：P3 仍固定提交 `54914eafd85a22d3f63054b81dd56271c11f9bbf`，测试命令 `yarn test` 与 Jest 运行器保持识别，`testFiles`、`handwrittenTests`、`trackedTests` 均为 0，结果为 `inspection_facts_matched`。
- 处理结果：DEF-01 本地关闭；P3 原生命令实际发现 0 个测试仍按 `blocked` 记录，修复不会把“无测试用例”改写为“测试通过”。外部平台兼容性由 V-08 独立等待最终提交 CI。
