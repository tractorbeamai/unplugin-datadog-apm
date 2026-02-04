# Known Issues

This document tracks known issues, limitations, and upstream bugs affecting this plugin.

## dd-trace URL Instrumentation Error (Node.js 22+)

**Status**: Upstream bug in dd-trace
**Severity**: High - breaks instrumentation entirely
**Affected**: Production builds with `--import` flag

### Symptom

When running a bundled application with dd-trace, you may see:

```
Error during ddtrace instrumentation of application, aborting.
TypeError: Cannot read private member #context from an object whose class did not declare it
    at get host (node:internal/url:1037:25)
    at get host (.../dd-trace/packages/datadog-instrumentations/src/url.js:31:36)
```

### Cause

dd-trace's URL instrumentation attempts to wrap getters on the `URL` class, but in Node.js 22+, the `URL` class uses private class fields (`#context`) that cannot be accessed from shimmed getters.

### Workaround

Disable URL instrumentation in your register file:

```js
tracer.use("url", false);
```

This prevents the error but means URL-related spans won't be captured. The nitro example (`examples/vite-nitro-tanstack-start/register.mjs`) demonstrates this workaround.

An upstream fix in dd-trace is still needed for full functionality.

### Tracking

- Upstream issue: TBD (needs to be filed with DataDog/dd-trace-js)

---

## Nitro Dev Mode - No Active Spans

**Status**: Architectural limitation
**Severity**: Medium - dev mode only
**Affected**: TanStack Start, Nuxt, and other Nitro-based frameworks in dev mode

### Symptom

In dev mode, `trace.getActiveSpan()` returns `null` in API handlers:

```json
{ "tracing": { "hasActiveSpan": false } }
```

Debug output shows:

```
=== API HANDLER ===
Active span: NO
No span context - dd-trace HTTP instrumentation may not be working
```

### Cause

Nitro runs API handlers in a separate worker process from the Vite dev server. The `--import` flag only affects the main process, not spawned workers. Nitro's architecture loads core HTTP modules before any plugin hooks run, making it impossible to instrument them.

### Why This Happens

1. **Dev mode**: Vite starts -> Nitro spawns worker -> Worker loads h3/HTTP modules -> Plugins run -> Handlers load
2. **Production**: `--import` runs -> dd-trace initializes -> All modules load (instrumentable)

The key difference is that in production, `--import` ensures dd-trace loads before ANY modules, while in dev mode, Nitro's worker loads its core modules before we can intervene.

### Workaround

1. **Test tracing in production builds**: Run `pnpm build && pnpm start` to verify instrumentation works
2. **Use manual spans in dev**: Create spans manually if needed for debugging:

```ts
import tracer from "dd-trace";

const span = tracer.startSpan("my-operation");
try {
  // ... your code
} finally {
  span.finish();
}
```

### Not a Workaround

We previously attempted a Nitro plugin approach (`unplugin-datadog-apm/nitro-plugin`) but removed it because:

- Nitro plugins run AFTER core modules are loaded
- HTTP/h3 modules are already imported before plugins execute
- The plugin initialized dd-trace but couldn't instrument already-loaded modules

### Potential Future Solutions

1. **Nitro `NODE_OPTIONS` support**: If Nitro exposes a way to set Node options for its worker process, `--import` could work
2. **Vite 8 Environment API**: May provide new hooks for earlier initialization
3. **Upstream Nitro changes**: Nitro could support preload modules for its worker

---

## ECONNREFUSED to Datadog Agent

**Status**: Expected behavior (not a bug)
**Severity**: None

### Symptom

```
[RC] Error in request
Error: connect ECONNREFUSED 127.0.0.1:8126
```

### Cause

This occurs when no Datadog Agent is running locally. This is expected during local development without the agent.

### Resolution

Either:

1. Run the Datadog Agent locally
2. Set `DD_TRACE_ENABLED=false` to disable tracing
3. Ignore the error - the application still runs, traces are just not sent
