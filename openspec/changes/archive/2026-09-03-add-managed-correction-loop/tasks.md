## 1. 补充受管局部修正合同

- [x] 1.1 在 `frontend-change` 的现有生命周期内增加局部修正回路，落实唯一活动变更、既有 D/A、局部调用链、聚焦验证、待验证状态恢复和实质边界退出，同时保持公开描述、独立快速 Skill 与原 Plan/Revise/Implement/Complete 门禁不变。（D-01～D-06；A-01～A-04）
- [x] 1.2 扩展 `tests/fast-change-routing.test.mjs`，验证三个互斥去向、最小读取和单次聚焦验证、状态与证据恢复、返回 Revise 的边界，以及原完成归档合同；不新建重复测试文件。（D-02～D-06；A-01～A-04）

## 2. 聚焦验证

- [x] 2.1 运行 `node --test tests/fast-change-routing.test.mjs`，修复所有路由、兼容和门禁断言失败，并在 `verification.md` 记录真实结果。（D-02、D-03、D-04、D-05、D-06；A-01、A-02、A-03、A-04）

## 3. 完成共享工作流门禁

- [x] 3.1 运行 `npm test`、`npm run validate` 和 `npm run validate:official`，人工复核没有新增 Skill、公共入口、运行时分类器或重复说明，并如实记录未覆盖范围。（D-01、D-05、D-06；A-02、A-04）
- [x] 3.2 更新需求 V-*、验收勾选和状态，通过变更检查与完成预检后再同步规格和归档；不得绕过现有 finalize 门禁。（D-03、D-05、D-06；A-02、A-04）
