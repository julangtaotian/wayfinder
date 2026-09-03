## Purpose

为仓库提供一个显式、轻量且失败关闭的本地 Creator validator 预检能力，通过复用有界 PyYAML 缓存减少重复准备工作，同时真实执行当前 Codex 环境中的全部 Skill 与 Plugin 校验目标，并诚实限定结果适用范围。

## ADDED Requirements

### Requirement: 系统必须通过显式入口真实执行当前 Creator validators

系统 MUST 提供 `npm run validate:official`，MUST 读取当前 Codex 开发环境中的 Skill Creator 和 Plugin Creator validators，MUST 按仓库相对路径稳定排序对每个自定义 Skill 分别执行一次 Skill validator，并 MUST 对插件根执行一次 Plugin validator。系统 MUST 记录实际 validator 来源标识和 SHA256，MUST NOT 把外部脚本复制进仓库或以项目自写校验替代不可用的官方脚本。（D-01、D-02；A-01、A-05）

#### Scenario: 全部目标预检通过

- **WHEN** 当前环境提供两个 Creator validators，全部 Skill 和插件内容满足其规则
- **THEN** 系统报告每个 Skill、Plugin、实际脚本摘要和目标计数，并在全部目标真实通过后返回零状态

#### Scenario: 当前环境缺少 validator

- **WHEN** 任一 Creator validator 不存在、不可读或 Skill 集合为空
- **THEN** 系统返回 `official_validator_unavailable` 和非零状态，不执行替代校验，也不声称官方预检通过

### Requirement: 依赖缓存必须有界且可复用

系统 MUST 锁定 PyYAML 精确版本和发布包摘要，MUST 只在 `outputs/official-validator-cache/` 核验、准备和复用依赖，MUST NOT 修改用户 Python、仓库根依赖或其他输出。缓存有效时 MUST 直接复用；缓存缺失或无效时 MAY 从依赖源准备固定包，但取得失败或摘要不符 MUST 失败关闭。（D-03、D-04；A-02、A-03）

#### Scenario: 首次准备依赖

- **WHEN** 缓存不存在且固定依赖可以取得并通过摘要核验
- **THEN** 系统只把依赖准备到专属缓存，完成预检后保留有效缓存供后续使用

#### Scenario: 有效缓存复用

- **WHEN** 专属缓存中的版本和摘要满足合同
- **THEN** 系统不重复安装依赖，并能在不访问依赖源的条件下启动预检

#### Scenario: 冷缓存依赖不可取得

- **WHEN** 缓存缺失或无效，且固定依赖无法取得或摘要核验失败
- **THEN** 系统返回 `official_validator_dependency_unavailable` 和非零状态，不回退用户级模块

#### Scenario: 预检结束后清理

- **WHEN** 预检成功、内容失败、启动失败或异常结束
- **THEN** 系统只清理本次 `outputs/official-validator-runtime/`，保留有效缓存和其他 `outputs` 内容；缓存仅由独立显式命令删除

### Requirement: 所有未执行与内容失败必须失败关闭

系统 MUST 区分 validator/Python 不可用、固定依赖不可用、子进程启动失败和内容校验失败，分别使用 `official_validator_unavailable`、`official_validator_dependency_unavailable`、`official_validator_start_failed` 和 `official_validator_validation_failed`。内容失败 MUST 保留 `validator`、仓库相对 `target`、真实退出码、stdout 和 stderr；任何失败 MUST 返回非零状态。（D-06、D-08；A-03）

#### Scenario: validator 启动失败

- **WHEN** validator 路径已解析但子进程无法真实启动或异常终止
- **THEN** 系统返回 `official_validator_start_failed`，保留启动诊断，不把它归类为内容不合法

#### Scenario: Skill 或 Plugin 内容失败

- **WHEN** 官方脚本已经启动并对某个 Skill 或插件返回非零状态
- **THEN** 系统返回 `official_validator_validation_failed`，通过 `validator` 和 `target` 定位目标并保留真实原始输出

#### Scenario: Windows 与 POSIX 路径

- **WHEN** 编排在 Windows 或 POSIX 路径语义下处理同一仓库目标
- **THEN** 机器结果使用统一仓库相对目标，子进程参数使用目标平台路径，且不通过 shell 拼接命令

### Requirement: 预检必须保持显式使用和诚实结论边界

系统 MUST NOT 把官方预检加入普通 `npm run validate`、`npm run verify` 或常规 CI。成功结果 MUST 只表述为“当前本地 Creator validators 预检通过”，MUST NOT 宣称固定快照、最新上游规则、Skill 行为质量或 OpenAI 公共目录最终审核通过。缓存、启动适配和外部 validator MUST NOT 进入插件发布物。（D-05、D-07、D-08；A-04、A-05）

#### Scenario: 普通验证不触发预检

- **WHEN** 开发者执行普通 `validate`、`verify` 或既有 CI 工作流
- **THEN** 系统保持原有验证范围，不隐式定位、准备或运行外部 Creator validators

#### Scenario: 生成插件发布物

- **WHEN** 仓库生成或检查插件发布内容
- **THEN** 成品不包含依赖缓存、临时运行时、外部 validator 或仅用于开发预检的文件

#### Scenario: 预检结论保持本地边界

- **WHEN** 当前 Creator validators 全部返回成功
- **THEN** 输出同时记录实际脚本摘要与执行环境，并明确该结果不替代项目行为测试或公共目录提交审核
