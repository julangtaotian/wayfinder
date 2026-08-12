import { promises as fs } from 'fs';
import path from 'path';
import { resolveArtifactOutputs, resolveSchema } from '../core/artifact-graph/index.js';
import { resolveSchemaForChange } from './change-metadata.js';
/**
 * A Markdown task line: a `-`/`*` bullet carrying a `[ ]` or `[x]` checkbox.
 *
 * Leading whitespace is allowed so nested sub-tasks count like their parents.
 * Anchoring at column 0 made `  - [ ] 1.1.1 ...` invisible to progress, to the
 * apply task list, and to archive's incomplete-task check, so a change with
 * unfinished sub-tasks reported "✓ Complete" and archived without a warning.
 *
 * Permissive on purpose, and safe to keep that way: any character class
 * tightened here - the `\s` inside the brackets, which lets a tab or
 * non-breaking space stand for an empty box - drops lines that used to count,
 * and a task this parser drops is a task `openspec archive` stops warning about.
 *
 * Deliberately unanchored at the end: `.` does not match `\r`, so writing the
 * description group as `(.*)$` would reject every line of a CRLF tasks.md.
 */
const TASK_LINE_PATTERN = /^\s*[-*]\s*\[([\sxX])\]\s*(.*)/;
/**
 * Parses every task line in a tasks file, in document order.
 *
 * Every line matching the pattern counts, wherever it sits - inside a code
 * fence, an HTML comment or an indented block, as before. Skipping fenced
 * checkboxes was tried and dropped: every rule for deciding which fence is
 * "real" has an input where a stray or unbalanced ``` swallows genuine tasks.
 * Counting a documented example as work is a loud, bypassable false positive;
 * losing a real task is a silent one.
 */
export function parseTaskLines(content) {
    const tasks = [];
    for (const line of content.split('\n')) {
        const match = line.match(TASK_LINE_PATTERN);
        if (match) {
            tasks.push({ done: match[1].toLowerCase() === 'x', description: match[2].trim() });
        }
    }
    return tasks;
}
export function countTasksFromContent(content) {
    const tasks = parseTaskLines(content);
    return {
        total: tasks.length,
        completed: tasks.filter((task) => task.done).length,
    };
}
/**
 * Identifies the change's tracked-tasks artifact: the artifact whose `generates`
 * equals the schema's `apply.tracks` value, falling back to the artifact with id
 * `tasks` when no `apply` block declares what it tracks. (`apply.tracks` is a
 * filename that *selects* the artifact; the glob is that artifact's `generates`.)
 */
function findTrackedTasksArtifact(schema) {
    const tracks = schema.apply?.tracks;
    if (tracks != null) {
        return schema.artifacts.find((a) => a.generates === tracks);
    }
    return schema.artifacts.find((a) => a.id === 'tasks');
}
/**
 * Resolves the tracked-tasks artifact's output glob for a change, or undefined
 * when the schema cannot be resolved or no tracked-tasks artifact exists.
 * `resolveSchema` throws on an unresolvable/misnamed schema; we swallow that so
 * the caller falls back to a single top-level `tasks.md` and never crashes.
 */
function resolveTrackedTasksGlob(changeDir, projectRoot) {
    try {
        const schemaName = resolveSchemaForChange(changeDir, undefined, projectRoot);
        const schema = resolveSchema(schemaName, projectRoot);
        return findTrackedTasksArtifact(schema)?.generates;
    }
    catch {
        return undefined;
    }
}
async function countSingleTopLevelTasksFile(changeDir) {
    const tasksPath = path.join(changeDir, 'tasks.md');
    try {
        const content = await fs.readFile(tasksPath, 'utf-8');
        return countTasksFromContent(content);
    }
    catch {
        return { total: 0, completed: 0 };
    }
}
/**
 * Computes a change's task progress by resolving its tracked-tasks artifact and
 * counting checkboxes across every file matched by that artifact's `generates`
 * glob — the same file-resolution `openspec status` uses to detect the tasks
 * artifact (`resolveArtifactOutputs`) — so progress is no longer blind to nested
 * `tasks.md` files (#1202). Falls back to a single top-level `tasks.md` (exactly
 * as before) when the schema is unresolvable, no tracked-tasks artifact is found,
 * or the glob matches no file. Never throws.
 */
export async function getTaskProgressForChange(changesDir, changeName, projectRoot) {
    const changeDir = path.join(changesDir, changeName);
    const generates = resolveTrackedTasksGlob(changeDir, projectRoot);
    if (generates) {
        const files = resolveArtifactOutputs(changeDir, generates);
        if (files.length > 0) {
            let total = 0;
            let completed = 0;
            for (const file of files) {
                try {
                    const content = await fs.readFile(file, 'utf-8');
                    const progress = countTasksFromContent(content);
                    total += progress.total;
                    completed += progress.completed;
                }
                catch {
                    // Swallow files that vanish between glob and read, as before.
                }
            }
            return { total, completed };
        }
    }
    return countSingleTopLevelTasksFile(changeDir);
}
export function formatTaskStatus(progress) {
    if (progress.total === 0)
        return 'No tasks';
    if (progress.completed === progress.total)
        return '✓ Complete';
    return `${progress.completed}/${progress.total} tasks`;
}
//# sourceMappingURL=task-progress.js.map