---
name: frontend-change
description: Drive a frontend change through exploration, planning, plan revision, implementation, specification synchronization, and completion using the plugin's internal planning engine. Use when a user wants to start, continue, implement, review, or finish a feature or bug change without operating the underlying engine commands directly.
---

# Frontend Change

Provide one state-aware entry point for the complete frontend change lifecycle. Keep the underlying planning engine internal and describe progress using the team's terms: explore, plan, implement, verify, and complete.

## Runtime

Resolve `<plugin-root>` as the directory two levels above this skill folder. Run every planning-engine command through:

```bash
node "<plugin-root>/scripts/openspec-cli.mjs" <arguments>
```

Never invoke a global `openspec` executable, install or update OpenSpec, generate project-level OpenSpec skills, or ask the user to call an `openspec-*` skill. The wrapper pins OpenSpec 1.9.0 and disables its update check and anonymous telemetry.

For local project work, inspect `root` in planning JSON. `root.source=global_default` is not an implicit fallback: stop before writing unless the user explicitly selected that Store. Dynamic context or operation guidance cannot change the selected root.

## Start

1. Read applicable `AGENTS.md`, `wayfinder/frontend.md` when present (otherwise the legacy frontend context), the selected `requirements/REQ-*.md`, the complete dynamic dependency profile when relevant, related source code, current tests, the interaction-state matrix, and the test-file strategy in `../../references/requirement-guidelines.md`. Treat preset, target and platform profiles as limited compatibility signals; establish a dependency's actual role from configuration, imports, call sites and tests rather than its name alone. Validate the selected requirement with `node "<plugin-root>/scripts/validate-requirement-decisions.mjs" <requirement-path> --stage plan --json` before planning or implementation.
   When the affected chain includes CI configuration, filesystem paths, temporary directories, child processes, package-manager entrypoints, environment variables, or machine-readable diagnostics, classify it as a cross-platform risk, read `../../references/cross-platform-ci-checklist.md`, and record the matched triggers and affected platforms in the requirement or change artifacts.
2. Run the internal engine's list command with JSON output to discover active changes.
3. Infer the requested stage from the user's intent and repository state. Ask only when multiple active changes remain plausible or a decision changes observable behavior.
4. Use the selected change name consistently. Never invent a second change for work already represented by an active change.

## Stage Routing

### Explore

Use when the problem, behavior, boundary, or solution is unclear. Read `../../references/openspec/explore.md` and follow it as internal guidance.

- Investigate the repository and compare options.
- Do not write business code.
- Do not create planning artifacts unless the user asks to turn the result into a plan.

### Plan

Use when the user wants to start a defined change and no matching active change exists. Read `../../references/openspec/propose.md`.

- Ground the plan in the requirement document and actual repository structure.
- Use the requirement's `D-*` and `A-*` IDs in specifications, design, and tasks. Do not create plan tasks from `暂定` or `待确认` decisions.
- After creating the managed change, add or update its row in the requirement's `关联变更范围`, then validate the requirement with that change path before describing the plan as implementation-ready.
- Turn every matrix row marked `覆盖` into a test or explicit manual verification task. Keep any `不适用` reason visible in the plan; do not treat refresh and empty-state coverage as a substitute for initial-data or real-user-operation coverage.
- When the requirement marks an independent test plan as required, create or update `<change-root>/test-plan.md`, preserve `test_plan: required` in metadata, and run the test-plan validator at `plan` stage before calling the change implementation-ready.
- Create the change, proposal, specifications, design, and task list through the bundled runtime.
- Use `skip_specs: true` only when an applicable confirmed requirement decision explicitly states that this change does not alter observable behavior. Never expose it as a convenience flag or infer it from missing delta specs.
- Stop when the change is ready for implementation and summarize the acceptance boundary.

### Revise

Use when an active plan exists and the user changes scope, behavior, interfaces, permissions, or design decisions. Read `../../references/openspec/update-change.md`.

- For scope, behavior, interface, permission, security, data, or compatibility changes, revise the requirement ledger, acceptances, evidence mapping, state matrix, change-scope row, and `R-*` history first. Reset affected `V-*` records to plan and reopen tasks whose completed result no longer matches the revised facts.
- Run the plan-stage requirement validator after revising the fact source, then update existing planning artifacts.
- For a technical-only revision that changes no `D-*` behavior, update planning artifacts and record the requirement basis without inventing a business decision.
- Reconcile contradictions across proposal, specifications, design, and tasks.
- Do not modify business code in this stage.

