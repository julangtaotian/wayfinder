# Deep initialization procedure

Resolve `<plugin-root>` from the calling skill. Read `deep-project-analysis.md` for coverage and map dimensions.

Use this procedure instead of ordinary initialization steps 4–6:

   ```bash
   node <plugin-root>/scripts/collect-project-scope.mjs --target <repository-root>
   node <plugin-root>/scripts/bootstrap-project.mjs --target <repository-root> --deep
   ```

   - Show the scope summary, explicit exclusions, limits, planned files and the fact that no file has been written.
   - Confirm that sensitive files and Git-ignored paths were excluded before reading. Never print or persist suspected credential values.
   - Before claiming a complete analysis, read every file listed under `includedFiles` in batches. Record every file as read and classified, or retain its concrete unprocessed reason from the scope result.
   - Treat `validationEvidence` as the capability boundary: file enumeration, text reading and hashing do not prove syntax parsing, platform compilation, Lint or tests. Never claim one of those checks passed unless that exact tool or command was actually executed successfully.
   - Treat `observations` as non-blocking static hints. Report their paths and lines as risks or unresolved validation work; never upgrade a heuristic observation to a syntax or platform compilation error without the corresponding tool evidence.
   - Build a project map, then deep-read and cross-check routes with pages, services with the request/config layers, permissions with route guards, build settings with routing settings, test scripts with test assets, and relevant direct dependencies with their configuration, imports and call sites. A declared dependency without usage evidence remains `declared, usage unresolved`; it is not proof of installation, compatibility, safety or successful execution.
   - Separate source-backed facts, multi-file inferences and unresolved questions. Every fact names a source file; every cross-file chain names its endpoints. Dynamic behavior and repository-external contracts remain unresolved questions.
   - When initialization or refresh writing is already authorized, refresh the existing workflow files and create `frontend.md` only when it is absent. This refresh sets `analysisStatus` to `pending` and `analysisCoveredFiles` to 0; it does not claim that a previous project map still matches the new scope:

     ```bash
     node <plugin-root>/scripts/bootstrap-project.mjs --target <repository-root> --deep --write
     ```

   - Replace only the `frontend-ai-workflow:analysis:start/end` block in `wayfinder/frontend.md` and the `frontend-ai-workflow:deep-guardrails:start/end` block in `AGENTS.md`. In AGENTS write 4–8 concise, source-backed, project-specific hard constraints for high-impact request, auth/security, route/build and test boundaries. Preserve the `scope` block, the other generic AGENTS rules and all content outside managed blocks. In Wayfinder `meta`, update only `analysisStatus`, `analysisCoveredFiles` and `analysisUpdatedAt` after the actual analysis; preserve the scope snapshot fields. If any Wayfinder block is missing or duplicated, stop and report the conflict. Never create `project-scan.md` or another project-analysis document.
   - The written analysis must include the coverage totals and boundary, validation capability boundary, static observations, scope fingerprint, scan time, Git state, project map, confirmed facts, inferences, unresolved questions, high-risk areas and verification recommendations. Use the map dimensions for run/delivery, functional dependency chains, data/state/security boundaries, and verification/high-risk areas; when source, configuration or dependency evidence exists, additionally cover internationalization, PWA/offline, design systems, observability/experiments and cross-platform boundaries. Separate facts, inferences and unresolved questions. Keep the five stable `frontend-ai-workflow:analysis-dimension:*` markers from `deep-project-analysis.md` inside the analysis block; headings may be renamed for the project. Keep the per-file ledger in the scan report rather than adding a long-lived document. If any included file is not accounted for, set `analysisStatus: partial`, record the covered count and do not describe the result as complete. Only after every included file is accounted for may it set `analysisStatus: complete`, set coverage equal to `scopeIncludedFiles`, set an ISO `analysisUpdatedAt`, and remove the pending placeholder.
