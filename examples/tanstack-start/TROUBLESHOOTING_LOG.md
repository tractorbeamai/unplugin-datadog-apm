# TanStack Start + dd-trace Integration Troubleshooting Log

## Problem Statement

Need to get `dd-trace` to initialize properly in TanStack Start's Nitro worker process so that `trace.getActiveSpan()` returns active spans in API handlers.

**Core Challenge**: AsyncLocalStorage context doesn't propagate across IPC/Unix socket boundaries between Vite dev server and Nitro worker processes.

---

## Attempts Made

### Attempt 1: Direct `configureServer` Hook Initialization

**File**: `src/vite.ts`  
**Approach**: Added a Vite plugin with `configureServer` hook to call `require('dd-trace').init()` directly in the Vite main process.

```typescript
configureServer(server) {
  if (options.autoInit) {
    const tracer = require("dd-trace");
    tracer.init();
  }
}
```

**Result**:

- dd-trace initialized in Vite's main process
- Traces created for Vite process (DNS lookups, etc.)
- API handlers in Nitro worker still had no active spans
- Wrong process - handlers execute in Nitro worker, not Vite

---

### Attempt 2: Virtual Nitro Plugin Injection

**File**: `src/vite.ts`  
**Approach**: Injected a virtual Nitro plugin via `config.nitro.plugins` and `config.nitro.virtual`.

```typescript
config(config) {
  return {
    nitro: {
      plugins: ["#datadog-apm-plugin"],
      virtual: {
        "#datadog-apm-plugin": nitroPluginCode
      }
    }
  }
}
```

**Result**:

- `ReferenceError: defineNitroPlugin is not defined`
- Virtual modules in Nitro don't have access to auto-imported utilities
- Tried manually importing `defineNitroPlugin` - still failed

---

### Attempt 3: Nitro `moduleSideEffects`

**File**: `src/vite.ts`  
**Approach**: Used `config.nitro.moduleSideEffects` to mark `unplugin-datadog-apm/init` as having side effects.

```typescript
config(config) {
  return {
    nitro: {
      moduleSideEffects: ["unplugin-datadog-apm/init"],
      externals: {
        external: ["dd-trace", "dc-polyfill", ...]
      }
    }
  }
}
```

**Result**:

- No dd-trace initialization logs appeared
- Module wasn't actually loaded/executed
- `moduleSideEffects` doesn't guarantee early execution

---

### Attempt 4: Nitro `imports` Configuration

**File**: `src/vite.ts`  
**Approach**: Used Nitro's `imports` mechanism to import `unplugin-datadog-apm/init` early.

```typescript
config(config) {
  return {
    nitro: {
      imports: {
        imports: [
          { from: "unplugin-datadog-apm/init", name: "*" }
        ]
      }
    }
  }
}
```

**Result**:

- No dd-trace initialization occurred
- Import mechanism doesn't guarantee execution order
- Still no active spans in API handlers

---

### Attempt 5: Virtual Module with Rollup Banner (Duplicate Code)

**File**: `src/vite.ts`  
**Approach**: Created both a virtual module AND a rollup banner, causing duplication.

```typescript
config(config) {
  return {
    nitro: {
      virtual: { "#datadog-apm-init": initCode },
      rollupConfig: {
        output: { banner: `import '#datadog-apm-init';` },
        plugins: [bannerPlugin]
      }
    }
  }
}
```

**Result**:

- `ERR_PACKAGE_IMPORT_NOT_DEFINED` - virtual module not resolved at runtime
- When fixed, caused duplicate initialization code in output
- `SyntaxError: Identifier 'createRequire' has already been declared`

---

### Attempt 6: Inline Rollup Banner (Production Only)

**File**: `src/vite.ts`  
**Approach**: Inject dd-trace initialization code directly as a rollup banner for Nitro builds.

```typescript
config(config) {
  const initCode = `
// Auto-injected by unplugin-datadog-apm
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const tracer = require('dd-trace');
tracer.init();
`;

  return {
    nitro: {
      rollupConfig: {
        output: { banner: initCode }
      }
    }
  };
}
```

