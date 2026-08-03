## Why

第一轮终端画像只表达桌面或移动 Web 形态，微信原生、uni-app、Taro 和 Remax 项目缺少可追溯的平台框架事实，需求分析容易遗漏生命周期、导航、权限、存储、网络和构建边界。第二轮应复用同一画像入口补充强证据，同时继续限制为分析输入而非框架工具链。（D-01、D-02、D-05）

## What Changes

- 在现有 `targetProfile` 中增加平台框架子画像，提供稳定类型、框架、来源和证据。（D-03、D-04）
- 用固定配置文件组合识别微信原生和 uni-app，用明确依赖识别 uni-app、Taro、Remax；未知和多框架冲突保守返回。（D-02、D-03、D-05）
- 将平台画像同步到识别、检查、AGENTS、Wayfinder 和 OpenSpec，并为需求整理增加条件化的平台边界提醒。（D-06）
- 新建平台画像专用测试，覆盖强证据、未知、冲突、误导名称、初始化、升级与兼容。（D-08、D-09）
- 不新增公共命令、项目配置、第三方依赖、构建适配器或平行工作流，也不支持缺少 `package.json` 的仓库。（D-07）

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `project-target-profile`: 在现有轻量终端画像内增量提供平台框架强证据，并让需求与变更上下文消费相同事实。

## Impact

- 代码：项目画像、项目识别、初始化变量和结构校验。
- 受管资产：AGENTS、Wayfinder 与 OpenSpec 配置模板。
- 规则：项目识别参考和需求整理规则。
- 测试：新增 `tests/project-platform-profile.test.mjs`，并运行完整统一门禁。
- 兼容性：只新增嵌套机器字段和受管模板内容，现有第一轮画像、preset、命令、路径与写入保护保持不变。
- 依赖与外部系统：不增加依赖，不调用小程序开发工具或框架 CLI。
- 关联需求：`requirements/REQ-2026-014-project-platform-profile.md`。