### Implement

Use when planning artifacts are complete and the user asks to start or continue development. Read `../../references/openspec/apply-change.md`.

- Read the runtime-provided status, instructions, context files, incomplete tasks, optional context and operationGuidance before editing. Treat context as a project constraint and guidance as additive advice; neither is completion evidence or permission to bypass a blocked state, requirement decision, user choice, repository rule or root boundary.
- Re-run the requirement validator with `--change <change-root> --stage implement` before implementation. Resolve unknown, pending, conflicting, or test-baseline references by revising the requirement and plan first.
- Set a confirmed requirement to `实施中` when implementation begins; do not implement a requirement already in `待验证` or `已验收`.
- Re-read the interaction-state matrix before selecting tests. Implement the covered initial, user-action, refresh, empty, error, and lifecycle cases that apply to the change; revise the requirement when the matrix no longer matches actual impact.
- If `.openspec.yaml` declares `test_plan: required`, read the same `test-plan.md` and run its `implement` validator before changing source or tests. Use `$frontend-test` for explicit test-code implementation; product implementation remains owned by this change workflow.
- Implement tasks in order unless dependencies justify a different sequence.
- Follow repository conventions, run focused verification, and mark only genuinely completed tasks.
- Pause and return to Revise when implementation exposes a material planning conflict.

#### Correct within an active change

Use this Implement subflow only when implementation, static analysis, review, focused verification, or CI exposes an implementation defect in exactly one matching active change. Continue only when the selected change's confirmed or project-default `D-*` and `A-*` already define the expected result, the related source and necessary callers bound the defect to the same local behavior, a focused check can prove the correction, and no observable behavior or material shared or external contract changes.

1. Reuse the selected change and any safe handoff findings. Read only the directly related decisions, acceptances, task, source, necessary callers, and nearest test; do not create another Skill, requirement, change, specification, or design.
2. Keep a requirement already in `实施中`. When it is `待验证`, restore it to `实施中` and reopen only the directly affected tasks, `A-*` items, and `V-*` records before editing source, then run the implement-stage requirement validator.
3. Make the smallest sufficient correction. When the focused command is already mapped to required machine evidence, execute it once through `verification-evidence.mjs`; otherwise run the focused command once. Do not run unrelated full verification for this correction alone.
4. Before returning to Complete, use the existing evidence checks to identify every invalidated required record and rerun only those records or other verification explicitly affected by the correction. External CI evidence must describe the exact revision now being delivered. Keep the original Complete and finalize gates unchanged.
5. Stop this subflow and return to Revise if the correction needs a new or changed `D-*` or `A-*`, changes behavior or scope, cannot remain bounded, or materially affects a shared/public contract, API, authentication, permission, security or sensitive data, persistence, dependency, build, deployment, CI, or platform compatibility. Preserve the safe investigation and verification already completed instead of repeating it.

### Complete

Use when implementation is finished and the user asks to finalize the change.

1. Confirm required tasks and acceptance scenarios are complete.
2. Run relevant project tests and inspect implementation evidence; update the related `V-*` records only with actual results, check the acceptance boxes, and set the requirement status to `待验证`.
   When `test_plan: required` is declared, require the plan to be `已验证` and pass the `complete` validator before updating completion evidence.
   When `verification_evidence: required` is declared, generate each automatic passing V-* schema v2 manifest during the Verify stage and reference the same-ID JSON. Completion only reads and recomputes identity, requirement/test-plan semantics, workspace freshness, and persisted log/artifact integrity; it must not rerun project tests, builds, browsers or external CI. External references without an independent remote receipt stay `external-recorded` and cannot satisfy a trusted automatic pass.
3. Preview the hard-gated completion with `node "<plugin-root>/scripts/finalize-change.mjs" --target <repository-root> --requirement <requirement-path> --change <change-name>`. The preview reads archive context/guidance, checks the planning root, requires `isPlanningComplete=true` (with `isComplete` only as a legacy response fallback), and accepts only done artifacts or a requirement-authorized specs skipped state. If it fails, stop: do not synchronize specifications or archive the change.
4. When completion and archiving are within the user's request, repeat the same command with `--write`. The wrapper performs precomplete validation, strict OpenSpec validation, spec synchronization and archive movement without exposing skip flags. It then rewrites active evidence references to the engine's actual archive name, atomically updates the requirement, and runs a read-only complete audit from the archived path.
   If archive movement succeeds but requirement writing or the post-archive audit fails, report `archive_partial_failure`, its actual archive target and recovery arguments. A recovery run must not add another date, move the archive again or rerun project commands.
