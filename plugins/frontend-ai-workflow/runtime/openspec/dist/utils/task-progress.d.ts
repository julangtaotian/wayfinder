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