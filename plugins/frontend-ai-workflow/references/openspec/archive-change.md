---
name: openspec-archive-change
description: Archive a completed change in the experimental workflow. Use when the user wants to finalize and archive a change after implementation is complete. Uses the plugin-bundled OpenSpec CLI.
allowed-tools: Bash(node:*)
license: MIT
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.8.0"
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
6. When the user requested completion and archiving, repeat the command with `--write`.
7. Report the archived path, synchronized capability names, final requirement status, runtime warnings and residual recovery risk.

## Guaranteed Order

The wrapper performs:

1. `precomplete` requirement validation;
2. `isPlanningComplete=true` and artifact status checks; a legacy response may fall back to `isComplete`, and only metadata- and requirement-authorized specs `skipped` is accepted;
3. persistent evidence checks;
4. strict bundled OpenSpec validation;
5. archive instructions, root boundary and date-preserving archive-target conflict precheck;
6. bundled spec rebuild, validation and synchronization;
7. archive movement;
8. requirement status update to `已验收`.

## Guardrails

- Incomplete artifacts, tasks, acceptances or verification records are blocking errors, never warnings that can be confirmed away.
- `root.source=global_default` is blocking for a local project unless the user explicitly selected that Store.
- Existing `YYYY-MM-DD-` names keep their full name; ordinary and numeric-prefix names receive exactly one archive date.
- Delta discovery uses `artifactPaths.specs.existingOutputPaths`, including nested capability paths; never infer a path from a glob.
- Delta specs are synchronized during normal completion; there is no “archive without syncing” option.
- A capability whose last requirement is removed may be retired only when `.openspec.yaml` explicitly declares `retire_capabilities: true`; the bundled runtime must report the deleted main spec, and a missing marker remains blocking.
- The wrapper always supplies the explicit non-interactive change name, `--json` and `--yes`; it never guesses a missing confirmation flag from a failed prompt.
- If spec rebuild, validation or archive movement fails, do not mark the requirement accepted.
- `complete` remains a read-only audit stage for historical already-accepted requirements; new changes use `precomplete` before archive.
