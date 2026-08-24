# 项目识别规则

## 识别顺序

1. 读取目标根目录的 `package.json`。
2. 动态收集根 `package.json` 的 dependencies、devDependencies、peerDependencies 和 optionalDependencies，生成完整 `dependencyProfile`；不得用内置白名单筛掉未知、私有或未来新增的包。
3. 将 dependencies、devDependencies 和 peerDependencies 作为有限兼容信号，根据平台框架证据、框架包和构建工具选择最接近的 preset；无 Vue/React 的原生微信小程序优先使用 `wechat-native`。
4. 根据 lockfile 判断包管理器。
5. 从非空 `package.json.scripts` 选择真实存在的开发、构建、测试、lint 和类型检查命令；npm 初始化生成的失败 test 占位脚本标记为 `placeholder`，不得作为可用测试入口。
6. 单独报告默认构建与交付构建：`build` 是默认构建，`build:prod`、`build:production` 或 `build:release` 是显式交付构建；缺少显式交付构建时才回退默认构建。
7. 仅当 `lint` 脚本文本包含已识别的静态检查工具时标记为“语义已验证”；未知包装命令只能报告“语义未验证”，不能据此声称静态检查已经可用。
8. 从非空 `package.json.scripts` 单独收集显式平台命令候选；不解析脚本内容、不自动选择或执行。
9. 检查常见页面、组件、请求、路由、状态和测试路径，仅记录实际存在的目录或文件。原生微信小程序允许将 `app.json` 记为路由与页面注册路径；仅当 `app.js` 同时存在 `App(...)` 和 `globalData` 结构时，才记为全局数据路径。
10. 终端画像只读取 `package.json` 中的终端型依赖证据；不根据目录名、项目名、CSS 或 viewport 猜测。
11. 平台框架画像只读取明确框架依赖和固定源配置组合；不递归搜索构建产物，也不读取或输出配置内容。

## Preset

- `vue3-vite`：存在 Vue 3 和 Vite。
- `vue2-vite`：存在 Vue 2 和 Vite。
- `vue-webpack`：存在 Vue 且使用 Webpack、Vue CLI 或缺少 Vite。
- `react-vite`：存在 React 和 Vite。
- `react-webpack`：存在 React 且使用 Webpack 或缺少 Vite。
- `wechat-native`：固定项目文件确认原生微信小程序，且依赖中没有 Vue 或 React。
- `generic-frontend`：存在 `package.json`，但不属于以上组合。

## 终端画像

- `desktop`：只匹配 Element Plus、Element UI、Ant Design 或 MUI 桌面依赖。
- `mobile`：只匹配 Vant、Vant Weapp、Ant Design Mobile 或 NutUI 移动依赖。
- `mixed`：桌面和移动依赖同时存在，只表示证据并存，不代表已经确认响应式布局。
- `unknown`：没有匹配依赖；保持未知，不将目录、样式或项目名称升级为事实。
- `source` 有证据时固定为 `package-dependencies`，否则为 `unknown`；`evidence` 只包含去重排序后的公开包名。

## 平台框架画像

- `wechat-native`：根目录同时存在 `app.json` 和 `project.config.json`，返回 `native-mini-program`。
- `uni-app`：依赖包含 `@dcloudio/uni-app` 或 `@dcloudio/vite-plugin-uni`，或者根目录、`src/` 中存在同层 `manifest.json` 与 `pages.json` 组合，返回 `cross-platform`。
- `taro`：依赖包含 `@tarojs/taro`、`@tarojs/cli`、`@tarojs/vite-runner` 或 `@tarojs/webpack5-runner`，返回 `cross-platform`。
- `remax`：依赖包含 `remax`，返回 `cross-platform`。
- 同时匹配多个不同框架时返回 `conflict`；没有强证据时返回 `unknown`。
- 来源只使用 `project-files`、`package-dependencies`、`package-and-project-files` 或 `unknown`；证据只记录固定相对路径和公开包名。

`cross-platform` 只表示项目具有对应框架证据，不代表微信、支付宝、H5 或其他具体发布目标已经配置、构建或验证。平台画像复用 `targetProfile.platform`，不新增框架专用命令、构建适配器或平行工作流；没有 `package.json` 的目录仍不属于当前项目识别范围。

## 平台命令证据

- 目标只包含 `wechat-mini-program`、`alipay-mini-program`、`h5`。
- 微信别名为 `weapp`、`mp-weixin`、`wechat`；支付宝别名为 `alipay`、`mp-alipay`；H5 别名为 `h5`。
- 开发动作只匹配 `dev`、`serve`、`start`，构建动作只匹配 `build`；动作与目标之间只支持 `:` 或 `-`。
- 只匹配名称完整且内容非空的 script；`prebuild:weapp`、`build:ios`、空脚本或仅在脚本内容中提及平台均不形成证据。
- `platformCommands.status=detected` 只表示候选存在；每个候选固定 `executed=false`，真实运行成功后才能由具体任务记录为通过。
- 同一目标的全部候选分别保存在 `devCandidates` 和 `buildCandidates`，识别层不选择默认值。
- 已识别平台框架但平台命令为 `missing` 时，检查只给非阻断警告；原生微信小程序应记录微信开发者工具或外部 CI 环境，其他平台记录实际人工开发工具或外部 CI 环境。普通 Web 项目缺失时保持安静空态。

识别结果只用于生成初始上下文，不得据此改变业务代码或安装依赖。

## 动态直接依赖画像

- `dependencyProfile` 只描述根 `package.json` 中合法、非空的直接依赖声明，保留依赖组和原始版本说明，并以稳定顺序输出完整 `packages`。
- 人类可读摘要最多展示 20 个包；`summary.status=truncated` 时必须同时给出总数、已展示数、遗漏数，并引导 AI 读取完整 `dependencyProfile.packages` 或根 `package.json`，不得把摘要截断误写成“只有这些依赖”。
- AI 判断依赖用途、框架角色、兼容性或影响链时，必须把完整依赖画像与真实配置、入口、导入和调用证据交叉核对。依赖已声明不等于已安装、已使用、兼容、安全、测试通过或发布可用。
- preset、终端画像和平台框架画像是有限的兼容与安全信号，不是全部技术栈目录，也不能替代动态依赖画像。
- 当前画像不递归 workspaces 或子应用，不读取 `node_modules` 和传递依赖，不联网查询注册表，也不分析漏洞、许可证或最新版本；这些能力必须单独验证并明确范围。
- 非法依赖组、包名或版本说明只产生稳定诊断并被忽略，不中断其他合法依赖的收集；诊断结论不得扩展为业务源码错误。
