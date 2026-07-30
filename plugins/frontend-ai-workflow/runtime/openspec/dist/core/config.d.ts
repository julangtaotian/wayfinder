export declare const OPENSPEC_DIR_NAME = "openspec";
export declare const OPENSPEC_MARKERS: {
    start: string;
    end: string;
};
export interface OpenSpecConfig {
    aiTools: string[];
}
export interface AIToolOption {
    name: string;
    value: string;
    available: boolean;
    successLabel?: string;
    skillsDir?: string;
    detectionPaths?: string[];
    setupNote?: string;
}
export declare const AI_TOOLS: AIToolOption[];
/**
 * Retired tool ids that still resolve, so a rebrand does not break scripted
 * `--tools` invocations. Windsurf was rebranded to Devin Desktop on
 * 2026-06-02 and its config directory moved from `.windsurf/` to `.devin/`;
 * `--tools windsurf` therefore configures `devin`.
 */
export declare const TOOL_ID_ALIASES: Record<string, string>;
/**
 * Resolves a tool id through TOOL_ID_ALIASES, leaving current ids untouched.
 */
export declare function resolveToolIdAlias(toolId: string): string;
//# sourceMappingURL=config.d.ts.map