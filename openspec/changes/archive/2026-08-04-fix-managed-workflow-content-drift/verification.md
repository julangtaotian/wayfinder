# 验证记录

## 聚焦验证

- 命令：`node --test tests/workflow.test.mjs tests/project-platform-profile.test.mjs`
- 结果：49/49 通过，0 失败。
- 覆盖：旧 Wayfinder facts 迁移、三文件同步、内容漂移空态/警告、深度刷新重复语义、WXML/WXSS/WXS 纳入与指纹变化。

## 完整验证

- 命令：`npm run verify`
- 结果：113/113 自动测试、22/22 OpenSpec 严格校验、插件结构、OpenSpec 1.7.0 和 76 个运行时包完整性全部通过。
- 官方验证器：源码与最终安装副本的 plugin validator 均通过，5 个 skill validator 均通过。

## 安装副本

- 版本：`0.11.0+codex.20260804012628`。
- 安装位置：本机 Codex 插件缓存中的 `frontend-ai-workflow` 对应版本目录。
- 冒烟：安装副本 OpenSpec 入口返回 `1.7.0`；源码与安装副本仅存在运行时 `.bin/node-which`、`.bin/yaml` 两个可重建链接差异，不影响内置入口运行。

## 目标微信小程序只读复核

- 目标：`ikang-mini-wechat-inspect`；全程 `write=false`，未修改目标项目。
- 当前识别：`wechat-native`；微信原生小程序、Vant Weapp ^1.9.1；页面 `pages`、组件 `components`、请求 `api`、路由 `app.json`、全局数据 `app.js`；`yarn test` 为 placeholder。
- 升级预览：AGENTS unchanged，`wayfinder/frontend.md` update，`openspec/config.yaml` update。
- 检查结果：受管内容 stale 文件与预览一致；范围版本变化使既有深度项目地图准确报告 stale；平台警告文案空格正确。
- 安全范围：共纳入 1040 个文件、4857164 bytes；其中 WXML 225 个、WXSS 231 个、WXS 46 个。仓库中的其余同扩展文件位于 `node_modules`，继续按排除目录处理。
- 输出边界：只记录项目画像、路径、数量、指纹和动作，没有输出 WXML/WXSS/WXS 源码或敏感配置值。
