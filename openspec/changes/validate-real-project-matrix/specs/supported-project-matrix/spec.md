## ADDED Requirements

### Requirement: 支持矩阵结论必须区分证据层级

系统 MUST 将最小 fixture 回归、本机真实项目执行、插件本地统一验证和真实 CI 平台矩阵视为互不替代的证据层级。支持说明 MUST 对每个框架、构建工具、包管理器和测试运行器组合明确标记已认证、有限支持、正确阻断或未覆盖；只有对应层级真实通过后才能提升声明。（D-06、D-07、D-08、D-12、D-13；A-05、A-06、A-07、A-10）

#### Scenario: 真实项目在本机通过

- **WHEN** 某一项目组合在 macOS ARM64 的精确提交隔离副本中完成真实运行
- **THEN** 支持矩阵可以记录该组合的本机项目证据
- **AND** 不得据此把 Linux、Windows、macOS Intel 或同类所有项目标记为已通过

#### Scenario: runner 只有项目证据

- **WHEN** Jest 或其他非首版认证 runner 在一个或多个真实项目中成功运行
- **THEN** 系统记录项目级通过并继续标明运行器为有限支持
- **AND** 在缺少专用 fixture 与广泛项目证据时不得声明完整认证

#### Scenario: 组合未被六项目覆盖

- **WHEN** 六项目没有 pnpm、React + Vite 或真实 workspace/Monorepo 样本
- **THEN** 最终支持矩阵明确保留这些组合为未覆盖
- **AND** 不得用相邻框架、嵌套 package 或现有 fixture 替代真实项目认证结论

