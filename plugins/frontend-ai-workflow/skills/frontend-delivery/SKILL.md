---
name: frontend-delivery
description: Implement explicit frontend changes with bounded context. Do not use for explanations, analysis, reviews, status, or planning-only requests.
---

# Frontend Delivery

Use for explicit implementation; preserve existing work.

## Build context

- Cap Project Context JSON at 4096 bytes with `stack`, `scope`, `entrypoints`, `similarImplementations`, `testCandidates`, and `commands`. Reuse Wayfinder, project detection, and dependency profile. Read only direct targets, callers, and nearest tests. Never include full source, full logs, plans, or evidence bodies.
- Keep Execution Brief in conversation; do not write it. Record `goal`, `scope`, `outOfScope`, `acceptance`, `verificationLevel`, and `riskEscalation`.

## Choose implementation depth

- Direct — clear local behavior; read adjacent facts. Direct does not create requirement or management files.
- Light — an in-session plan of 3–7 steps. Light does not create requirement or management files.
- Direct and Light do not write `requirements/`, `openspec/changes/`, evidence, or `.workflow-history`.
- Complex — architecture, auth/security, persistence, public contract, dependency, build/deploy/CI/platform, unbounded impact, multi-session, or formal spec. Only Complex creates OpenSpec; exactly one change is required.
- For Complex use `node "<plugin-root>/scripts/workflow-cli.mjs" <create|status|validate|complete>`. With write authorization, create before implementation and complete only after the Outcome Gate; otherwise preview and ask.
- File count, directory name, or shared location alone cannot select Complex. Preserve safe investigation and edits when risk escalates the same task.

## Choose verification independently

Planning and verification are independent. Choose by actual impact and acceptance, not depth: None for text; Focused for local behavior; Targeted UI for a named interaction; Full UI for a critical journey. Requests may raise the minimum. Direct can use Targeted UI; Light can use Focused; Complex can use Focused or Full UI.

Check CLI/module/wrapper; do not install or retry if absent. Do not rerun a passing focused check without relevant edits. For Direct local edits, batch the focused check with diff/allowed-path review in one safe closing tool call; report every failure. Summarize UI screenshot/console; trace only on request after failure.

## Implement and close

- Make the smallest sufficient change; add Chinese comments only for non-obvious behavior.
- Use the Outcome Gate to compare the original user goal with each acceptance item and an observable result; a test exit code alone does not prove completion.
- Fingerprint failures by acceptance item, failed gate, and observable symptom. New hypothesis, layer, candidate, or stage name does not reset the count. The same fingerprint gets at most two repair rounds; on the third occurrence stop with root cause, checks, and remaining decision. Never widen verification after a failed repair.
