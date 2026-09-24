---
name: frontend-test
description: Analyze frontend test coverage or implement tests only when the user explicitly asks for test work. Do not use for ordinary product-code implementation, automatic verification, or lifecycle management.
---

# Frontend Test

Use one of two explicit modes. Resolve `<plugin-root>` two directories above this Skill.

## Analyze — read-only coverage analysis

Read the named test, its imported implementation, applicable project rules, and only the callers needed to answer the question. Report what existing assertions prove, consequential gaps, and the smallest useful check. Separate source-derived expectations from confirmed behavior and commands actually executed. Create no files.

For broader runner or directory facts, run `node "<plugin-root>/scripts/inspect-test-context.mjs" --target <repository-root>`. Use its bounded output directly; do not inspect its implementation unless diagnosing a concrete failure.

## Implement — explicitly authorized test implementation

Require an explicit request to add or change tests. Reuse the project's native runner, conventions, nearest handwritten tests, and existing command. Implement only the tests in scope and run the narrowest relevant command. Do not create planning or evidence files.

Before execution, confirm the local CLI, module, or repository wrapper exists. If missing, report it once; do not install dependencies and do not retry a known failure. A zero-test result is a failure. Never use generated baselines as a default destination for feature-specific assertions unless project rules require it. Visual behavior belongs to `frontend-ui-review` or `frontend-ui-verify`, not a second browser workflow here.
