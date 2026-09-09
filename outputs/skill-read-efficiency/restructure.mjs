import fs from 'node:fs';
import path from 'node:path';
const root = 'plugins/frontend-ai-workflow';
const testPath = path.join(root,'skills/frontend-test/SKILL.md');
const bootstrapPath = path.join(root,'skills/frontend-workflow-bootstrap/SKILL.md');
const test = fs.readFileSync(testPath,'utf8');
const bootstrap = fs.readFileSync(bootstrapPath,'utf8');
fs.writeFileSync('outputs/skill-read-efficiency/test-before.md',test);
fs.writeFileSync('outputs/skill-read-efficiency/bootstrap-before.md',bootstrap);
// 保留原受管流程的完整正文，只校正移动后的引用基准。
const runtime = test.slice(test.indexOf('## Runtime'),test.indexOf('## Intent Routing'));
const managed = test.slice(test.indexOf('## Plan'));
const rebase = text => text.replaceAll('../../references/', './').replaceAll('../../assets/', '../assets/');
fs.writeFileSync(path.join(root,'references/managed-test-workflow.md'), '# Managed frontend test workflow\n\nRead only for Plan, Implement or Verify. Resolve `<plugin-root>` as the parent of this reference directory. The requirement ledger is the business fact source; the active change\'s test plan is its technical derivative.\n\n' + rebase(runtime).replace('Resolve `<plugin-root>` as the directory two levels above this skill folder. ', '') + rebase(managed));
const intro = test.slice(0,test.indexOf('# Frontend Test'));
fs.writeFileSync(testPath, intro + `# Frontend Test

Select the user's intent before reading references. Resolve \`<plugin-root>\` two directories above this skill folder.

## Analyze — read-only

For coverage, assertion or test-gap questions:

1. Read applicable project rules and the named test with its imported implementation, together when their paths are known. Follow another caller only to resolve a fact that affects the answer. Reuse already-read content while unchanged.
2. Explain what the assertion proves, consequential gaps and the smallest useful check. Distinguish source-derived expectations from confirmed requirements and tests actually executed. Finish this mode after answering.

A local assertion question does not need workflow guides, an inventory, runner discovery or an active change. Do not load the managed workflow below for Analyze. For broader coverage questions, read the relevant requirement and nearby tests if present. Only when runner, command, test-directory or Git facts are needed, run:

\`\`\`bash
node "<plugin-root>/scripts/inspect-test-context.mjs" --target <repository-root>
\`\`\`

Use its result directly; inspect the script implementation only to diagnose a concrete failure. Missing evidence calls for a targeted lookup or an explicit unknown, not a whole-project scan. Analysis creates no files and never installs dependencies.

## Plan, Implement or Verify — managed operations

Requests to persist a test plan, write tests or execute recorded verification use [the managed test workflow](../../references/managed-test-workflow.md). Read it before that operation and follow the selected stage's gates. Implementation requires explicit intent and a selected active change; analysis alone does not authorize it. A mixed request advances only into authorized stages.
`);
const workflow = bootstrap.slice(bootstrap.indexOf('## Workflow'));
fs.writeFileSync(path.join(root,'references/workflow-initialization.md'), '# Frontend workflow initialization\n\nRead only for ordinary initialization, explicit deep initialization or a complete project map. Resolve `<plugin-root>` as the parent of this reference directory. Read-only complete analysis never authorizes managed writes.\n\n' + rebase(workflow).replace('When mode selection requires deep initialization,', 'For explicit deep initialization or a complete project map,'));
fs.writeFileSync(bootstrapPath, bootstrap.slice(0,bootstrap.indexOf('# Initialize Frontend AI Workflow')) + `# Frontend project understanding and initialization

Resolve \`<plugin-root>\` two directories above this skill folder. Select exactly the mode requested; the initialization procedure is not a continuation of a local answer.

## Understand a module or call chain — read-only

Read applicable project rules and the relevant source. With known entry paths, read the entry and its direct imports together; expand only where the answer depends on another file. Reuse unchanged findings, and reread affected content after edits.

Explain the inspected chain with source-backed facts and unresolved external behavior. Finish after answering. Do not load initialization references, enumerate the whole repository or run workflow checks for this mode. Use \`inspect-project.mjs --target <repository-root>\` only if project identification is necessary to resolve the question; execute the script without first reading its implementation.

More detail about a module expands that chain; it does not imply a complete project map. Missing evidence should remain explicit rather than inferred from filenames or dependencies.

## Initialize the workflow or produce a complete map

Only for onboarding, initialization, an explicit deep scan or a complete/high-confidence map, read [the initialization procedure](../../references/workflow-initialization.md).

Ordinary onboarding creates an identification baseline and leaves the deep map pending. Explicit complete analysis follows the full coverage procedure; a local answer cannot satisfy it. Writing needs initialization or update intent already supplied by the user. Preserve existing authorization without asking again.
`);
console.log(JSON.stringify({ test:{before:Buffer.byteLength(test),after:fs.statSync(testPath).size}, bootstrap:{before:Buffer.byteLength(bootstrap),after:fs.statSync(bootstrapPath).size} }));
