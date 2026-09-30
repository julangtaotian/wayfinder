---
name: frontend-delivery
description: Implement explicit frontend changes with bounded context. Do not use for explanation, analysis, review, status, or planning-only requests.
---

# Frontend Delivery

## Context

- Project Context is at most 4096 bytes: `stack`, `scope`, `entrypoints`, `similarImplementations`, `testCandidates`, `commands`. Reuse Wayfinder, project detection, and dependency profile; read only direct targets, callers, and nearest tests. Never include full source, full logs, plans, or evidence bodies.
- One conversational Execution Brief carries every depth's delivery core: `goal`, `scope`, `outOfScope`, observable `acceptance`, `approach`, implementation, per-item verification, `verificationLevel`, and `riskEscalation`.

## Depth

- Direct — clear local behavior; keep the brief compact with no forced plan block.
- Light — before code edits, one user-visible message MUST contain the complete Execution Brief plus a numbered 3–7-step plan; otherwise stop.
- Direct and Light create no requirement, OpenSpec, evidence, `.workflow-history`, or other management files.
- Complex — architecture/security, persistence, public/dependency/build/deploy/CI/platform contracts, unbounded impact, multi-session, or formal spec. Only Complex creates exactly one OpenSpec change. Run `node "<plugin-root>/scripts/workflow-cli.mjs" create`; replace every TODO in proposal, spec, design, and tasks from project facts, give each scenario one `AC-*`, link tasks, then run `validate` before implementation.
- File count, directory name, or shared location alone cannot select Complex. Preserve safe work when the same task escalates.

## Verification

Planning and verification are independent: None=text, Focused=local behavior, Targeted UI=named interaction, Full UI=critical journey. Choose by impact and acceptance; requests may raise the minimum. Direct can use Targeted UI; Light Focused; Complex Focused or Full UI.

Check CLI/module/wrapper; do not install/retry if absent. Do not rerun a passing focused check without relevant edits. For Direct local edits, batch the focused check, diff/allowed-path review, and report every failure in one safe closing tool call. Summarize UI screenshot/console; trace only when requested after failure.

## Close

- Make the smallest sufficient change; use Chinese comments for non-obvious behavior.
- Outcome Gate compares the original user goal, each acceptance item, and observable result; a test exit code alone is insufficient.
- For Complex, mark finished tasks and write bounded `verification-summary.json` with the exact spec `acceptanceId` set, `passed` status, and observations before `complete`; never invent evidence.
- Fingerprint: acceptance item, failed gate, observable symptom. Hypothesis, layer, candidate, or stage name does not reset the same fingerprint. It gets at most two repair rounds; on the third occurrence stop with root cause and remaining decision. Never widen verification after failure.
