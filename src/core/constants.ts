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

// -----------------------------------------------------------------------------
// Module Identifiers
// -----------------------------------------------------------------------------

/** Diagnostic channel name for dd-trace bundler integration. */
export const CHANNEL = "dd-trace:bundler:load";

/** Suffix for ESM proxy virtual modules. */
export const ESM_PROXY_SUFFIX = "?__dd_esm_proxy__";

/** Module specifier for the init entry point (legacy, kept for compatibility). */
export const INIT_MODULE = "unplugin-datadog-apm/init";

/** Module specifier for the --import register helper. */
export const REGISTER_MODULE = "unplugin-datadog-apm/register";

/** Module specifier for the register helpers. */
export const REGISTER_HELPERS_MODULE = "unplugin-datadog-apm/register-helpers";

/** Path segment for detecting node_modules. */
export const NODE_MODULES = "node_modules/";

// -----------------------------------------------------------------------------
// Externals
// -----------------------------------------------------------------------------

/**
 * Runtime dependencies that should never be bundled.
 *
 * This list is the single source of truth; bundler-specific external formats
 * (string-only vs regex-capable) are derived from it below.
 */
export const RUNTIME_EXTERNALS = [
  "dd-trace",
  "@opentelemetry/api",
  "@openfeature/core",
  "dc-polyfill",
  "import-in-the-middle",
  "unplugin-datadog-apm",
] as const;

/**
 * Known subpath imports that can appear in generated output or runtime init code.
 *
 * These are safe to externalize everywhere and help bundlers that only accept
 * string externals (e.g., esbuild, Vite SSR).
 */
function buildRuntimeExternalSubpaths(): readonly string[] {
  return [
    INIT_MODULE,
    REGISTER_MODULE,
    REGISTER_HELPERS_MODULE,
    "dd-trace/loader-hook.mjs",
    "import-in-the-middle/lib/register.js",
    "import-in-the-middle/lib/get-exports.mjs",
  ];
}

export const RUNTIME_EXTERNAL_SUBPATHS: readonly string[] =
  buildRuntimeExternalSubpaths();

/**
 * String-only externals list (base packages + known subpaths).
 */
function buildStringExternals(): readonly string[] {
  return [...RUNTIME_EXTERNALS, ...RUNTIME_EXTERNAL_SUBPATHS];
}

export const STRING_EXTERNALS: readonly string[] = buildStringExternals();

/**
 * String-only externals list for bundlers that do not support RegExp externals.
 *
 * This is safe for esbuild and also useful for Vite SSR config, which expects
 * string externals.
 */
export const STRING_ONLY_EXTERNALS: readonly string[] = STRING_EXTERNALS;

/**
 * Modules that must stay external in rollup-style builds.
 *
 * Regex patterns handle subpath imports that should not be bundled.
 */
export const ROLLUP_EXTERNALS: (string | RegExp)[] = [
  ...STRING_EXTERNALS,
  /^dd-trace\//,
  /^@openfeature\/core\//,
  /^import-in-the-middle\//,
  /^unplugin-datadog-apm\//,
];
