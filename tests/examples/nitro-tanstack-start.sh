#!/usr/bin/env bash
# Integration test for vite-nitro-tanstack-start example.
# Builds the example, starts the server, and verifies tracing works.
# Exit codes: 0 = pass, 1 = fail

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
EXAMPLE_DIR="$ROOT_DIR/examples/vite-nitro-tanstack-start"
PORT=4321

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "==> Building example..."
cd "$EXAMPLE_DIR"
pnpm build > /dev/null 2>&1

echo "==> Starting server on port $PORT..."
PORT=$PORT \
DD_TRACE_STARTUP_LOGS=false \
DD_TRACE_AGENT_URL=http://127.0.0.1:1 \
node --import unplugin-datadog-apm/register .output/server/index.mjs &
SERVER_PID=$!

# Wait for server to be ready
for i in {1..20}; do
  if curl -s "http://localhost:$PORT/api/health" > /dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

echo "==> Checking /api/health endpoint..."
RESPONSE=$(curl -s "http://localhost:$PORT/api/health")

if [[ -z "$RESPONSE" ]]; then
  echo "FAIL: No response from health endpoint"
  exit 1
fi

# Check hasActiveSpan is true
if echo "$RESPONSE" | grep -q '"hasActiveSpan":true'; then
  echo "PASS: Active span detected"
else
  echo "FAIL: No active span"
  echo "Response: $RESPONSE"
  exit 1
fi

# Check traceId exists
if echo "$RESPONSE" | grep -q '"traceId":"[^"]\+"'; then
  echo "PASS: traceId present"
else
  echo "FAIL: traceId missing"
  echo "Response: $RESPONSE"
  exit 1
fi

echo "==> All checks passed"
exit 0
