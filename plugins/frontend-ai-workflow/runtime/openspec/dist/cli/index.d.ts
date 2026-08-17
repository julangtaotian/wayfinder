import { Command } from 'commander';
declare const program: Command;
/**
 * Get the full command path for nested commands.
 * For example: 'change show' -> 'change:show'
 */
export declare function getCommandPath(command: Command): string;
/**
 * True when the executing command asked for JSON output — used to suppress the
 * first-run telemetry notice so stdout stays a single valid JSON document.
 *
 * `--json` reaches commands three ways, so a single parsed option is not enough:
 * - declared on the leaf (`openspec status --json`) → `opts().json`
 * - declared on a parent group and read via globals (`openspec workset --json list`)
 *   → `optsWithGlobals().json`
 * - a residual arg on a permissive group that never declares the option
 *   (`openspec store --json`, which detects it from `command.args`) → `args`
 *
 * Suppressing is always safe: the disclosure is only deferred to the next
 * non-JSON run, never lost, whereas printing it on a JSON run corrupts stdout.
 */
export declare function isJsonRun(command: Command): boolean;
export { program };
export declare function runCli(argv?: string[]): void;
//# sourceMappingURL=index.d.ts.map