## Why

插件已有 fixture、专用回归和五平台 CI，但还没有在真实历史项目上形成统一、可复验的证据，因而无法可靠回答“哪些流程已经闭合、哪些只是有限支持、是否存在误识别或误结论”。现在需要用六个已确认且干净的真实项目验证核心链，同时保护业务工作区并阻止单机、单项目结果被外推成完整兼容。

## What Changes

- 固定 P1～P6 的路径、提交、项目角色和覆盖缺口，建立逐项目、逐阶段的真实验证矩阵。（D-01、D-02、D-05；A-01、A-02）
- 原工作区只做只读快照与识别；所有可能写入受管文件、缓存或测试产物的操作都在仓库 `outputs/real-project-validation/` 的隔离副本中运行。（D-03、D-04、D-10；A-03、A-09）
- 分层验证识别、初始化/幂等/升级/检查、项目原生测试链、缺命令阻断、边界措辞和清理，结果只使用 `passed`、`limited`、`blocked`、`defect`。（D-05～D-08；A-04～A-06）
- 将 fixture 证明、本机真实项目证明、插件本地统一验证和真实五平台 CI 分开记录；只有对应证据通过后才提升支持结论。（D-09、D-12、D-13；A-07、A-10）
- 发现产品缺陷时输出稳定复现与影响范围并转入独立受管修复，不在验证过程中修改业务项目或顺手修插件逻辑。（D-11、D-14；A-04、A-10）

## Capabilities

### New Capabilities

- `real-project-validation`: 定义真实项目基线、隔离执行、分层结果、证据保存、缺陷转交和不越界结论的验证合同。

### Modified Capabilities

- `supported-project-matrix`: 将真实项目证据与 fixture/CI 证据分层，要求支持声明明确已认证、有限、阻断和未覆盖范围。

## Impact

- 规划与验证资产：`requirements/REQ-2026-030-real-project-validation-matrix.md`、当前 OpenSpec 变更、`outputs/real-project-validation/`。
- 只读输入：六个业务项目的 Git、根 `package.json`、配置、测试目录和命令证据。
- 验证入口：现有 inspect、bootstrap、update、check、test context、仓库测试与 validators；本阶段不新增依赖、不联网、不访问后端。
- 跨平台高风险：是；命中路径、临时目录、子进程、包管理器入口和机器可读诊断。真实业务项目运行只证明 macOS ARM64；若后续修复插件代码，五平台 CI 另行取证。
- 业务项目源码、manifest、锁文件、Git 历史和远程环境不在修改范围内。
