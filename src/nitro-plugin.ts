/**
 * Nitro runtime plugin for dd-trace initialization.
 *
 * This plugin runs once during Nitro server startup, BEFORE any request handlers
 * are loaded. This allows dd-trace to intercept module loading and instrument
 * HTTP clients, databases, etc.
 *
 * Works in both dev mode and production builds.
 *
 * @module
 */

import { createRequire } from "node:module";

import { initTracer } from "./core/init-tracer";

const require = createRequire(import.meta.url);

/**
 * Nitro plugin that initializes dd-trace at server startup.
 *
 * Exported as a plain function; Nitro's defineNitroPlugin is a passthrough.
 */
export default function datadogApmPlugin(): void {
  initTracer({
    require,
    debug: Boolean(process.env.DD_TRACE_DEBUG),
    debugMessages: {
      init: "[unplugin-datadog-apm] dd-trace initialized in Nitro",
      tracerProvider:
        "[unplugin-datadog-apm] TracerProvider registered with OTel API",
    },
  });
}
