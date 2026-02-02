import { context, trace } from "@opentelemetry/api";
import { createMiddleware, createStart } from "@tanstack/react-start";

/**
 * Request middleware that logs the active span context from OpenTelemetry API.
 * This validates that dd-trace's HTTP auto-instrumentation is working and
 * trace context is flowing properly through the request.
 */
const tracingMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const span = trace.getActiveSpan();
    const spanContext = span?.spanContext();

    console.log("\n=== TRACING MIDDLEWARE ===");
    console.log("Request:", request.method, request.url);
    console.log("Active span:", span ? "✓ YES" : "✗ NO");

    if (spanContext) {
      console.log("✓ Span context found:");
      console.log("  Trace ID:", spanContext.traceId);
      console.log("  Span ID:", spanContext.spanId);
      console.log("  Trace Flags:", spanContext.traceFlags);
    } else {
      console.log(
        "✗ No span context - dd-trace HTTP instrumentation may not be working",
      );
      console.log("  Context keys:", Object.keys(context.active()));
    }
    console.log("=========================\n");

    return next();
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [tracingMiddleware],
}));
