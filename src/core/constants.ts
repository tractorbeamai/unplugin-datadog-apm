/**
 * Shared constants for unplugin-datadog-apm.
 *
 * @module
 */

// -----------------------------------------------------------------------------
// IITM Exclusions
// -----------------------------------------------------------------------------

/**
 * Packages that don't work well with import-in-the-middle.
 * Used by both the init module and the esbuild banner injection.
 */
export const IITM_EXCLUSION_PATTERNS: RegExp[] = [
  /langsmith/,
  /openai\/_shims/,
  /openai\/resources\/chat\/completions\/messages/,
  /openai\/agents-core\/dist\/shims/,
  /@anthropic-ai\/sdk\/_shims/,
];

/**
 * Serialize exclusion patterns to a JavaScript code string for banner injection.
 * Converts RegExp objects to their string representation (e.g., /pattern/).
 */
export function serializeExclusionsToCode(): string {
  return `[${IITM_EXCLUSION_PATTERNS.map((r) => r.toString()).join(", ")}]`;
}

// -----------------------------------------------------------------------------
// Module Identifiers
// -----------------------------------------------------------------------------

/** Diagnostic channel name for dd-trace bundler integration */
export const CHANNEL = "dd-trace:bundler:load";

/** Suffix for ESM proxy virtual modules */
export const ESM_PROXY_SUFFIX = "?__dd_esm_proxy__";

/** Prefix for entry wrapper virtual modules */
export const ENTRY_WRAPPER_PREFIX = "\0dd-entry:";

/** The init module specifier */
export const INIT_MODULE = "unplugin-datadog-apm/init";

/** Path segment for detecting node_modules */
export const NODE_MODULES = "node_modules/";

/** Rollup banner for production builds - imports the init module first */
export const DD_TRACE_INIT_BANNER = `
// Auto-injected by unplugin-datadog-apm
import 'unplugin-datadog-apm/init';
`;

// -----------------------------------------------------------------------------
// Externals
// -----------------------------------------------------------------------------

/**
 * Modules that must be external for esbuild (simplified list).
 * esbuild handles regex patterns differently, so we only use strings.
 */
export const ESBUILD_EXTERNALS = [
  "dd-trace",
  "@opentelemetry/api",
  "unplugin-datadog-apm",
] as const;

/**
 * Modules that must be external for rollup-based bundlers.
 * Includes regex patterns for subpath imports.
 */
export const ROLLUP_EXTERNALS: (string | RegExp)[] = [
  "dd-trace",
  /^dd-trace\//,
  "@opentelemetry/api",
  "dc-polyfill",
  "import-in-the-middle",
  /^import-in-the-middle\//,
  "unplugin-datadog-apm",
  /^unplugin-datadog-apm\//,
];
