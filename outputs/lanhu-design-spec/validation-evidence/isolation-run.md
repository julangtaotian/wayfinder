# 修订后隔离还原记录

## 输入边界

全新 AI 进程只读取修订后的 `spec/**/*.md`、`spec/assets/icons/*` 和隔离任务提示词。未读取蓝湖、参考画板、截图、旧验证 UI、仓库其他代码或网络内容。

## 结果

- 进程退出码：`0`
- 设计 Markdown：`29`
- 图标资产清单：`1`
- 本地图标：`6`
- 来源画板映射：`29`
- 组件视图：`25`
- 唯一场景：`159`
- 输入策略：`markdown-and-local-assets`
- 实现选择：原生 HTML、CSS、JavaScript

## 自检

- `manifest.json` 可解析，包含 29 个来源画板、25 个组件视图和 159 个唯一场景。
- `app.js` 通过 JavaScript 语法检查。
- 159 个场景都由带 `data-scenario-id` 的真实组件区域渲染，不只存在于 JSON。
- 6 个 PNG 均复制到 `validation-ui/assets/icons/`，文件哈希与设计资产一致，并全部在 UI 代码中引用。
- `index.html`、`styles.css`、`app.js` 不包含外部 HTTP/HTTPS 资源。
- HTML、CSS 和 JavaScript 不包含 AI 行数或工具来源统计注释。

隔离模型尝试启动本地预览服务时，端口绑定被隔离沙箱拒绝；这不影响生成结果。最终浏览器加载和可见状态检查由主流程在仓库内独立完成。
