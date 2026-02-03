/**
 * dd-trace integration utilities.
 *
 * Loads dd-trace internals for module instrumentation detection.
 *
 * @module
 */

import { createRequire } from "node:module";

import type { ExtractedModule } from "./types";

// Use createRequire for loading dd-trace internals (CommonJS)
const require = createRequire(import.meta.url);

/**
 * Set of module names that dd-trace can instrument.
 */
export const ddTraceHooks: Set<string> = new Set<string>(
  Object.keys(
    require("dd-trace/packages/datadog-instrumentations/src/helpers/hooks") as Record<
      string,
      unknown
    >,
  ),
);

/**
 * Extract package name and module path from a full file path.
 * Uses dd-trace's internal utility for consistent behavior.
 */
const ddTraceExtractPackageAndModulePath =
  require("dd-trace/packages/datadog-instrumentations/src/helpers/extract-package-and-module-path") as (
    fullPath: string,
  ) => { pkg: string | null; path: string; pkgJson: string };

export function extractPackageAndModulePath(
  fullPath: string,
): ExtractedModule | null {
  const result = ddTraceExtractPackageAndModulePath(fullPath);
  if (!result.pkg) return null;
  return result as ExtractedModule;
}

/**
 * Detect if a file is an ESM module.
 * Uses dd-trace's internal utility for consistent behavior.
 */
const { isESMFile: ddTraceIsESMFile } =
  require("dd-trace/packages/datadog-esbuild/src/utils") as {
    isESMFile: (
      path: string,
      pkgJsonPath?: string,
      pkgJson?: { type?: string },
    ) => boolean;
  };

export function isESMFile(
  filePath: string,
  pkgJsonPath?: string,
  pkgJson?: { type?: string },
): boolean {
  return ddTraceIsESMFile(filePath, pkgJsonPath, pkgJson);
}
