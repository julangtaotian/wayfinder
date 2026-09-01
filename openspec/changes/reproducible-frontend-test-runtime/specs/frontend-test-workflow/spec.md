## MODIFIED Requirements

### Requirement: 首版兼容声明必须由真实 fixture 证明

首版 MUST 在 Vue 3 + Vite + Vitest fixture 上证明上下文识别、方案校验、专用测试定位、真实聚焦执行、零测试失败和重复执行稳定性。其他 runner MAY 按项目已有模式使用，但系统 MUST NOT 在没有对应 fixture 或外部证据时声明完整兼容；开发验证依赖与临时运行时 MUST 只按需位于 `outputs/frontend-test-runtime/`，不得进入项目根目录、插件运行时或业务项目。Vitest 运行时 MUST 由仓库受版本控制的最小清单和锁文件通过确定性安装创建；可复用 npm 缓存 MUST 仅位于被忽略的 `outputs/frontend-test-cache/`，与临时运行时分别清理。准备入口与统一验证 MUST 接受显式 `--offline`：缓存完整时离线准备 MUST 不访问 registry，缓存缺失、损坏或不满足锁文件时 MUST 返回非零状态以及稳定 `code`、`target`、`status` 和中文说明。默认模式 MAY 在缓存未命中时访问 registry，但 MUST 优先使用受控缓存。仓库既有的真实平台矩阵 MUST 在每个平台先在线准备、清理临时运行时、生成对应平台运行时，再运行离线共享验证，并在成功或失败后分别清理运行时与缓存。（D-01、D-02、D-03、D-04、D-06；A-01、A-02、A-03、A-04、A-05）

#### Scenario: Vue Vitest fixture 完成闭环

- **WHEN** 仓库执行测试用例工作流专用验证
- **THEN** fixture 的 Vitest 命令真实发现并通过计划 TC，重复执行保持方案和测试定位稳定

#### Scenario: 已缓存的离线验证运行时

- **WHEN** 同一锁文件已成功准备缓存，调用方以 `--offline` 准备运行时或启动统一验证
- **THEN** 运行时仅使用 `outputs/frontend-test-cache/` 中与锁文件完整性匹配的包内容完成准备
- **AND** 统一验证将该选项传递至准备入口，根目录不生成依赖目录或锁文件

#### Scenario: 离线缓存缺失或不完整

- **WHEN** 调用方以 `--offline` 执行且受控缓存缺失、损坏或无法满足锁文件
- **THEN** 命令失败关闭，不将临时目录视作有效运行时
- **AND** 输出稳定 `code`、`target`、`status` 及中文说明，而不回退到网络

#### Scenario: 分离清理运行时与缓存

- **WHEN** 调用方清理临时运行时或显式清理缓存
- **THEN** 每个命令仅删除所属的受控 outputs 子目录
- **AND** 临时运行时清理不会删除可复用缓存，缓存清理不会影响持久验证证据

#### Scenario: 真实平台矩阵离线复验

- **WHEN** 同一提交触发仓库声明的任一平台 CI runner
- **THEN** runner 先以默认模式准备缓存，再清理临时运行时、生成对应平台运行时，并以 `--offline` 完成共享验证
- **AND** 无论任务结果如何，运行时与测试缓存均被有界清理

#### Scenario: 遇到未认证 runner

- **WHEN** 项目使用首版没有完整兼容证据的测试 runner
- **THEN** 系统只依据项目现有文件提供有限支持并披露未认证边界，不安装替代框架或声称完整支持
