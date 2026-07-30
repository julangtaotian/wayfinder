/**
 * Spec Application Logic
 *
 * Extracted from ArchiveCommand to enable standalone spec application.
 * Applies delta specs from a change to main specs without archiving.
 */
export interface SpecUpdate {
    /** Capability id relative to the specs root, forward-slash separated (e.g. "web" or "platform/session-layout"). */
    id: string;
    source: string;
    target: string;
    exists: boolean;
}
/**
 * Find all delta spec files that need to be applied from a change.
 */
export declare function findSpecUpdates(changeDir: string, mainSpecsDir: string): Promise<SpecUpdate[]>;
/**
 * Build an updated spec by applying delta operations.
 * Returns the rebuilt content and counts of operations.
 */
export declare function buildUpdatedSpec(update: SpecUpdate, changeName: string, options?: {
    silent?: boolean;
}): Promise<{
    rebuilt: string;
    counts: {
        added: number;
        modified: number;
        removed: number;
        renamed: number;
    };
    warnings: string[];
}>;
/**
 * Write an updated spec to disk.
 */
export declare function writeUpdatedSpec(update: SpecUpdate, rebuilt: string, counts: {
    added: number;
    modified: number;
    removed: number;
    renamed: number;
}, options?: {
    silent?: boolean;
    displayPath?: string;
}): Promise<void>;
/**
 * Build a skeleton spec for new capabilities. When the delta spec authored a
 * `## Purpose`, carry it over instead of the TBD placeholder (#1413) - archive
 * invents the Purpose for a brand-new main spec either way, and the author's
 * own wording beats a placeholder they then have to hand-edit.
 */
export declare function buildSpecSkeleton(specFolderName: string, changeName: string, purpose?: string): string;
//# sourceMappingURL=specs-apply.d.ts.map