**Result**:

- dd-trace initializes in production builds
- Only works in production builds, not dev mode (Nitro dev worker loads modules dynamically)

---

### Attempt 7: Manual `--import` Flag

**File**: `examples/tanstack-start/package.json`  
**Approach**: Added `NODE_OPTIONS='--import unplugin-datadog-apm/init'` to scripts.

**Result**:

- Would have worked technically
- User rejected: requires manual configuration, not "just works"

---

### Attempt 8: Real Nitro Plugin Module via `nitro.plugins`

**File**: `src/vite.ts`, `src/nitro-plugin.ts`  
**Approach**: Create a real Nitro plugin module exported from the package, then configure `nitro.plugins` to load it using `require.resolve()` for the absolute path.

```typescript
// src/nitro-plugin.ts - Real module, not a string template
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

export default function datadogApmPlugin(): void {
  const tracer = require("dd-trace");
  tracer.init();
  const tracerProvider = new tracer.TracerProvider();
  tracerProvider.register();
}

// src/vite.ts
config() {
  const nitroPluginPath = require.resolve("unplugin-datadog-apm/nitro-plugin");
  return {
    nitro: {
      plugins: [nitroPluginPath],
    },
  };
}
```

**Result**:

- dd-trace initializes in Nitro worker in dev mode
- Logs show: `[unplugin-datadog-apm] dd-trace initialized in Nitro`
- TracerProvider registered
- However, HTTP spans not created - Nitro's http/h3 modules loaded before plugin runs
- Warning: "Please ensure dd-trace is loaded before other modules"
- DNS spans ARE created (modules loaded after dd-trace init)

---

### Attempt 9: Combined Vite `config` hook + Nitro Plugin + Rollup Banner (CURRENT SOLUTION)

**File**: `src/vite.ts`  
**Approach**: Multi-layered approach for maximum compatibility:

1. **Dev mode (same-process SSR)**: Initialize dd-trace in Vite's `config` hook (runs early)
2. **Dev mode (Nitro worker)**: Nitro plugin runs in separate worker process
3. **Production builds**: Rollup banner injects init code at top of bundle

```typescript
function vite(rawOptions?: Options): Plugin[] {
  const viteDevPlugin: Plugin = {
    name: "unplugin-datadog-apm:vite",
    enforce: "pre",

    config(config, env) {
      // Dev mode: initialize early in Vite server process
      if (env.command === "serve") {
        initializeTracer(options.debug);
      }

      return {
        nitro: {
          // Dev mode: Nitro plugin for worker process
          plugins: [nitroPluginPath],
          // Production: rollup banner for early init
          rollupConfig: {
            output: { banner: INIT_BANNER },
          },
        },
      };
    },
  };

  return [basePlugin, viteDevPlugin];
}
```

**Result**:

- **Production builds**: dd-trace initializes FIRST (rollup banner at top of bundle)
- **Dev mode (Vite process)**: dd-trace initializes, DNS spans created
- **Dev mode (Nitro worker)**: dd-trace initializes, but HTTP spans not created
- Root cause in dev: Nitro's core modules load before our plugin runs

---

## API Route Issues Fixed

### Issue 1: Wrong API Route Syntax

**File**: `examples/tanstack-start/src/routes/api/health.tsx`  
**Problem**: Used `createAPIFileRoute` which doesn't exist in TanStack Router.

**Fix**: Changed to correct syntax:

```typescript
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health/")({
  server: {
    handlers: {
      GET: () => Response.json({...})
    }
  }
});
```

---

## Current State

### Production Builds (WORKS)

- dd-trace initializes FIRST via rollup banner at top of bundle
- TracerProvider registered with OpenTelemetry API
- All modules load AFTER dd-trace init
- HTTP spans and auto-instrumentation should work

### Dev Mode (PARTIAL)

- dd-trace initializes in BOTH Vite server and Nitro worker
- DNS spans are created (proof dd-trace is working)
- HTTP request spans NOT created in Nitro worker
- Root cause: Module load order in Nitro dev - core modules load before plugin
- `trace.getActiveSpan()` returns null in Nitro API handlers

