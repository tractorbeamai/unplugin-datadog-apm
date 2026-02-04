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
 *   import { setupOpenTelemetry, setupESMImports } from 'unplugin-datadog-apm/register-helpers';
 *
 *   tracer.init({ service: 'my-app' });
 *   tracer.use('http', { hooks: { request: (span, req) => { ... } } });
 *
 *   setupOpenTelemetry(tracer);
 *   setupESMImports();
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
export function setupOpenTelemetry(tracer: Tracer): void {
  const tracerProvider = new tracer.TracerProvider();
  tracerProvider.register();

  if (process.env.DD_TRACE_DEBUG) {
    console.log(
      "[unplugin-datadog-apm] TracerProvider registered with OTel API",
    );
  }
}

/**
 * Register the TracerProvider with the OpenTelemetry API.
 *
 * @param tracer - The initialized dd-trace tracer instance.
 * @deprecated Use `setupOpenTelemetry` instead. Will be removed in a future major version.
 */
export const setupTracer: typeof setupOpenTelemetry = setupOpenTelemetry;

/**
 * Register the ESM loader hook for dd-trace instrumentation.
 *
 * This enables dd-trace to instrument ESM modules loaded after registration.
 * Should be called from the main thread only.
 *
 * @param exclusions - Optional patterns for modules to exclude from instrumentation.
 */
export function setupESMImports(
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
 * Register the ESM loader hook for dd-trace instrumentation.
 *
 * @param exclusions - Optional patterns for modules to exclude from instrumentation.
 * @deprecated Use `setupESMImports` instead. Will be removed in a future major version.
 */
export const registerLoaderHook: typeof setupESMImports = setupESMImports;

/**
 * Default IITM exclusion patterns for modules that break under import-in-the-middle.
 *
 * Exported for users who want to extend the default exclusions.
 */
export { IITM_EXCLUSION_PATTERNS } from "./core/constants";
