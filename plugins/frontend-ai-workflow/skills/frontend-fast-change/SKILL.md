---
name: frontend-fast-change
description: Implement a clear, localized frontend code change immediately with focused verification. Use when the user explicitly asks to make a bounded change, the expected result is already decided, and the affected behavior can be understood from nearby code and callers. Do not use for a matching active managed change, unresolved product decisions, unbounded impact, or material shared-contract, API, permission, security, data, dependency, build, deployment, CI, or platform changes.
---

# Frontend Fast Change

Complete one clear local frontend change without creating requirement or OpenSpec artifacts. Keep this path independent from the managed lifecycle; use `$frontend-change` only when the handoff rules require it.

## Lightweight Check

1. Read applicable `AGENTS.md` files and the current worktree status. Preserve user-owned changes.
2. When the project has a local `openspec/` directory, run `node "<plugin-root>/scripts/openspec-cli.mjs" list --json` from the project root. If a matching active change exists, hand off to `$frontend-change` and continue that change.
3. Inspect the directly related source, necessary callers, and nearest tests. Use project navigation only when needed to locate this chain; do not load requirements, interaction matrices, dependency profiles, or planning artifacts by default.

Continue here only when every point is true:

- The user explicitly asked for implementation.
- The expected result is already decided and needs no new product decision.
- The inspected code and callers bound the work to the same local behavior without a material shared or external contract change.
- A focused automated test, project-native check, or specific manual check can verify the result.
- No matching active managed change exists.

Directory names, file count, changed-line count, and model confidence are neither proof nor blockers. Multiple files are allowed when they are necessary parts of the same local call chain and do not change its outcome or shared boundary.

## Implement and Verify

1. Send one brief start update with the reason this path applies, the expected affected area, and the focused verification.
2. Make the smallest sufficient in-scope change. Add or update a nearby test when the project already has a suitable pattern.
3. Run the narrowest verification that proves the expected result. When no matching automated check exists, perform and report the specific manual check and the automation gap.
4. Run broader verification only when focused verification is unavailable, the real shared chain requires it, or the user explicitly asks for it.
5. Report only the actual files changed, actual verification and result, and material residual risk.

This path never authorizes commits, pushes, releases, messages, deployments, or other external-state changes.

## Handoff Once

Stop expanding the fast change and hand off once to `$frontend-change` when any of these becomes true:

- A matching active managed change exists.
- The expected result needs a new or conflicting product decision.
- The impact cannot be bounded to the same local behavior or crosses a material module or shared/public contract boundary.
- The work materially changes an API, authentication, permission, security or sensitive-data behavior, persistence, dependency or lockfile, build, deployment, CI, or platform compatibility.
- Implementation or verification shows that the original expected result must change.

Preserve user-owned work and any safe investigation, edits, or verification already completed. Report the trigger and pass the discovered files, facts, current edits, and results into `$frontend-change` so it can continue from the present state instead of repeating work. After the handoff, do not continue this fast path.
