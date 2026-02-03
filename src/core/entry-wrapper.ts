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
 * The wrapper imports the init module (which initializes dd-trace) before
 * re-exporting everything from the original entry point.
 */
export function generateEntryWrapper(originalPath: string): string {
  // Read the original to detect its exports
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
