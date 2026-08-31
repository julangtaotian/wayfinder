## Context

参见 `proposal.md` 的动机和四份 delta spec 的行为合同。当前共享 Playwright 运行时约 19MB，而 `runtime/playwright/platform-assets/` 的五个平台浏览器约 1.3GB；`build-playwright-platform.mjs` 会把目标资产写回源码运行时，`package-plugin-platform.mjs` 再从源码复制目标平台。CI 已经通过固定 Playwright 1.62.1 CLI 在五个原生 runner 重建资产，但仍依赖 checkout 中存在 LFS 指针目录作为安全替换前置。

Codex marketplace 支持本地路径或 Git 仓库/ref，当前 manifest 没有已验证的 OS/arch 自动分流合同。新链路因此以“准备当前平台的完整本地 marketplace，再由用户显式安装”为边界；准备入口不自动修改 Codex 配置。安装或升级允许联网，插件运行阶段继续只读使用自身内置运行时。

本变更属于跨平台高风险：命中 CI、路径、临时目录、子进程、环境变量、包管理器入口、安装流程和机器可读诊断；受影响平台是 macOS ARM64/x64、Linux ARM64/x64、Windows x64。确定性聚焦、本地统一验证和同一 SHA 真实五平台 CI 必须分层记录。（D-08～D-13；A-01～A-06）

## Goals / Non-Goals

**Goals:**

- 让平台下载、运行时组装和插件打包在源码目录之外完成，源码 HEAD 不再需要平台浏览器二进制或 LFS 指针。
- 保持一个单平台 marketplace 成品内的目录布局、运行时选择、固定版本、许可、完整性、体积预算和离线 UI Review 合同。
- 提供默认预览、显式写入、重复准备保护、受控升级、下载超时/重试、代理保密和失败保留旧包。
- 让普通 CI 使用与本地安装准备相同的核心，在五个平台验证成品，但只上传小型报告。
- 通过两个可回滚阶段完成迁移，避免在新安装链得到五平台证据前删除旧 LFS 交付物。

**Non-Goals:**

- 不自动执行 Codex marketplace/plugin 安装，不新增平台自动分流 manifest 字段。
- 不在使用阶段下载浏览器，不切换系统 Chrome，不修改业务项目依赖。
- 不增加缓存、镜像服务、第三方 action、npm 依赖、schedule、GitHub 写权限或发布密钥。
- 不升级 Playwright/Chromium/Node/OpenSpec，不扩展平台矩阵。
- 不改写 Git 历史，不执行 LFS 历史迁移或远端对象清理。

## Decisions

### 1. 平台资产构建器从“源码内替换”改为“源/目标分离”

保留 `build-playwright-platform.mjs` 的固定版本、平台映射、许可补齐、完整性生成与稳定错误语义，但把输入拆成只读共享 `runtimeRoot` 和全新 `outputRuntimeRoot`。写入时先复制平台成品必需的共享运行时、目标平台元数据和空的平台目录骨架，再把 Playwright CLI 的 `PLAYWRIGHT_BROWSERS_PATH` 指向输出运行时内部；源码 `platform-assets` 无论缺失、为 LFS 指针还是真实文件都不参与新主路径。

旧 `--replace-lfs-pointers` 暂时作为第一阶段回退，只被旧测试/兼容入口识别，不再由 CI 调用。第二阶段删除 LFS 资产时同步退役该参数、占位树检查和备份恢复分支。

备选方案是继续在 checkout 内删除/重建目标目录。它仍让构建成功依赖源码存在平台路径，并使验证过程修改仓库内容，不符合源码与成品解耦目标，因此不采用。

### 2. 新总入口一次完成平台运行时和本地 marketplace 成品

新增职责明确的平台准备入口，例如 `prepare-platform-marketplace.mjs`。它只编排：解析当前平台与安全输出、建立独占工作目录、调用平台资产构建器、把外部运行时源交给平台打包器、运行结构/完整性/体积/真实浏览器检查、发布最终 marketplace、写入 `package-report.json` 并清理工作目录。

默认平台来自 `${process.platform}-${process.arch}`；预览允许显式查看受支持目标，写入只接受当前原生平台。默认输出保持在忽略的 `dist/frontend-ai-workflow-<platform>`，测试与验证可以注入 `outputs/<主题>/` 下的精确路径；最终输出已存在时拒绝覆盖。受控升级使用独立显式参数，把新成品完整生成在同级 stage 后再原子替换，并保留可恢复的旧目录直到发布成功。

