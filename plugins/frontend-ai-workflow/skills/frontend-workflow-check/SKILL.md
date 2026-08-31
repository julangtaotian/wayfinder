---
name: frontend-workflow-check
description: Audit a frontend repository's shared AI workflow without modifying files. Use when a user asks whether onboarding is complete, the internal planning engine is healthy, project commands are real, workflow files are present, or an initialization or upgrade needs verification.
---

# Check Frontend AI Workflow

Perform a read-only audit of the target repository.

## Workflow

1. Read applicable `AGENTS.md` files and determine the repository root.
2. Run:

   ```bash
   node <plugin-root>/scripts/check-project.mjs --target <repository-root> --summary
   ```

3. Parse the summary into errors, warnings, the full dynamic root dependency profile, detected commands, command evidence, platform command candidates, workflow layout/version, plugin repository category, migration state, analysis freshness, validation evidence, historical verification-evidence counts, sampled static observations, completed-but-active changes, and planning-engine status.
4. Only when a non-zero historical count and the user's question require exact targets, query that code without loading unrelated diagnostics:

   ```bash
   node <plugin-root>/scripts/check-project.mjs --target <repository-root> --diagnostic-code <code>
   ```

   Diagnostic queries return at most 20 items. When `nextOffset` is non-null and more targets are necessary, request the next page with `--diagnostic-offset <nextOffset>`; use `--diagnostic-limit` only to lower or raise the page size within 1-100.
5. Run the original command without `--summary` only when the summary and paged diagnostic queries do not contain a fact required by the user's audit. Do not use the full report by default.
6. When the user selects a requirement and active change, also run:

   ```bash
   node <plugin-root>/scripts/check-change.mjs --target <repository-root> --requirement <requirement-path> --change <change-name> --stage implement
   ```

7. For a delivery-readiness question, use `--stage precomplete` instead. This remains read-only and checks requirement state, acceptance/task completion, persistent evidence, strict OpenSpec validity, and archive-target availability.
8. Inspect reported files directly when an error is ambiguous.
9. Report the smallest corrective action for each error. Do not apply fixes unless the user asks.

## Interpretation

- Missing required workflow files are errors.
- `repositoryKind: plugin-repository` 仅在根 `.agents/plugins/marketplace.json` 含有至少一个 `source.source=local` 条目时出现。此时应优先读取 `pluginRepository.status`、本地插件条目和插件命令事实；`healthy` 表示业务项目专属的工作流文件、深度分析和构建/lint/类型检查不适用，不能把这些缺项报告成插件错误。
- `pluginRepository.status: invalid` 是失败关闭结果。先按嵌套 `pluginRepository.diagnostics` 的稳定 `code`、`status` 和 `target` 定位 marketplace、本地插件目录、manifest 或技能目录；中文 `message` 只用于解释。不要从原始不安全路径推断文件位置。
- 插件仓库摘要最多显示 20 个插件和 20 条插件诊断，同时给出总数、显示数、遗漏数和状态/诊断计数。只有用户需要被省略的条目或完整事实时，才运行不带 `--summary` 的检查；历史诊断分页查询不用于读取插件仓库诊断。
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
- `verificationEvidenceAudit.executed` is always false. Summary mode intentionally omits the diagnostics array; use `counts` first and query a specific non-zero code for exact targets. Report `legacy_markdown_evidence`, `stale_active_evidence_path`, and `external_evidence_unverified` as migration or trust-boundary warnings. Do not rewrite historical requirements or claim that external CI was remotely checked.
- `legacy` 布局是迁移提醒，不等同于工作流损坏；说明需要 Wayfinder 迁移，且不要把检查命令当作迁移命令。
- Existing business-code changes are context, not workflow failures.
- Preset, target and platform profiles are finite compatibility signals. Unknown or private dependencies that are absent from those profiles still remain visible in the dynamic dependency profile.

## Guardrails

- Never write files, install dependencies, or initialize the planning engine. The checker may execute its read-only bundled runtime.
- Never claim a command passed unless it was executed successfully.
- Never run `finalize-change.mjs --write` during a status or health-check request.
- Keep known baseline warnings separate from regressions.
