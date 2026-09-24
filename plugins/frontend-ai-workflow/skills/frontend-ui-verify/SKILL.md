---
name: frontend-ui-verify
description: Re-run an existing UI review on the same baseline only when the user explicitly asks to verify, recheck, regress, or close recorded findings. Never modify source or expand scope.
---

# Frontend UI Verify

This Skill does not modify source. Read [the UI review workflow](../../references/ui-review-workflow.md) only for an actual recheck.

1. Read the named baseline state and current configuration. Preview before writing any run.
2. Reuse the same baseline page, design content, viewport, DPR, target nodes, interactions, comparison scope, thresholds, masks, and actual capture method. A mismatch stops the run; it must not expand or silently become a new review.
3. Recollect real evidence and classify stable finding fingerprints as resolved, remaining, or new. Inconclusive stays inconclusive; both remaining and new must be empty to pass.
4. Return the conclusion, counts, report/state paths, screenshot paths, and console error count. Do not inline screenshot bytes, full console logs, comparison bodies, or state. A trace is created only after a failure and on request.
5. Store all run artifacts under ignored `.frontend-ui-review/runs/`. Do not install dependencies, switch capture methods, edit source, commit, or push.
