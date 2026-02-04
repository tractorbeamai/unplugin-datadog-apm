/**
 * Helper utilities for creating custom dd-trace register files.
 *
 * Use these when you need full control over dd-trace initialization
 * but still want the TracerProvider registration handled for you.
 *
 * Example custom register file:
 *
 *   // my-register.mjs
 *   import tracer from 'dd-trace';
 *   import { setupTracer, registerLoaderHook } from 'unplugin-datadog-apm/register-helpers';
 *
 *   tracer.init({ service: 'my-app' });
 *   tracer.use('http', { hooks: { request: (span, req) => { ... } } });
 *
 *   setupTracer(tracer);
 *   registerLoaderHook();
 *
 * Then run with:
 *   node --import ./my-register.mjs dist/server.js
 *
 * @module
 */

import { register } from "node:module";

import type { Tracer } from "dd-trace";

import { IITM_EXCLUSION_PATTERNS } from "./core/constants";

/**
 * Register the TracerProvider with the OpenTelemetry API.
 *
 * This enables `trace.getActiveSpan()` from @opentelemetry/api to work
 * with dd-trace spans.
 *
 * @param tracer - The initialized dd-trace tracer instance.
 */
export function setupTracer(tracer: Tracer): void {
  const tracerProvider = new tracer.TracerProvider();
  tracerProvider.register();

  if (process.env.DD_TRACE_DEBUG) {
    console.log(
      "[unplugin-datadog-apm] TracerProvider registered with OTel API",
    );
  }
}

/**
 * Register the ESM loader hook for dd-trace instrumentation.
 *
 * This enables dd-trace to instrument ESM modules loaded after registration.
 * Should be called from the main thread only.
 *
 * @param exclusions - Optional patterns for modules to exclude from instrumentation.
 */
export function registerLoaderHook(
  exclusions: (string | RegExp)[] = IITM_EXCLUSION_PATTERNS,
): void {
  register("dd-trace/loader-hook.mjs", import.meta.url, {
    data: { exclude: exclusions },
  });

  if (process.env.DD_TRACE_DEBUG) {
    console.log("[unplugin-datadog-apm] ESM loader hook registered");
  }
}

/**
 * Default IITM exclusion patterns for modules that break under import-in-the-middle.
 *
 * Exported for users who want to extend the default exclusions.
 */
export { IITM_EXCLUSION_PATTERNS } from "./core/constants";
