## 1. 终端画像行为

- [x] 1.1 新建 `tests/project-target-profile.test.mjs`，先覆盖桌面、移动、混合、未知和误导目录名场景。（D-03、D-07；A-01、A-02）
- [x] 1.2 新增集中式终端画像纯函数，使用最小桌面/移动依赖集合生成稳定 `formFactor`、`source` 和有序 `evidence`。（D-03、D-04、D-06；A-01、A-02、A-04）
- [x] 1.3 将终端画像接入项目识别和项目检查的增量 JSON 输出，保持既有字段兼容。（D-04、D-05；A-01、A-03）

## 2. 需求与变更上下文

- [x] 2.1 为初始化变量增加终端类型、来源和证据，并同步到 AGENTS、Wayfinder 与 OpenSpec 受管模板。（D-01、D-05、D-06；A-03、A-04）
- [x] 2.2 扩展专用测试，覆盖初始化预览/写入、依赖变化后的显式升级、项目检查和自定义内容保留。（D-05、D-07；A-03）
- [x] 2.3 更新项目识别参考规则，明确证据集合、mixed/unknown 语义及本轮小程序排除边界。（D-02、D-03、D-06；A-02、A-04）

## 3. 验证与发布

- [x] 3.1 运行 `node --test tests/project-target-profile.test.mjs`，核对机器字段、模板输出和兼容边界。（D-07、D-08；A-01、A-02、A-03）
- [x] 3.2 按插件开发流程刷新单一 cachebuster，运行 `npm run verify` 和官方 skill/plugin validator。（D-06、D-08；A-04）
- [x] 3.3 重新安装本地插件并核对安装缓存中的 manifest、终端画像源码和专用测试结果。（D-05、D-08；A-03、A-04）
- [x] 3.4 更新需求验收、验证记录和状态，执行完成门禁并同步归档 `project-target-profile` 规格。（D-01、D-02、D-08；A-01、A-02、A-03、A-04）
