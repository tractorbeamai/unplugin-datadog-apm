/**
 * dd-trace integration utilities.
 *
 * Loads dd-trace internals for module instrumentation detection.
 *
 * @module
 */

import { createRequire } from "node:module";

import type { ExtractedModule } from "./types";

// Use createRequire for loading dd-trace internals (CommonJS).
const require = createRequire(import.meta.url);

/**
 * Set of module names that dd-trace can instrument.
 *
 * This powers "should we wrap" decisions for bundle outputs.
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
 * Extract package name and subpath using dd-trace's internal resolver.
 *
 * @param fullPath - Absolute file path within a package.
 * @returns Package info when the path maps to a package, otherwise null.
 */
const ddTraceExtractPackageAndModulePath =
  require("dd-trace/packages/datadog-instrumentations/src/helpers/extract-package-and-module-path") as (
    fullPath: string,
  ) => { pkg: string | null; path: string; pkgJson: string };

/**
 * Extract package name and module path from a full file path.
 *
 * @param fullPath - Absolute file path inside node_modules.
 * @returns Package metadata for dd-trace or null when no package matches.
 */
export function extractPackageAndModulePath(
  fullPath: string,
): ExtractedModule | null {
  const result = ddTraceExtractPackageAndModulePath(fullPath);
  if (!result.pkg) return null;
  return result as ExtractedModule;
}

/**
 * Detect if a file should be treated as ESM.
 *
 * Delegates to dd-trace's internal logic so we match its behavior.
 */
const { isESMFile: ddTraceIsESMFile } =
  require("dd-trace/packages/datadog-esbuild/src/utils") as {
    isESMFile: (
      path: string,
      pkgJsonPath?: string,
      pkgJson?: { type?: string },
    ) => boolean;
  };
/**
 * Check whether a file is ESM based on dd-trace rules.
 *
 * @param filePath - Absolute path to the file to evaluate.
 * @param pkgJsonPath - Optional path to the closest package.json.
 * @param pkgJson - Optional parsed package.json contents.
 */
export function isESMFile(
  filePath: string,
  pkgJsonPath?: string,
  pkgJson?: { type?: string },
): boolean {
  return ddTraceIsESMFile(filePath, pkgJsonPath, pkgJson);
}
