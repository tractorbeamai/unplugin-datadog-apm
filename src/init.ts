/**
 * dd-trace initialization module.
 *
 * This module should run BEFORE any HTTP modules are imported.
 * For Vite/Nitro, this is automatically configured.
 * For other bundlers, entry points are wrapped to import this module first.
 *
 * Configuration is done via environment variables:
 * - DD_SERVICE: Service name
 * - DD_ENV: Environment (e.g., "production", "staging")
 * - DD_VERSION: Service version
 * - DD_TRACE_DEBUG: Enable debug logging
 * - DD_TRACE_ENABLED: Enable/disable tracing (default: true)
 *
 * @see https://docs.datadoghq.com/tracing/trace_collection/library_config/nodejs/
 *
 * @module
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Initialize on import (side-effect module)
const tracer = require("dd-trace");
tracer.init();

if (process.env.DD_TRACE_DEBUG) {
  console.log("[unplugin-datadog-apm] dd-trace initialized");
}

const tracerProvider = new tracer.TracerProvider();
tracerProvider.register();

if (process.env.DD_TRACE_DEBUG) {
  console.log("[unplugin-datadog-apm] TracerProvider registered with OTel API");
}
