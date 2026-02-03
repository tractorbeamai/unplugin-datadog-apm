# esbuild + Express Example

Example Express API bundled with esbuild, demonstrating `unplugin-datadog-apm` instrumentation.

## Setup

```bash
pnpm install
```

## Build and Run

```bash
# Build the bundle
pnpm build

# Start the server
pnpm start
```

## Test the Health Check

```bash
curl http://localhost:3000/api/health
```

Expected response when tracing is working:

```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "tracing": {
    "hasActiveSpan": true,
    "traceId": "...",
    "spanId": "..."
  }
}
```

## How It Works

1. `build.mjs` uses esbuild with the `unplugin-datadog-apm/esbuild` plugin
2. The plugin wraps instrumentable modules (like `express`, `router`, `body-parser`) for dd-trace
3. A banner imports `unplugin-datadog-apm/init` before any bundled code runs
4. The init module initializes dd-trace and registers the TracerProvider with OpenTelemetry API
5. The `/api/health` endpoint uses `@opentelemetry/api` to verify tracing is active
