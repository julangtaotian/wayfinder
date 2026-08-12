## Context

见 `proposal.md`。根 `.gitignore` 目前先忽略普通 `node_modules/`，再对两套插件内置运行时做递归反忽略；Playwright 随后重新忽略 `.bin/`，OpenSpec 没有对应规则。仓库还刻意跟踪运行时 `dist`、约 482.7 MiB 的 LFS Playwright 平台资产、约 64.1 MiB 的 `outputs` 验收证据以及 `.frontend-ui-review/runs`，因此不能套用通用前端项目的宽泛输出目录模板。

## Goals / Non-Goals

**Goals:**

- 用按职责分组且顺序明确的规则表达仓库提交边界。
- 让普通依赖保持忽略、两套离线运行时生产内容保持可提交、运行时可重建内容再次被忽略。
- 使用不创建真实垃圾文件的专用测试验证 Git 的最终匹配结果和关键索引资产。
- 保持插件功能版本、manifest、marketplace、LFS 和当前跟踪集合不变。

**Non-Goals:**

- 不把离线运行时改造成运行期下载，也不改变支持平台。
- 不迁移、压缩或删除历史验收证据。
- 不在本变更拆分大型脚本或测试文件。

## Decisions

### 1. 使用“默认忽略 → 精确反忽略 → 运行时二次忽略”的顺序

普通 `node_modules/` 继续默认忽略；OpenSpec 和 Playwright 的固定运行时路径继续用既有例外逐层允许；在例外之后分别声明 `.bin/`、`.DS_Store` 和缓存规则。已经受跟踪的 OpenSpec `.bin/node-which`、`.bin/yaml` 是指向生产包入口的可重建链接，不被 `runtime-integrity.mjs` 核验，也不由包装器调用，因此从仓库移除。这样新生产依赖仍可纳管，而包管理器生成的链接和系统文件不会因反忽略顺序重新出现。（D-01、D-04、D-05；A-02、A-03）

未采用单独白名单列举每个生产包，因为每次受控运行时升级都会改变依赖闭包，容易产生静默缺包；完整性清单已负责核验实际闭包。

### 2. 只添加低歧义的通用过滤，不忽略通用 `dist/` 或 `build/`

规则覆盖系统元数据、IDE 本机目录、交换/备份/临时文件、`.env`、包管理器缓存、常见工具缓存、TypeScript 增量文件、覆盖率、测试结果和 Playwright 报告。环境模板通过后置否定规则保留。（D-01～D-04；A-01）

不添加通用 `dist/`、`build/`、`output/`、`outputs/`、`.frontend-ui-review/`、`openspec/` 或 `requirements/` 规则，因为当前仓库将其中多类内容作为发布物或持久证据。

### 3. 新建独立的仓库卫生测试

`tests/repository-hygiene.test.mjs` 使用 Node.js 标准库调用 `git check-ignore -q --no-index` 判断不存在样例路径的最终忽略状态；失败时再读取 verbose 匹配信息形成诊断。测试另用 `git ls-files --error-unmatch` 或一次性索引清单确认代表性运行时、LFS、证据、需求和规格仍受跟踪。（D-06、D-07；A-01～A-05）

没有追加到 `tests/workflow.test.mjs`，因为提交边界是独立的仓库治理职责，不属于 OpenSpec 运行时生命周期。

### 4. 健康审查建议与本次实现解耦

本次只处理明确的过滤缺口。以下审查项留作独立需求，以免把可逆的 `.gitignore` 修改扩大为发布架构迁移：（D-08、D-09；A-06）

- 后续高价值：把 1239 行 `ui-review-workflow.mjs` 按配置、执行、状态和报告编排拆分，并同步拆分超过千行的核心测试。
- 后续成本优化：评估按平台发布 Playwright 资产，减少单次插件安装体积；必须先保留离线、macOS ARM 与 Linux x64 CI 合同。
- 暂不调整：OpenSpec 生产闭包、LFS 浏览器资产、`outputs` 和 `.frontend-ui-review/runs` 均有完整性、CI 或验收证据用途，不能仅因体积或生成属性过滤。

## Risks / Trade-offs

- [规则过宽导致合法配置不可提交] → 只纳入低歧义模式，保留 environment example，并对关键持久路径设置自动反例。
- [运行时反忽略顺序失效] → 用真实 `git check-ignore --no-index` 同时覆盖生产文件和 `.bin` 样例。
- [新增工具产生未知缓存] → 本次不猜测所有框架目录；后续按真实工作区证据增量补充。
- [全量测试成本较高] → 先运行毫秒级专用测试，再因提交边界是发布级共享规则执行一次全量验证。

## Migration Plan

1. 先加入专用测试，确认它能够暴露 OpenSpec `.bin` 与缺失通用规则。
2. 按分组重写 `.gitignore`，保持现有运行时例外和 LFS 规则不变。
3. 移除两个已受跟踪的 OpenSpec `.bin` 链接，再运行专用测试、`git status --short --ignored` 和当前索引核对，确认只有这两个可重建链接退出索引。
4. 运行全量仓库验证及官方 Plugin/Skill validators。
5. 回滚时恢复 `.gitignore`、专用测试和两个符号链接；本变更不删除生产包或迁移数据。
