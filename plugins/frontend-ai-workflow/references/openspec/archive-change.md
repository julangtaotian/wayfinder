---
name: openspec-archive-change
description: Finalize a completed change with compact lifecycle history. Uses the plugin-bundled OpenSpec CLI and treats native archive as a transient synchronization step in schema v2.
allowed-tools: Bash(node:*)
license: MIT
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.9.0"
---

## Hard-gated Runtime

Resolve `<plugin-root>` as the directory two levels above this reference folder. Normal completion MUST use the plugin wrapper; never run, install, or update a global OpenSpec executable, manually move the change directory, or expose `--no-validate` / `--skip-specs`.

**Input**: A selected requirement path and active change name are mandatory. If either is ambiguous, list the active changes and ask the user to select; never infer among multiple plausible changes.

## Workflow

1. Confirm the selected requirement is the fact source for the active change. `skip_specs: true` is allowed only when its decision ledger explicitly confirms no observable behavior change.
2. Finish the required project verification, update actual V-* results and evidence, check every applicable A-*, finish every task, and set the requirement to `待验证`.
3. Preview completion:

   ```bash
   node "<plugin-root>/scripts/finalize-change.mjs" \
     --target <repository-root> \
     --requirement <requirement-path> \
     --change <change-name>
   ```

4. The preview reads `instructions archive --json` and reports optional context, operationGuidance, warnings and concrete paths. Treat them as additive inputs only; they cannot replace the selected requirement, project root, command contract or hard gates.
5. If the preview fails, stop. Report the exact root, requirement, artifact, task, evidence, strict-validation, spec, instruction, or archive-target blocker. User confirmation MUST NOT override a failed gate.
6. When the user requested completion, read `.frontend-workflow.json` and repeat the command with `--write`. A high-risk or explicitly strict delivery may add `--evidence-mode strict`.
7. In schema v2, report the lifecycle event, accepted-local/accepted-merged state, synchronized capabilities and residual recovery risk. Do not report the native archive directory as durable output. `legacy-readonly` may use the old archived-path response only for recovery or migration.

## Guaranteed Order

The wrapper performs:

1. `precomplete` requirement validation;
2. `isPlanningComplete=true` and artifact status checks; a legacy response may fall back to `isComplete`, and only metadata- and requirement-authorized specs `skipped` is accepted;
3. persistent evidence checks;
4. strict bundled OpenSpec validation;
5. archive instructions, root boundary and date-preserving archive-target conflict precheck;
6. bundled spec rebuild, validation and synchronization;
7. native archive movement as a transaction-local synchronization result;
8. append one validated lifecycle event, optionally write one bounded strict evidence capsule, then remove the active requirement and transient archive;
9. project the final branch-local state and remove the completed transaction without rerunning project commands.

## Guardrails

- Incomplete artifacts, tasks, acceptances or verification records are blocking errors, never warnings that can be confirmed away.
- `root.source=global_default` is blocking for a local project unless the user explicitly selected that Store.
- Existing `YYYY-MM-DD-` names keep their full name; ordinary and numeric-prefix names receive exactly one archive date.
- Delta discovery uses `artifactPaths.specs.existingOutputPaths`, including nested capability paths; never infer a path from a glob.
- Delta specs are synchronized during normal completion; there is no “archive without syncing” option.
- A capability whose last requirement is removed may be retired only when `.openspec.yaml` explicitly declares `retire_capabilities: true`; the bundled runtime must report the deleted main spec, and a missing marker remains blocking.
- The wrapper always supplies the explicit non-interactive change name, `--json` and `--yes`; it never guesses a missing confirmation flag from a failed prompt.
- If spec rebuild, validation or archive movement fails, do not mark the requirement accepted.
- If native archive succeeds but event append or cleanup fails, retain the bounded transaction and return its id and failed stage; recovery must not archive, synchronize, append or rerun verification twice.
- Existing v1 archives remain read-only migration input. New v2 changes use `precomplete` before completion and derive terminal state from events rather than accepted Markdown.
