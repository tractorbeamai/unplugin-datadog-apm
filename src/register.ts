/**
 * dd-trace initialization module for use with Node's --import flag.
 *
 * This module runs BEFORE any application code loads, ensuring dd-trace
 * can intercept all module imports for instrumentation.
 *
 * Usage:
 *   node --import unplugin-datadog-apm/register dist/server.js
 *
 * Configuration is done via environment variables:
 *   - DD_SERVICE: Service name
 *   - DD_ENV: Environment (e.g., "production", "staging")
 *   - DD_VERSION: Service version
 *   - DD_TRACE_DEBUG: Enable debug logging
 *   - DD_TRACE_ENABLED: Enable/disable tracing (default: true)
 *
 * For custom configuration (tracer.use(), sampling rules, etc.),
 * create your own register file using the helpers from register-helpers.
 *
 * @see https://docs.datadoghq.com/tracing/trace_collection/library_config/nodejs/
 * @see https://github.com/DataDog/dd-trace-js/blob/master/initialize.mjs
 *
 * @module
 */

import { register } from "node:module";
import { isMainThread } from "node:worker_threads";

import type { Tracer } from "dd-trace";

import { IITM_EXCLUSION_PATTERNS } from "./core/constants";
import { setupOpenTelemetry } from "./register-helpers";

/**
 * Initialize dd-trace with settings from environment variables.
 *
 * @returns The initialized tracer instance.
 */
function initTracer(): Tracer {
  // Use require for dd-trace to ensure synchronous initialization
  // before any ESM imports are resolved.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, unicorn/prefer-module
  const tracer = require("dd-trace") as Tracer;
  tracer.init();

  if (process.env.DD_TRACE_DEBUG) {
    console.log("[unplugin-datadog-apm] dd-trace initialized");
  }

  return tracer;
}

/**
 * Register the ESM loader hook for dd-trace instrumentation.
 */
function registerLoaderHook(): void {
  register("dd-trace/loader-hook.mjs", import.meta.url, {
    data: { exclude: IITM_EXCLUSION_PATTERNS },
  });

  if (process.env.DD_TRACE_DEBUG) {
    console.log("[unplugin-datadog-apm] ESM loader hook registered");
  }
}

// Only initialize on main thread (worker threads inherit the tracer)
if (isMainThread) {
  const tracer = initTracer();
  setupOpenTelemetry(tracer);
  registerLoaderHook();
}
