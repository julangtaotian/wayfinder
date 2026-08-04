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
   node <plugin-root>/scripts/check-project.mjs --target <repository-root>
   ```

3. Parse the report into errors, warnings, detected commands, command evidence, platform command candidates, workflow layout/version, migration state, analysis freshness, validation evidence, static observations, completed-but-active changes, and planning-engine status.
4. When the user selects a requirement and active change, also run:

   ```bash
   node <plugin-root>/scripts/check-change.mjs --target <repository-root> --requirement <requirement-path> --change <change-name> --stage implement
   ```

5. For a delivery-readiness question, use `--stage precomplete` instead. This remains read-only and checks requirement state, acceptance/task completion, persistent evidence, strict OpenSpec validity, and archive-target availability.
6. Inspect reported files directly when an error is ambiguous.
7. Report the smallest corrective action for each error. Do not apply fixes unless the user asks.

## Interpretation

- Missing required workflow files are errors.
- Missing optional lint or typecheck scripts are warnings, not invented commands.
- `commandSemantics` separates the default build from the delivery-build candidate and marks known failing test placeholders as `placeholder`. `commandEvidence.status: detected` only proves the script was found; `placeholder` is unavailable, and a command is passed only when `executed: true` comes from an actual successful run.
- `platformCommands.status: detected` only proves matching non-empty script names exist. Report their target, all development/build candidates, and evidence with `executed=false`; never describe a candidate as passed unless that exact command was run successfully. When an identified platform framework has no candidate, report the non-blocking warning and the need for a manual developer tool or external CI environment; for native WeChat mini programs, name WeChat DevTools explicitly.
- A lint status of `unverified` means the script name exists but its static-check behavior is not proven. Keep it as a warning and ask for project evidence before treating it as lint coverage.
- A missing or mismatched bundled planning runtime is a plugin integrity error.
- An unhealthy planning root is an error when its configuration exists.
- A stale Wayfinder fingerprint is a refresh warning, not permission to overwrite the project map.
- `deepAnalysis.validationEvidence` distinguishes performed file reading and hashing from syntax parsing, platform compilation, Lint and tests that were not run. Never turn `not-run` into a passing result.
- `deepAnalysis.observations` contains non-blocking static hints. Report `wxml-attribute-spacing` with its path and line as a location to verify, not as a confirmed WXML syntax or platform compilation failure.
- Completed changes that remain active are workflow hygiene warnings; do not archive them without their selected requirement and delivery gate.
- `legacy` 布局是迁移提醒，不等同于工作流损坏；说明需要 Wayfinder 迁移，且不要把检查命令当作迁移命令。
- Existing business-code changes are context, not workflow failures.

## Guardrails

- Never write files, install dependencies, or initialize the planning engine. The checker may execute its read-only bundled runtime.
- Never claim a command passed unless it was executed successfully.
- Never run `finalize-change.mjs --write` during a status or health-check request.
- Keep known baseline warnings separate from regressions.
