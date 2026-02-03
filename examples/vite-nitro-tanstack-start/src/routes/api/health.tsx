import { context, trace } from "@opentelemetry/api";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => {
        // Get active span from dd-trace via OpenTelemetry API
        // NOTE: In dev mode, this returns null due to Vite↔Nitro IPC boundary.
        // AsyncLocalStorage context doesn't cross process boundaries.
        // Test in production mode (`pnpm build && pnpm start`) for working traces.
        const span = trace.getActiveSpan();
        const spanContext = span?.spanContext();

        console.log("\n=== API HANDLER ===");
        console.log("Active span:", span ? "✓ YES" : "✗ NO");

        if (spanContext) {
          console.log("✓ Span context:");
          console.log("  Trace ID:", spanContext.traceId);
          console.log("  Span ID:", spanContext.spanId);
        } else {
          console.log("✗ No span context");
          console.log("  Context keys:", Object.keys(context.active()));
        }
        console.log("===================\n");

        return Response.json({
          status: "ok",
          timestamp: new Date().toISOString(),
          tracing: {
            hasActiveSpan: !!span,
            traceId: spanContext?.traceId,
            spanId: spanContext?.spanId,
          },
        });
      },
    },
  },
});