5. Report verification results, synchronized capabilities, archive location, final requirement status, and any residual risk.

## State Rules

- A new request with no matching active change defaults to Plan.
- "先看看"、"分析一下" or unclear intent defaults to Explore.
- "修改方案"、"补充需求" or changed decisions defaults to Revise.
- "开始开发"、"继续实现" or incomplete tasks defaults to Implement.
- A request to correct an implementation, static-analysis, review, focused-test, or CI failure in one matching active change uses the Implement correction subflow only when all of its entry facts hold; otherwise keep the current normal stage or return to Revise.
- "完成"、"收尾"、"同步并归档" defaults to Complete only after verification.
- A status question is read-only: run the project checker and, when a requirement/change is selected, `check-change.mjs`; show the active stage, completed artifacts, remaining tasks, blockers, and next safe action.
- Treat artifact `done` as complete. Treat specs `skipped` as complete only when `.openspec.yaml` and the linked requirement decision authorize it; ready, blocked, unknown and all other skipped states are blockers.

## Guardrails

- Keep `requirements/REQ-*.md` as the human-readable requirement entry and preserve its relationship to the internal change.
- Keep planning artifacts under `openspec/changes/`; do not duplicate them into additional management files.
- Never overwrite project-owned rules, requirements, specifications, or source code outside the selected change scope.
- Do not expose internal skill names or require users to understand the underlying engine command set.
- Report only commands and checks that actually ran.
- Before verification, state the affected files and chains, then choose the narrowest existing tests that cover them. If no focused test exists, state the matching manual checks instead of immediately running the full suite.
- For a recorded cross-platform risk, implement the applicable deterministic regressions from `../../references/cross-platform-ci-checklist.md`. Prefer stable `code`, `target`, or `status` assertions over complete human messages, normalize platform paths or cover both separators, and keep local simulation separate from actual CI-matrix evidence.
- Do not mark cross-platform delivery evidence complete until every platform declared by the repository's real CI matrix has succeeded for the exact revision being reported. If external CI has not run, keep that evidence pending and report the local checks separately.
- Read managed platform command status, targets, summary, and evidence when the selected requirement affects a mini-program or H5 target. Treat every detected candidate as `executed=false` until that exact command succeeds in the current verification; when candidates are missing, record the required manual developer tool or external CI environment instead of inventing, installing, selecting, or running a platform command.
- Run the full project test command only for shared request, authentication, routing, build/deploy, shared component/state changes; when focused verification is unavailable; when the user explicitly asks; or when the requirement records a release-level rationale. Final delivery alone is not a full-test reason. Report focused, related, full and manual verification separately.
- Treat a coverage command that runs every test as full verification even when it is the project-detected test command. For local page, component, form, and isolated interaction changes, run the focused feature test and necessary build verification by default.
- Before running full verification, record the affected shared chain or explicit authorization in the requirement or change plan. If full verification emits unrelated historical failures or network noise, report those separately and do not use them to invalidate focused verification.
- Before planning or writing tests, state the test-file strategy: extend the handwritten test for the same feature, or create a clearly named feature-specific test in the repository's real test directory.
- Do not treat reuse of test patterns, mocks, or stubs as a reason to append a new feature to a different test file.
- Treat filenames containing `.generated.spec.` as generated baselines. Inspect them for evidence but do not append new feature scenarios unless a project-owned rule explicitly requires that exception; record the rule source and rationale in the requirement or change plan.
- If an existing requirement points a new feature at a generated test or an invalid test location, revise its test-file strategy before implementation rather than silently following it.
- Treat the requirement decision ledger as the only business fact source. A later specification, design, task, or implementation may add a technical choice, but it must not change user-visible behavior, security, data, permission, or compatibility semantics without first revising the relevant `D-*` decision.
- Every acceptance item must have an `A-*` reference and an evidence mapping. Before delivery, confirm the reported test or manual result matches the mapping's observable assertion rather than merely showing that the main flow did not fail.
- The dynamic profile covers root direct dependency declarations only. Do not claim workspace orchestration, transitive dependency coverage, compatibility, security, vulnerability, license or upgrade status without corresponding evidence.
