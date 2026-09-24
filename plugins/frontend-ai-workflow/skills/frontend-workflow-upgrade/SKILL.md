---
name: frontend-workflow-upgrade
description: Upgrade managed frontend workflow sections only when the user explicitly asks to synchronize an initialized project after a plugin update, while preserving project guidance and business artifacts.
---

# Upgrade Frontend AI Workflow

Update managed workflow sections only. Resolve the plugin root as the directory two levels above this skill folder.

## Workflow

1. Read applicable `AGENTS.md`, run `git status --short`, and preserve all existing changes.
2. Read `../../references/managed-files.md` relative to this skill.
3. Preview the managed-block upgrade:

   ```bash
   node <plugin-root>/scripts/update-project.mjs --target <repository-root>
   ```

4. Lead with actual managed differences, preserved/skipped files and conflicts. Report layout/version and dependency details when they explain a change or require action. Ordinary upgrade preserves the recorded deep scan time, Git state and scope fingerprint; only explicit `--deep` refreshes them. If the preview has no content changes, proceed to the checker without a write pass.
5. When the upgrade is within the user's request and no conflicts remain, apply it:

   ```bash
   node <plugin-root>/scripts/update-project.mjs --target <repository-root> --write
   ```

6. Run the checker and summarize the resulting diff.

If the preview reports `retired_workflow_state`, stop. The current plugin must not read, migrate or reinterpret that format. Ask the user to use the matching historical plugin revision, or to explicitly remove the reported retired paths after confirming their content is no longer needed.

## Guardrails

- Replace content only between matching `frontend-ai-workflow:start/end` markers.
- Stop on missing, duplicated, reversed, or mismatched markers.
- Never overwrite requirement documents, project context, planning changes, or business code.
- Never use a version upgrade as permission for unrelated cleanup.
- Keep project-owned content outside managed blocks byte-for-byte unchanged.
- Current upgrades keep the dynamic root direct-dependency profile, write-safety boundaries, OpenSpec 1.9.0, compact lifecycle events and ignored managed runtime directories. The dependency profile does not recurse workspaces or transitive packages, query registries, or prove usage, compatibility, security, licenses or upgrade status.
- Stop with a clear unsupported-layout result when the project predates schema v2. Do not recreate a legacy migration path inside the current plugin; use a matching historical plugin revision when an old repository must be recovered.
