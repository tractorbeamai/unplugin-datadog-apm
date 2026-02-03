# TanStack Start + Datadog APM Example

This example demonstrates using `unplugin-datadog-apm` with:

- Vite 8
- Nitro (nightly)
- TanStack Start

## Setup

1. Install dependencies from the repo root:

```bash
pnpm install
```

2. Build the plugin (required for the workspace link to work):

```bash
pnpm build
```

3. Navigate to this example:

```bash
cd examples/tanstack-start
```

## Development

Set your Datadog environment variables:

```bash
export DD_SERVICE=my-app
export DD_ENV=development
export DD_TRACE_ENABLED=true
export DD_TRACE_DEBUG=true  # optional, shows instrumented modules
```

Run the dev server:

```bash
pnpm dev
```

## Production

Build the app:

```bash
pnpm build
```

Run the production server:

```bash
pnpm start
```

## Key Files

- `vite.config.ts` - Vite configuration with the Datadog APM plugin
- `src/start.ts` - TanStack Start instance with tracing middleware
- `src/routes/` - TanStack Router file-based routes

## How it Works

The `DatadogAPM()` plugin automatically:

1. Initializes dd-trace before any HTTP modules load
2. Wraps instrumentable modules (http, pg, redis, etc.) at build time
3. Registers TracerProvider with OpenTelemetry API

This allows you to use `@opentelemetry/api` (e.g., `trace.getActiveSpan()`) to access spans created by dd-trace.

## Tracing Behavior

### Production Mode (`pnpm build && pnpm start`)

✅ **Fully functional** - dd-trace initializes in the Nitro worker where API handlers execute:

- dd-trace initialization logs appear
- HTTP requests are traced
- `trace.getActiveSpan()` should return active spans (once Nitro nightly is stable)
- AsyncLocalStorage context propagates correctly

### Dev Mode (`pnpm dev`)

⚠️ **Partial functionality** - Vite and Nitro run in separate processes communicating via IPC/Unix sockets:

- ✅ Plugin loads and instruments modules
- ✅ Build-time transformations work correctly
- ✗ dd-trace doesn't initialize in the Nitro worker (technical limitation)
- ✗ `trace.getActiveSpan()` returns `null` in API handlers
- ✗ AsyncLocalStorage context doesn't cross the IPC boundary

**Why?** The rollup banner that injects dd-trace initialization only applies to production builds, not dynamic dev mode module loading.

**Recommendation**: Use production builds (`pnpm build && pnpm start`) for testing tracing functionality.
