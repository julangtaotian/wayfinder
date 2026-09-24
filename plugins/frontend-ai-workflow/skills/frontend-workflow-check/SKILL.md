---
name: frontend-workflow-check
description: Audit a frontend repository's shared workflow without modifying files, only when the user explicitly asks for workflow health, onboarding status, real project commands, managed files, or upgrade verification.
---

# Check Frontend AI Workflow

Perform a read-only audit of the target repository.

## Workflow

1. Read applicable `AGENTS.md` files and determine the repository root.
2. Run:

   ```bash
   node <plugin-root>/scripts/check-project.mjs --target <repository-root> --summary
   ```

3. Start with overall status, errors/warnings and the facts relevant to the question. Retain the summary’s dependency, command, platform, layout and analysis fields for interpretation below; do not expand every field into the user report.
4. Run the original command without `--summary` only when the summary does not contain a fact required by the user's audit. Do not use the full report by default.
5. When the user selects an active Complex change, also run:

   ```bash
   node <plugin-root>/scripts/check-change.mjs --target <repository-root> --change <change-name> --stage implement
   ```

6. For a delivery-readiness question, use `--stage precomplete` instead. This remains read-only and checks task completion, the bounded delivery verification result, strict OpenSpec validity and lifecycle completion readiness.
7. Inspect reported files directly when an error is ambiguous.
8. Report scope, conclusion, blockers and the smallest corrective action. State whether any project command actually ran. Zero warnings in a limited audit do not prove complete historical or delivery health. Do not apply fixes unless the user asks.

## Interpretation

- Missing required workflow files are errors.
- `repositoryKind: plugin-repository` 仅在根 `.agents/plugins/marketplace.json` 含有至少一个 `source.source=local` 条目时出现。此时应优先读取 `pluginRepository.status`、本地插件条目和插件命令事实；`healthy` 表示业务项目专属的工作流文件、深度分析和构建/lint/类型检查不适用，不能把这些缺项报告成插件错误。
- `pluginRepository.status: invalid` 是失败关闭结果。先按嵌套 `pluginRepository.diagnostics` 的稳定 `code`、`status` 和 `target` 定位 marketplace、本地插件目录、manifest 或技能目录；中文 `message` 只用于解释。不要从原始不安全路径推断文件位置。
- 插件仓库摘要最多显示 20 个插件和 20 条插件诊断，同时给出总数、显示数、遗漏数和状态/诊断计数。只有用户需要被省略的条目或完整事实时，才运行不带 `--summary` 的检查。
- `dependencyProfile.packages` is the complete root direct-dependency declaration for this audit; its human summary may be truncated. Report declaration facts separately from usage, installation, compatibility, safety and execution evidence. It does not cover workspaces, transitive packages, registry metadata, vulnerabilities or licenses.
- Missing optional lint or typecheck scripts are warnings, not invented commands.
- `commandSemantics` separates the default build from the delivery-build candidate and marks known failing test placeholders as `placeholder`. `commandEvidence.status: detected` only proves the script was found; `placeholder` is unavailable, and a command is passed only when `executed: true` comes from an actual successful run.
- `platformCommands.status: detected` only proves matching non-empty script names exist. Report their target, all development/build candidates, and evidence with `executed=false`; never describe a candidate as passed unless that exact command was run successfully. When an identified platform framework has no candidate, report the non-blocking warning and the need for a manual developer tool or external CI environment; for native WeChat mini programs, name WeChat DevTools explicitly.
- A lint status of `unverified` means the script name exists but its static-check behavior is not proven. Keep it as a warning and ask for project evidence before treating it as lint coverage.
- A missing or mismatched bundled planning runtime is a plugin integrity error.
- An unhealthy planning root is an error when its configuration exists.
- A stale Wayfinder fingerprint is a refresh warning, not permission to overwrite the project map.
- `deepAnalysis.analysis.status` separates a scope snapshot from a usable project map: `pending` means the map has not been produced, `partial` is not a complete context, and only `complete` with full coverage and all required map dimensions can be used as a complete project context. A deep refresh intentionally resets the status to `pending` until the analysis is rewritten.
- `deepAnalysis.validationEvidence` distinguishes performed file reading and hashing from syntax parsing, platform compilation, Lint and tests that were not run. Never turn `not-run` into a passing result.
- Summary mode reports `deepAnalysis.totalObservations`, `observationCounts`, at most five sampled `observations`, and `omittedObservations`. Report each `wxml-attribute-spacing` sample with path and line as a location to verify, not as a confirmed WXML syntax or platform compilation failure. Use the full report only when the audit explicitly requires every observation.
- Completed changes that remain active are workflow hygiene warnings; do not archive them without their selected requirement and delivery gate.
- `retired_workflow_state` 是失败关闭结果。当前版本不得读取或迁移旧格式；说明应使用匹配的历史插件版本，或由用户确认后显式删除报告中的退役路径。
- Existing business-code changes are context, not workflow failures.
- Preset, target and platform profiles are finite compatibility signals. Unknown or private dependencies that are absent from those profiles still remain visible in the dynamic dependency profile.

## Guardrails

- Never write files, install dependencies, or initialize the planning engine. The checker may execute its read-only bundled runtime.
- Never claim a command passed unless it was executed successfully.
- Never run `finalize-change.mjs --write` during a status or health-check request.
- Keep known baseline warnings separate from regressions.
