# real-developer-effectiveness-evidence Specification

## Purpose
为真实前端项目上的插件组与对照组配对观测提供安全、可复算且可证伪的效果证据，使效率收益只有在样本、公平性、统计强度和质量护栏同时成立时才能被声明。

## Requirements

### Requirement: 真实效果输入必须匿名、完整且配对公平

系统 MUST 只接受使用安全研究、项目、参与者和任务别名的 schema v1 结构化输入。每个配对 MUST 记录同一项目提交、冻结需求摘要、独立验收摘要、模型、推理强度、时间预算和 `plugin-first` 或 `baseline-first` 顺序，并 MUST 为两组提供完整时间、澄清、返工、阻断、首次验收、最终验收及可选 Token 事实。未知字段、重复标识、不相等条件、绝对路径、身份、需求正文、源码、日志或凭据 MUST 失败关闭。<!-- provenance: D-01,D-02,D-03,D-06,D-08; A-01 -->

#### Scenario: 合法配对输入通过预览
- **WHEN** 调用方提供只含别名、摘要和完整结构化指标的真实研究输入
- **THEN** 系统返回确定性研究预览、配对质量和结论，并且不写文件、不联网、不运行代理或业务命令

#### Scenario: 配对条件不公平或内容敏感
- **WHEN** 任一配对两组的冻结条件不同，或输入含绝对路径、个人身份、正文、日志、凭据、未知字段或不可信 Token
- **THEN** 系统返回稳定 `code`、`status` 和 `target`，且不生成标准证据或部分收益结论

### Requirement: 主要效率结论必须使用预先固定的配对规则

系统 MUST 以两组均通过最终验收的总周期配对作为主要样本，计算插件组相对对照组的逐配对改善率、中位数改善、项目级中位数、非平局数量和单侧精确符号检验。同一项目的冻结任务摘要 MUST 唯一。只有至少三个项目、三名参与者、每项目至少两个可比较配对、至少六个非平局配对、两个执行顺序均出现、总体中位数改善不少于 10%、`p < 0.05` 且每个项目中位数均不回退时，主要效率门槛才能通过。平局 MUST 留在描述性汇总但不得进入符号检验。<!-- provenance: D-02,D-03,D-04; A-02 -->

#### Scenario: 全部门槛同时满足
- **WHEN** 三个或更多项目、三名或更多参与者的有效配对同时满足逐项目规模、任务唯一、顺序、改善率、显著性和项目防回退门槛
- **THEN** 系统把主要指标标记为通过并输出可复算的样本数、中位数改善率、项目结果、正负平局计数和精确 p 值

#### Scenario: 样本或可比性不足
- **WHEN** 项目、参与者、每项目可比较配对、非平局数量或执行顺序任一最低门槛不足
- **THEN** 系统返回 `inconclusive`，列出稳定原因并保持 `benefitPercent` 为 null

#### Scenario: 研究设计达标但主要改善未证明
- **WHEN** 最低研究设计门槛已满足，但中位数改善或精确符号检验未达到主要指标门槛
- **THEN** 系统返回 `no-demonstrated-improvement` 并保持 `benefitPercent` 为 null

### Requirement: 质量与返工护栏必须阻止伪效率结论

系统 MUST 比较全部有效观测的最终验收通过率、首次验收通过率和配对返工差值中位数。插件组任一验收通过率低于对照组、返工中位数增加或任一项目总周期中位数回退时，即使同时存在样本不足，结论也 MUST 优先为 `regressed`；主要门槛未满足但质量未回退时 MUST 为 `no-demonstrated-improvement`；只有主要门槛与全部质量护栏同时通过时才能为 `demonstrated-improvement`。<!-- provenance: D-04,D-05,D-07; A-02 -->

系统 MUST 另外输出首次交付时间、澄清次数、返工次数和阻断次数的配对差值中位数，作为不决定主要结论的操作指标。<!-- provenance: D-05; A-02 -->

#### Scenario: 时间更快但质量回退
- **WHEN** 总周期改善满足统计门槛，但首次或最终验收通过率降低、返工增加或某项目中位数回退
- **THEN** 系统返回 `regressed` 且收益百分比为 null，不得用时间优势覆盖质量损失

#### Scenario: 改善得到证明
- **WHEN** 主要门槛和全部质量护栏通过
- **THEN** 系统返回 `demonstrated-improvement`，并把总体中位数改善率作为 `benefitPercent`

### Requirement: Token 必须作为独立成本指标保留未知语义

系统 MUST 只接受从 Codex `turn.completed.usage` 聚合得到的非负整数 input、cached input、output、reasoning output、total 和 turn count。只有配对两侧 Token 都完整时才计算差值和中位数；任一侧缺失时 MUST 保持该配对 Token 差值为 null，并且不得用字符、价格、时间或零值替代。Token 结果 MUST 独立展示且不得单独决定时间效率结论。<!-- provenance: D-06; A-01,A-02 -->

#### Scenario: 配对两侧 Token 完整
- **WHEN** 同一配对两侧均提供合法 Token 聚合
- **THEN** 系统输出各维度差值、Token 有效配对数及总 Token 配对中位数差异

#### Scenario: 任一侧 Token 未知
- **WHEN** 任一执行组没有合法 Token 事实
- **THEN** 系统保留时间和质量指标，把该配对 Token 差值及无法形成的汇总设为 null，并公开有效 Token 样本数

### Requirement: 标准证据必须有界、不可覆盖且可验证来源

系统 MUST 默认只预览。显式写入时，标准证据 MUST 包含固定生成器身份、插件 40 位提交、研究别名、结论、全部可复算汇总、限制和输入文件的相对路径、字节数及 SHA-256，并原子写入 `.frontend-ai-workflow/runs/developer-effectiveness-evidence/`。输出不得覆盖既有文件；输入来源变化后，下游消费方 MUST 拒绝旧摘要。<!-- provenance: D-08,D-09,D-10; A-04 -->

#### Scenario: 显式写入标准证据
- **WHEN** 合法输入通过校验且调用方显式请求写入
- **THEN** 系统在受管忽略目录创建一次标准 JSON，并返回相对回执路径、结论和来源摘要

#### Scenario: 重复写入或来源漂移
- **WHEN** 输出路径已经存在，或标准证据记录的输入摘要与当前文件不一致
- **THEN** 系统失败关闭且不覆盖、不自动选择其他结果、不输出提升结论

### Requirement: 普通验证不得触发真实研究执行

普通测试、结构校验、统一验证和默认 CI MUST 只运行确定性 fixture，不得启动 Codex、读取业务项目、访问网络或生成真实研究结果。真实观测收集和额度消耗 MUST 由调用方在仓库验证之外显式完成。<!-- provenance: D-01,D-10; A-05 -->

#### Scenario: 执行仓库统一验证
- **WHEN** 维护者运行普通测试或统一验证
- **THEN** 系统仅验证 schema、统计、安全与投影逻辑，不启动真实代理或读取外部业务数据
