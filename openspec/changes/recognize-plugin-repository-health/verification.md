# 验证记录：健康检查识别插件仓库

执行日期：2026-08-31

## V-01：专用回归

- 命令：`node --test tests/plugin-repository-health.test.mjs`
- 结果：6/6 通过。
- 覆盖：有效与多插件仓库、summary 上限、重复只读检查、损坏 JSON、名称与技能目录失配、POSIX/Windows 路径、符号链接和普通项目兼容。

## V-02：本地全量与结构验证

- `npm test`：188 通过、0 失败、8 个明确环境或平台跳过。
- `npm run validate`：通过；新增识别模块已列入发布资产清单。
- `npm run verify`：7 个阶段全部通过；体积门禁、自动测试、结构、严格 OpenSpec、归档 OpenSpec、运行时版本与完整性均成功。
- 当前本机 Codex CLI 未提供独立的 `plugin validate` 或 `skill validate` 子命令；现有 `npm run validate` 是本仓库用于 manifest 与自有 Skill 发布结构的校验入口，已通过。

## V-03：Vue 3 + Vite fixture

- 全量测试中的“Vue Vitest fixture 真实发现 TC，零测试失败且重复执行不改文件”通过。
- 覆盖现有 fixture 的初始化、重复执行、升级与健康检查兼容合同；本次插件识别本身不扩大该 fixture 的产品能力声明。

## V-04：当前插件仓库人工复核

- `check-project.mjs --target . --summary` 返回 `ok: true`、`repositoryKind: "plugin-repository"` 和唯一的本地插件条目。
- 未出现 Wayfinder、业务受管标记、构建、lint 或类型检查误报。
- 根级 `test` 与 `validate` 命令以未执行的事实呈现；检查不写入文件，也不读取运行时、outputs 或需求归档正文。

## V-05：提交后的 CI

- 待通过 WebStorm 提交并推送后，复核同一精确 SHA 的 shared 与 macOS ARM64/x64、Linux ARM64/x64、Windows x64 六项任务。
- 平台 UI 用例仅在已准备 Chromium 的平台成品中执行；共享源码验证会明确跳过，避免把固定运行时交付成本重新引入共享验证。
