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
cd examples/vite-nitro-tanstack-start
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
- `register.mjs` - Custom dd-trace register file with tracer.use() examples
- `src/start.ts` - TanStack Start instance with tracing middleware
- `src/routes/` - TanStack Router file-based routes

## How it Works

The `DatadogAPM()` plugin automatically wraps instrumentable modules (http, pg, redis, etc.) at build time for dd-trace compatibility.

At runtime, `--import unplugin-datadog-apm/register` ensures dd-trace initializes before any app code loads. This:

1. Initializes dd-trace with environment variable configuration
2. Registers the TracerProvider with OpenTelemetry API
3. Sets up the ESM loader hook for module instrumentation

This allows you to use `@opentelemetry/api` (e.g., `trace.getActiveSpan()`) to access spans created by dd-trace.

## Custom Register File

For advanced configuration (tracer.use(), sampling rules, etc.), use a custom register file:

```bash
# Use the included custom register file
pnpm start:custom

# Or specify your own
node --import ./my-register.mjs .output/server/index.mjs
```

See `register.mjs` for an example that configures HTTP and fetch integrations with custom hooks.

## Tracing Behavior

### Production Mode (`pnpm build && pnpm start`)

**Fully functional** - The `--import unplugin-datadog-apm/register` flag ensures dd-trace initializes before any app code:

- dd-trace initialization logs appear (with `DD_TRACE_DEBUG=true`)
- HTTP requests are traced
- `trace.getActiveSpan()` returns active spans
- AsyncLocalStorage context propagates correctly

### Dev Mode (`pnpm dev`)

**Partial functionality** - Vite dev mode runs differently than production:

- Build-time transformations work correctly
- However, the `--import` flag isn't automatically applied in dev mode
- For full tracing in dev, manually run: `node --import unplugin-datadog-apm/register node_modules/.bin/vite`

**Recommendation**: Use production builds (`pnpm build && pnpm start`) for testing tracing functionality.
