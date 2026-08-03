## Context

现有 `project-target-profile.mjs` 集中生成第一轮 `formFactor/source/evidence`，`inspect-project.mjs` 再把画像传给检查、初始化和受管模板。第二轮继续沿用这条数据流，不创建新的识别入口。参见 `proposal.md` 与 `specs/project-target-profile/spec.md`。

当前目标仓库必须有 `package.json`，识别只使用 Node.js 标准库。初始化默认预览，升级只替换合法受管区块；这些约束保持不变。

## Goals / Non-Goals

**Goals:**

- 在第一轮字段不变的前提下，增加一个稳定、可追溯的平台子画像。
- 用少量固定文件组合补足没有框架依赖的微信原生和 uni-app 项目。
- 让项目上下文与需求整理规则消费同一事实。
- 保持检测确定性、只读性和可重复执行。

**Non-Goals:**

- 不解析 appid、密钥、平台列表或框架配置内容。
- 不扫描任意目录寻找生成产物，不推断实际发布平台。
- 不修改 preset、命令选择、项目根规则或构建流程。
- 不增加框架专用技能、命令、模板或外部工具。

## Decisions

### 决策一：平台画像嵌套在现有 targetProfile

保留第一轮对象的 `formFactor/source/evidence`，新增：

```json
{
  "platform": {
    "kind": "native-mini-program | cross-platform | conflict | unknown",
    "frameworks": ["wechat-native | uni-app | taro | remax"],
    "source": "project-files | package-dependencies | package-and-project-files | unknown",
    "evidence": ["file:<relative-path> | package:<name>"]
  }
}
```

这样现有调用方无需迁移，新字段也不会和 Web 终端形态混为一个枚举。（D-04、D-07）

备选方案是增加新的顶层 `platformProfile`，但这会产生两套画像入口和更多模板变量，不符合精简约束。

### 决策二：框架定义使用固定、最小证据表

- `wechat-native`：根目录 `app.json` 与 `project.config.json` 同时存在。
- `uni-app`：`@dcloudio/uni-app` 或 `@dcloudio/vite-plugin-uni`；也接受根目录或 `src/` 下 `manifest.json` 与 `pages.json` 的同层组合。
- `taro`：`@tarojs/taro`、`@tarojs/cli`、`@tarojs/vite-runner` 或 `@tarojs/webpack5-runner`。
- `remax`：`remax`。

文件检测只检查上述固定相对路径，不递归搜索 `dist`、构建输出或任意同名文件；依赖合并继续复用 dependencies、devDependencies 和 peerDependencies。（D-02、D-03）

备选方案是解析各框架完整配置和脚本，但会快速形成版本矩阵，且把“识别能力”扩大成“框架适配器”。

### 决策三：多框架不做优先级选择

每个框架先独立收集包与文件证据。没有匹配为 `unknown`；只有微信原生为 `native-mini-program`；只有一个跨端框架为 `cross-platform`；两个或以上不同框架统一为 `conflict`。框架按固定声明顺序输出，证据按字符串排序。（D-04、D-05）

即使多个依赖属于同一框架，也只输出一个框架；同时存在包和文件证据时来源为 `package-and-project-files`。

### 决策四：上下文使用扁平模板变量，规则只做条件提醒

初始化渲染平台类型、框架、来源和证据四个变量，写入 AGENTS、Wayfinder meta 与 OpenSpec context。`requirement-guidelines.md` 增加条件化规则：检测到平台框架才核对生命周期、导航、权限、存储、网络和构建；跨端画像不等于具体平台已验证。（D-01、D-06）

不修改通用需求模板结构，避免每个 Web 需求都增加小程序空章节。

### 决策五：测试与发布保持独立证据

新建 `tests/project-platform-profile.test.mjs` 覆盖包证据、固定文件组合、未知、冲突、误导路径、初始化、升级和检查。第一轮测试当前尚未进入 Git 基线，因此不把它记为可复用文件。（D-08）

共享识别、模板和规则会影响所有 fixture，聚焦通过后执行统一完整门禁、官方插件/技能校验与本地重装核对。（D-09）

## Risks / Trade-offs

- [固定文件组合遗漏非标准目录] → 返回 `unknown` 并披露证据边界，不递归扫描或猜测。
- [框架依赖存在但项目只构建 H5] → 只报告 `cross-platform`，明确不证明具体发布目标。
- [生成目录带来假阳性] → 只检查根目录和 `src/` 固定源配置，不扫描 `dist`。
- [多框架仓库可能是合法 Monorepo] → 第二轮返回 `conflict`，不在本轮引入 Monorepo 包级编排。
- [受管模板字段增加] → 继续只替换受管区块，并用升级测试验证自定义内容保留。

## Migration Plan

1. 新增平台专用测试并固定数据契约。
2. 扩展集中式画像模块和项目识别调用，不改变第一轮字段。
3. 增加模板变量、受管上下文与条件化需求规则。
4. 运行聚焦测试、统一门禁和官方验证器。
5. 刷新一次 cachebuster，重装并核对本地插件副本。
6. 完成需求证据后同步主规格并归档变更。

回滚只需移除 `platform` 子对象及对应模板/规则内容，不涉及业务仓库数据迁移。