备选方案是让用户先运行构建器、再手动拼接打包命令。它会暴露中间路径并让安装文档承担正确顺序，容易产生只有浏览器没有完整 marketplace 的半成品，因此不采用。

### 3. 平台打包器接收已验证的外部运行时源

`package-plugin-platform.mjs` 保持公开预览和现有默认行为兼容，增加显式 `runtimeSourceRoot` 服务注入或等价参数。复制插件共享内容时继续排除源码 `runtime/playwright` 的平台资产，随后从外部运行时源复制唯一目标平台目录、目标元数据和必要许可，再重建成品自己的 `distribution.json` 与完整性清单。

外部运行时源必须位于允许范围、真实路径不得越界、平台必须匹配当前原生目标，且构建前通过平台资产检查。打包结果不能信任上游清单直接复制，必须在最终成品上重新计算摘要和真实冒烟。

备选方案是让构建器直接生成完整插件。它会复制 `package-plugin-platform.mjs` 已有的插件结构、预算、Linux ARM64 去符号和 Windows 发布重试职责，因此不采用。

### 4. 下载采用有界三次尝试和十分钟单次超时

每次 Playwright CLI 下载最多十分钟，失败后精确清空本次未完成浏览器目录并重新建立；总尝试数为三次。错误结果保留最后一次真实退出码、信号或超时类型，并返回稳定 `code/status/target/attempts`。不自动切换下载主机或镜像。

子进程继承 `process.env`，因此用户已有的 `HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY` 等正常生效；计划、报告和错误对象只记录代理是否存在，不记录值。捕获的 stdout/stderr 在进入诊断前按当前环境中代理变量的非空值统一脱敏，防止带用户名/密码的 URL 落盘。测试注入执行器，不访问真实网络。

备选方案是无限重试或依赖 Playwright 默认网络等待。前者会隐藏长期阻塞并增加 CI 成本，后者无法形成稳定失败时间和机器证据，因此不采用。

### 5. 离线回退复用完整 marketplace，不复用裸下载缓存

成功输出本身是可复制的本地 marketplace。离线机器只接受平台、插件版本、Playwright 版本、`distribution.json`、共享/平台清单、许可和结构全部通过的完整目录；文档提供 `codex plugin marketplace add <本地路径>` 和 `codex plugin add ...` 的显式步骤。不会新增另一个缓存格式、共享浏览器目录或使用阶段解压逻辑。

备选方案是把 Playwright 下载缓存复制给目标机器，再在目标机器重新组包。它扩大了未验证中间物的信任边界，也容易出现权限和路径差异，因此不采用。

### 6. CI 直接调用平台准备入口但只上传报告

现有 shared job、`needs: shared`、五平台 matrix、`fail-fast: false`、Node 20.19.0、push/PR、只读权限和 concurrency 均保持。平台 job 删除 `--replace-lfs-pointers`，调用新总入口在 `dist/` 生成平台 marketplace，然后执行平台作用域或由总入口复用同一平台检查，最终只上传 `package-report.json`。

工作流静态回归必须断言没有 `git lfs pull`、`--replace-lfs-pointers`、`actions/cache`、大型目录 artifact、schedule、写权限或额外依赖；五个平台报告继续保持独立名称。同一 SHA 的真实矩阵仍是跨平台通过证据。

### 7. 两个提交阶段后再退役 LFS

第一阶段提交新增外部暂存构建、总入口、打包注入、网络回退、测试和 CI 改造，但保留现有 LFS 文件、`.gitattributes` 规则和兼容分支。该精确提交必须在五平台从无 LFS 下载的新入口生成成品、真实启动 Chromium，并至少完成当前 macOS ARM64 本地 marketplace 安装验证。

第二阶段只有在五个平台成品的结构/冒烟证据及计划要求的安装证据齐全后才执行：从 HEAD 删除 `platform-assets/`、LFS 规则、旧占位替换代码和相应旧断言；更新 README、正式规格、结构清单和体积退役门禁。第二阶段精确提交再次跑六任务 CI。任一阶段失败可回滚到上一提交，不改写历史。

任务 4.1 使用人工 `workflow_dispatch` 开关复用同一五平台矩阵，不新增第二套矩阵。每个平台只在该开关开启时把固定 Codex CLI 0.150.0-alpha.8 安装到 `outputs/`，复制完整 marketplace 到短暂存目录，以隔离 `CODEX_HOME` 执行真实 marketplace/plugin 安装，通过 `debug prompt-input` 直接检查新会话模型可见技能，再从已安装缓存于不可达代理环境启动 Chromium。该过程不读取登录态或密钥、不调用模型，普通 push/PR 不下载 Codex；报告仍随原一次 artifact 上传且不包含绝对缓存路径、代理值或凭据。

