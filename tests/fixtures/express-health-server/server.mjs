/**
 * Express health check server for runtime verification tests (ESM).
 * Uses dynamic imports so the loader hook can intercept them.
 * Static ESM imports are hoisted and resolved before any code runs,
 * which means the loader hook would be registered too late.
 */
async function main() {
  const express = (await import("express")).default;
  const { trace } = await import("@opentelemetry/api");

  const app = express();

  app.get("/health", (req, res) => {
    const span = trace.getActiveSpan();
    const ctx = span?.spanContext();
    res.json({
      hasActiveSpan: !!span,
      traceId: ctx?.traceId,
      spanId: ctx?.spanId,
    });
  });

  const server = app.listen(0, () => {
    const addr = server.address();
    console.log("LISTENING:" + addr.port);
  });
}

main();
