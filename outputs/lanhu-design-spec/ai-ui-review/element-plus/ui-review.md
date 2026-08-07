# AI UI 验收结果

- 项目：`validation-element-plus`
- 运行时：`Vue 3.5.40 + Element Plus 2.14.3`
- 页面：`http://127.0.0.1:4173/#button/SCN-BUTTON-01`
- 视口：`1440 × 900`，DPR `1`，缩放 `100%`
- 设计依据：`outputs/lanhu-design-spec/components/button.md：字号 / 行高 14px / 22px`
- 验收时间：`2026-08-05T07:37:04.521Z`
- 结果：需修改：发现 1 个高置信度节点问题。
- 交付问题：`1`；已过滤：`0`；已合并：`0`

## 本次覆盖范围

- Button 按钮 / SCN-BUTTON-01 基础填充按钮 / Default 状态
- 检查默认、主要、正确、信息、警告、危险六个真实按钮节点
- 核对高度、字号、行高、水平内边距、圆角、边框与默认语义色；验收页外壳不参与判定

## 已检查节点

- `[data-scenario-id="SCN-BUTTON-01"] .demo-row > .el-button`｜ValidationApp > ScenarioDemo(button) > .demo-row > .el-button[6]｜基础填充按钮组内的六个真实按钮节点｜`341, 249, 432 × 32`

## 问题清单

### UI-001：行高

- 节点：`[data-scenario-id="SCN-BUTTON-01"] .demo-row > .el-button`
- 组件路径：`ValidationApp > ScenarioDemo(button) > .demo-row > .el-button[6]`
- 节点文本或语义：`基础填充按钮组内的六个真实按钮节点`
- 页面位置：Button 页面左上角 SCN-BUTTON-01 场景卡片的按钮行
- 截图坐标：`341, 249, 432 × 32`
- 问题类型：字体
- 问题：六个填充按钮的计算行高均为 14px，与设计规范 22px 不一致。
- 当前值：`line-height: 14px`
- 目标值：`line-height: 22px`
- 修改要求：在按钮场景作用域为 .el-button 设置 line-height: 22px，并保持现有 32px 高度与垂直居中。
- 置信度：高

#### 源码修复指导

- 源码目标文件：`outputs/lanhu-design-spec/validation-element-plus/src/theme.css`
- 稳定代码锚点：`.scenario-demo .el-button`
- 当前样式来源：Element Plus 默认按钮样式提供 14px 计算行高；本地 `.scenario-demo .el-button` 已覆盖高度、内边距和圆角，但没有覆盖 `line-height`。
- 允许修改作用域：仅修复 `validation-element-plus` 中 `[data-scenario-id="SCN-BUTTON-01"] .demo-row > .el-button` 的行高；建议在稳定锚点附近增加场景级规则。
- 禁止修改范围：不要修改 `node_modules/element-plus`、全局 `.el-button`、Element UI 项目或其他未验收场景；不要改变现有 32px 高度、16px 水平内边距、2px 圆角和语义色。
- 建议修改：`[data-scenario-id="SCN-BUTTON-01"] .demo-row > .el-button { line-height: 22px; }`

#### 修复后复验

- 工作目录：`outputs/lanhu-design-spec/validation-element-plus`
- 页面：`http://127.0.0.1:4173/#button/SCN-BUTTON-01`
- 命令：
  - `npm run build`
- 通过断言：
  - 目标选择器仍匹配 6 个真实按钮节点。
  - 6 个按钮的计算样式 `line-height` 均为 `22px`。
  - 按钮高度仍为 `32px`，水平内边距仍为 `16px`，圆角仍为 `2px`。
  - 默认、主要、正确、信息、警告、危险六种按钮的现有语义色保持不变。
