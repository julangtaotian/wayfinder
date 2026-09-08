---
name: frontend-requirement-write
description: Convert a natural-language frontend feature or bug description into a reviewable Markdown requirement grounded in the current repository. Use when a user asks to write, refine, standardize, or review a requirement before starting a managed change or implementing code.
---

# Write Frontend Requirement

Review, revise or create requirement documentation according to the requested intent. Do not implement application code.

## Runtime

Resolve `<plugin-root>` as the directory two levels above this skill folder. Run the requirement decision validator through:

```bash
node "<plugin-root>/scripts/validate-requirement-decisions.mjs" <requirement-path> [--change <change-path>] [--json]
```

Do not replace this validation with an informal self-check. Report validation findings during read-only review. For writing modes, resolve structural errors and keep unresolved decisions in a draft; never claim a draft is implementation-ready.

## Intent Routing

- **Review**: read the selected requirement and only the repository evidence needed to assess it. Run the validator read-only, report contradictions and proposed corrections; do not allocate an ID, write files or change status unless revision is also requested.
- **Revise**: update the selected document in place, preserving its REQ identifier and unrelated content. Locate affected D/A/V items first, update their dependent sections, and apply revision and evidence-invalidation rules below; do not regenerate the whole document for a local correction.
- **Create**: use a supplied unused identifier or select the next unused ID. If a supplied ID already exists, inspect it and resolve whether this is a revision rather than overwriting it.
- A review followed by an explicitly requested revision can continue within the same authorization.

## Writing Workflow

1. Read applicable `AGENTS.md`, the selected requirement or template, relevant Wayfinder sections and the directly affected source and tests. Read the full dynamic dependency profile only when dependency roles matter to the requirement. Use the profile to discover declared packages, but use configuration, imports, call sites and tests to establish their actual role.
2. Read `../../references/requirement-guidelines.md` relative to this skill.
3. Use `requirements/_template.md` when present; otherwise use `../../assets/templates/requirements/_template.md`.
4. Follow the selected writing mode: preserve the ID for Revise; allocate an unused ID only for Create.
5. Before writing narrative, create or revise the decision ledger. Preserve existing `D-*` IDs and record each decision’s state, value and source. Only user-confirmed facts or traceable project defaults may be `已确认` or `项目默认`; unknown behavior remains `待确认` or sourced `暂定`.
6. Describe observable behavior from those decisions. Include only applicable UI, interface, permission and compatibility details; distinguish non-applicability from missing facts instead of filling generic sections with invented requirements.

7. Cover scope, current behavior, verifiable scenarios, UI states, validation, security, interfaces, permissions, risks, tests, and acceptance criteria. Give every acceptance criterion an `A-*` ID and fill the acceptance-evidence mapping with related decisions, verification method, evidence location, and observable assertion. Complete the interaction-state matrix for initial existing data, user action, refresh, empty, error, and unmount: choose `覆盖` or `不适用` for every row, link covered rows to `A-*`, and record a specific reason for every inapplicable row. For automatic tests, record the test-file strategy (create or extend, target path, Git baseline evidence, and rationale), verification scope (focused or full, commands, and rationale), and whether an independent test plan is required. Require an active-change `test-plan.md` when the user asks to form, implement, or repeatedly verify multiple traceable test cases; do not put unconfirmed behavior into `TC-*`. When revising an existing requirement, append an `R-*` revision record, invalidate affected `V-*` results, name the tasks that must reopen, and treat an older test-plan revision baseline as stale. Keep the change-scope table empty until a managed change actually exists.
8. Save the document under `requirements/REQ-*.md` with a descriptive kebab-case suffix.
9. Run `node "<plugin-root>/scripts/validate-requirement-decisions.mjs" <requirement-path> --stage plan --json`. Record the controlled requirement status, `V-*` verification plan, test-file Git baseline and any manual visual environment before presenting the requirement. Fix every structural, ID, reference, mapping, and evidence error before presenting the requirement. If the only blocking errors come from intentionally retained `暂定` or `待确认` decisions, keep the document as a draft, state the exact confirmation questions, and do not start a managed change or describe it as implementation-ready.
10. Check the final document for contradictions, hidden assumptions and unverifiable wording. Report substantive gaps or changes first, link the document, and list only material unresolved questions; validator success proves structure, not business correctness.

## Guardrails

- Preserve the selected mode and user-owned content. Review is read-only; writing documentation never authorizes product implementation or a managed change by itself.
- The decision ledger is the only business fact source. Do not place a `暂定` or `待确认` decision into specifications, design, tasks, acceptance criteria or implementation instructions. Revise the requirement before changing behavior, interface, permission, security, data or compatibility semantics.
- Authorize `skip_specs: true` only through an executable decision explicitly confirming no observable behavior change. Keep the complete change name in the change-scope table; date stripping is only an archive-directory fallback after exact matching.
- Use the test-file strategy in `../../references/requirement-guidelines.md`: extend the same handwritten feature-specific test or create a dedicated one. `.generated.spec.` files remain read-only baselines unless project rules explicitly require an exception, recorded with its Git baseline and rationale.
- Default local changes to focused tests and necessary build checks. Full or coverage verification requires the shared-chain, unavailable-focused-test, user-authorization or release rationale recorded in the requirement. Final delivery alone is not a full-verification reason.
- Select interaction states from actual impact, not from which cases already passed. Record manual environment, observable checks and evidence paths before marking visual acceptance complete.
- Preset, target and platform profiles are limited signals. A root dependency declaration does not prove installation, usage, compatibility, safety or validation; workspace, transitive, vulnerability, license and registry questions need separate evidence.
