---
name: frontend-workflow-upgrade
description: Upgrade managed frontend AI workflow sections to the plugin's current version while preserving repository-specific guidance and business artifacts. Use when a user wants to synchronize managed workflow rules in a business repository after a plugin update or migrate an older initialized repository; installing or updating the plugin itself is outside this skill.
---

# Upgrade Frontend AI Workflow

Update managed workflow sections only. Resolve the plugin root as the directory two levels above this skill folder.

## Workflow

1. Read applicable `AGENTS.md`, run `git status --short`, and preserve all existing changes.
2. Read `../../references/managed-files.md` relative to this skill.
3. Preview the managed-block upgrade and the old-requirement migration gaps:

   ```bash
   node <plugin-root>/scripts/update-project.mjs --target <repository-root>
   node <plugin-root>/scripts/preview-requirement-upgrade.mjs --target <repository-root> --json
   ```

4. Lead with actual managed differences, preserved/skipped files and conflicts. Report layout/version, dependency and old-requirement details when they explain a change or require action. The requirement preview is read-only and never rewrites business facts. Ordinary upgrade preserves the recorded deep scan time, Git state and scope fingerprint; only explicit `--deep` refreshes them. If the preview has no content changes, proceed to the checker without a write pass.
5. When the upgrade is within the user's request and no conflicts remain, apply it:

   ```bash
   node <plugin-root>/scripts/update-project.mjs --target <repository-root> --write
   ```

6. Run the checker and summarize the resulting diff.

If the preview reports a legacy layout, ordinary upgrade must not move files. Instead preview `migrate-wayfinder-project.mjs`; only run its `--write` form after the user confirms its file plan.

## Guardrails

- Replace content only between matching `frontend-ai-workflow:start/end` markers.
- Stop on missing, duplicated, reversed, or mismatched markers.
- Never overwrite requirement documents, project context, planning changes, or business code.
- Never use a version upgrade as permission for unrelated cleanup.
- Keep project-owned content outside managed blocks byte-for-byte unchanged.
- Upgrading to workflow 0.18.0 keeps the dynamic root direct-dependency profile, write-safety and verification-evidence boundaries, and OpenSpec 1.9.0. Repository lifecycle governance archives accepted requirement bodies behind lightweight root entries and applies a deterministic footprint gate during repository development; business repositories are still upgraded only inside managed sections and their historical content remains read-only. The dependency profile does not recurse workspaces or transitive packages, query registries, or prove usage, compatibility, security, licenses or upgrade status.
- Do not use the requirement preview as authorization to migrate a requirement. The maintainer must confirm each document's business facts, state, decision ledger and evidence mapping separately.
