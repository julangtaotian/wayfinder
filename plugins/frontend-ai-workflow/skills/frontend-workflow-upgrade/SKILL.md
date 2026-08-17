---
name: frontend-workflow-upgrade
description: Upgrade managed frontend AI workflow sections to the plugin's current version while preserving repository-specific guidance and business artifacts. Use when a user updates this plugin, wants to synchronize shared rules across projects, or needs to migrate an older initialized repository safely.
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

4. Show the current layout and target workflow version, bundled OpenSpec version, managed files to update, skipped files, migration reminders, old active requirement gaps and conflicts. The requirement preview is read-only: it never creates, completes or rewrites a business requirement. For a deep-analysis project, ordinary upgrade must preserve the recorded scan time, Git state and scope fingerprint; only explicit `--deep` refreshes them.
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
- Upgrading to workflow 0.15.0 adds the optional `test_plan: required` gate, `$frontend-test`, and project-native test-case assets while retaining OpenSpec 1.9.0, planning-completion, explicit deep-analysis, and historical-change compatibility; it must not rename, relocate or rewrite existing requirements, changes, specifications, or tests.
- Do not use the requirement preview as authorization to migrate a requirement. The maintainer must confirm each document's business facts, state, decision ledger and evidence mapping separately.
