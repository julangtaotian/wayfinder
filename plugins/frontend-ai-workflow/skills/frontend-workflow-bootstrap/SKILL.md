---
name: frontend-workflow-bootstrap
description: Inspect and initialize a frontend repository with shared Codex guidance, a Wayfinder project navigator, OpenSpec configuration, and safe workflow migration. Use when a user asks to onboard a new or existing frontend project, apply the shared AI workflow, or avoid manually recreating AGENTS.md and OpenSpec setup in each repository.
---

# Frontend project understanding and initialization

Resolve `<plugin-root>` two directories above this skill folder. Select exactly the mode requested; the initialization procedure is not a continuation of a local answer.

## Understand a module or call chain — read-only

Read applicable project rules and the relevant source. With known entry paths, read the entry and its direct imports together; expand only where the answer depends on another file. Reuse unchanged findings, and reread affected content after edits.

Explain the inspected chain with source-backed facts and unresolved external behavior. Finish after answering. Do not load initialization references, enumerate the whole repository or run workflow checks for this mode. Use `inspect-project.mjs --target <repository-root>` only if project identification is necessary to resolve the question; execute the script without first reading its implementation.

More detail about a module expands that chain; it does not imply a complete project map. Missing evidence should remain explicit rather than inferred from filenames or dependencies.

## Initialize the workflow or produce a complete map

Only for onboarding, initialization, an explicit deep scan or a complete/high-confidence map, read [the initialization procedure](../../references/workflow-initialization.md).

Ordinary onboarding creates an identification baseline and leaves the deep map pending. Explicit complete analysis follows the full coverage procedure; a local answer cannot satisfy it. Writing needs initialization or update intent already supplied by the user. Preserve existing authorization without asking again.
