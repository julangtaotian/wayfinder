interface ExecuteOptions {
    all?: boolean;
    changes?: boolean;
    specs?: boolean;
    type?: string;
    strict?: boolean;
    json?: boolean;
    noInteractive?: boolean;
    interactive?: boolean;
    concurrency?: string;
    store?: string;
    storePath?: string;
}
export declare class ValidateCommand {
    execute(itemName: string | undefined, options?: ExecuteOptions): Promise<void>;
    private normalizeType;
    /**
     * Resolve change IDs by directory existence within the resolved root — the
     * same rule `openspec status`/`instructions` use (`getAvailableChanges`) —
     * rather than requiring `proposal.md`. This lets `validate` resolve a
     * scaffolded or still-authoring change that the sibling commands already
     * resolve (#1182). Sorted to preserve the prior `getActiveChangeIds` ordering.
     */
    private listChangeIds;
    private runInteractiveSelector;
    private printNonInteractiveHint;
    private validateDirectItem;
    private validateByType;
    private printReport;
    private printNextSteps;
    private runBulkValidation;
}
export {};
//# sourceMappingURL=validate.d.ts.map