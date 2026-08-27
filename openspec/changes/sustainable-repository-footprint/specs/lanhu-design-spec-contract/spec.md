## ADDED Requirements

### Requirement: 精简 AI 规范必须成为唯一活动蓝湖交付

系统 MUST 仅将 `outputs/lanhu-ai-ui-spec/` 作为当前仓库的活动蓝湖 AI 输入合同；该目录 MUST 保留可执行 Markdown、本地必要资产和可解析索引，但 MUST NOT 包含历史验证工程、组件库构建产物、原始批量截图或三方对比矩阵。（D-01、D-02；A-01）

#### Scenario: AI 读取蓝湖规范

- **WHEN** AI 需要使用后台 UI 规则
- **THEN** 它 MUST 能仅通过 `outputs/lanhu-ai-ui-spec/` 定位规范、场景和本地引用，不读取已退役目录

#### Scenario: 仓库执行蓝湖规范检查

- **WHEN** 聚焦测试验证精简规范
- **THEN** 测试 MUST 检查 Markdown 索引、场景唯一性和本地引用，不要求历史截图或双组件库工程存在

### Requirement: 精确视觉事实必须只写入精简 AI 规范

后续经正式需求确认且影响真实 UI 的尺寸、间距、颜色、文案、初始状态、面板结构和图标显示值 MUST 直接写入精简 AI 规范，并 MUST 保持技术栈无关；验证外壳、组件库 DOM、截图位置和内部算法 MUST NOT 进入规范。（D-02；A-01）

#### Scenario: 新确认可见精确值

- **WHEN** 后续需求确认一个可见 UI 参数且当前规范尚未记录
- **THEN** 对应 AI Markdown MUST 写入数值、适用场景和事实来源，不再维护第二份镜像目录

#### Scenario: 参数只服务验证实现

- **WHEN** 参数只控制测试设施、证据采集或组件库适配
- **THEN** 系统 MUST NOT 把该参数写入通用 AI 规范

## REMOVED Requirements

### Requirement: 验收确认的精确视觉值必须回写到双目录规范

**Reason**: `outputs/lanhu-design-spec/` 的历史验证工程被退役，继续维护双份规范会重新引入漂移和大量证据依赖。（D-01、D-02；A-01）

**Migration**: 以 `outputs/lanhu-ai-ui-spec/` 为唯一活动规范，后续精确值直接写入该目录。

### Requirement: 规范交付文案必须使用通用后台名称

**Reason**: 原要求同时约束已退役的验证页面源码和静态构建产物；精简 AI 规范的通用命名由新活动合同继续约束。（D-01、D-02；A-01）

**Migration**: 只验证精简 AI 规范中的通用后台命名，不再保留验证页面和构建产物。

### Requirement: 响应式表单规范必须通过双组件库真实项目验证

**Reason**: 双组件库工程、五档历史截图和三方矩阵属于一次性验收资产，不再作为主仓持续交付合同。（D-01、D-02；A-01）

**Migration**: 保留已确认的响应式规则和左侧标签事实，以精简 Markdown 合同测试保证完整性；需要新的真实 UI 验证时由具体业务变更重新取证。

### Requirement: 响应式表单字段必须使用左侧标签结构

**Reason**: 原要求把通用布局事实与双组件库工程、十张截图和逐字段机器证据绑定；这些历史验证资产本轮退役。（D-01、D-02；A-01）

**Migration**: 左侧标签、约 12px 间距和响应式列数继续保留在 `outputs/lanhu-ai-ui-spec/foundations/responsive-form-layout.md`，由精简规范测试验证文本合同。
