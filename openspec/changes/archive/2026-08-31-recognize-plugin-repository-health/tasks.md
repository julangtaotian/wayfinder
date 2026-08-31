## 1. 插件仓库识别与安全合同

- [x] 1.1 新增只读插件仓库识别模块，安全解析 marketplace 的本地条目、manifest 与技能目录，区分非插件、有效插件和配置损坏插件状态，并输出稳定诊断。D-02、D-06、D-10；A-01、A-03
- [x] 1.2 将插件仓库类别接入 `checkProject()`：有效或损坏插件仓库不执行不适用的业务工作流检查，保留规划引擎、活动变更、需求审计和插件命令事实；非插件项目保持原有分支。D-01、D-04、D-07、D-08；A-01、A-03、A-04

## 2. 有界输出与发布完整性

- [x] 2.1 为完整结果与 summary 增加兼容的插件仓库投影：保留既有 `layout`/schema/诊断查询合同，完整结果保留全部事实，summary 固定上限并报告总数、显示数、遗漏数和计数。D-03、D-05；A-02
- [x] 2.2 更新工作流检查 Skill，说明插件仓库类别、稳定诊断、summary 优先与完整结果按需回退；将识别模块加入插件结构发布资产清单。D-05、D-08；A-02、A-05

## 3. 专用回归与验证

- [x] 3.1 新建 `tests/plugin-repository-health.test.mjs`，覆盖当前有效仓库、多条目摘要上限、重复只读检查、无本地条目、JSON 损坏、manifest/名称/技能目录错误、普通项目兼容及稳定机器字段。D-01、D-02、D-03、D-04、D-06、D-07、D-09；A-01、A-02、A-03、A-04
- [x] 3.2 为路径安全回归补 POSIX 与 Windows 外平台样本，覆盖 `./` 标准前缀、禁止段、绝对路径、越界和符号链接，断言双侧规范化后的 `code/status/target`。D-02、D-06、D-10；A-03
- [x] 3.3 按测试方案执行专用回归、`npm test`、`npm run validate`、`npm run verify`、官方 Skill/Plugin validators 与 Vue 3 + Vite fixture，记录聚焦、全量和人工结果的边界。D-05、D-08、D-09、D-10；A-01、A-02、A-03、A-04、A-05
- [x] 3.4 使用 WebStorm 提交并推送；复核提交 `4b2936f6bbd1e9543a5a501a17dbad6354a6b1f5` 的 [GitHub Actions #78](https://github.com/julangtaotian/wayfinder/actions/runs/33377691203)，shared 与 macOS ARM64/x64、Linux ARM64/x64、Windows x64 六项任务全部通过；未新增 CI 触发、缓存、权限或定时任务。D-08、D-10；A-05