若人工矩阵任一平台没有生成 `platform_marketplace_install_verified` 小型报告，A-05 和第二阶段删除任务必须保持未完成，不能用结构校验或初次打包冒烟替代安装事实。

### 8. 测试和证据按三层定位

- `tests/ui-review-platform-runtime.test.mjs`：复用手写平台专用测试，覆盖预览零写入、源/目标分离、下载重试/超时、代理脱敏、外部运行时注入、唯一平台成品、离线复用、失败清理、Windows 路径/重试和 CI 静态合同。
- `tests/platform-marketplace-install.test.mjs`：新建职责单一的安装证据测试，覆盖默认预览、真实 Codex 命令编排、隔离缓存、新会话技能可见、断网 Chromium、失败清理、Windows 短路径和人工 CI 零日常成本合同；避免继续扩大已达 999 行的旧平台测试。
- `tests/repository-hygiene.test.mjs`：第二阶段覆盖平台资产与 LFS 规则不再受跟踪、共享运行时仍可提交。
- `tests/repository-footprint.test.mjs`：第二阶段覆盖退役路径与平台跟踪数量零预算。
- 本地聚焦与统一验证只证明当前实现和共享链；五平台真实 CI 证明原生构建/冒烟；五平台 Codex 安装记录单独满足人工 A-05。

## Risks / Trade-offs

- [安装或升级受官方源网络影响] → 三次有界尝试、单次十分钟、代理继承与脱敏；失败保留旧插件；完整 marketplace 可复制到离线环境。
- [第一阶段同时保留 LFS，源码体积暂未下降] → 明确它是删除前回退门禁；五平台证据齐全后立即执行第二阶段，不把第一阶段误报为 A-06 完成。
- [源码共享校验因缺平台资产误失败或虚假通过] → 共享校验只覆盖共享运行时；平台成品校验必须在实际外部成品上执行，两类清单和入口分离。
- [打包器接受错误平台或越界运行时源] → 两侧真实路径规范化、原生平台匹配、唯一平台目录、完整性与最终成品重算；外平台 Windows 样本显式使用 `path.win32`。
- [代理凭据泄漏] → 不序列化代理值，stdout/stderr 进入持久诊断前按环境值脱敏，测试使用带凭据代理样本断言日志与报告不含原值。
- [下载重试留下大目录] → 每次尝试使用独立子目录，失败精确删除；清理失败保留原错误并返回独立 cleanup 诊断。
- [Windows 文件句柄阻止原子发布] → 复用现有有界线性退避和原始错误保留；不使用 shell 或 `.cmd` 包装器。
- [大型 CI artifact 重新增加成本] → 普通工作流只上传报告；完整 marketplace 由用户本地准备或未来单独确认的人工发布流程交付。
- [五平台安装证据依赖 Codex CLI 可用性] → 人工运行固定官方版本，版本不匹配失败关闭；不使用认证或模型，任一平台缺报告就不提前删除 LFS。

## Migration Plan

1. 更新需求关联范围，建立 test-plan 并通过 plan 门禁。
2. 先补源/目标分离、网络失败、代理脱敏、平台打包注入和 CI 合同的失败回归。
3. 实现外部暂存平台构建、总准备入口与平台打包注入，保持旧 LFS 主路径可回退。
4. 运行平台聚焦、仓库治理、全量、结构、统一验证、validators 和 Vue 3 + Vite fixture；在当前 macOS ARM64 生成并安装本地 marketplace，断网执行真实 UI Review 冒烟。
5. 使用 WebStorm 提交并推送第一阶段；同一 SHA 的 shared 与五平台任务全部成功后记录 V-06，再人工触发同一矩阵的安装证据开关收集五个平台小型报告。
6. 只有 V-05 五平台安装证据齐全，才删除 HEAD 平台资产、LFS 规则和旧占位代码，更新文档、规格与退役门禁。
7. 再次运行完整本地验证，使用 WebStorm 提交并推送第二阶段；最终 SHA 的六任务 CI 全部成功后进入完成归档。
8. 若第二阶段失败，恢复到第一阶段已验证提交；若第一阶段失败，恢复现有 LFS 交付链，不删除测试中新增的稳定根因定位。

## Open Questions

无。若实施期间发现 Codex marketplace 安装行为与当前 CLI 合同不一致，属于接口兼容变化，必须先修订需求和本设计，不能在代码中猜测降级。
