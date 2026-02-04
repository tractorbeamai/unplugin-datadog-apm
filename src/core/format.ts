/**
 * Format detection utilities for bundler output.
 *
 * @module
 */

/**
 * Check if the given format string indicates ESM output.
 *
 * @param format - The output format string from the bundler.
 * @returns True if the format is ESM.
 */
export function isEsmFormat(format?: string): boolean {
  return format === "es" || format === "esm" || format === "module";
}
