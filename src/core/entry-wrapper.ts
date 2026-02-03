/**
 * Entry point wrapper generation.
 *
 * Generates wrapper modules that import dd-trace initialization before
 * the actual entry point code.
 *
 * @module
 */

import { readFileSync } from "node:fs";

import { INIT_MODULE } from "./constants";
import { parseExportsFromSource } from "./esm-proxy";

/**
 * Generate wrapper code for an entry point that imports init first.
 *
 * @param originalPath - Absolute path to the real entry file.
 * @returns Wrapper module source that re-exports the entry exports.
 */
export function generateEntryWrapper(originalPath: string): string {
  // Read the original to detect its exports.
  let hasDefault = false;

  try {
    const code = readFileSync(originalPath, "utf8");
    const exports = parseExportsFromSource(code);
    hasDefault = exports.includes("default");
  } catch {
    // If we can't parse, just re-export everything
  }

  const lines = [
    `// Auto-generated entry wrapper by unplugin-datadog-apm`,
    `import ${JSON.stringify(INIT_MODULE)};`,
    `export * from ${JSON.stringify(originalPath)};`,
  ];

  if (hasDefault) {
    lines.push(`export { default } from ${JSON.stringify(originalPath)};`);
  }

  return lines.join("\n");
}
