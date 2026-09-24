---
name: frontend-ui-review
description: Perform a read-only UI acceptance review only when the user explicitly asks for visual review, design comparison, screenshot inspection, or a pre-fix UI audit. Never modify business source.
---

# Frontend UI Review

This Skill is read-only and does not modify business source. Read [the UI review workflow](../../references/ui-review-workflow.md) only when executing an actual review.

1. Read the configured scenario and preview the bundled runner. Do not invent the page, design reference, target nodes, interactions, viewport, or acceptance scope.
2. Write a run only after preview reports it ready. Use the bundled adapter without installing project dependencies. Store every run artifact under ignored `.frontend-ui-review/runs/`.
3. Keep the declared scope exact: structural evidence is not visual equivalence, and inconclusive evidence is not passing. Browser fallback requires a declared fallback and a new run identity.
4. Return the conclusion, counts, report/state paths, screenshot paths, and console error count. Do not inline screenshot bytes, full console logs, comparison bodies, or state. A trace is created only after a failure and on request.
5. Report findings without fixing them. A separate explicit implementation request may use `$frontend-delivery`; this review never edits source, installs dependencies, commits, or pushes.
