/**
 * Shared constants for unplugin-datadog-apm.
 *
 * @module
 */

// -----------------------------------------------------------------------------
// IITM Exclusions
// -----------------------------------------------------------------------------

/**
 * Patterns for packages that break under import-in-the-middle.
 *
 * Consumers use this list to opt out of ESM loader interception while
 * keeping tracing enabled for other modules.
 */
export const IITM_EXCLUSION_PATTERNS: RegExp[] = [
  /langsmith/,
  /openai\/_shims/,
  /openai\/resources\/chat\/completions\/messages/,
  /openai\/agents-core\/dist\/shims/,
  /@anthropic-ai\/sdk\/_shims/,
];

/**
 * Serialize the exclusions into a JS code literal for injection.
 *
 * @returns JavaScript array literal of regex source strings.
 */
export function serializeExclusionsToCode(): string {
  return `[${IITM_EXCLUSION_PATTERNS.map((r) => r.toString()).join(", ")}]`;
}

// -----------------------------------------------------------------------------
// Module Identifiers
// -----------------------------------------------------------------------------

/** Diagnostic channel name for dd-trace bundler integration. */
export const CHANNEL = "dd-trace:bundler:load";

/** Suffix for ESM proxy virtual modules. */
export const ESM_PROXY_SUFFIX = "?__dd_esm_proxy__";

/** Prefix for entry wrapper virtual modules. */
export const ENTRY_WRAPPER_PREFIX = "\0dd-entry:";

/** Module specifier for the init entry point. */
export const INIT_MODULE = "unplugin-datadog-apm/init";

/** Path segment for detecting node_modules. */
export const NODE_MODULES = "node_modules/";

/** Rollup banner for production builds; imports init first. */
export const DD_TRACE_INIT_BANNER = `
// Auto-injected by unplugin-datadog-apm
import 'unplugin-datadog-apm/init';
`;

// -----------------------------------------------------------------------------
// Externals
// -----------------------------------------------------------------------------

/**
 * Modules that must stay external in esbuild builds.
 *
 * esbuild treats RegExp externals differently from rollup, so this list is
 * intentionally string-only.
 */
export const ESBUILD_EXTERNALS = [
  "dd-trace",
  "@opentelemetry/api",
  "unplugin-datadog-apm",
] as const;

/**
 * Modules that must stay external in rollup-style builds.
 *
 * Regex patterns handle subpath imports that should not be bundled.
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
