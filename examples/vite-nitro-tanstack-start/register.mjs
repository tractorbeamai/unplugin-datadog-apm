/**
 * Custom dd-trace register file for TanStack Start + Nitro.
 *
 * This demonstrates how to customize dd-trace initialization beyond
 * environment variables. Use this approach when you need:
 * - tracer.use() configuration for specific integrations
 * - Custom sampling rules
 * - Plugin-specific hooks
 *
 * Usage:
 *   node --import ./register.mjs .output/server/index.mjs
 *
 * @see https://docs.datadoghq.com/tracing/trace_collection/library_config/nodejs/
 */
import tracer from "dd-trace";
import {
  registerLoaderHook,
  setupTracer,
} from "unplugin-datadog-apm/register-helpers";

// Initialize dd-trace with custom configuration
tracer.init({
  // Service name (can also use DD_SERVICE env var)
  service: process.env.DD_SERVICE || "tanstack-start-app",

  // Environment (can also use DD_ENV env var)
  env: process.env.DD_ENV || "development",

  // Enable debug logging to see instrumented modules
  debug: !!process.env.DD_TRACE_DEBUG,

  // Disable startup logs for cleaner output
  startupLogs: false,
});

// Disable URL instrumentation to work around Node.js 22+ private field error
// @see KNOWN_ISSUES.md "dd-trace URL Instrumentation Error (Node.js 22+)"
tracer.use("url", false);

// Example: Configure HTTP integration with custom hooks
tracer.use("http", {
  client: {
    // Add custom tags to outgoing HTTP requests
    hooks: {
      request: (span, req) => {
        if (span && req) {
          span.setTag("http.custom_tag", "example");
        }
      },
    },
  },
});

// Example: Configure fetch integration (Node 18+)
tracer.use("fetch", {
  // Add custom tags to fetch requests
  hooks: {
    request: (span, req) => {
      if (span && req) {
        span.setTag("fetch.custom_tag", "example");
      }
    },
  },
});

// Register TracerProvider with OpenTelemetry API
// This enables trace.getActiveSpan() from @opentelemetry/api
setupTracer(tracer);

// Register the ESM loader hook for module instrumentation
registerLoaderHook();

if (process.env.DD_TRACE_DEBUG) {
  console.log("[custom-register] dd-trace initialized with custom config");
}
