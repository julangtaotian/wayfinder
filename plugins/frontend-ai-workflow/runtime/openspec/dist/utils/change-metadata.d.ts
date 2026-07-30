import { type ChangeMetadata } from '../core/change-metadata/index.js';
import { type ProjectConfig } from '../core/project-config.js';
export declare const METADATA_FILENAME = ".openspec.yaml";
/**
 * Error thrown when change metadata validation fails.
 */
export declare class ChangeMetadataError extends Error {
    readonly metadataPath: string;
    readonly cause?: Error | undefined;
    constructor(message: string, metadataPath: string, cause?: Error | undefined);
}
/**
 * Validates that a schema name is valid (exists in available schemas).
 *
 * @param schemaName - The schema name to validate
 * @param projectRoot - Optional project root for project-local schema resolution
 * @returns The validated schema name
 * @throws Error if schema is not found
 */
export declare function validateSchemaName(schemaName: string, projectRoot?: string): string;
/**
 * Writes change metadata to .openspec.yaml in the change directory.
 *
 * @param changeDir - The path to the change directory
 * @param metadata - The metadata to write
 * @param projectRoot - Optional project root for project-local schema resolution
 * @throws ChangeMetadataError if validation fails or write fails
 */
export declare function writeChangeMetadata(changeDir: string, metadata: ChangeMetadata, projectRoot?: string): void;
/**
 * Reads change metadata from .openspec.yaml in the change directory.
 *
 * @param changeDir - The path to the change directory
 * @param projectRoot - Optional project root for project-local schema resolution
 * @returns The validated metadata, or null if no metadata file exists
 * @throws ChangeMetadataError if the file exists but is invalid
 */
export declare function readChangeMetadata(changeDir: string, projectRoot?: string): ChangeMetadata | null;
export interface ResolveSchemaForChangeOptions {
    metadata?: ChangeMetadata | null;
    /** Pre-read project config; suppresses the fallback config read when provided. */
    projectConfig?: ProjectConfig | null;
}
/**
 * Resolves the schema for a change, with explicit override taking precedence.
 *
 * Resolution order:
 * 1. Explicit schema (if provided)
 * 2. Schema from .openspec.yaml metadata (if exists)
 * 3. Schema from openspec/config.yaml (if exists)
 * 4. Default 'spec-driven'
 *
 * @param changeDir - The path to the change directory
 * @param explicitSchema - Optional explicit schema override
 * @returns The resolved schema name
 */
export declare function resolveSchemaForChange(changeDir: string, explicitSchema?: string, projectRootOverride?: string, options?: ResolveSchemaForChangeOptions): string;
export interface SkipSpecsMarker {
    /**
     * True when the metadata parses under ChangeMetadataSchema, sets
     * skip_specs: true, and names a schema that loads.
     */
    declared: boolean;
    /**
     * Set when the marker cannot be honored: skip_specs appears in a file that
     * fails the metadata contract, or the metadata file exists but cannot be
     * read at all (so whether the marker is set cannot even be determined).
     */
    invalidReason?: string;
}
/**
 * Non-throwing read of the skip_specs marker. The marker only counts when the
 * metadata would load for status/instructions: the file parses under
 * ChangeMetadataSchema, its schema name passes readChangeMetadata's
 * listSchemas membership check, AND the schema itself loads via resolveSchema
 * (a schema.yaml that exists but does not parse fails status just the same).
 * Validate and archive must never honor metadata the rest of the CLI rejects,
 * in either direction. The project root for schema resolution is derived from
 * changeDir exactly like resolveSchemaForChange (changeDir is
 * <root>/openspec/changes/<name> for every root type, including store roots).
 * Missing metadata means "not declared"; a marker that cannot be honored
 * yields invalidReason so callers can say why.
 */
export declare function readSkipSpecsMarker(changeDir: string): SkipSpecsMarker;
//# sourceMappingURL=change-metadata.d.ts.map