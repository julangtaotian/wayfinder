export interface ParsedTask {
    /** Checkbox state: `[x]`/`[X]` is done, anything else is not. */
    done: boolean;
    /** Task text after the checkbox, trimmed (may be empty). */
    description: string;
}
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
export declare function parseTaskLines(content: string): ParsedTask[];
export interface TaskProgress {
    total: number;
    completed: number;
}
export declare function countTasksFromContent(content: string): TaskProgress;
/**
 * Computes a change's task progress by resolving its tracked-tasks artifact and
 * counting checkboxes across every file matched by that artifact's `generates`
 * glob — the same file-resolution `openspec status` uses to detect the tasks
 * artifact (`resolveArtifactOutputs`) — so progress is no longer blind to nested
 * `tasks.md` files (#1202). Falls back to a single top-level `tasks.md` (exactly
 * as before) when the schema is unresolvable, no tracked-tasks artifact is found,
 * or the glob matches no file. Never throws.
 */
export declare function getTaskProgressForChange(changesDir: string, changeName: string, projectRoot: string): Promise<TaskProgress>;
export declare function formatTaskStatus(progress: TaskProgress): string;
//# sourceMappingURL=task-progress.d.ts.map