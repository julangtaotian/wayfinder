# 修订后隔离 AI 还原输入证据

## 执行信息

- 执行日期：2026-07-27（Asia/Shanghai）
- 临时目录：`/private/tmp/lanhu-ai-validation-v2.dplal5`
- 模型：`gpt-5.6-terra`
- 推理强度：`high`
- Codex CLI：`0.146.0-alpha.3.1`
- 隔离会话：`019fa147-0873-72a1-a5f5-5c51986bee7b`
- 输入策略：`markdown-and-local-assets`
- 输入范围：`29` 份设计 Markdown、`1` 份图标资产清单、`6` 个透明 PNG 和 `TASK.md`
- 明确禁止：蓝湖链接与会话、参考画板、截图、既有 UI、其他项目代码、外部网络与生产接口
- 启动方式：在临时目录内启动全新的临时 Codex 进程，使用 `--ephemeral`、`--skip-git-repo-check`、`--ignore-user-config` 和 `workspace-write`
- 进程结果：退出码 `0`；5 个要求的主文件和 6 个图标均已落盘。进程内本地预览服务因隔离沙箱禁止绑定端口而未启动，但 JSON、JavaScript、计数、资产引用和外链检查均通过；浏览器验证由主流程独立执行。

## 输入哈希

`37` 个输入文件按相对路径排序后，以“路径 + 单文件 SHA-256”组成规范化清单；该清单的汇总 SHA-256 为：

`1791e2e774c5509be076df3935d6fb9316138e633a1ca753b5c9ffa74b06a580`

任务提示词 SHA-256：

`7860ec242909d7326acfb8dbe5d44a1709f81eae89f869278d24eef600ed850d`

本地图标的单文件 SHA-256 见[组件图标资产清单](../assets/icons/manifest.md)，隔离输入与输出图标哈希逐个一致。

## 输出哈希

| 文件 | SHA-256 |
| --- | --- |
| `app.js` | `0e12a3db8f780e6ed41e45c55651151c596c946d8050290955553ae29a77e17b` |
| `index.html` | `99d4b876837e0232c2b03a48022a8df483aa83be4245d33d4fee76f84f312cf8` |
| `isolation-run.md` | `f7badde1900fa1778ab941fb3717941e4ea6b813e1105727f071f6c8d5a71665` |
| `manifest.json` | `7f42df59707dba5f17dcf7aaa787d1b26a205c75429ecf4b84596f8f33ea6457` |
| `styles.css` | `a0a24f8058da5c2f4cfa8ca27777bb340badf1935349144fa0a7b348f327da31` |

## 独立模型的实现选择与歧义

- 隔离目录没有预装可用组件库且禁止联网，模型选择原生 HTML、CSS 与 JavaScript；这是实现选择，不是规范前提。
- 29 张来源画板都缺少完整宽高，`sourceWidth`、`sourceHeight` 保持 `null`。
- 字体族未指定，使用本地系统字体回退栈；字号与行高仍按规范值。
- 浮层和对话框必须保留层级分离，但阴影没有可复制参数；模型使用中性柔和阴影并明确不将其冒充蓝湖标注。
- 蓝湖未提供独立资产的搜索、清空、关闭、加减、日期、时间和部分方向图标使用语义等效实现；6 个已提供 PNG 均被复制并真实引用。
- 请求频率、竞态、卸载和生产接口没有被写成 UI 规范，仅实现加载、空态、失败及恢复等可见状态。
