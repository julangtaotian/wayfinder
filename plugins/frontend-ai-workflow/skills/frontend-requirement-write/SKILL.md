---
name: frontend-requirement-write
description: Convert a natural-language frontend feature or bug description into a reviewable Markdown requirement grounded in the current repository. Use when a user asks to write, refine, standardize, or review a requirement before starting a managed change or implementing code.
---

# Write Frontend Requirement

Create or update requirement documentation only. Do not implement application code.

## Runtime

Resolve `<plugin-root>` as the directory two levels above this skill folder. Run the requirement decision validator through:

```bash
node "<plugin-root>/scripts/validate-requirement-decisions.mjs" <requirement-path> [--change <change-path>] [--json]
```

Do not replace this validation with an informal self-check. Resolve every reported error before presenting a requirement or starting a managed change.

## Workflow

1. Read the repository's `AGENTS.md`, `wayfinder/frontend.md` when present (otherwise the legacy frontend context), existing requirement template, related routes, pages, services, components, and tests.
2. Read `../../references/requirement-guidelines.md` relative to this skill.
3. Use `requirements/_template.md` when present; otherwise use `../../assets/templates/requirements/_template.md`.
4. Select the next unused `REQ-YYYY-NNN` identifier unless the user supplied one.
5. Before writing the narrative, create the requirement's decision ledger. Give every business decision a stable `D-*` ID, state, value, and source. Only user-confirmed facts or traceable project defaults may be `已确认` or `项目默认`; user-visible unknowns must remain `待确认` or sourced `暂定`.
6. Separate content into:

   - confirmed requirements from the user;
   - provisional decisions grounded in existing project conventions;
   - unresolved questions that could change behavior.

7. Cover scope, current behavior, verifiable scenarios, UI states, validation, security, interfaces, permissions, risks, tests, and acceptance criteria. Give every acceptance criterion an `A-*` ID and fill the acceptance-evidence mapping with related decisions, verification method, evidence location, and observable assertion. Complete the interaction-state matrix for initial existing data, user action, refresh, empty, error, and unmount: choose `覆盖` or `不适用` for every row, link covered rows to `A-*`, and record a specific reason for every inapplicable row. For automatic tests, record the test-file strategy (create or extend, target path, and evidence) and verification scope (focused or full, commands, and rationale). When revising an existing requirement, append an `R-*` revision record, invalidate affected `V-*` results, and name the tasks that must reopen. Keep the change-scope table empty until a managed change actually exists.
8. Save the document under `requirements/REQ-*.md` with a descriptive kebab-case suffix.
9. Run `node "<plugin-root>/scripts/validate-requirement-decisions.mjs" <requirement-path> --stage plan --json`. Record the controlled requirement status, `V-*` verification plan, test-file Git baseline and any manual visual environment before presenting the requirement. Fix every structural, ID, reference, mapping, and evidence error before presenting the requirement. If the only blocking errors come from intentionally retained `暂定` or `待确认` decisions, keep the document as a draft, state the exact confirmation questions, and do not start a managed change or describe it as implementation-ready.
10. Re-read the completed document for contradictions, hidden assumptions, and unverifiable wording.

## Guardrails

- Do not turn an unknown API, permission, or product rule into a confirmed fact.
- Do not write implementation code or create a managed change unless the user also asks.
- Preserve existing requirement content when revising; make scope changes explicit.
- Behavior, interface, permission, security, data, or compatibility changes revise the requirement fact source before planning artifacts. A technical-only change may skip requirement revision only when no `D-*` semantics change.
- Authorize `skip_specs: true` only in a confirmed or project-default decision whose value explicitly states that the selected change does not alter observable behavior. Otherwise require delta specs; never let implementation convenience or dynamic guidance supply this authorization.
- Keep the complete active change name in the change-scope table, including numeric or date prefixes. Date stripping is only an archive-directory compatibility fallback after exact matching.
- Prefer concrete scenarios over implementation prescriptions.
- Reuse existing test patterns, stubs, mocks, and assertions independently from choosing the test file.
- Treat files whose names contain `.generated.spec.` as generated baselines: inspect them for evidence, but do not assign new feature scenarios to them by default.
- Extend an existing handwritten feature-specific test when it covers the same behavior; otherwise create a clearly named feature-specific test in the repository's real test directory.
- If project-owned rules explicitly require a generated-test exception, record the rule source and rationale in the test-file strategy; when Git baseline is available, record whether the target is already tracked. If the test location or baseline cannot be determined, mark it as unresolved instead of guessing.
- Default local page, component, form, and isolated interaction changes to focused tests plus necessary build verification. Treat a coverage command that runs every test as full verification, not as a default test command.
- Assign full verification only for shared request, authentication, routing, build, shared component, or shared state changes; unavailable focused tests; explicit user request; or a documented release-level rationale. Final delivery alone is not a full-verification reason.
- Record the verification scope, commands, rationale and planned `V-*` records in the requirement. When full verification exposes unrelated historical failures or network noise, report them separately from the affected verification result.
- Select state-matrix rows from the actual impact: data rendering normally evaluates initial existing data, empty, and error; filters, forms, and explicit controls evaluate user action and refresh; subscriptions, timers, cancellable requests, route changes, or component teardown evaluate unmount. Do not mark a state inapplicable merely because it has not been tested.
- For a manual visual acceptance, record its viewport or device, observable checks, and screenshot or recording destination in a `V-*` record; do not mark the acceptance complete until that evidence exists.
- Do not place a `暂定` or `待确认` decision in a specification, design, task, acceptance criterion, or implementation instruction. Ask for confirmation or keep it in the requirement's open questions instead.
- Do not invent a business decision in a later document. Use the requirement's `D-*` ID and revise the ledger first when new information arrives.
