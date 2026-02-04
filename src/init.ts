/**
 * dd-trace initialization module.
 *
 * This module should run BEFORE any instrumented modules are imported.
 * For Vite/Nitro, this is automatically configured.
 * For other bundlers, entry points are wrapped with inline initialization code.
 * This module is used by Vite/Nitro's unenv polyfill mechanism.
 *
 * Based on dd-trace's initialize.mjs, this module:
 * 1. Only initializes on the main thread
 * 2. Initializes dd-trace via synchronous require (before any ESM imports)
 * 3. Registers the ESM loader hook for runtime instrumentation of external modules
 *
 * Configuration is done via environment variables:
 * - DD_SERVICE: Service name
 * - DD_ENV: Environment (e.g., "production", "staging")
 * - DD_VERSION: Service version
 * - DD_TRACE_DEBUG: Enable debug logging
 * - DD_TRACE_ENABLED: Enable/disable tracing (default: true)
 *
 * @see https://docs.datadoghq.com/tracing/trace_collection/library_config/nodejs/
 * @see https://github.com/DataDog/dd-trace-js/blob/master/initialize.mjs
 *
 * @module
 */

import * as Module from "node:module";
import { createRequire } from "node:module";
import { isMainThread } from "node:worker_threads";

import { IITM_EXCLUSION_PATTERNS } from "./core/constants";
import { initTracer } from "./core/init-tracer";

// Only initialize on main thread (same as native dd-trace)
// Worker threads inherit the tracer from the main thread
const require = createRequire(import.meta.url);
initTracer({
  require,
  debug: Boolean(process.env.DD_TRACE_DEBUG),
  registerLoaderHook: true,
  moduleNamespace: Module,
  loaderHookBaseUrl: import.meta.url,
  iitmExclusions: IITM_EXCLUSION_PATTERNS,
  isMainThread,
});
