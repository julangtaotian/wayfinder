## ADDED Requirements

### Requirement: 规范交付文案必须使用通用后台名称

系统 MUST 在两套 Markdown 规范、图标清单、验证说明、验证页面源码和静态构建产物中使用通用后台规范名称，不得保留既有品牌前缀。

本要求实现 `D-18`，并由 `A-08` 验证。

#### Scenario: 用户读取规范文档

- **WHEN** 用户打开设计规范或 AI 输入版 README、图标清单和验证说明
- **THEN** 标题与来源说明必须使用“后台设计规范”或“后台 UI 还原规范”等通用文案

#### Scenario: 用户打开验证页面

- **WHEN** 用户打开历史验证页、Element Plus 验证页或 Element UI 验证页
- **THEN** 页面标题和页头必须使用“后台组件还原”或“后台规范”等通用文案

#### Scenario: 重新生成静态产物

- **WHEN** 两套组件库验证页面执行生产构建
- **THEN** 生成的 HTML、JavaScript、JSON 和其他文本产物不得包含旧品牌前缀
