/**
 * Init Command
 *
 * Sets up OpenSpec with Agent Skills and /opsx:* slash commands.
 * This is the unified setup command that replaces both the old init and experimental commands.
 */
type InitCommandOptions = {
    tools?: string;
    force?: boolean;
    interactive?: boolean;
    profile?: string;
    /** Commander's --no-animation flag: false disables the welcome animation. */
    animation?: boolean;
};
export declare class InitCommand {
    private readonly toolsArg?;
    private readonly force;
    private readonly interactiveOption?;
    private readonly profileOverride?;
    private readonly animation;
    constructor(options?: InitCommandOptions);
    execute(targetPath: string): Promise<void>;
    private validate;
    private canPromptInteractively;
    private resolveProfileOverride;
    /**
     * Resolves the workflows the effective profile installs, so onboarding output
     * only mentions commands that will actually exist.
     */
    private getActiveWorkflows;
    /**
     * Cleans repo-local legacy artifacts immediately and defers global Codex prompt
     * cleanup until replacement skills have been installed.
     */
    private handleLegacyCleanup;
    /**
     * Applies the safe subset of legacy cleanup that does not depend on newly
     * generated Codex skills.
     */
    private performImmediateLegacyCleanup;
    /**
     * Removes only the legacy global Codex prompts whose workflows now have
     * replacement skills in the project.
     */
    private finalizeDeferredLegacyCleanup;
    /**
     * Reads the currently installed workflow IDs for a single tool from the
     * generated skill layout on disk.
     */
    private getInstalledWorkflowsForTool;
    private performLegacyCleanup;
    private getSelectedTools;
    private resolveToolsArg;
    private validateTools;
    private createDirectoryStructure;
    /**
     * Generates skill files and slash commands for each selected tool,
     * honoring the configured delivery mode (skills, commands, or both).
     *
     * @param projectPath - Absolute path to the project root
     * @param tools - Selected tools with their skill directory metadata
     * @returns Created, refreshed, and failed tools plus removed artifact counts
     */
    private generateSkillsAndCommands;
    private createConfig;
    private displaySuccessMessage;
    private startSpinner;
    private removeSkillDirs;
    private removeCommandFiles;
}
export {};
//# sourceMappingURL=init.d.ts.map