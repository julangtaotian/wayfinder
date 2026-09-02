## 1. 分离快速与完整能力

- [x] 1.1 恢复 `frontend-change` 原公开描述、状态规则和 Plan/Revise/Implement/Complete 生命周期，移除嵌入式 Fast Path，并用专用测试锁定关键段落。（D-06；A-04）
- [x] 1.2 新建 `frontend-fast-change` Skill，落实最低准入、必要读取、同一局部调用链扩展、聚焦验证、实质风险和单次无损交接合同。（D-01～D-05；A-01～A-03）
- [x] 1.3 新增 Skill 元数据并启用隐式选择，把新 Skill 加入公开能力 fixture，确保默认提示显式引用 `$frontend-fast-change`。（D-01、D-07；A-01、A-05）

## 2. 收敛公共路由说明

- [x] 2.1 把受管 `AGENTS.md` 的旧长清单替换为两个 Skill 的简洁选择与交接规则，不复制完整快速合同。（D-03、D-04、D-06、D-07；A-02、A-04、A-05）
- [x] 2.2 更新需求边界说明和 README，解释独立快速 Skill 的适用目标、真实速度来源、交接边界与示例，并保持完整流程入口清楚。（D-01～D-07；A-01～A-05）

## 3. 建立独立架构的回归保护

- [x] 3.1 重写 `tests/fast-change-routing.test.mjs`，覆盖独立 Skill/元数据、最低准入、实质风险、局部多文件、单次交接、聚焦验证和公共路由同步。（D-01～D-05、D-07；A-01～A-03、A-05）
- [x] 3.2 增加 `frontend-change` 兼容断言，证明原描述、Explore/Plan/Revise/Implement/Complete 结构、活动变更和完成门禁未被快速规则改写。（D-06、D-07；A-04、A-05）
- [x] 3.3 运行专用聚焦测试并记录真实结果，修复所有架构或合同漂移。（D-04～D-07；A-01～A-05）

## 4. 完成仓库级验证与验收

- [x] 4.1 运行 `npm test`、`npm run validate` 和 `npm run verify:shared -- --offline`，确认公开 Skill、初始化、升级、需求和完成门禁没有回归。（D-05～D-07；A-04、A-05）
- [x] 4.2 使用官方 Skill validator 检查全部自定义 Skill，并使用官方 plugin validator 检查 manifest。（D-07；A-05）
- [x] 4.3 在至少一个 Vue 3 + Vite fixture 上验证初始化预览、显式写入、重复执行、升级和健康检查，确认只更新受管区块。（D-06、D-07；A-04、A-05）
- [x] 4.4 人工复核两个 Skill 描述互斥、公共文档没有重复完整合同，更新需求验收、验证记录与剩余风险。（D-01～D-07；A-01～A-05）
