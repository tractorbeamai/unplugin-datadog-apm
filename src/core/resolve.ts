/**
 * Module resolution utilities.
 *
 * @module
 */

import { builtinModules, createRequire } from "node:module";
import path from "node:path";

import { resolveModulePath } from "exsolve";

/**
 * Set of Node.js built-in modules (with and without node: prefix).
 */
export const BUILTINS: Set<string> = new Set<string>(
  builtinModules.flatMap((m) => [m, `node:${m}`]),
);

/**
 * Resolve a module path from a given directory.
 *
 * @param modulePath - Import specifier to resolve.
 * @param resolveDir - Directory used as the resolution base.
 * @returns Absolute path to the resolved module.
 */
export function resolveModule(modulePath: string, resolveDir: string): string {
  // Try exsolve first with CJS-preferred conditions (handles exports field, cached)
  const fromPath = resolveDir.endsWith("/") ? resolveDir : `${resolveDir}/`;
  const resolved = resolveModulePath(modulePath, {
    from: fromPath,
    conditions: ["node", "require", "import"], // Prefer CJS over ESM for conditional exports
    try: true, // Return undefined instead of throwing
  });

  if (resolved) {
    return resolved;
  }

  // Fall back to createRequire for legacy packages without exports field
  let resolvedPath = modulePath;
  if (modulePath === ".") resolvedPath = "./";
  else if (modulePath === "..") resolvedPath = "../";

  const require = createRequire(path.join(resolveDir, "package.json"));
  return require.resolve(resolvedPath);
}

/**
 * Extract the base module name from an import specifier.
 *
 * @param importee - Import specifier as written by user code.
 * @returns Base package name for scoped or unscoped imports.
 */
export function getBaseModuleName(importee: string): string {
  if (importee.startsWith("@")) {
    return importee.split("/").slice(0, 2).join("/");
  }
  return importee.split("/")[0] ?? importee;
}
