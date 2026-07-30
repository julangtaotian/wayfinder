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

## Preset

- `vue3-vite`：存在 Vue 3 和 Vite。
- `vue2-vite`：存在 Vue 2 和 Vite。
- `vue-webpack`：存在 Vue 且使用 Webpack、Vue CLI 或缺少 Vite。
- `react-vite`：存在 React 和 Vite。
- `react-webpack`：存在 React 且使用 Webpack 或缺少 Vite。
- `generic-frontend`：存在 `package.json`，但不属于以上组合。

识别结果只用于生成初始上下文，不得据此改变业务代码或安装依赖。
