## MODIFIED Requirements

### Requirement: 依赖缓存必须有界且可复用

系统 MUST 锁定 PyYAML 精确版本和发布包摘要，MUST 只在 `.frontend-ai-workflow/cache/official-validator-cache/` 核验、准备和复用依赖，并只在 `.frontend-ai-workflow/runs/official-validator-runtime/` 建立本次运行环境，MUST NOT 修改用户 Python、仓库根依赖、`outputs/` 或其他运行目录。缓存有效时 MUST 直接复用；缓存缺失或无效时 MAY 从依赖源准备固定包，但取得失败或摘要不符 MUST 失败关闭。（D-03、D-04；A-02、A-03）

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
- **THEN** 系统只清理本次 `.frontend-ai-workflow/runs/official-validator-runtime/`，保留有效缓存和其他运行内容；缓存仅由独立显式命令删除
