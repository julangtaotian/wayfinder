---
name: frontend-delivery
description: Implement explicit frontend changes with bounded context. Do not use for explanations, analysis, reviews, status, or planning-only requests.
---

# Frontend Delivery

## Context

- Project Context is JSON, at most 4096 bytes: `stack`, `scope`, `entrypoints`, `similarImplementations`, `testCandidates`, `commands`. Reuse Wayfinder, project detection, and dependency profile; read only direct targets, callers, and nearest tests. Never include full source, full logs, plans, or evidence bodies.
- Keep Execution Brief in conversation; do not write it: `goal`, `scope`, `outOfScope`, `acceptance`, `verificationLevel`, `riskEscalation`.

## Depth

- Direct — clear behavior; does not create requirement or management files.
- Light — in-session plan of 3–7 steps. Light does not create requirement or management files.
- Direct and Light do not write OpenSpec, evidence, or `.workflow-history`.
- Complex — architecture/security, persistence, public/dependency/build/deploy/CI/platform contracts, unbounded impact, multi-session, or formal spec. Only Complex creates OpenSpec; exactly one change is required. Run `node "<plugin-root>/scripts/workflow-cli.mjs" <create|status|validate|complete>`; with write authorization, create before implementation and complete after Outcome Gate, otherwise preview and ask.
- File count, directory name, or shared location alone cannot select Complex. Preserve safe investigation and edits when risk escalates the same task.

## Verification

Planning and verification are independent. Choose by impact and acceptance, not depth: None=text, Focused=local behavior, Targeted UI=named interaction, Full UI=critical journey. Requests may raise the minimum. Direct can use Targeted UI; Light can use Focused; Complex can use Focused or Full UI.

Check local CLI/module/wrapper; do not install/retry if absent. Do not rerun a passing focused check without relevant edits. For Direct local edits, batch the focused check, diff/allowed-path review, and report every failure in one safe closing tool call. Summarize UI screenshot/console; trace only when requested after failure.

## Close

- Make the smallest sufficient change; add Chinese comments only for non-obvious behavior.
- Outcome Gate compares the original user goal, each acceptance item, and observable result; a test exit code alone is insufficient.
- Fingerprint: acceptance item, failed gate, observable symptom. A new hypothesis, layer, candidate, or stage name does not reset it. The same fingerprint gets at most two repair rounds; on the third occurrence stop with root cause and remaining decision. Never widen verification after failure.
