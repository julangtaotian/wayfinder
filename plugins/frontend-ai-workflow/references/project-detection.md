# 项目识别规则

## 识别顺序

1. 读取目标根目录的 `package.json`。
2. 合并 dependencies、devDependencies 和 peerDependencies。
3. 根据框架包和构建工具选择最接近的 preset。
4. 根据 lockfile 判断包管理器。
5. 从 `package.json.scripts` 选择真实存在的开发、构建、测试、lint 和类型检查命令。
6. 单独报告默认构建与交付构建：`build` 是默认构建，`build:prod`、`build:production` 或 `build:release` 是显式交付构建；缺少显式交付构建时才回退默认构建。
7. 仅当 `lint` 脚本文本包含已识别的静态检查工具时标记为“语义已验证”；未知包装命令只能报告“语义未验证”，不能据此声称静态检查已经可用。
8. 检查常见页面、组件、请求、路由、状态和测试目录，仅记录实际存在的路径。
9. 终端画像只读取 `package.json` 中的终端型依赖证据；不根据目录名、项目名、CSS 或 viewport 猜测。
10. 平台框架画像只读取明确框架依赖和固定源配置组合；不递归搜索构建产物，也不读取或输出配置内容。

## Preset

- `vue3-vite`：存在 Vue 3 和 Vite。
- `vue2-vite`：存在 Vue 2 和 Vite。
- `vue-webpack`：存在 Vue 且使用 Webpack、Vue CLI 或缺少 Vite。
- `react-vite`：存在 React 和 Vite。
- `react-webpack`：存在 React 且使用 Webpack 或缺少 Vite。
- `generic-frontend`：存在 `package.json`，但不属于以上组合。

## 终端画像

- `desktop`：只匹配 Element Plus、Element UI、Ant Design 或 MUI 桌面依赖。
- `mobile`：只匹配 Vant、Ant Design Mobile 或 NutUI 移动依赖。
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

识别结果只用于生成初始上下文，不得据此改变业务代码或安装依赖。
