import { type AIToolOption } from './config.js';
/** Reads a valid-looking marker value without letting linked roots escape. */
export declare function readSharedSkillTarget(projectPath: string, skillsDir: string): string | undefined;
/**
 * A shared skill root can only hold one rendered variant of each skill.
 * Keep the writer recorded so later updates do not infer every tool that
 * happens to use the same directory.
 */
export declare function reconcileSharedSkillTargets(projectPath: string, tools: AIToolOption[]): AIToolOption[];
/**
 * Returns whether a tool is the active writer for its physical skills root.
 * Non-shared roots are always active.
 */
export declare function isSharedSkillTargetActive(projectPath: string, toolId: string): boolean;
export declare function writeSharedSkillTarget(projectPath: string, toolId: string): void;
//# sourceMappingURL=shared-skill-target.d.ts.map