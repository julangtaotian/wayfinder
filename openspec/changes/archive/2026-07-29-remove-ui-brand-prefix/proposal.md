## Why

当前两套 UI 规范、验证说明和验证页面仍保留项目品牌前缀，不适合作为可复用的通用后台 UI 规范交付。用户已明确要求移除相关品牌文案，因此需要同时清理源码和构建产物，避免入口改名后其他页面仍显示旧名称。

本变更执行需求决策 `D-18`，并以 `A-08` 作为完整性边界。

## What Changes

- 将两套规范入口统一改为“后台设计规范”和“后台 UI 还原规范（AI 输入版）”。
- 清理图标清单、验证说明、历史验证页以及 Element Plus、Element UI 验证页中的既有品牌前缀。
- 重新构建两套组件库验证页面，确保静态产物不残留旧文案。
- 扩展聚焦契约测试，扫描交付目录、验证源码和构建产物。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `lanhu-design-spec-contract`：增加“交付文案必须使用通用后台规范名称且构建产物不得残留旧品牌前缀”的契约。

## Impact

- 修改 `outputs/lanhu-design-spec/` 与 `outputs/lanhu-ai-ui-spec/` 中的入口文档、图标清单、验证说明和验证页面。
- 重新生成 `validation-element-plus/dist/` 与 `validation-element-ui/dist/`。
- 复用并扩展 `tests/lanhu-ui-reconstruction.test.mjs`。
- 不修改组件尺寸、颜色、场景 ID、交互、蓝湖链接或业务接口。
