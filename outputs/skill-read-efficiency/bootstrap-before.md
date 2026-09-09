---
name: frontend-workflow-bootstrap
description: Inspect and initialize a frontend repository with shared Codex guidance, a Wayfinder project navigator, OpenSpec configuration, and safe workflow migration. Use when a user asks to onboard a new or existing frontend project, apply the shared AI workflow, or avoid manually recreating AGENTS.md and OpenSpec setup in each repository.
---

# Initialize Frontend AI Workflow

Initialize only the repository the user placed in scope. Resolve the plugin root as the directory two levels above this skill folder.

## Mode Selection

- **Scoped understanding**: for a module, call chain or general project question, read applicable repository guidance and the source needed to answer it. Report the inspected scope, facts and unknowns, then stop. Do not run initialization, enumerate the entire repository or promise a complete map. Use the inspector only when project identification is needed.
- **Ordinary initialization**: initialize or onboard the workflow with the steps below. Explain that this creates an identification baseline and leaves the deep project map pending; accompanying local questions do not require full analysis.
- **Deep initialization or complete analysis**: use only for an explicit deep scan, complete/high-confidence project map or full project-specific onboarding. Follow the original coverage procedure; a shallow inventory cannot satisfy it. A request for more useful detail alone expands the relevant chain, not automatically the entire project.

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

5. Lead with preview readiness, files to create or skip, conflicts and the next action. Keep dependency counts, summary truncation, command/build candidates and platform evidence in the inspection result; expand those relevant to a decision or requested detail. Use `dependencyProfile.packages` when complete dependency analysis is needed. Presets are limited signals; `placeholder` tests are unavailable and `unverified` lint is not proven coverage. For native WeChat projects without platform scripts, record WeChat DevTools or external CI as the preview, upload and device-verification boundary.
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
