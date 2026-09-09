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

1. Read applicable `AGENTS.md` and current worktree status. Run the internal engine's list command with JSON output when a local planning root exists; do not initialize one for exploration or a status question.
2. Infer the requested stage from intent and active changes before loading stage-specific material. Ask only when multiple changes remain plausible or a material decision is unresolved. Never invent a second change for work already represented by an active change.
3. Explore and status requests read only evidence needed for the question. For Plan, Revise or Implement, read the selected requirement and the relevant Wayfinder, source/callers/tests. Use the interaction-state matrix and test-file strategy in `../../references/requirement-guidelines.md` when planning affected behavior or tests. Read the complete dependency profile only when the affected dependency chain needs it; declarations alone do not prove usage or compatibility.
4. Validate the selected requirement at plan stage before planning, and at implement stage before editing. When the affected chain includes CI, filesystem paths, temporary directories, child processes, package-manager entrypoints, environment variables or machine-readable diagnostics, classify it as a cross-platform risk, read `../../references/cross-platform-ci-checklist.md` and record triggers and affected platforms.

Already-read policy need not be loaded again within the same task. Reuse project findings only for the same root and selected change after checking relevant files for changes; reread affected content after user edits, revisions or uncertain freshness. This does not skip runtime-required context, stage validators, evidence integrity checks or verification the user explicitly asks to rerun.

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
- Summarize the acceptance boundary when the plan is ready. If the user requested planning only, stop. If implementation is already authorized in this conversation, continue to Implement without requiring another start request; unresolved material decisions still block dependent work.

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
- Use the current interaction-state matrix when selecting tests, rereading it after relevant revisions. Implement covered initial, user-action, refresh, empty, error and lifecycle cases; revise the requirement when actual impact differs.
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
   Multiple local correction rounds share one delivery CI gate: keep external CI records planned or pending while edits continue, and do not require a commit or CI run after each round. Run the matrix for the final candidate revision; any later relevant edit invalidates that result.
5. Stop this subflow and return to Revise if the correction needs a new or changed `D-*` or `A-*`, changes behavior or scope, cannot remain bounded, or materially affects a shared/public contract, API, authentication, permission, security or sensitive data, persistence, dependency, build, deployment, CI, or platform compatibility. Preserve the safe investigation and verification already completed instead of repeating it.

### Verify

Use when implementation needs validation or the user asks to verify. Read `../../references/change-verification.md` if not already loaded, then only the selected verification plan and affected evidence.

1. Check required records against current source, requirement and test-plan semantics. Reuse valid results; execute missing, stale, affected or explicitly requested rechecks through `verification-evidence.mjs` when machine evidence is required. Keep focused, full, manual and external results distinct.
2. Record actual results in `V-*`; check acceptance boxes only when their mapped assertions passed, then set the requirement to `待验证`. For `test_plan: required`, update the plan to `已验证` only after its cases passed and run its complete validator.
3. For `verification_evidence: required`, generate automatic passing V-* schema v2 manifests here and reference the same-ID JSON. External references without an independent remote receipt stay `external-recorded` and cannot satisfy a trusted automatic pass.
4. If validation finds an implementation defect, use the correction subflow or Revise according to its boundary. Continue to Complete when finalization is authorized and all required evidence is valid.

### Complete

Use when verified implementation is ready and finalization is within the user's request.

1. Confirm required tasks, acceptance scenarios and verification records are complete. Missing or stale evidence returns to Verify; unresolved behavior returns to Revise.
2. Completion only reads and recomputes evidence identity, requirement/test-plan semantics, workspace freshness and persisted log/artifact integrity; it must not rerun project tests, builds, browsers or external CI. Preserve the existing test-plan and verification-evidence completion gates.
3. Preview the hard-gated completion with `node "<plugin-root>/scripts/finalize-change.mjs" --target <repository-root> --requirement <requirement-path> --change <change-name>`. The preview reads archive context/guidance, checks the planning root, requires `isPlanningComplete=true` (with `isComplete` only as a legacy response fallback), and accepts only done artifacts or a requirement-authorized specs skipped state. If it fails, stop: do not synchronize specifications or archive the change.
4. When completion and archiving are within the user's request, repeat the same command with `--write`. The wrapper performs precomplete validation, strict OpenSpec validation, spec synchronization and archive movement without exposing skip flags. It then rewrites active evidence references to the engine's actual archive name, atomically updates the requirement, and runs a read-only complete audit from the archived path.
   If archive movement succeeds but requirement writing or the post-archive audit fails, report `archive_partial_failure`, its actual archive target and recovery arguments. A recovery run must not add another date, move the archive again or rerun project commands.
5. Lead with completion or recovery status and any blocker. Link the requirement, archive and verification evidence; summarize synchronized capabilities and material residual risk without replaying the full execution history.

## State Rules

- A defined change request with no matching active change defaults to Plan; read-only analysis takes precedence over this default.
- "先看看"、"分析一下" or unclear intent defaults to Explore.
- "修改方案"、"补充需求" or changed decisions defaults to Revise.
- "开始开发"、"继续实现" or incomplete tasks defaults to Implement.
- A request to correct an implementation, static-analysis, review, focused-test, or CI failure in one matching active change uses the Implement correction subflow only when all of its entry facts hold; otherwise keep the current normal stage or return to Revise.
- "验证"、"复验" defaults to Verify. "完成"、"收尾"、"同步并归档" routes through Verify only for missing or stale evidence, then Complete.
- A status question is read-only: run the project checker and, when a requirement/change is selected, `check-change.mjs`; show the active stage, completed artifacts, remaining tasks, blockers, and next safe action.
- Treat artifact `done` as complete. Treat specs `skipped` as complete only when `.openspec.yaml` and the linked requirement decision authorize it; ready, blocked, unknown and all other skipped states are blockers.

## Guardrails

- Keep `requirements/REQ-*.md` as the human-readable requirement entry and preserve its relationship to the internal change.
- Keep planning artifacts under `openspec/changes/`; do not duplicate them into additional management files.
- Never overwrite project-owned rules, requirements, specifications, or source code outside the selected change scope.
- Do not expose internal skill names or require users to understand the underlying engine command set.
- Report only commands and checks that actually ran.
- Before selecting tests or planning test files, read `../../references/change-verification.md`; use it again in Verify only when the policy is not already loaded. Complete consumes evidence and does not reload implementation context.
