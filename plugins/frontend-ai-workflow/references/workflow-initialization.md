# Frontend workflow initialization

Read only for ordinary initialization, explicit deep initialization or a complete project map. Resolve `<plugin-root>` as the parent of this reference directory. Read-only complete analysis never authorizes managed writes.

## Workflow

1. Read the repository's existing `AGENTS.md` files and run `git status --short` once. Keep the root, initial status and relevant-file state as the current initialization snapshot; reuse it until a write or external change invalidates it.
2. Read `./project-detection.md` and `./managed-files.md` relative to this reference. For explicit deep initialization or a complete project map, also read `./deep-project-analysis.md`.
3. Run the inspector without changing the repository. Use its structured output directly; do not read the inspector, bootstrap, update or checker implementation unless a concrete command failure or missing stable field requires diagnosis:

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

7. For deep initialization, read `./deep-initialization-workflow.md` and follow its coverage and managed-write procedure instead of steps 4–6.
8. After all authorized writes and status synchronization, run the workflow checker once in summary mode and report any bundled OpenSpec runtime failure separately from project failures:

   ```bash
   node <plugin-root>/scripts/check-project.mjs --target <repository-root> --summary
   ```

   Re-run it only when a later write changed managed state or the first result exposed a resolvable diagnostic. Do not run a full check before the map is complete merely to rediscover a known pending state.
9. Re-run `git status --short` once after writing and summarize only workflow-created or workflow-updated files. For content protection, report changed paths and hash mismatches; do not emit every protected file's full content again after it was already read.

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
