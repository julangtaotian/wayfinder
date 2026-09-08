---
name: frontend-workflow-bootstrap
description: Inspect and initialize a frontend repository with shared Codex guidance, a Wayfinder project navigator, OpenSpec configuration, and safe workflow migration. Use when a user asks to onboard a new or existing frontend project, apply the shared AI workflow, or avoid manually recreating AGENTS.md and OpenSpec setup in each repository.
---

# Initialize Frontend AI Workflow

Initialize only the repository the user placed in scope. Resolve the plugin root as the directory two levels above this skill folder.

## Mode Selection

- Use ordinary initialization only when the user asks to initialize or onboard the workflow without requesting project understanding. State before writing that it creates a traceable identification baseline and leaves the deep project map pending.
- Use deep initialization when the user asks to inspect or understand an established project, wants useful project-specific context or a complete/high-confidence project map, or says an ordinary generated result is too generic. Do not substitute a shallow file inventory for this mode.

If the user only asks to inspect or understand the project, perform read-only analysis and report it. Writing workflow files requires initialization or update intent; existing authorization does not need repeating.

## Workflow

1. Read the repository's existing `AGENTS.md` files and run `git status --short`.
2. Read `../../references/project-detection.md` and `../../references/managed-files.md` relative to this skill. When mode selection requires deep initialization, also read `../../references/deep-project-analysis.md`.
3. Run the inspector without changing the repository:

   ```bash
   node <plugin-root>/scripts/inspect-project.mjs --target <repository-root>
   ```

4. When the user requests ordinary initialization, run a bootstrap preview:

   ```bash
   node <plugin-root>/scripts/bootstrap-project.mjs --target <repository-root>
   ```

5. Show the full root dependency count, dynamic dependency summary and truncation status, then the detected preset, real project commands, default and delivery build candidates, test and lint semantic status, files to create, files to skip, and warnings. Treat preset, target and platform profiles as limited compatibility signals, not as the complete technology stack. When the summary is truncated, use `dependencyProfile.packages` for complete analysis. Do not describe a `placeholder` test script as an available test entry or an `unverified` lint script as an available static check. For a native WeChat mini program without platform scripts, state that WeChat DevTools or an external CI environment must be recorded for preview, upload and device verification.
6. When initialization is within the user's request, apply the previewed plan:

   ```bash
   node <plugin-root>/scripts/bootstrap-project.mjs --target <repository-root> --write
   ```

7. For deep initialization, read `../../references/deep-initialization-workflow.md` and follow its coverage and managed-write procedure instead of steps 4–6.
8. Run the workflow checker and report any bundled OpenSpec runtime failure separately from project failures.
9. Re-run `git status --short` and summarize only files created by the workflow.

## Legacy Migration

When the preview or checker reports a legacy layout, do not run ordinary upgrade as a substitute. Preview the explicit migration first:

```bash
node <plugin-root>/scripts/migrate-wayfinder-project.mjs --target <repository-root>
```

After the user confirms its create, preserve and delete plan, repeat with `--write`. The migration preserves the complete old frontend context and project-specific AGENTS constraints; it retains any custom requirement template or workflow metadata instead of deleting it.

## Guardrails

- Never overwrite an existing file without a valid managed block.
- Never modify business code during initialization.
- Never install or upgrade project dependencies.
- Treat absent, empty and known failing placeholder scripts as unavailable; do not invent commands.
- Preserve all pre-existing user changes.
- Stop when the target resolves to a filesystem root or user home directory.
- A file inventory is not an architecture conclusion. Do not infer project behavior from names, directories or dependencies without reading evidence.
- The dynamic profile covers root direct declarations only. Do not imply workspace, transitive dependency, registry, vulnerability, license or upgrade analysis unless separately performed.
