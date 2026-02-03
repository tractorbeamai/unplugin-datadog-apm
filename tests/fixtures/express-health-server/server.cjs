/**
 * Express health check server for runtime verification tests.
 * Uses dd-trace auto-instrumentation to capture spans.
 */
const express = require("express");
const { trace } = require("@opentelemetry/api");

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