### What Works in Dev Mode

- dd-trace initialization in both processes
- DNS instrumentation (modules loaded after init)
- TracerProvider registration with OpenTelemetry API
- Manual span creation works
- Frameworks with same-process SSR (SvelteKit, Remix) may work better

### What Doesn't Work in Dev Mode (Nitro)

- Automatic HTTP span creation
- `trace.getActiveSpan()` in Nitro request handlers
- Auto-instrumentation of h3/Nitro HTTP handling

---

## Architecture Understanding

### Why Dev Mode is Different

1. **Production**: Code is bundled, rollup banner runs FIRST, then all modules load
2. **Dev Mode**: Nitro loads its core modules, THEN plugins run, THEN handlers load on-demand

### Module Load Order in Nitro Dev

```
1. Nitro core starts
2. h3/HTTP modules load (ALREADY LOADED - can't be instrumented)
3. Plugins execute (dd-trace.init() runs HERE)
4. Route handlers load on-demand (CAN be instrumented)
```

### Why DNS Works But HTTP Doesn't

- DNS module is used lazily (on first network request)
- HTTP/h3 modules are loaded as part of Nitro's core initialization
- dd-trace can only patch modules not yet loaded

---

## Do Not Try Again

1. Virtual Nitro plugins - module resolution issues with auto-imports
2. `moduleSideEffects` - doesn't guarantee execution
3. `imports` configuration - doesn't control load order
4. Nitro hooks (e.g., `dev:reload`) - don't run early enough
5. Combining banner + renderChunk plugin - causes duplication

---

## Potential Solutions (Not Yet Tried)

### 1. Vite 8 Environment API - Custom Module Runner

Vite 8's Environment API allows creating custom module runners. Could potentially:

- Create a custom evaluator that imports dd-trace init first
- Intercept module loading at the Vite environment level

**Complexity**: High  
**Framework-specific**: No (would work for all Vite 8 SSR)

### 2. Nitro `devServer` Configuration

Nitro might have undocumented options for dev server module preloading.

**Complexity**: Medium  
**Framework-specific**: Yes (Nitro only)

### 3. Node.js `--require` via Nitro's Node Options

If Nitro exposes a way to set Node options for its worker process.

**Complexity**: Low  
**Framework-specific**: Yes (Nitro only)

### 4. Accept Dev Mode Limitations

Document that automatic HTTP instrumentation requires production builds. Manual span creation still works in dev mode.

**Complexity**: None  
**Framework-specific**: N/A

---

## Recommendations

1. **For Production**: Current solution works - rollup banner ensures early initialization
2. **For Dev Mode**: Consider accepting limitations or investigating Vite 8 Environment API
3. **For Users**: Test tracing behavior in production builds (`pnpm build && pnpm start`)
4. **Manual Spans**: Users can create manual spans in dev mode if needed

---

## Files Changed

- `src/index.ts`: Added Vite-specific hooks via `vite:` key in unplugin factory
- `src/vite.ts`: Simplified to just export `unplugin.vite()` (follows unplugin conventions)
- `src/nitro-plugin.ts`: Real Nitro plugin module (not string template)
- `package.json`: Exports `unplugin-datadog-apm/nitro-plugin`

## Code Structure

The plugin now follows unplugin conventions:

```typescript
// src/index.ts - Main unplugin factory
export const unpluginDatadogApm = createUnplugin((options) => ({
  name: "unplugin-datadog-apm",
  // ... common hooks (resolveId, load, transform, etc.)

  // Vite-specific hooks via unplugin's bundler-specific pattern
  vite: {
    config(config, env) {
      if (env.command === "serve") {
        initializeTracerEarly(debug);
      }
      return {
        nitro: {
          plugins: [nitroPluginPath],
          rollupConfig: { output: { banner: DD_TRACE_INIT_BANNER } },
        },
      };
    },
  },
}));

// src/vite.ts - Simple wrapper
function vite(options?: Options): Plugin {
  return unpluginDatadogApm.vite(options);
}
```
