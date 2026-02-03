import { context, trace } from "@opentelemetry/api";
import express from "express";

const app = express();
const PORT = process.env.PORT ?? "3000";

app.use(express.json());

app.get("/api/health", (_req, res) => {
  // Get active span from dd-trace via OpenTelemetry API
  const span = trace.getActiveSpan();
  const spanContext = span?.spanContext();

  console.log("\n=== API HANDLER ===");
  console.log("Active span:", span ? "YES" : "NO");

  if (spanContext) {
    console.log("Span context:");
    console.log("  Trace ID:", spanContext.traceId);
    console.log("  Span ID:", spanContext.spanId);
  } else {
    console.log("No span context");
    console.log("  Context keys:", Object.keys(context.active()));
  }
  console.log("===================\n");

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    tracing: {
      hasActiveSpan: !!span,
      traceId: spanContext?.traceId,
      spanId: spanContext?.spanId,
    },
  });
});

app.get("/", (_req, res) => {
  res.json({
    message: "Express API with Datadog APM",
    endpoints: ["/", "/api/health"],
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
