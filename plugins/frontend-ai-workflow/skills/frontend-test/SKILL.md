---
name: frontend-test
description: Analyze frontend test coverage, create a traceable test plan for an active change, implement project-native tests when explicitly requested, and run focused verification with auditable evidence. Use when a user asks to analyze, generate, implement, verify, or recheck frontend test cases.
---

# Frontend Test

Provide one entry point for frontend test analysis, test-case planning, test implementation, and focused verification. Treat the requirement ledger as the business fact source and the active change's `test-plan.md` as its technical test derivative.

## Runtime

Resolve `<plugin-root>` as the directory two levels above this skill folder. Read `../../references/test-case-guidelines.md` completely before acting. Use only these plugin scripts for deterministic inspection and validation:

```bash
node "<plugin-root>/scripts/inspect-test-context.mjs" --target <repository-root>
node "<plugin-root>/scripts/validate-test-plan.mjs" --plan <test-plan> --requirement <requirement> --change <change-root> --stage <plan|implement|complete>
node "<plugin-root>/scripts/verification-evidence.mjs" --target <repository-root> --change <change-name> --requirement <requirement> --evidence-id <V-ID> --locator "[TC-ID] <title>" [--artifact <path>] -- <executable> <arguments...>
```

The inspector and validators are read-only. The evidence command defaults to a zero-write preview; only `--write` executes its explicit argv and persists a passed manifest. Never install, update, or inject a test runner into the target project. Never replace the project's native command, fixture, mock, or assertion style with a plugin runtime.

## Intent Routing

- “分析、盘点、检查覆盖、还缺什么” routes to **Analyze** and is read-only.
- “形成、生成、整理测试用例或测试方案” routes to **Plan** and may write only the selected active change's test plan and metadata.
- “实现、补测试、写测试代码” routes to **Implement** and requires an explicit user request.
- “验证、运行、复验测试用例” routes to **Verify** and executes the recorded focused commands.
- A mixed request follows Analyze → Plan → Implement → Verify, but every later stage must pass its own gate. A blocked stage does not authorize skipping ahead.

## Analyze

1. Read applicable `AGENTS.md`, `wayfinder/frontend.md` when present, the selected requirement, active change artifacts, affected source, existing handwritten tests, and generated baselines.
2. Run the test-context inspector and report only observed command, runner, configuration, test-directory, file, Git, and compatibility evidence.
3. Map confirmed or project-default `D-*`, applicable `A-*`, specification scenarios, and the interaction-state matrix to coverage and gaps.
4. Do not create or modify files. Without a matching active change, stop after the read-only analysis and explain that persistent plans and test code require a managed change.

## Plan

1. Require one selected active change and its linked requirement. Validate the requirement at plan stage before creating test facts.
2. Copy `../../assets/templates/openspec/test-plan.md` to `<change-root>/test-plan.md` only when the file does not exist. Otherwise update the existing cases by stable `TC-*` identity; never replace unrelated content.
3. Set `test_plan: required` in `<change-root>/.openspec.yaml` while preserving all existing metadata.
4. Form every case only from executable decisions (`已确认` or `项目默认`), scoped acceptances, specification scenarios, interaction states, and actual repository evidence. New or contradictory behavior returns to requirement revision.
5. Prefer extending a Git-tracked handwritten test for the same feature. Otherwise choose a clearly named dedicated test in a discovered real test directory. Generated tests remain read-only baselines unless both project rules and the requirement explicitly authorize an exception.
6. Run the plan validator. Resolve every structural, reference, path, placeholder, and revision error before describing the plan as ready.

## Implement

1. Require an explicit request to write tests. Run the implement validator before editing.
2. Change only the target test files identified by applicable `TC-*`. Do not modify product source, package manifests, lockfiles, application configuration, or project-owned tests outside the selected cases.
3. Reuse the project's existing test runner, setup, fixtures, mocks, naming, and assertion conventions. Preserve `[TC-*]` in a stable test title or equivalent locator.
4. Locate an existing implementation by TC marker and observable scenario before writing. Re-running the workflow updates the same case rather than appending a duplicate.
5. If the project lacks a detected test command or evidence-backed test location, keep automatic cases blocked and form a visual or manual case where appropriate. Do not install dependencies.
6. If a test exposes a product defect, record `产品实现缺陷` and hand the result back to `$frontend-change`. Do not repair business code or weaken an accepted assertion from this entry point.

## Verify

1. Preview the narrowest recorded focused command with `verification-evidence.mjs`, inspect its normalized executable, working directory, V-* target and outputs target, then repeat with `--write` when execution is authorized. Do not promote a coverage or full-suite command to focused verification.
2. Require exit code 0 and at least one exact planned test-locator match. A zero-test result is blocked even when the process exits successfully, and a failed or zero-locator run must not overwrite an existing passed manifest.
3. Classify the actual outcome as one of: `通过`, `产品实现缺陷`, `测试设计错误`, `测试代码错误`, `需求歧义`, `环境阻塞`, or `历史无关失败`. Keep focused, related, full, visual, and manual evidence distinct.
4. Update a case and its `V-*` record to pass only after a real successful execution generated `openspec/changes/<change>/evidence/<V-ID>.json`; reference that JSON alongside any human-readable summary. Failed or unexecuted work remains explicit.
5. For visual cases, delegate browser capture and comparison to `$frontend-ui-review` and reference its page, viewport, scenario, run, and persisted artifacts. For other manual cases, record device or environment, operations, observable checks, and evidence paths.
6. Run the complete validator only after all applicable cases and verification records have valid passing evidence. The validator recalculates the selected requirement/test-plan semantic binding, workspace freshness, and every persisted log or artifact descriptor; it never reruns the recorded command.

## Guardrails

- Analysis is always read-only; Plan and Implement require the corresponding user intent.
- Never infer product behavior from implementation merely to make a test pass. Revise the requirement first when confirmed facts are missing or conflicting.
- Never modify business source, install dependencies, silently overwrite project tests, edit generated baselines by default, or claim an unexecuted command passed.
- Vue 3 + Vite + Vitest is the certified first-version fixture. Other runners receive evidence-based limited support and must not be described as fully certified.
- Only `test_plan: required` opts a change into the new completion gate; historical changes without that declaration keep their prior behavior.
- Only `verification_evidence: required` opts a change into strict V-* machine-evidence enforcement. Historical Markdown-only and schema v1 records remain read-only warnings outside a strict active change. An `external-ci` manifest is always `external-recorded` until a future trusted remote reader supplies an independent receipt; a local `remotelyVerified` field cannot promote trust.
