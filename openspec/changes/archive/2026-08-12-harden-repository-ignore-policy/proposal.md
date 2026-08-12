## Why

仓库当前没有未分类的未跟踪文件，但根忽略规则尚未覆盖环境文件、常见缓存与测试报告，而且 OpenSpec 运行时的 `node_modules/.bin/` 会被生产依赖例外重新纳入，存在未来误提交可重建文件的风险。需要在不破坏离线运行时、LFS 浏览器资产和持久验收证据的前提下，把提交边界变成可测试、可维护的明确合同。（D-01、D-05、D-06；A-01、A-02、A-03、A-04）

## What Changes

- 按系统、编辑器、环境、依赖、缓存、测试产物和内置运行时例外重组根 `.gitignore`。（D-01～D-05；A-01、A-02、A-03）
- 忽略两套内置运行时可重建的 `.bin/`、`.DS_Store` 与缓存，移除既有 OpenSpec `.bin/node-which` 与 `.bin/yaml` 链接，同时继续允许生产包、锁文件、许可证、完整性清单和 LFS 平台资产进入 Git。（D-01、D-05；A-02、A-03）
- 显式保护 `outputs`、`.frontend-ui-review/runs`、需求、规格和归档变更等持久交付物，不引入宽泛 `dist/` 或输出目录过滤。（D-04、D-06；A-04）
- 新增仓库卫生专用测试，以真实 Git 忽略语义验证正向过滤、反忽略和当前跟踪资产。（D-07、D-10；A-01～A-05）
- 输出分级健康审查建议；大型模块拆分、浏览器按平台拆包和历史证据迁移留待独立变更。（D-08、D-09；A-06）

## Capabilities

### New Capabilities

- `repository-hygiene`: 定义仓库必须过滤的临时/敏感内容、必须保留的离线运行时与持久证据，以及可重复验证这些边界的行为。（D-01～D-07；A-01～A-05）

### Modified Capabilities

- 无。根级 `npm test` 已按通配符加载全部专用测试，现有统一验证规格无需改变。

## Impact

- 受影响文件：根 `.gitignore`、新的 `tests/repository-hygiene.test.mjs`、统一验证覆盖及相关需求/规格记录。
- 不改变插件运行 API、业务项目文件、marketplace、manifest、功能版本、cachebuster 或安装缓存。（D-08、D-09）
- 除两个经入口和完整性检查证明可重建的 OpenSpec `.bin` 链接外，不删除或取消跟踪当前资产；Playwright 平台包继续使用 Git LFS，OpenSpec 与 Playwright 离线运行时继续随插件发布。（D-01、D-05、D-06）
