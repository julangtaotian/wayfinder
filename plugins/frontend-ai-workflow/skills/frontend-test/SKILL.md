---
name: frontend-test
description: Analyze frontend test coverage, create a traceable test plan for an active change, implement project-native tests when explicitly requested, and run focused verification with auditable evidence. Use for read-only coverage analysis or managed test-case planning, implementation and verification tied to an active change.
---

# Frontend Test

Select the user's intent before reading references. Resolve `<plugin-root>` two directories above this skill folder.

## Analyze — read-only

For coverage, assertion or test-gap questions:

1. Read applicable project rules and the named test with its imported implementation, together when their paths are known. Follow another caller only to resolve a fact that affects the answer. Reuse already-read content while unchanged.
2. Explain what the assertion proves, consequential gaps and the smallest useful check. Distinguish source-derived expectations from confirmed requirements and tests actually executed. Finish this mode after answering.

A local assertion question does not need workflow guides, an inventory, runner discovery or an active change. Do not load the managed workflow below for Analyze. For broader coverage questions, read the relevant requirement and nearby tests if present. Only when runner, command, test-directory or Git facts are needed, run:

```bash
node "<plugin-root>/scripts/inspect-test-context.mjs" --target <repository-root>
```

Use its result directly; inspect the script implementation only to diagnose a concrete failure. Missing evidence calls for a targeted lookup or an explicit unknown, not a whole-project scan. Analysis creates no files and never installs dependencies.

## Plan, Implement or Verify — managed operations

Requests to persist a test plan, write tests or execute recorded verification use [the managed test workflow](../../references/managed-test-workflow.md). Read it before that operation and follow the selected stage's gates. Implementation requires explicit intent and a selected active change; analysis alone does not authorize it. A mixed request advances only into authorized stages.
