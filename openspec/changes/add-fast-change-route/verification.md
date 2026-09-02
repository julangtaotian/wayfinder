# 独立快速通道验证记录

旧版 V-01、V-02 只证明“在 `frontend-change` 内嵌 Fast Path”的实现，已由需求修订 R-02 作废，不能用于本架构验收。

## V-01：独立路由合同测试

- 执行日期：2026-09-02
- 实际命令：`node --test tests/fast-change-routing.test.mjs`
- 结果：通过；8 项测试全部通过，0 失败、0 跳过。
- 覆盖：独立 Skill 与隐式选择元数据、最低准入、实质风险、同一局部调用链、单次交接、聚焦验证、公共路由同步，`frontend-change` 发布版描述、阶段顺序、活动变更和硬完成门禁兼容，以及单一 Vue 3 + Vite fixture 的初始化、重复执行、升级和检查生命周期。

## V-02：仓库共享验证

- 执行日期：2026-09-02
- 固定测试运行时：`npm run prepare:test-runtime -- --offline` 成功准备 Vitest 3.2.4；最终共享验证结束后自动清理 `outputs/frontend-test-runtime/`。
- 全量测试：最终 `npm test` 通过；215 项中 207 通过、8 项按环境声明跳过、0 失败。
- 结构校验：最终 `npm run validate` 通过。首次校验曾因公开 Skill 白名单仍为 9 项而失败，补齐结构白名单和回归断言后重跑通过；首次失败不计为通过证据。
- 共享统一验证：最终 `npm run verify:shared -- --offline` 通过 7/7 阶段；共享测试 158 项中 155 通过、3 项真实项目矩阵按条件跳过；OpenSpec 33 项严格校验、52 个归档变更和 76 个运行时包完整性校验全部通过。
- 官方 Skill 校验：使用 `skill-creator/scripts/quick_validate.py` 检查插件内 10 个自定义 Skill，10/10 通过。
- 官方插件校验：使用 `plugin-creator/scripts/validate_plugin.py` 检查 `plugins/frontend-ai-workflow`，通过。
- Vue 3 + Vite fixture：专用测试在同一 fixture 上完成初始化预览、显式写入、重复执行、受管区块升级和健康检查，1/1 通过；新路由和项目自定义内容均保留。
- 环境处理：官方 Python validator 所需 PyYAML 6.0.3 只临时安装到 `outputs/official-validator-runtime/`，校验后已删除，未修改项目依赖或锁文件。

## 人工一致性复核

- `frontend-change/SKILL.md` 与插件已安装缓存发布版逐字一致；快速 Skill 没有改写它的描述、状态规则或完成门禁。
- 两个 Skill 描述职责互斥：快速能力只面向结果已决定的局部实施，完整能力只面向受管变更生命周期。
- 受管 `AGENTS.md`、需求规则和 README 只保留选择与交接说明，完整准入和执行合同由独立 Skill 单点持有。
- 实际差异不包含依赖、锁文件、CI、平台运行时、manifest 或外部系统写入；验证临时目录均已清理。
- 剩余风险：Skill 选择仍由自然语言描述驱动，不能等同于真实模型路由评测；本轮未运行远程 CI 或五平台安装矩阵，也未在外部真实 React、Vue 2、Webpack 或业务仓库验证。仓库既有模拟矩阵与结构门禁通过，但不替代这些外部证据。
