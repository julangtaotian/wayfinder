## Why

仓库已有较完整的前端工作流，但本地与 CI 的验证入口仍然分散，框架支持声明也缺少对应的完整回归；同时，内置 OpenSpec 只有版本和许可证文件，无法确定性证明生产依赖内容未发生漂移。需要在继续扩展能力前建立单一门禁、受支持项目矩阵和可核验的运行时供应链基线。（D-01、D-02、D-04、D-05；A-01、A-02、A-04、A-05）

## What Changes

- 建立仓库初始 Git 基线，并在独立分支中实施与验证本变更。（D-01；A-01）
- 新增 `npm run verify`，以稳定顺序串行执行测试、结构、OpenSpec 严格校验、内置版本和完整性检查；CI 只调用该入口。（D-02、D-03；A-02、A-03）
- 增加 Vue 2 + Vite、Vue + Webpack、React + Vite、React + Webpack 以及 npm、pnpm、yarn 的确定性 fixture 回归。（D-04；A-04）
- 为内置 OpenSpec 1.7.0 增加可重复生成和核验的生产包、许可证及 SHA-256 清单，默认校验、显式写入。（D-05；A-05）
- 将插件升级为 0.11.0，保留现有只预览、受管更新、项目识别和内置运行时边界。（D-06；A-06）

## Capabilities

### New Capabilities

- `repository-verification-gate`: 定义本地与 CI 共享的统一验证入口、执行顺序和失败传播语义。（D-02、D-03；A-02、A-03）
- `supported-project-matrix`: 定义 Vue/React 与 Vite/Webpack、npm/pnpm/yarn 的受支持识别和工作流回归矩阵。（D-04；A-04）

### Modified Capabilities

- `bundled-openspec-runtime`: 增加确定性的版本、入口、生产包、许可证和 SHA-256 清单及漂移阻断要求。（D-05、D-06；A-05、A-06）

## Impact

影响根 `package.json`、GitHub Actions、工作流测试、插件结构校验、内置运行时相邻清单、插件 manifest、marketplace 与发布说明。实现继续只使用 Node.js 标准库，不联网、不安装 fixture 依赖，也不改变业务项目中无受管标记的文件。（D-03、D-04、D-05、D-06；A-03、A-04、A-05、A-06）
